import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure HMAC core for engagement-digest unsubscribe links.
 *
 * The link has to work without a session (it is followed from a mailbox), so
 * the address in the URL cannot be trusted on its own — anyone could
 * unsubscribe anyone by editing it. A keyed digest binds the address to the
 * secret, and the comparison is constant-time so the signature cannot be probed
 * byte by byte.
 *
 * Kept free of `server-only` and env access so the same functions run in the
 * Next.js server boundary (`unsubscribe-token-core.ts`), in tests, and in the
 * offline preview sender (`scripts/email-preview.mjs`). The caller supplies the
 * key, so a tool that can send mail can produce the *same* signature the
 * production route emits instead of a placeholder that no receiver accepts.
 */

/** The environment keys that may carry the signing secret, in priority order. */
export const UNSUBSCRIBE_SECRET_ENV_KEYS = [
  "ENGAGEMENT_UNSUBSCRIBE_SECRET",
  "RESEND_API_KEY",
] as const;

/**
 * The signing secret, or `null` when none is configured.
 *
 * An explicit `ENGAGEMENT_UNSUBSCRIBE_SECRET` wins; otherwise the Resend key is
 * reused (already secret and present wherever mail can be sent). A value under
 * 16 characters is treated as absent — a short secret is guessable, and emitting
 * a link signed with it is worse than emitting no link.
 */
export function resolveUnsubscribeSigningKey(
  env: Record<string, string | undefined> = process.env,
): string | null {
  for (const name of UNSUBSCRIBE_SECRET_ENV_KEYS) {
    const key = env[name]?.trim();
    if (key && key.length >= 16) return key;
  }
  return null;
}

/** Lower-cased, trimmed address form that the signature is computed over. */
export function normaliseUnsubscribeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** base64url HMAC-SHA256 of the normalised address under `key`. */
export function signUnsubscribeEmailWithKey(email: string, key: string): string {
  return createHmac("sha256", key)
    .update(normaliseUnsubscribeEmail(email))
    .digest("base64url");
}

/**
 * Constant-time check that `signature` is the one `key` produces for `email`.
 * A length mismatch short-circuits because `timingSafeEqual` throws on it.
 */
export function verifyUnsubscribeSignatureWithKey(
  email: string,
  signature: string,
  key: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(signUnsubscribeEmailWithKey(email, key));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * The full unsubscribe URL for an address, or `null` when no key is configured
 * or the base URL is unusable. Shared so the production routes and the preview
 * sender build byte-identical links — a preview that invents its own shape is
 * exactly how the `SAMPLE` placeholder reached a real inbox.
 */
export function buildUnsubscribeUrl(
  email: string,
  options: { baseUrl: string | URL; key: string },
): string | null {
  let url: URL;
  try {
    url = new URL("/api/email/unsubscribe", options.baseUrl);
  } catch {
    return null;
  }
  url.searchParams.set("e", normaliseUnsubscribeEmail(email));
  url.searchParams.set("s", signUnsubscribeEmailWithKey(email, options.key));
  return url.toString();
}
