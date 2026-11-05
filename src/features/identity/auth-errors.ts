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
