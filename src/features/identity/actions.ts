"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  oauthSignInSchema,
  requestPasswordResetSchema,
  resendConfirmationSchema,
  signInSchema,
  signUpSchema,
  updatePasswordSchema,
  type SignInFormState,
} from "./schemas";
import { parseEnabledOAuthProviders, resolveEnabledOAuthProviders } from "./oauth-providers";
import { messageForAuthErrorCode } from "./auth-errors";
import { isAccountBlocked } from "./account-status";
import {
  callbackAudienceParam,
  resolveAccountBlockedPath,
  resolveAuthDestination,
} from "./auth-routing";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { clientIp } from "@/features/abuse/request-context";
import {
  passwordResetThrottle,
  resendConfirmationThrottle,
  signInThrottle,
  signUpThrottle,
} from "./auth-rate-limits";
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

// A throttled credential call answers with the same generic failure as a rejected
// one, so a scripted caller cannot confirm from the response that it tripped a
// limit (mirrors the feedback/sales actions).
const throttledSignIn: SignInFormState = {
  status: "error",
  message: "signInFailed",
};
const throttledReset: SignInFormState = {
  status: "error",
  message: "resetRequestFailed",
};
// Sign-up and confirmation resend answer with the same message they already use
// on a Supabase failure, so a scripted caller cannot tell a throttled call from
// a rejected one and probe the limit.
const throttledSignUp: SignInFormState = {
  status: "error",
  message: "signUpFailed",
};
const throttledResend: SignInFormState = {
  status: "error",
  message: "resendFailed",
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
    intent: formData.get("intent"),
  });

  if (!result.success) return invalidForm;

  const cookieStore = await cookies();
  cookieStore.delete(oauthSignupIntentCookieName);

  const enabledProviders = resolveEnabledOAuthProviders(() =>
    parseEnabledOAuthProviders(process.env.AUTH_OAUTH_PROVIDERS),
  );
  if (!enabledProviders.includes(result.data.provider)) {
    return { status: "error", message: "oauthUnavailable" };
  }

  const localePrefix = getLocalePrefix(result.data.locale);
  const destination = callbackAudienceParam(result.data.audience);
  const redirectTo = new URL(
    `${localePrefix}/auth/callback?flow=oauth&next=${destination}`,
    getAppBaseUrl(),
  ).toString();
  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
    experimental: { appendPkceFlowIdToRedirects: true },
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

  // Throttle before the credential check. Per client address and per submitted
  // address, so neither a shared origin nor one account can be guessed without
  // limit — the captcha is not a substitute on the hosted project (#418 §7).
  if (!signInThrottle.address.check(`ip:${await clientIp()}`).ok) {
    return throttledSignIn;
  }
  if (!signInThrottle.email.check(`email:${result.data.email}`).ok) {
    return throttledSignIn;
  }

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: result.data.email,
    password: result.data.password,
    options: { captchaToken: result.data.captchaToken },
  });

  if (error) {
    console.error("Supabase sign-in failed.", { code: error.code });

    // Supabase returns `email_not_confirmed` when confirmations are enabled and
    // the address has not been verified yet; the generic message would mislead.
    // Echo the submitted address back so the form can offer a one-click resend
    // without persisting it client-side.
    return {
      status: "error",
      message: messageForAuthErrorCode(error.code, "signInFailed"),
      email:
        error.code === "email_not_confirmed" ? result.data.email : undefined,
    };
  }

  // The credential check just minted a session, but `profiles.status` is the
  // account's kill switch and the RPCs already refuse a non-active profile.
  // Handing a suspended/closed account a working session would only surface as
  // `42501` on the next write, so read the caller's own row (RLS
  // `profiles_read_own` permits it) and, when the account is not active, drop
  // the session and send the visitor to the login page's `error=account`
  // branch, which shows the inactive message and a sign-out. A read failure is
  // refused too: we cannot confirm the account is active, and a session we
  // cannot justify is exactly the gap this closes.
  const statusResult = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (statusResult.error) {
    console.error("The signed-in profile status could not be read.", {
      code: statusResult.error.code,
    });
    await supabase.auth.signOut();
    return { status: "error", message: "signInFailed" };
  }

  if (isAccountBlocked(statusResult.data?.status)) {
    await supabase.auth.signOut();
    redirect(
      resolveAccountBlockedPath(result.data.locale, result.data.audience),
    );
  }

  redirect(resolveAuthDestination(result.data.audience, result.data.locale));
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

  // Throttle before the mail fan-out. `signUp` mails the submitted address a
  // confirmation link, so one origin or one victim mailbox must not be driven
  // without limit (#505).
  if (!signUpThrottle.address.check(`ip:${await clientIp()}`).ok) {
    return throttledSignUp;
  }
  if (!signUpThrottle.email.check(`email:${result.data.email}`).ok) {
    return throttledSignUp;
  }

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
        `${getLocalePrefix(result.data.locale)}/auth/callback?next=${callbackAudienceParam(
          result.data.audience,
        )}`,
        getAppBaseUrl(),
      ).toString(),
      captchaToken: result.data.captchaToken,
    },
  });

  if (error) {
    console.error("Supabase sign-up failed.", { code: error.code });
    return {
      status: "error",
      message: messageForAuthErrorCode(error.code, "signUpFailed"),
    };
  }

  if (data.session) {
    if (data.user) {
      // Best-effort and off the critical path: the account already exists, so a
      // mail problem must never stop the post-signup redirect, and the send is an
      // outbound HTTPS call to the mail provider — awaiting it here delayed the
      // redirect the visitor is waiting on. `after` runs it once the response has
      // been sent (it is supported in Server Functions and keeps the request
      // context), so the visitor reaches their dashboard first.
      const userId = data.user.id;
      after(async () => {
        try {
          await sendWelcomeEmail({
            to: result.data.email,
            audience: result.data.audience,
            locale: result.data.locale,
            name: result.data.displayName,
            userId,
          });
        } catch (mailError) {
          console.error("Welcome email could not be sent.", {
            error: mailError instanceof Error ? mailError.message : "unknown_error",
          });
        }
      });
    }
    redirect(resolveAuthDestination(result.data.audience, result.data.locale));
  }

  // With confirmations on, `signUp` on an address that already has an account
  // returns an obfuscated user with no session and sends nothing, so that a
  // visitor cannot probe which addresses are registered. GoTrue signals that
  // case with an empty `identities` array; a genuinely new signup carries the
  // `email` identity it just created. Without this check the duplicate lands on
  // "verification link sent" and the visitor waits for a mail that never comes.
  //
  // The same obfuscation means this cannot be used to *confirm* an address:
  // nothing here distinguishes a registered address from a brand-new one to a
  // caller who did not already know, which is the point.
  if (data.user && (data.user.identities?.length ?? 0) === 0) {
    return {
      status: "error",
      message: "emailAlreadyRegistered",
      email: result.data.email,
    };
  }

  return {
    status: "success",
    message: "verificationSent",
  };
}

