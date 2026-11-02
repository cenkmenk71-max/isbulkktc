import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { sendPushMessage, type PushTarget } from "@/server/push/vapid";
import {
  applicationNotificationCategory,
  buildApplicationPushPayload,
} from "@/server/push/notification-copy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 25;

/**
 * Web Push dispatcher. Intended to run on a schedule, alongside the email
 * outbox worker:
 *
 *   curl -X POST -H "Authorization: Bearer $PUSH_CRON_SECRET" \
 *     https://<origin>/api/push/dispatch
 *
 * It reuses the existing application-notification feed rather than adding a
 * second event source: `notifications` already deduplicates one row per
 * (user, application event), so a push can be claimed exactly once and cannot
 * double-send. Delivery state lives on the row (`push_sent_at`,
 * `push_attempt_count`), which makes the worker idempotent across retries.
 *
 * The route never trusts the caller for *what* to send: it sends only rows it
 * claimed, and it reads each recipient's locale and preferences from the
 * database. A leaked cron secret therefore cannot be used to push arbitrary
 * content to arbitrary users.
 */

type ClaimedNotification = {
  notification_id: string;
  user_id: string;
  event_type: string;
  job_title: string;
  application_status: string | null;
  application_id: string;
};

type TargetRow = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  locale: string | null;
};

export async function POST(request: Request) {
  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return Response.json({ message: "Push delivery is not configured" }, { status: 503 });
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    "claim_application_push_notifications",
    { _batch_size: BATCH_SIZE },
  );

  if (claimError) {
    console.error("Push work could not be claimed.", { code: claimError.code });
    return Response.json({ message: "Claim failed" }, { status: 502 });
  }

  const rows = (claimed ?? []) as ClaimedNotification[];
  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const { data: targets, error: targetError } = await supabase.rpc(
      "list_push_targets_for_notification",
      { _user_id: row.user_id, _category: applicationNotificationCategory },
    );

    if (targetError) {
      failed += 1;
      // Leave `push_sent_at` unset so the row is retried on the next run; the
      // attempt ceiling in the claim RPC stops it from retrying forever.
      continue;
    }

    const targetRows = (targets ?? []) as TargetRow[];
    if (targetRows.length === 0) {
      // Nobody to notify (no device, or the category is switched off). Marking
      // it sent is correct: retrying would never find a target.
      skipped += 1;
      await supabase.rpc("finish_application_push_notification", {
        _notification_id: row.notification_id,
        _delivered: true,
      });
      continue;
    }

    const payload = buildApplicationPushPayload({
      eventType: row.event_type,
      toStatus: row.application_status,
      jobTitle: row.job_title,
      applicationId: row.application_id,
      locale: targetRows[0]?.locale ?? null,
    });

    let anyDelivered = false;
    for (const target of targetRows) {
      const pushTarget: PushTarget = {
        subscriptionId: target.subscription_id,
        endpoint: target.endpoint,
        p256dh: target.p256dh,
        authKey: target.auth_key,
      };
      const result = await sendPushMessage(pushTarget, JSON.stringify(payload));

      if (result.status === "delivered") {
        anyDelivered = true;
        await supabase.rpc("record_push_delivery_result", {
          _subscription_id: target.subscription_id,
          _delivered: true,
          _permanent_failure: false,
        });
        continue;
      }

      if (result.status === "gone") {
        // The browser subscription no longer exists; retire it so it is not
        // targeted again.
        await supabase.rpc("record_push_delivery_result", {
          _subscription_id: target.subscription_id,
          _delivered: false,
          _permanent_failure: true,
        });
        continue;
      }

      await supabase.rpc("record_push_delivery_result", {
        _subscription_id: target.subscription_id,
        _delivered: false,
        _permanent_failure: false,
      });
    }

    if (anyDelivered) delivered += 1;
    else failed += 1;

    await supabase.rpc("finish_application_push_notification", {
      _notification_id: row.notification_id,
      _delivered: anyDelivered,
    });
  }

  return Response.json({
    message: "Push dispatch complete",
    claimed: rows.length,
    delivered,
    failed,
    skipped,
  });
}
