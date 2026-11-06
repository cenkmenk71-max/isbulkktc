/**
 * The `email_health` signal for an outbound send that Resend rejected.
 *
 * The malformed-key path reports a health signal under `email_health` (#186),
 * but a *delivery* rejection was logged as a bare sentence with only `{ code }`
 * — so a rule keyed on `email_health` never saw the second half of the same
 * outage, and `statusCode` (the field that separates a bad key from a bad
 * recipient from throttling) was dropped.
 *
 * Pure and dependency-free: the mailer is behind `server-only`, so the rule
 * lives here to stay unit-testable.
 */
export const EMAIL_HEALTH_EVENT = "email_health";

export const DELIVERY_FAILURE_EVENT = "email_delivery_failed";

export type DeliveryFailure = {
  event: typeof DELIVERY_FAILURE_EVENT;
  code: string;
  statusCode: number | null;
};

/**
 * The most diagnostic error code available.
 *
 * A *returned* Resend error carries the API code in `name`
 * (`validation_error`, `rate_limit_exceeded`, `application_error`, …). A thrown
 * error is a different shape: `fetch` rejects with a `TypeError` whose real
 * cause is a Node system error carrying a string `code` (`ECONNRESET`,
 * `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`). Reading `name` first would report the
 * JS constructor (`TypeError`, `Error`) — the same useless value for every
 * network failure, which cannot be alerted on. So a real `code` (on the error or
 * on its `cause`) wins, and `name` is the fallback.
 */
function extractErrorCode(record: Record<string, unknown>): string {
  const direct = typeof record.code === "string" ? record.code.trim() : "";
  if (direct) return direct;

  const cause = record.cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as Record<string, unknown>).code;
    if (typeof causeCode === "string" && causeCode.trim()) return causeCode.trim();
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  return name || "unknown_error";
}

/**
 * Normalises a Resend send error into the `email_health` shape, for both a
 * returned `{ name, message, statusCode }` and a thrown transport error. A
 * network-level failure sets `statusCode` to `null`. Only the code and status
 * are kept — Resend's `message` can quote the recipient, and this signal is not
 * a place to leak an address.
 */
export function describeDeliveryFailure(error: unknown): DeliveryFailure {
  const record = (error ?? {}) as Record<string, unknown>;
  const statusCode =
    typeof record.statusCode === "number" ? record.statusCode : null;
  return { event: DELIVERY_FAILURE_EVENT, code: extractErrorCode(record), statusCode };
}

/**
 * Emits the delivery-failure signal under `email_health`. The logger is
 * injectable so the emission itself is covered by a test — the mailer is behind
 * `server-only` and cannot be imported without a bundler condition.
 */
export function reportDeliveryFailure(
  error: unknown,
  log: (event: string, payload: DeliveryFailure) => void = console.error,
): DeliveryFailure {
  const signal = describeDeliveryFailure(error);
  log(EMAIL_HEALTH_EVENT, signal);
  return signal;
}
