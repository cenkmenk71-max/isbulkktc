import { isAppLocale, type AppLocale } from "@/i18n/routing";

export const oauthSignupIntentCookieName = "ib_oauth_signup_intent";
export const oauthSignupIntentMaxAgeSeconds = 15 * 60;

const oauthSignupIntentMaxAgeMs = oauthSignupIntentMaxAgeSeconds * 1_000;
const oauthClockSkewMs = 30_000;

export type OAuthSignupIntent = {
  locale: AppLocale;
  initiatedAt: number;
};

export function createOAuthSignupIntent(
  locale: AppLocale,
  initiatedAt = Date.now(),
): string {
  return `${locale}:${initiatedAt}`;
}

export function parseOAuthSignupIntent(
  value: string | undefined,
  now = Date.now(),
): OAuthSignupIntent | null {
  if (!value) return null;

  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 1 || separatorIndex === value.length - 1) return null;

  const locale = value.slice(0, separatorIndex);
  const initiatedAt = Number(value.slice(separatorIndex + 1));

  if (!isAppLocale(locale) || !Number.isSafeInteger(initiatedAt)) return null;
  if (
    initiatedAt < now - oauthSignupIntentMaxAgeMs - oauthClockSkewMs ||
    initiatedAt > now + oauthClockSkewMs
  ) {
    return null;
  }

  return { locale, initiatedAt };
}

/**
 * `user_metadata` for an account that must be mailed in `locale`.
 *
 * The email templates read `.Data.locale`, i.e. `user_metadata.locale`, and
 * nothing else — they cannot reach `profiles`. The password sign-up path sets
 * it directly; an OAuth account arrives with only the provider's own claims, so
 * the callback has to merge the locale in without dropping them.
 */
export function mergeLocaleIntoUserMetadata(
  metadata: Record<string, unknown> | null | undefined,
  locale: AppLocale,
): Record<string, unknown> {
  return { ...metadata, locale };
}

export function isNewOAuthAccount(
  createdAt: string,
  intent: OAuthSignupIntent,
  now = Date.now(),
): boolean {
  const createdAtMs = Date.parse(createdAt);

  return (
    Number.isFinite(createdAtMs) &&
    intent.initiatedAt >= now - oauthSignupIntentMaxAgeMs - oauthClockSkewMs &&
    intent.initiatedAt <= now + oauthClockSkewMs &&
    createdAtMs >= intent.initiatedAt - oauthClockSkewMs &&
    createdAtMs <= now + oauthClockSkewMs
  );
}
