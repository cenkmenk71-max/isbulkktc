"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  oauthSignInSchema,
  requestPasswordResetSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type SignInFormState,
} from "./schemas";
import { parseEnabledOAuthProviders } from "./oauth-providers";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getAppBaseUrl } from "@/server/config/app-url";
import { redirectLocalized } from "@/i18n/redirect";
import { getLocalePrefix } from "@/i18n/routing";
import { sendWelcomeEmail } from "@/server/email/mailer";
import {
  createOAuthSignupIntent,
  oauthSignupIntentCookieName,
  oauthSignupIntentMaxAgeSeconds,
} from "./oauth-signup-intent";

const invalidForm: SignInFormState = {
  status: "error",
  message: "invalid",
};

// Turnstile renders its widget inside the form and writes the token into this
// field. Absent when the widget is not configured, so the value stays optional.
function readCaptchaToken(formData: FormData): string | undefined {
  const value = formData.get("cf-turnstile-response");
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function startOAuthSignIn(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = oauthSignInSchema.safeParse({
    provider: formData.get("provider"),
    audience: formData.get("audience"),
    locale: formData.get("locale"),
  });

  if (!result.success) return invalidForm;

  const cookieStore = await cookies();
  cookieStore.delete(oauthSignupIntentCookieName);

  const enabledProviders = parseEnabledOAuthProviders(
    process.env.AUTH_OAUTH_PROVIDERS,
  );
  if (!enabledProviders.includes(result.data.provider)) {
    return { status: "error", message: "oauthUnavailable" };
  }

  const localePrefix = getLocalePrefix(result.data.locale);
  const destination =
    result.data.audience === "employer" ? "company" : "candidate";
  const redirectTo = new URL(
    `${localePrefix}/auth/callback?flow=oauth&next=${destination}`,
    getAppBaseUrl(),
  ).toString();
  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: result.data.provider,
    options: {
      redirectTo,
      ...(result.data.provider === "google"
        ? { queryParams: { prompt: "select_account" } }
        : {}),
    },
  });

  if (error) {
    console.error("Supabase OAuth sign-in could not start.", {
      code: error.code,
    });
    return { status: "error", message: "oauthStartFailed" };
  }

  if (result.data.intent === "signup") {
    cookieStore.set(
      oauthSignupIntentCookieName,
      createOAuthSignupIntent(result.data.locale),
      {
        httpOnly: true,
        maxAge: oauthSignupIntentMaxAgeSeconds,
        path: "/",
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    );
  }

  redirect(data.url);
}

export async function signIn(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    audience: formData.get("audience"),
    locale: formData.get("locale"),
    captchaToken: readCaptchaToken(formData),
  });

  if (!result.success) return invalidForm;

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: result.data.email,
    password: result.data.password,
    options: { captchaToken: result.data.captchaToken },
  });

  if (error) {
    console.error("Supabase sign-in failed.", { code: error.code });

    // Supabase returns this when email confirmations are enabled and the
    // address has not been verified yet; the generic message would mislead.
    if (error.code === "email_not_confirmed") {
      return {
        status: "error",
        message: "emailNotConfirmed",
      };
    }

    // Supabase answers `captcha_failed` when Turnstile rejects or expires the
    // token; the generic copy would tell the user to check a correct password.
    if (error.code === "captcha_failed") {
      return {
        status: "error",
        message: "captchaFailed",
      };
    }

    return {
      status: "error",
      message: "signInFailed",
    };
  }

  redirect(
    `${getLocalePrefix(result.data.locale)}${
      result.data.audience === "employer"
        ? "/company/dashboard"
        : "/profile/dashboard"
    }`,
  );
}

export async function signUp(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = signUpSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    audience: formData.get("audience"),
    locale: formData.get("locale"),
    captchaToken: readCaptchaToken(formData),
  });

  if (!result.success) return invalidForm;

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { data, error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      data: {
        display_name: result.data.displayName,
        locale: result.data.locale,
      },
      emailRedirectTo: new URL(
        `${getLocalePrefix(result.data.locale)}/auth/callback?next=${
          result.data.audience === "employer" ? "company" : "candidate"
        }`,
        getAppBaseUrl(),
      ).toString(),
      captchaToken: result.data.captchaToken,
    },
  });

  if (error) {
    console.error("Supabase sign-up failed.", { code: error.code });
    if (error.code === "captcha_failed") {
      return { status: "error", message: "captchaFailed" };
    }
    return {
      status: "error",
      message: "signUpFailed",
    };
  }

  if (data.session) {
    if (data.user) {
      // Best-effort: the account already exists, so a mail problem must never
      // stop the post-signup redirect or surface as a sign-up failure.
      try {
        await sendWelcomeEmail({
          to: result.data.email,
          audience: result.data.audience,
          locale: result.data.locale,
          name: result.data.displayName,
          userId: data.user.id,
        });
      } catch (mailError) {
        console.error("Welcome email could not be sent.", {
          error: mailError instanceof Error ? mailError.message : "unknown_error",
        });
      }
    }
    redirect(
      `${getLocalePrefix(result.data.locale)}${
        result.data.audience === "employer"
          ? "/company/dashboard"
          : "/profile/dashboard"
      }`,
    );
  }

  return {
    status: "success",
    message: "verificationSent",
  };
}

export async function requestPasswordReset(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = requestPasswordResetSchema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale"),
    captchaToken: readCaptchaToken(formData),
  });

  if (!result.success) return invalidForm;

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { error } = await supabase.auth.resetPasswordForEmail(
    result.data.email,
    {
      redirectTo: new URL(
        `${getLocalePrefix(result.data.locale)}/auth/callback?flow=reset`,
        getAppBaseUrl(),
      ).toString(),
      captchaToken: result.data.captchaToken,
    },
  );

  if (error) {
    console.error("Supabase password reset request failed.", {
      code: error.code,
    });
    if (error.code === "captcha_failed") {
      return { status: "error", message: "captchaFailed" };
    }
    return { status: "error", message: "resetRequestFailed" };
  }

  return { status: "success", message: "resetRequestSent" };
}

export async function updatePassword(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    locale: formData.get("locale"),
  });

  if (!result.success) return invalidForm;

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Password update was requested without a valid session.", {
      code: userError?.code,
    });
    return { status: "error", message: "sessionExpired" };
  }

  const { error } = await supabase.auth.updateUser({
    password: result.data.password,
  });

  if (error) {
    console.error("Supabase password update failed.", { code: error.code });
    return { status: "error", message: "passwordUpdateFailed" };
  }

  const { error: signOutError } = await supabase.auth.signOut();

  if (signOutError) {
    console.error("Supabase sign-out after password update failed.", {
      code: signOutError.code,
    });
  }

  redirect(`${getLocalePrefix(result.data.locale)}/login?reset=1`);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Supabase sign-out failed.", { code: error.code });
    throw new Error("Oturum kapatılamadı.", { cause: error });
  }

  return redirectLocalized("/login");
}