/**
 * Re-sends the sign-up confirmation mail. `supabase.auth.resend` is the only
 * supported path here because `signUp` on an existing, unconfirmed address
 * answers with an obfuscated user and no fresh mail. The response is always
 * reported as sent to avoid disclosing whether an address is registered.
 */
export async function resendConfirmation(
  _previousState: SignInFormState,
  formData: FormData,
): Promise<SignInFormState> {
  const result = resendConfirmationSchema.safeParse({
    email: formData.get("email"),
    audience: formData.get("audience"),
    locale: formData.get("locale"),
    captchaToken: readCaptchaToken(formData),
  });

  if (!result.success) return invalidForm;

  // Throttle before the mail fan-out. `resend` re-mails the confirmation link
  // to an address the caller chose, so it is the loosest of the four and the one
  // a script would reach for (#505).
  if (!resendConfirmationThrottle.address.check(`ip:${await clientIp()}`).ok) {
    return throttledResend;
  }
  if (!resendConfirmationThrottle.email.check(`email:${result.data.email}`).ok) {
    return throttledResend;
  }

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: result.data.email,
    options: {
      // Carry the audience so the confirmation link lands the employer on the
      // company dashboard, not the candidate one. A hardcoded `candidate` here
      // sent an employer who re-verified to /profile/dashboard.
      emailRedirectTo: new URL(
        `${getLocalePrefix(result.data.locale)}/auth/callback?next=${callbackAudienceParam(
          result.data.audience,
        )}`,
        getAppBaseUrl(),
      ).toString(),
      captchaToken: result.data.captchaToken,
    },
  });

  if (error) {
    console.error("Supabase confirmation resend failed.", { code: error.code });

    if (error.code === "captcha_failed") {
      return { status: "error", message: "captchaFailed" };
    }

    // `over_email_send_rate_limit` and friends: surface a distinct, actionable
    // message rather than claiming the mail went out.
    return { status: "error", message: "resendFailed" };
  }

  return { status: "success", message: "verificationResent" };
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

  // Throttle before the mail fan-out. Per client address and per submitted
  // address, so neither one origin nor one victim mailbox can be flooded (#418 §7).
  if (!passwordResetThrottle.address.check(`ip:${await clientIp()}`).ok) {
    return throttledReset;
  }
  if (!passwordResetThrottle.email.check(`email:${result.data.email}`).ok) {
    return throttledReset;
  }

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
    return {
      status: "error",
      message: messageForAuthErrorCode(error.code, "resetRequestFailed"),
    };
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
    // `same_password` and `weak_password` are actionable: the visitor must pick a
    // different value. The generic copy would tell them to retry the same one.
    return {
      status: "error",
      message: messageForAuthErrorCode(error.code, "passwordUpdateFailed"),
    };
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
    // A remote sign-out that fails transiently must not surface as a 500 on a
    // form whose whole purpose is to get the visitor out. auth-js's `_signOut`
    // calls `_removeSession()` on that branch before returning the error, so the
    // local session (and its cookies) is already gone and the visitor is signed
    // out either way; the retry the error would invite cannot succeed. When the
    // stored session itself is unreadable the proxy clears the stale cookies on
    // the next request, so the redirect is correct there too. Log and continue.
    console.error("Supabase sign-out failed.", { code: error.code });
  }

  return redirectLocalized("/login");
}
