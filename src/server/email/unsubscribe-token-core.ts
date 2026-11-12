import "server-only";

import {
  buildUnsubscribeUrl,
  resolveUnsubscribeSigningKey,
  signUnsubscribeEmailWithKey,
  verifyUnsubscribeSignatureWithKey,
} from "./unsubscribe-signature";

/**
 * Server-boundary wrapper around the pure unsubscribe HMAC core.
 *
 * The crypto lives in `unsubscribe-signature.ts` (no `server-only`, no env) so
 * tests and the offline preview sender can run the *real* functions. This module
 * keeps the secret-reading boundary #102 asked for: everything here reads
 * `process.env` behind `server-only`.
 *
 * Key resolution mirrors the rest of the mailer: an explicit
 * `ENGAGEMENT_UNSUBSCRIBE_SECRET` if set, otherwise the Resend key (already
 * secret and present wherever mail can be sent). With neither, signing is
 * disabled and the caller must not emit a link.
 */

export function isUnsubscribeSigningConfigured(): boolean {
  return resolveUnsubscribeSigningKey() !== null;
}

export function signUnsubscribeEmail(email: string): string | null {
  const key = resolveUnsubscribeSigningKey();
  if (!key) return null;
  return signUnsubscribeEmailWithKey(email, key);
}

export function verifyUnsubscribeSignature(
  email: string,
  signature: string,
): boolean {
  const key = resolveUnsubscribeSigningKey();
  if (!key) return false;
  return verifyUnsubscribeSignatureWithKey(email, signature, key);
}

/**
 * The ready-to-embed unsubscribe URL for `email`, or `null` when signing is not
 * configured. Uses the shared builder so a route and the preview tool emit the
 * identical link.
 */
export function unsubscribeUrlFor(
  email: string,
  baseUrl: string | URL,
): string | null {
  const key = resolveUnsubscribeSigningKey();
  if (!key) return null;
  return buildUnsubscribeUrl(email, { baseUrl, key });
}
