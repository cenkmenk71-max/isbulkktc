import { createSupabaseServiceClient } from "@/server/db/supabase-server";
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
 * Trust comes entirely from the Svix signature over the raw body; a missing,
 * forged or replayed request is a 401 before the body is read. A transient
 * failure to store the suppression answers 5xx on purpose so Resend retries
 * instead of the event being lost.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return Response.json(
      { message: "Webhook receiver is not configured" },
      { status: 503 },
    );
  }

  const payload = await request.text();
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
    return Response.json({ message: "Invalid signature" }, { status: 401 });
  }

  const decision = classifyResendEvent(event.type);
  if (!decision.suppress) {
    // Acknowledge the rest so Resend stops retrying; there is nothing to record.
    return Response.json({ message: "Ignored", type: event.type ?? null });
  }

  const recipients = eventRecipients(event);
  if (recipients.length === 0) {
    return Response.json({ message: "No recipients to suppress" });
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return Response.json(
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
      return Response.json(
        { message: "Suppression could not be stored", suppressed },
        { status: 502 },
      );
    }
    suppressed += 1;
  }

  return Response.json({
    message: "Suppressed",
    reason: decision.reason,
    suppressed,
  });
}
