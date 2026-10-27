import { getTranslations } from "next-intl/server";
import { AccountAudiencePicker } from "@/components/layout/account-audience-picker";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { SignUpForm } from "@/features/identity/sign-up-form";
import { accountAudienceSchema } from "@/features/identity/schemas";
import { noIndexMetadata } from "@/lib/seo";
import { getEnabledOAuthProviders } from "@/server/config/oauth-providers";

export const metadata = noIndexMetadata;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string }>;
}) {
  const { audience: requestedAudience } = await searchParams;
  const audience = accountAudienceSchema.catch("candidate").parse(requestedAudience);
  const copy = await getTranslations("AccountPages.register");
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
      <AccountAudiencePicker audience={audience} page="/register" />
      <SignUpForm audience={audience} providers={providers} />
    </EditorialFormPage>
  );
}
