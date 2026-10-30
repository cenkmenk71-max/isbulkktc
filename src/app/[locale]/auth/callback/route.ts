import { NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { routing } from "@/i18n/routing";
import {
  isNewOAuthAccount,
  oauthSignupIntentCookieName,
  parseOAuthSignupIntent,
} from "@/features/identity/oauth-signup-intent";
import {
  getPostAuthDestinationPath,
  toPostAuthDestinationKey,
} from "@/features/identity/safe-redirect";

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
  const postAuthKey = toPostAuthDestinationKey(
    request.nextUrl.searchParams.get("next"),
  );
  const audience = postAuthKey === "company" ? "employer" : "candidate";
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
      }
    }
  }

  const destination = getPostAuthDestinationPath(postAuthKey);
  const localizedDestination = `${localePrefix}${destination}`;

  return redirectAndClearOAuthIntent(new URL(localizedDestination, appBaseUrl));
}
