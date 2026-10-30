/**
 * Session state the global header renders, plus the pure routing rule behind it.
 *
 * The header lives in the shared locale layout, and several public routes
 * (`/about`, `/blog`, `/packages`, …) are statically prerendered. Reading the
 * session in the layout itself would call `cookies()` and turn every one of
 * those routes dynamic, so the header asks a server action instead and hydrates
 * client-side. The routing rule is kept here, free of `server-only`, so the unit
 * suite can pin it.
 */

export const headerDashboardHrefs = {
  employer: "/company/dashboard",
  candidate: "/profile/dashboard",
} as const;

export type HeaderSessionState =
  | { signedIn: false }
  | { signedIn: true; displayName: string; dashboardHref: string };

export function resolveHeaderDashboardHref(
  hasEmployerMembership: boolean,
): string {
  return hasEmployerMembership
    ? headerDashboardHrefs.employer
    : headerDashboardHrefs.candidate;
}
