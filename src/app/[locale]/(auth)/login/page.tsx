import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/features/identity/actions";
import { SignInForm } from "@/features/identity/sign-in-form";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { AccountAudiencePicker } from "@/components/layout/account-audience-picker";
import { accountAudienceSchema } from "@/features/identity/schemas";
import { messageKeyForOAuthFailureReason } from "@/features/identity/auth-errors";
import { createAuthPageMetadata } from "@/features/identity/auth-metadata";
import { resolveEnabledOAuthProviders } from "@/features/identity/oauth-providers";
import { resolveAuthDestination } from "@/features/identity/auth-routing";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getEnabledOAuthProviders } from "@/server/config/oauth-providers";
import { PendingActionSubmitButton } from "@/components/forms/pending-action-submit-button";

type LoginSearchParams = {
  audience?: string;
  error?: string;
  reason?: string;
  reset?: string;
};

// The page's own title/description, not the locale layout's home-page ones: the
// layout metadata is what used to make /login announce itself as the home page.
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<LoginSearchParams>;
}): Promise<Metadata> {
  const [{ locale: requestedLocale }, { audience: requestedAudience }] =
    await Promise.all([params, searchParams]);
  const locale =
    routing.locales.find((supported) => supported === requestedLocale) ??
    routing.defaultLocale;
  const audience = accountAudienceSchema
    .catch("candidate")
    .parse(requestedAudience);
  const copy = await getTranslations({ locale, namespace: "AccountPages.login" });

  return createAuthPageMetadata({
    locale,
    pathname: "/login",
    title: copy(`${audience}.title`),
    description: copy(`${audience}.description`),
  });
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<LoginSearchParams>;
}) {
  const [
    { locale: requestedLocale },
    { audience: requestedAudience, error, reason, reset },
  ] = await Promise.all([params, searchParams]);
  const locale =
    routing.locales.find((supported) => supported === requestedLocale) ??
    routing.defaultLocale;
  const audience = accountAudienceSchema
    .catch("candidate")
    .parse(requestedAudience);

  if (error !== "account") {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const [{ data: profile }, { data: membership }] = await Promise.all([
          supabase
            .from("profiles")
            .select("status")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("company_memberships")
            .select("company_id")
            .eq("user_id", user.id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle(),
        ]);

        if (!profile || profile.status === "active") {
          const resolvedAudience = membership ? "employer" : audience;
          redirect(resolveAuthDestination(resolvedAudience, locale));
        }
      }
    } catch (authCheckError) {
      if (
        authCheckError instanceof Error &&
        authCheckError.message === "NEXT_REDIRECT"
      ) {
        throw authCheckError;
      }
      if (
        typeof authCheckError === "object" &&
        authCheckError !== null &&
        "digest" in authCheckError &&
        typeof (authCheckError as { digest?: unknown }).digest === "string" &&
        (authCheckError as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      ) {
        throw authCheckError;
      }
    }
  }

  const copy = await getTranslations("AccountPages.login");
  // A malformed AUTH_OAUTH_PROVIDERS must not 500 the sign-in page; it degrades
  // to "no provider enabled", exactly like an empty value.
  const providers = resolveEnabledOAuthProviders(getEnabledOAuthProviders);
  // The callback carries *why* it failed in `?reason=` (already reduced from the
  // GoTrue code); map that reason to the specific copy so a visitor whose account
  // already exists is told to sign in instead of being asked to "try again"
  // forever.
  const oauthMessageKey = messageKeyForOAuthFailureReason(reason);

  return (
    <EditorialFormPage
      backHref="/"
      backLabel={copy("back")}
      description={copy(`${audience}.description`)}
      eyebrow={copy(`${audience}.eyebrow`)}
      sceneMediaLabel={copy("sceneMediaLabel")}
      sceneVideoUnavailable={copy("sceneVideoUnavailable")}
      storyBody={copy(`${audience}.storyBody`)}
      storyEyebrow={copy(`${audience}.storyEyebrow`)}
      storyTitle={copy(`${audience}.storyTitle`)}
      title={copy(`${audience}.title`)}
    >
      <AccountAudiencePicker audience={audience} page="/login" />
      {error === "account" ? (
        <>
          <p className="editorial-page-alert" aria-live="polite" role="status">
            {copy("inactiveMessage")}
          </p>
          <form action={signOut} className="editorial-signout">
            <PendingActionSubmitButton className="button button-outline">
              {copy("signOut")}
            </PendingActionSubmitButton>
          </form>
        </>
      ) : (
        <>
          {reset === "1" ? (
            <p
              className="editorial-page-alert"
              data-status="success"
              aria-live="polite"
              role="status"
            >
              {copy("resetSuccessMessage")}
            </p>
          ) : error === "verification" || error === "oauth" ? (
            <>
              <p
                className="editorial-page-alert"
                data-status={error === "oauth" ? "error" : undefined}
                aria-live="polite"
                role="status"
              >
                {copy(
                  error === "oauth" ? oauthMessageKey : "verificationMessage",
                )}
              </p>
              {error === "oauth" && reason === "accountExists" ? (
                <Link
                  className="button button-dark editorial-submit"
                  href={{ pathname: "/forgot-password" }}
                >
                  {copy("oauthAccountExistsAction")}
                </Link>
              ) : null}
            </>
          ) : null}
          <SignInForm audience={audience} providers={providers} />
        </>
      )}
    </EditorialFormPage>
  );
}
