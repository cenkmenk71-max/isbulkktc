import { z } from "zod";
import { routing } from "@/i18n/routing";

export const accountAudienceSchema = z.enum(["candidate", "employer"]);
export const oauthProviderSchema = z.enum([
  "google",
  "linkedin_oidc",
  "facebook",
]);

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
  displayName: z.string().trim().min(2).max(80),
  password: z.string().min(8).max(128),
});

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  locale: z.enum(routing.locales),
  captchaToken: z.string().trim().min(1).max(4096).optional(),
});

export const updatePasswordSchema = z.object({
  password: z.string().min(8).max(128),
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
    | "captchaFailed"
    | "signUpFailed"
    | "verificationSent"
    | "oauthUnavailable"
    | "oauthStartFailed"
    | "resetRequestSent"
    | "resetRequestFailed"
    | "passwordUpdateFailed"
    | "sessionExpired";
  status: "idle" | "error" | "success";
};
