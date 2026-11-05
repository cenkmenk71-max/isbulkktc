import type { SignInFormState } from "./schemas";

/**
 * Maps a Supabase Auth error code to the form message the user sees.
 *
 * Supabase answers `email_not_confirmed` when confirmations are enabled and the
 * mailbox is still unverified. Folding it into the generic `signInFailed` copy
 * tells a legitimate user their password is wrong and hides the real fix, so it
 * keeps its own message. `captcha_failed` is the same story for Turnstile.
 *
 * GoTrue reports a duplicate registration under several codes depending on how
 * the collision happens: `email_exists` / `user_already_exists` for a second
 * password sign-up on a known address (the case the empty-`identities`
 * obfuscation covers when confirmations are on), and
 * `email_conflict_identity_not_deletable` / `identity_already_exists` when an
 * OAuth identity lands on an address that already has an account. All four mean
 * the same thing to the visitor — the account is already there — so they share
 * `emailAlreadyRegistered` rather than falling through to the generic
 * `signUpFailed`, which reads as "your details were wrong" and invites a retry
 * that cannot succeed.
 */
export type AuthMessage = SignInFormState["message"];

const authErrorMessages: Record<string, AuthMessage> = {
  email_not_confirmed: "emailNotConfirmed",
  captcha_failed: "captchaFailed",
  email_exists: "emailAlreadyRegistered",
  user_already_exists: "emailAlreadyRegistered",
  identity_already_exists: "emailAlreadyRegistered",
  email_conflict_identity_not_deletable: "emailAlreadyRegistered",
};

export function messageForAuthErrorCode(
  code: string | null | undefined,
  fallback: AuthMessage,
): AuthMessage {
  if (!code) return fallback;
  return authErrorMessages[code] ?? fallback;
}

/**
 * Why an OAuth / callback round-trip failed, reduced to a closed vocabulary.
 *
 * The callback logs GoTrue's raw `error.code` but used to discard it and send
 * every failure to the same `?error=oauth` page, so a visitor whose LinkedIn
 * account already existed was told "try again" and retried forever. The reason
 * travels in the URL as one of these five literals — never the raw GoTrue code,
 * which is attacker-influenced on a public GET and must not be echoed.
 */
export type OAuthFailureReason =
  | "accountExists"
  | "cancelled"
  | "linkExpired"
  | "providerUnavailable"
  | "failed";

const oauthFailureReasons: Record<string, OAuthFailureReason> = {
  // The identity/address is already on file. `identity_already_exists` and
  // `email_conflict_identity_not_deletable` are the OAuth-identity collisions;
  // the other two are the password-sign-up equivalents, which can also surface
  // through the callback.
  identity_already_exists: "accountExists",
  email_conflict_identity_not_deletable: "accountExists",
  email_exists: "accountExists",
  user_already_exists: "accountExists",
  // The PKCE code / one-time link is gone: consumed, expired, or from another
  // device. Retrying the same link cannot help; the visitor must start again.
  flow_state_expired: "linkExpired",
  flow_state_not_found: "linkExpired",
  otp_expired: "linkExpired",
  // The visitor declined the provider's consent screen — not an error.
  access_denied: "cancelled",
  // The provider (or the project's configuration of it) is not usable.
  provider_disabled: "providerUnavailable",
  oauth_provider_not_supported: "providerUnavailable",
  server_error: "providerUnavailable",
};

export function oauthFailureReason(
  code: string | null | undefined,
): OAuthFailureReason {
  if (!code) return "failed";
  return oauthFailureReasons[code] ?? "failed";
}

/**
 * The `AccountPages.login` message key for a callback failure. The mapping is
 * closed, so an unknown or hostile `?code=` value can only ever resolve to the
 * generic copy — it is never interpolated into the page.
 */
const oauthFailureMessageKeys = {
  accountExists: "oauthAccountExists",
  cancelled: "oauthCancelled",
  linkExpired: "oauthLinkExpired",
  providerUnavailable: "oauthProviderUnavailable",
  failed: "oauthMessage",
} as const satisfies Record<OAuthFailureReason, string>;

export type OAuthFailureMessageKey =
  (typeof oauthFailureMessageKeys)[OAuthFailureReason];

/**
 * A reason already reduced from the URL -> the message key.
 *
 * The login page receives the reduced reason (`?reason=`), not a raw GoTrue code,
 * so it must not run it back through `oauthFailureReason` — a reason literal is
 * not a code and would collapse to `failed`. An unknown or hostile value falls
 * back to the generic copy and is never interpolated.
 */
export function messageKeyForOAuthFailureReason(
  reason: string | null | undefined,
): OAuthFailureMessageKey {
  return reason && reason in oauthFailureMessageKeys
    ? oauthFailureMessageKeys[reason as OAuthFailureReason]
    : "oauthMessage";
}
