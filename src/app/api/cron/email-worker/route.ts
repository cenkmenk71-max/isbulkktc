/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  notifyCandidateApplicationReceived,
  notifyCandidateStatusChange,
  notifyEmployerNewApplication,
} from "@/server/email/resend";
import { getAppBaseUrl } from "@/server/config/app-url";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron / Scheduled Worker for processing outbox emails
 * Verilen CRON_SECRET veya Authorization Bearer token ile korunur.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        message: "Email worker skipped: SUPABASE_SERVICE_ROLE_KEY is not configured.",
        processed: 0,
      },
      { status: 200 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // 1. Kuyruktan en fazla 20 e-postayı kilitleyip çek
    const { data: outboxItems, error: claimError } = await supabase.rpc(
      "claim_notification_email_outbox",
      { _batch_size: 20 },
    );

    if (claimError) {
      console.error("[Email Worker] claim error:", claimError);
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    if (!outboxItems || outboxItems.length === 0) {
      return NextResponse.json({ message: "No pending emails in outbox", processed: 0 });
    }

    const baseUrl = getAppBaseUrl().origin;
    let successCount = 0;
    let failCount = 0;

    // 2. Her bildirimi Resend üzerinden gönder
    for (const item of outboxItems) {
      let sendResult: import("@/server/email/resend").SendEmailResult = { success: false };

      try {
        if (item.recipient_is_candidate) {
          if (item.event_type === "submitted") {
            sendResult = await notifyCandidateApplicationReceived({
              candidateEmail: item.recipient_email,
              candidateName: "Değerli Aday",
              companyName: "İşveren",
              jobTitle: item.job_title || "Pozisyon",
              statusUrl: `${baseUrl}/${item.recipient_locale || "tr"}/applications`,
            });
          } else {
            sendResult = await notifyCandidateStatusChange({
              candidateEmail: item.recipient_email,
              candidateName: "Değerli Aday",
              companyName: "İşveren",
              jobTitle: item.job_title || "Pozisyon",
              newStatus: item.application_status || "İncelendi",
              actionUrl: `${baseUrl}/${item.recipient_locale || "tr"}/applications`,
            });
          }
        } else {
          // İşverene yeni başvuru bildirimi
          sendResult = await notifyEmployerNewApplication({
            employerEmail: item.recipient_email,
            employerName: "İşveren",
            candidateName: "Yeni Aday",
            jobTitle: item.job_title || "İş İlanı",
            applicationUrl: `${baseUrl}/${item.recipient_locale || "tr"}/company/dashboard`,
          });
        }

        // 3. Veritabanındaki outbox durumunu güncelle
        if (sendResult.success) {
          await supabase.rpc("finish_notification_email", {
            _outbox_id: item.outbox_id,
            _provider_message_id: sendResult.messageId || `resend_${Date.now()}`,
            _error_code: null,
          });
          successCount++;
        } else {
          await supabase.rpc("finish_notification_email", {
            _outbox_id: item.outbox_id,
            _provider_message_id: null,
            _error_code: "SEND_FAILED",
          });
          failCount++;
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "ERR_SEND";
        await supabase.rpc("finish_notification_email", {
          _outbox_id: item.outbox_id,
          _provider_message_id: null,
          _error_code: "ERR_EXCEPTION",
        });
        failCount++;
      }
    }

    return NextResponse.json({
      message: "Outbox processed successfully",
      processed: outboxItems.length,
      successCount,
      failCount,
    });
  } catch (err: unknown) {
    console.error("[Email Worker Exception]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
