import { signOut } from "@/features/identity/actions";
import { SignInForm } from "@/features/identity/sign-in-form";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { AccountAudiencePicker } from "@/components/layout/account-audience-picker";
import { accountAudienceSchema } from "@/features/identity/schemas";
import { messageKeyForOAuthFailureReason } from "@/features/identity/auth-errors";
import { resolveEnabledOAuthProviders } from "@/features/identity/oauth-providers";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { noIndexMetadata } from "@/lib/seo";
import { getEnabledOAuthProviders } from "@/server/config/oauth-providers";

export const metadata = noIndexMetadata;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    audience?: string;
    error?: string;
    reason?: string;
    reset?: string;
  }>;
}) {
  const {
    audience: requestedAudience,
    error,
    reason,
    reset,
  } = await searchParams;
  const audience = accountAudienceSchema
    .catch("candidate")
    .parse(requestedAudience);
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
            <button className="button button-outline" type="submit">
              {copy("signOut")}
            </button>
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
