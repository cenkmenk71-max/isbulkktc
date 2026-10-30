import { NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getLocalePrefix, routing } from "@/i18n/routing";
import {
  audienceFromCallbackParam,
  parseAuthFlow,
  resolveAuthDestination,
  resolveAuthFailurePath,
} from "@/features/identity/auth-routing";
import {
  isNewOAuthAccount,
  mergeLocaleIntoUserMetadata,
  oauthSignupIntentCookieName,
  parseOAuthSignupIntent,
} from "@/features/identity/oauth-signup-intent";

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
  const failurePath = resolveAuthFailurePath(flow, locale, audience);

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
      new URL(`${getLocalePrefix(locale)}/reset-password`, appBaseUrl),
    );
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

      // The email templates can only read `auth.users.user_metadata.locale`
      // (`.Data.locale`), which only the password sign-up path sets. Without
      // this an OAuth account is mailed in Turkish whatever language it used.
      // A failure here only costs the email language, so it is logged rather
      // than turned into a failed sign-in.
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
      }
    }
  }

  return redirectAndClearOAuthIntent(
    new URL(resolveAuthDestination(audience, locale), appBaseUrl),
  );
}
