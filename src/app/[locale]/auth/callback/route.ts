import { after, NextResponse, type NextRequest } from "next/server";
import { getAppBaseUrl } from "@/server/config/app-url";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getLocalePrefix, routing, type AppLocale } from "@/i18n/routing";
import { sendWelcomeEmail } from "@/server/email/mailer";
import { deriveDisplayName } from "@/features/identity/oauth-claims";
import type { WelcomeAudience } from "../../../../../supabase/functions/_shared/email-render.ts";
import {
  audienceFromCallbackParam,
  parseAuthFlow,
  parsePkceFlowId,
  resolveAccountBlockedPath,
  resolveAuthDestination,
  resolveAuthFailurePath,
} from "@/features/identity/auth-routing";
import { isAccountBlocked } from "@/features/identity/account-status";
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
 *
 * It is also off the critical path: the send is an outbound HTTPS call to the
 * mail provider (hundreds of milliseconds, seconds when the provider is slow),
 * and awaiting it here delayed the redirect the visitor is waiting on. `after`
 * runs it once the response has been sent, so the visitor lands on their
 * dashboard first and the greeting arrives afterwards. The callback is a route
 * handler, so the send keeps its request context (cookies, headers) inside the
 * deferred task.
 */
function scheduleWelcomeEmail(input: {
  email: string;
  audience: WelcomeAudience;
  locale: AppLocale;
  user: { id: string; user_metadata?: Record<string, unknown> | null };
}): void {
  after(async () => {
    try {
      await sendWelcomeEmail({
        to: input.email,
        audience: input.audience,
        locale: input.locale,
        name: deriveDisplayName(input.user.user_metadata),
        userId: input.user.id,
      });
    } catch (mailError) {
      console.error("Welcome email could not be sent.", {
        error: mailError instanceof Error ? mailError.message : "unknown_error",
      });
    }
  });
}

function redirectAndClearOAuthIntent(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.delete(oauthSignupIntentCookieName);
  return response;
}

/**
 * The callback mints a session for every successful exchange, including OAuth,
 * e-mail confirmation and recovery. `profiles.status` is the account kill
 * switch, so a non-active account must not keep that session (#467/#418) — the
 * same gap `signIn` already closes. The cookie is written by the time the
 * status is known, so the visitor is sent to the login page's `error=account`
 * branch, which explains the refusal and offers a sign-out.
 *
 * Fails closed on a read error: a session whose status cannot be confirmed is
 * exactly what this guard exists to withhold. A missing profile row (the trigger
 * has not created it yet) is not a suspension, matching `signIn`.
 */
async function isCallbackAccountBlocked(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("The callback profile status could not be read.", {
      code: error.code,
    });
    return true;
  }

  return isAccountBlocked(data?.status);
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
  // GoTrue answers a failed round-trip either by redirecting back here with
  // `?error=&error_code=` (the visitor declined, the link expired) or by an
  // error from `exchangeCodeForSession` below. Both are reduced to a closed
  // reason vocabulary so the login page can say *why*, instead of repeating
  // "try again" for an account that already exists.
  const callbackErrorCode =
    request.nextUrl.searchParams.get("error_code") ??
    request.nextUrl.searchParams.get("error");
  // Reassigned with the exchange error's own code below, once it is known.
  let failurePath = resolveAuthFailurePath(
    flow,
    locale,
    audience,
    callbackErrorCode,
  );
  // Set when this callback completed a brand-new account, so the destination
  // can report the `sign_up` conversion. A form cannot: both flows here end in
  // a redirect, so the client form never sees a success state.
  let createdAccount = false;

  if (!code || request.nextUrl.searchParams.has("error")) {
    console.warn("Auth callback rejected before exchange.", {
      code: callbackErrorCode,
      flow,
      hasCode: Boolean(code),
    });
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
    // A PKCE code is single-use. When the same `/auth/callback` request is
    // delivered twice (an edge/proxy retry, a preflight, or the user reopening
    // the link), the first exchange already wrote the session cookies and the
    // second one answers `flow_state_not_found` — but the visitor *is* signed
    // in. Treating that second response as a failure is what showed
    // "social sign-in could not be completed" to a user whose session was
    // live, and bounced them to the login screen instead of their dashboard.
    // So only fail when no session was actually established.
    const {
      data: { user: sessionUser },
    } = await supabase.auth.getUser();

    if (!sessionUser) {
      // Reduce the raw code to a closed reason for the URL (never echo it), but
      // keep the raw code in the log — that is where an operator diagnoses it.
      console.error("Supabase auth callback failed.", {
        code: error.code,
        flow,
      });
      failurePath = resolveAuthFailurePath(flow, locale, audience, error.code);
      return redirectAndClearOAuthIntent(new URL(failurePath, appBaseUrl));
    }

    console.warn("Supabase auth code was already exchanged.", {
      code: error.code,
    });

    // The retry path minted (or found) a live session too, so the kill switch
    // applies here as well.
    if (await isCallbackAccountBlocked(supabase, sessionUser.id)) {
      return redirectAndClearOAuthIntent(
        new URL(resolveAccountBlockedPath(locale, audience), appBaseUrl),
      );
    }

    if (isResetFlow) {
      return redirectAndClearOAuthIntent(
        new URL(`${getLocalePrefix(locale)}/reset-password`, appBaseUrl),
      );
    }

    return redirectAndClearOAuthIntent(
      new URL(resolveAuthDestination(audience, locale), appBaseUrl),
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

  // The exchange minted a session, but `profiles.status` is the account kill
  // switch (#467/#418) — a suspended/closed account must not keep it. This gate
  // runs before every success exit, the reset flow included, so no branch hands
  // a non-active account a working session. The visitor lands on the login
  // page's `error=account` branch, which explains the refusal and signs out.
  if (user && (await isCallbackAccountBlocked(supabase, user.id))) {
    return redirectAndClearOAuthIntent(
      new URL(resolveAccountBlockedPath(locale, audience), appBaseUrl),
    );
  }

  if (isResetFlow) {
    return redirectAndClearOAuthIntent(
      new URL(`${getLocalePrefix(locale)}/reset-password`, appBaseUrl),
    );
  }

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
        createdAccount = true;
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
          scheduleWelcomeEmail({
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
    createdAccount = true;
    scheduleWelcomeEmail({
      email: user.email,
      audience,
      locale,
      user,
    });
  }

  const destination = resolveAuthDestination(audience, locale);
  return redirectAndClearOAuthIntent(
    new URL(createdAccount ? `${destination}?signup=1` : destination, appBaseUrl),
  );
}
