import { z } from "zod";
import { routing } from "@/i18n/routing";

export const accountAudienceSchema = z.enum(["candidate", "employer"]);
export const oauthProviderSchema = z.enum(["google", "linkedin_oidc"]);

/**
 * A trimmed name that carries no control characters and fits the 2–80 bound.
 *
 * The rejected set is C0 (U+0000–U+001F), DEL (U+007F) and C1 (U+0080–U+009F) —
 * POSIX `[[:cntrl:]]`, the same set `public.oauth_profile_claims` strips and
 * `deriveDisplayName` mirrors. The name is echoed to the header, the profile, the
 * account panel and the welcome mail, and two concrete failures follow if a
 * control character reaches it:
 *
 *  - a NUL byte (U+0000) is not storable by Postgres for any character type
 *    ("the character with code zero … cannot be stored", PostgreSQL 8.3), so the
 *    `handle_new_auth_user` trigger's INSERT aborts and a sign-up the client
 *    accepted fails server-side;
 *  - newlines/tabs/DEL/C1 characters corrupt the rendered name, and bidi
 *    overrides can reorder visible text.
 *
 * Rejecting them at the boundary keeps the value the form accepts equal to the
 * value the database and the derived-greeting path can actually hold.
 */
export const displayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  // Expressed as a regex rather than a `refine` with a custom error string: the
  // `auth-messages.test.ts` guard finds the `SignInFormState` union by slicing
  // from the first `message` key in this file, and an extra one above it would
  // shift that slice. The action returns the generic `invalid` state for any
  // schema failure, so a per-rule error string is never surfaced anyway.
  .regex(/^[^\u0000-\u001f\u007f-\u009f]*$/);

export const oauthSignInSchema = z.object({
  provider: oauthProviderSchema,
  audience: accountAudienceSchema,
  locale: z.enum(routing.locales),
  intent: z.enum(["signin", "signup"]),
});

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(128),
  audience: accountAudienceSchema,
  locale: z.enum(routing.locales),
  // Present only when Turnstile is configured; Supabase verifies it when
  // captcha protection is enabled on the project.
  captchaToken: z.string().trim().min(1).max(4096).optional(),
});

export const signUpSchema = signInSchema.extend({
  displayName: displayNameSchema,
  password: z.string().min(10).max(128),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  locale: z.enum(routing.locales),
  captchaToken: z.string().trim().min(1).max(4096).optional(),
});

export const resendConfirmationSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  audience: accountAudienceSchema,
  locale: z.enum(routing.locales),
  captchaToken: z.string().trim().min(1).max(4096).optional(),
});

export const updatePasswordSchema = z.object({
  password: z.string().min(10).max(128),
  locale: z.enum(routing.locales),
});

export type AccountAudience = z.infer<typeof accountAudienceSchema>;
export type OAuthProvider = z.infer<typeof oauthProviderSchema>;

export type SignInFormState = {
  message:
    | "idle"
    | "invalid"
    | "signInFailed"
    | "emailNotConfirmed"
    | "captchaRequired"
    | "captchaFailed"
    | "signUpFailed"
    | "verificationSent"
    | "emailAlreadyRegistered"
    | "verificationResent"
    | "resendFailed"
    | "oauthUnavailable"
    | "oauthStartFailed"
    | "resetRequestSent"
    | "resetRequestFailed"
    | "passwordUpdateFailed"
    | "passwordUnchanged"
    | "sessionExpired";
  status: "idle" | "error" | "success";
  /**
   * Echoed back only for flows that need a follow-up (e.g. resending the
   * confirmation mail after `email_not_confirmed`) so the client never has to
   * persist a submitted address itself.
   */
  email?: string;
};
