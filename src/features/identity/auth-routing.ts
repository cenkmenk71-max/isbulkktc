import { getLocalePrefix, type AppLocale } from "@/i18n/routing";
import type { AccountAudience } from "./schemas";

/**
 * Server-only auth destination and failure-path rules.
 *
 * Both the sign-in/sign-up actions and the `/auth/callback` route need to agree
 * on where a user lands and where a broken link sends them. The callback is a
 * public GET endpoint, so the query values it reads (`next`, `flow`) are
 * untrusted: only the fixed vocabulary below is ever turned into a path.
 */

export type AuthFlow = "email" | "oauth" | "reset";

const audienceDestinations: Record<AccountAudience, string> = {
  candidate: "/profile/dashboard",
  employer: "/company/dashboard",
};

/** `next` is the only audience signal the callback accepts. */
export function audienceFromCallbackParam(
  value: string | null | undefined,
): AccountAudience {
  return value === "company" ? "employer" : "candidate";
}

/**
 * The inverse of `audienceFromCallbackParam`: the `next` value an auth redirect
 * carries so the callback can recover the audience. Every flow that emails a
 * confirmation/recovery link (sign-up, OAuth start, resend) must use this — a
 * hardcoded `candidate` silently drops an employer on the candidate dashboard.
 */
export function callbackAudienceParam(
  audience: AccountAudience,
): "candidate" | "company" {
  return audience === "employer" ? "company" : "candidate";
}

export function parseAuthFlow(value: string | null | undefined): AuthFlow {
  if (value === "oauth") return "oauth";
  if (value === "reset") return "reset";
  return "email";
}

/**
 * The `sb_flow_id` an OAuth start appends to the callback URL (auth-js
 * `appendPkceFlowIdToRedirects`). It is 32 lowercase hex characters — the same
 * shape `generatePKCEFlowId` produces. The callback is a public GET, so the
 * value is untrusted: it is only forwarded to `exchangeCodeForSession` when it
 * matches, otherwise the exchange falls back to the legacy verifier key.
 */
export function parsePkceFlowId(
  value: string | null | undefined,
): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value)
    ? value
    : undefined;
}

export function resolveAuthDestination(
  audience: AccountAudience,
  locale: AppLocale,
): string {
  return `${getLocalePrefix(locale)}${audienceDestinations[audience]}`;
}

/**
 * GoTrue answers a failed OAuth round-trip (or an unusable link) by redirecting
 * to the Site URL — the bare origin — with the failure in the query string,
 * *not* to `/auth/callback`. The marketing home page has no handler for that,
 * so the visitor used to land on an unrelated page with no explanation.
 *
 * When the query carries GoTrue's `error_code`, send them to the localized
 * login page, which already renders the OAuth failure message. Only
 * `error_code` is trusted as the signal; a bare `?error=` is left alone so the
 * home page cannot be turned into an open redirect by an arbitrary link.
 */
export function resolveAuthErrorRedirect(
  query: Record<string, string | string[] | undefined>,
  locale: AppLocale,
): string | null {
  const errorCode = query.error_code;
  if (typeof errorCode !== "string" || errorCode.length === 0) return null;
  return `${getLocalePrefix(locale)}/login?error=oauth`;
}

/**
 * Where a failed confirmation / OAuth / recovery link sends the visitor. Every
 * branch is a literal path; no caller-supplied value is interpolated.
 */
export function resolveAuthFailurePath(
  flow: AuthFlow,
  locale: AppLocale,
  audience: AccountAudience,
): string {
  const prefix = getLocalePrefix(locale);

  if (flow === "reset") {
    return `${prefix}/forgot-password?error=expired`;
  }

  const errorCode = flow === "oauth" ? "oauth" : "verification";
  return `${prefix}/login?error=${errorCode}&audience=${audience}`;
}
