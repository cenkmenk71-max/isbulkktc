import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { jsonNoStore } from "@/server/http/no-store-response";
import {
  classifyResendEvent,
  eventRecipients,
  readResendWebhookPayload,
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
 * Trust comes entirely from the Svix signature over the raw body. The body is
 * read with a strict 1 MiB streaming bound before verification; forged or
 * replayed requests never reach the database. A transient failure to store the
 * suppression answers 5xx so Resend retries instead of the event being lost.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonNoStore(
      { message: "Webhook receiver is not configured" },
      { status: 503 },
    );
  }

  let payload: string | null;
  try {
    payload = await readResendWebhookPayload(request);
  } catch {
    return jsonNoStore({ message: "Invalid payload" }, { status: 400 });
  }
  if (payload === null) {
    return jsonNoStore({ message: "Payload too large" }, { status: 413 });
  }

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
