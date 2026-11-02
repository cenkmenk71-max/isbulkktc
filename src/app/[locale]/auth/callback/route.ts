import { NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getLocalePrefix, routing, type AppLocale } from "@/i18n/routing";
import { sendWelcomeEmail } from "@/server/email/mailer";
import type { WelcomeAudience } from "../../../../../supabase/functions/_shared/email-render.ts";
import {
  audienceFromCallbackParam,
  parseAuthFlow,
  parsePkceFlowId,
  resolveAuthDestination,
  resolveAuthFailurePath,
} from "@/features/identity/auth-routing";
import {
  isNewOAuthAccount,
  mergeLocaleIntoUserMetadata,
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
  const audience = audienceFromCallbackParam(
    request.nextUrl.searchParams.get("next"),
  );
  const flow = parseAuthFlow(request.nextUrl.searchParams.get("flow"));
  const isOAuthFlow = flow === "oauth";
  const isResetFlow = flow === "reset";
  const code = request.nextUrl.searchParams.get("code");
  // `sb_flow_id` is appended by `appendPkceFlowIdToRedirects` on the OAuth
  // start (see startOAuthSignIn). Passing it selects the verifier created by
  // that exact flow, instead of the shared legacy key — which mirrors only the
  // most recently started flow and breaks when two flows overlap.
  const flowId = parsePkceFlowId(request.nextUrl.searchParams.get("sb_flow_id"));
  const failurePath = resolveAuthFailurePath(flow, locale, audience);

  if (!code || request.nextUrl.searchParams.has("error")) {
    return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
  }

  const supabase = await createSupabaseServerClient({
    allowCookieWrites: true,
  });
  const { error } = await supabase.auth.exchangeCodeForSession(
    code,
    flowId ? { flowId } : undefined,
  );

  if (error) {
    console.error("Supabase auth callback failed.", { code: error.code });
    return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
  }

  if (isResetFlow) {
    return redirectAndClearOAuthIntent(
      new URL(`${getLocalePrefix(locale)}/reset-password`, appBaseUrl),
    );
  }

  // Past this point the session is already established — the exchange above
  // wrote the auth cookies. Everything that follows only *decorates* that
  // session (provider claims, e-mail language, the welcome mail), so a failure
  // in any of it must never send the user to the failure page: that would
  // report a broken sign-in for a sign-in that in fact succeeded, and strand
  // them on the login screen without the account they just created.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isOAuthFlow) {
    // Pull the provider's own claims (avatar, given/family name) onto the
    // profile.
    const { error: syncError } = await supabase.rpc("sync_oauth_profile");

    if (syncError) {
      console.error("OAuth profile auto-fill could not be applied.", {
        code: syncError.code,
      });
    }

    const intent = parseOAuthSignupIntent(
      request.cookies.get(oauthSignupIntentCookieName)?.value,
    );

    if (user && intent?.locale === locale) {
      // The email templates can only read `auth.users.user_metadata.locale`
      // (`.Data.locale`), which only the password sign-up path sets. Without
      // this an OAuth account is mailed in Turkish whatever language it used.
      if (user.user_metadata?.locale !== intent.locale) {
        const { error: metadataError } = await supabase.auth.updateUser({
          data: mergeLocaleIntoUserMetadata(user.user_metadata, intent.locale),
        });

        if (metadataError) {
          console.error(
            "OAuth profile locale could not be stored in user metadata.",
            { code: metadataError.code },
          );
        }
      }

      if (isNewOAuthAccount(user.created_at, intent)) {
        const { error: profileError } = await supabase
          .from("profiles")
          .update({ locale: intent.locale })
          .eq("id", user.id);

        if (profileError) {
          console.error("New OAuth profile locale could not be stored.", {
            code: profileError.code,
          });
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
  } else if (user?.email && isFreshAccount(user.created_at)) {
    // Greet a brand-new account exactly once, on the first callback that
    // resolves its session. The freshness window keeps this to genuine
    // sign-ups.
    await greetNewAccount({
      email: user.email,
      audience,
      locale,
      user,
    });
  }

  return redirectAndClearOAuthIntent(
    new URL(resolveAuthDestination(audience, locale), appBaseUrl),
  );
}
