import { Webhook } from "standardwebhooks";

/**
 * Pure half of the Resend webhook receiver: signature verification, the mapping
 * from an event type to a suppression decision, and recipient extraction.
 *
 * Kept out of the route (which is behind `server-only`) so the rules are
 * unit-testable without a bundler condition, the same reason `email-headers.ts`
 * and `delivery-health.ts` live here.
 */

export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

/** The subset of a Resend webhook event this receiver reads. */
export type ResendWebhookEvent = {
  type?: string;
  data?: { to?: unknown; [key: string]: unknown };
};

/**
 * Verifies a Resend webhook request against the endpoint's signing secret.
 *
 * Resend signs with Svix (`svix-id` / `svix-timestamp` / `svix-signature`);
 * `standardwebhooks` is the same library the Resend SDK re-exports, and it also
 * rejects a replay outside its timestamp tolerance. A missing, stale or forged
 * signature throws, so the caller answers 401 before parsing the body.
 */
export function verifyResendWebhook(
  payload: string,
  headers: ResendWebhookHeaders,
  secret: string,
): ResendWebhookEvent {
  return new Webhook(secret).verify(payload, {
    "webhook-id": headers.id,
    "webhook-timestamp": headers.timestamp,
    "webhook-signature": headers.signature,
  }) as ResendWebhookEvent;
}

export type SuppressionDecision =
  | { suppress: true; reason: string }
  | { suppress: false };

/**
 * Which events must remove an address from future sends.
 *
 * `email.bounced` and `email.complained` are the hard, unambiguous signals: a
 * dead mailbox and a spam report. `email.suppressed` mirrors Resend's own
 * suppression list back to us. Everything else is not a reason to stop mailing —
 * in particular a transient `email.delivery_delayed` or `email.failed` must not
 * suppress a live subscriber, so those are ignored. The `reason` is stored in
 * `email_engagement_optouts` and must fit its 40-character limit.
 */
export function classifyResendEvent(type: string | undefined): SuppressionDecision {
  switch (type) {
    case "email.bounced":
      return { suppress: true, reason: "bounce" };
    case "email.complained":
      return { suppress: true, reason: "complaint" };
    case "email.suppressed":
      return { suppress: true, reason: "provider_suppression" };
    default:
      return { suppress: false };
  }
}

/** Loose shape check matching the RPC's own address guard. */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The lower-cased, de-duplicated, syntactically valid recipients an event names.
 * `data.to` is normally an array but a single string is tolerated; anything that
 * is not a plausible mailbox is dropped rather than handed to the RPC, which
 * would raise and fail the whole event.
 */
export function eventRecipients(event: ResendWebhookEvent): string[] {
  const to = event.data?.to;
  const list = Array.isArray(to) ? to : typeof to === "string" ? [to] : [];
  const out = new Set<string>();
  for (const value of list) {
    if (typeof value !== "string") continue;
    const email = value.trim().toLowerCase();
    if (email.length >= 3 && email.length <= 254 && EMAIL_PATTERN.test(email)) {
      out.add(email);
    }
  }
  return [...out];
}
