import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header.
 *
 * Fails closed when no secret is configured: an unset `CRON_SECRET` must not
 * turn a scheduled endpoint into a public trigger for service-role side effects.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  cronSecret: string | undefined,
): boolean {
  if (!cronSecret) return false;

  const expected = `Bearer ${cronSecret}`;
  if (!authorizationHeader || authorizationHeader.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(authorizationHeader),
    Buffer.from(expected),
  );
}
