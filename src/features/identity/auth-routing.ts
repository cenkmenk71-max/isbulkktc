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

export function parseAuthFlow(value: string | null | undefined): AuthFlow {
  if (value === "oauth") return "oauth";
  if (value === "reset") return "reset";
  return "email";
}

/**
 * A bare locale prefix for building paths, without next-intl's request scope so
 * the callback (a Route Handler, not a page) can use it.
 */
export function localePrefixFor(locale: AppLocale): string {
  return getLocalePrefix(locale);
}

export function resolveAuthDestination(
  audience: AccountAudience,
  locale: AppLocale,
): string {
  return `${getLocalePrefix(locale)}${audienceDestinations[audience]}`;
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
