import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { jsonNoStore } from "@/server/http/no-store-response";
import { readBoundedTextBody } from "@/server/http/bounded-text-body";
import {
  classifyResendEvent,
  eventRecipients,
  verifyResendWebhook,
} from "@/server/email/resend-webhook-core";

export const dynamic = "force-dynamic";

/**
 * Resend delivery-event receiver.
 *
 * Resend posts `email.bounced` / `email.complained` / `email.suppressed` here
 * after a send. Without it the digest kept mailing addresses that hard-bounced
 * or reported spam, which is the fastest way to lose sending reputation, so a
 * bounce or a complaint is written to `email_engagement_optouts` through the
 * same service-role RPC the unsubscribe link uses and drops the address from
 * every later batch.
 *
 * The raw body is read with a hard byte ceiling before signature
 * verification; a missing, forged or replayed signature is then rejected with
 * 401 before JSON parsing or database access. The body ceiling protects the
 * receiver from large unauthenticated uploads. A transient failure to store the
 * suppression answers 5xx on purpose so Resend retries instead of losing it.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonNoStore(
      { message: "Webhook receiver is not configured" },
      { status: 503 },
    );
  }

  const body = await readBoundedTextBody(request, 256 * 1024);
  if (!body.ok) {
    const status = body.reason === "too_large" ? 413 : 400;
    return jsonNoStore(
      { message: body.reason === "too_large" ? "Webhook body is too large" : "Invalid webhook body" },
      { status },
    );
  }
  const payload = body.text;
  let event: { type?: string; data?: { to?: unknown } };
  try {
    event = verifyResendWebhook(
      payload,
      {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      secret,
    );
  } catch {
    // Bad signature, missing headers, or a timestamp outside the replay window.
    return jsonNoStore({ message: "Invalid signature" }, { status: 401 });
  }

  const decision = classifyResendEvent(event.type);
  if (!decision.suppress) {
    // Acknowledge the rest so Resend stops retrying; there is nothing to record.
    return jsonNoStore({ message: "Ignored", type: event.type ?? null });
  }

  const recipients = eventRecipients(event);
  if (recipients.length === 0) {
    return jsonNoStore({ message: "No recipients to suppress" });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return jsonNoStore(
      { message: "Suppression is not configured" },
      { status: 503 },
    );
  }

  let suppressed = 0;
  for (const email of recipients) {
    const { error } = await supabase.rpc("opt_out_engagement", {
      _email: email,
      _reason: decision.reason,
    });
    if (error) {
      // 5xx so Resend retries; the write is idempotent, so a repeat is safe.
      console.error("Resend suppression could not be stored.", {
        code: error.code,
      });
      return jsonNoStore(
        { message: "Suppression could not be stored", suppressed },
        { status: 502 },
      );
    }
    suppressed += 1;
  }

  return jsonNoStore({
    message: "Suppressed",
    reason: decision.reason,
    suppressed,
  });
}
