import { NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { routing, type AppLocale } from "@/i18n/routing";
import { sendWelcomeEmail } from "@/server/email/mailer";
import type { WelcomeAudience } from "../../../../../supabase/functions/_shared/email-render.ts";
import {
  isNewOAuthAccount,
  oauthSignupIntentCookieName,
  parseOAuthSignupIntent,
} from "@/features/identity/oauth-signup-intent";

// An account is greeted only if it was created moments before this callback
// resolves, which keeps the welcome email to genuinely new sign-ups.
const WELCOME_WINDOW_MS = 5 * 60 * 1000;

function isFreshAccount(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && Date.now() - created < WELCOME_WINDOW_MS;
}

/**
 * Greeting a new account is best-effort: the session is already established, so
 * a mail problem (or a misconfigured app URL) must never break the callback and
 * strand the user without a redirect.
 */
async function greetNewAccount(input: {
  email: string;
  audience: WelcomeAudience;
  locale: AppLocale;
  user: { id: string; user_metadata?: Record<string, unknown> | null };
}): Promise<void> {
  try {
    await sendWelcomeEmail({
      to: input.email,
      audience: input.audience,
      locale: input.locale,
      name:
        (input.user.user_metadata?.display_name as string | undefined) ??
        (input.user.user_metadata?.full_name as string | undefined) ??
        null,
      userId: input.user.id,
    });
  } catch (mailError) {
    console.error("Welcome email could not be sent.", {
      error: mailError instanceof Error ? mailError.message : "unknown_error",
    });
  }
}

function redirectAndClearOAuthIntent(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.delete(oauthSignupIntentCookieName);
  return response;
}

export async function GET(request: NextRequest) {
  const appBaseUrl = getAppBaseUrl();
  const requestedLocale = request.nextUrl.pathname.split("/")[1];
  const locale =
    routing.locales.find(
      (supportedLocale) => supportedLocale === requestedLocale,
    ) ?? routing.defaultLocale;
  const audience =
    request.nextUrl.searchParams.get("next") === "company"
      ? "employer"
      : "candidate";
  const flow = request.nextUrl.searchParams.get("flow");
  const isOAuthFlow = flow === "oauth";
  const isResetFlow = flow === "reset";
  const code = request.nextUrl.searchParams.get("code");
  const localePrefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const failurePath = isResetFlow
    ? `${localePrefix}/forgot-password?error=expired`
    : `${localePrefix}/login?error=${
        isOAuthFlow ? "oauth" : "verification"
      }&audience=${audience}`;

  if (!code || request.nextUrl.searchParams.has("error")) {
    return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
  }

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Supabase auth callback failed.", { code: error.code });
    return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
  }

  if (isResetFlow) {
    return redirectAndClearOAuthIntent(
      new URL(`${localePrefix}/reset-password`, appBaseUrl),
    );
  }

  // Greet a brand-new account exactly once, on the first callback that resolves
  // its session. The freshness window keeps this to genuine sign-ups.
  if (!isOAuthFlow) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && isFreshAccount(user.created_at)) {
      await greetNewAccount({
        email: user.email,
        audience,
        locale,
        user,
      });
    }
  }

  if (isOAuthFlow) {
    const intent = parseOAuthSignupIntent(
      request.cookies.get(oauthSignupIntentCookieName)?.value,
    );

    if (intent?.locale === locale) {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("Supabase OAuth callback user could not be verified.", {
          code: userError?.code,
        });
        return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
      }

      if (isNewOAuthAccount(user.created_at, intent)) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .update({ locale: intent.locale })
          .eq("id", user.id)
          .select("id")
          .maybeSingle();

        if (profileError || !profile) {
          console.error("New OAuth profile locale could not be stored.", {
            code: profileError?.code,
          });
          return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
        }

        if (user.email) {
          await greetNewAccount({
            email: user.email,
            audience,
            locale,
            user,
          });
        }
      }
    }
  }

  const destination =
    audience === "employer" ? "/company/dashboard" : "/profile/dashboard";
  const localizedDestination = `${localePrefix}${destination}`;

  return redirectAndClearOAuthIntent(new URL(localizedDestination, appBaseUrl));
}
