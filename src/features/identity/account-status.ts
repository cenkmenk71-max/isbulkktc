/**
 * The account kill switch, as the sign-in path reads it.
 *
 * `public.profiles.status` is `active | suspended | closed` and every write RPC
 * re-checks `status = 'active'` before it will act, so the column is the
 * account's kill switch. Nothing on the sign-in path consulted it, so a
 * suspended account still received a working session and every later write
 * failed with a bare `42501` — which the visitor reads as a broken app rather
 * than a disabled account. A session must not be minted for a non-active
 * account.
 *
 * `active` and any value that is missing or unrecognised (a transient read
 * failure, a row the `handle_new_auth_user` trigger should have created) are
 * *allowed*: the caller decides how to fail closed on a read error, and
 * inventing a status the database does not use would lock out legitimate
 * visitors.
 *
 * Callers surface the refusal through the login page's existing `error=account`
 * branch, which already shows the inactive message and a sign-out button, so no
 * new user-facing copy is introduced here.
 */
export function isAccountBlocked(status: string | null | undefined): boolean {
  return status === "suspended" || status === "closed";
}
