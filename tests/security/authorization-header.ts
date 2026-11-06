/**
 * The `Authorization` request-header read, shared by the two bearer-guard
 * detectors (`cron-route-auth`, `notification-worker-auth`).
 *
 * HTTP header names are case-insensitive and `"Authorization"` is the canonical
 * spelling, so a case-sensitive literal makes a detector miss a real guard: the
 * route is never discovered and none of its ordering / fail-closed checks run.
 * Both the `.get(...)` and the bracket access form are matched, in any casing.
 *
 * A single source keeps the two detectors from drifting apart — the
 * `sql-hardening` sibling scanners drifted once already.
 */
export const authorizationLookup =
  /headers\s*(?:\.\s*get\(\s*|\[\s*)["']authorization["']\s*[)\]]/i;

/** The index of the `Authorization` read, in whichever spelling the file uses. */
export function authorizationIndex(code: string): number {
  return authorizationLookup.exec(code)?.index ?? -1;
}
