import { signOut } from "@/features/identity/actions";
import { SignInForm } from "@/features/identity/sign-in-form";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { AccountAudiencePicker } from "@/components/layout/account-audience-picker";
import { accountAudienceSchema } from "@/features/identity/schemas";
import { getTranslations } from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo";
import { getEnabledOAuthProviders } from "@/server/config/oauth-providers";

export const metadata = noIndexMetadata;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string; error?: string; reset?: string }>;
}) {
  const { audience: requestedAudience, error, reset } = await searchParams;
  const audience = accountAudienceSchema
    .catch("candidate")
    .parse(requestedAudience);
  const copy = await getTranslations("AccountPages.login");
  const providers = getEnabledOAuthProviders();

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
            <p
              className="editorial-page-alert"
              aria-live="polite"
              role="status"
            >
              {copy(error === "oauth" ? "oauthMessage" : "verificationMessage")}
            </p>
          ) : null}
          <SignInForm audience={audience} providers={providers} />
        </>
      )}
    </EditorialFormPage>
  );
}
