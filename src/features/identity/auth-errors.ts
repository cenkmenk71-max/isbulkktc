import type { SignInFormState } from "./schemas";

/**
 * Maps a Supabase Auth error code to the form message the user sees.
 *
 * Supabase answers `email_not_confirmed` when confirmations are enabled and the
 * mailbox is still unverified. Folding it into the generic `signInFailed` copy
 * tells a legitimate user their password is wrong and hides the real fix, so it
 * keeps its own message. `captcha_failed` is the same story for Turnstile.
 */
export type AuthMessage = SignInFormState["message"];

const authErrorMessages: Record<string, AuthMessage> = {
  email_not_confirmed: "emailNotConfirmed",
  captcha_failed: "captchaFailed",
};

export function messageForAuthErrorCode(
  code: string | null | undefined,
  fallback: AuthMessage,
): AuthMessage {
  if (!code) return fallback;
  return authErrorMessages[code] ?? fallback;
}
