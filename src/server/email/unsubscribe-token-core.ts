
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * HMAC for engagement-digest unsubscribe links.
 *
 * The link has to work without a session (it is followed from a mailbox), so
 * the address in the URL cannot be trusted on its own — anyone could unsubscribe
 * anyone by editing it. A keyed digest binds the address to the secret, and the
 * comparison is constant-time so the signature cannot be probed byte by byte.
 *
 * Key resolution mirrors the rest of the mailer: an explicit
 * `ENGAGEMENT_UNSUBSCRIBE_SECRET` if set, otherwise the Resend key (already
 * secret and present wherever mail can be sent). With neither, signing is
 * disabled and the caller must not emit a link.
 */

function signingKey(): string | null {
  const key =
    process.env.ENGAGEMENT_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.RESEND_API_KEY?.trim();
  return key && key.length >= 16 ? key : null;
}

export function isUnsubscribeSigningConfigured(): boolean {
  return signingKey() !== null;
}

export function signUnsubscribeEmail(email: string): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key)
    .update(email.trim().toLowerCase())
    .digest("base64url");
}

export function verifyUnsubscribeSignature(
  email: string,
  signature: string,
): boolean {
  const expected = signUnsubscribeEmail(email);
  if (!expected || !signature) return false;

  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (expectedBytes.length !== actualBytes.length) return false;
  return timingSafeEqual(expectedBytes, actualBytes);
}
