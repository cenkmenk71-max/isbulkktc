import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountAudiencePicker } from "@/components/layout/account-audience-picker";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { SignUpForm } from "@/features/identity/sign-up-form";
import { accountAudienceSchema } from "@/features/identity/schemas";
import { createAuthPageMetadata } from "@/features/identity/auth-metadata";
import { resolveEnabledOAuthProviders } from "@/features/identity/oauth-providers";
import { routing } from "@/i18n/routing";
import { getEnabledOAuthProviders } from "@/server/config/oauth-providers";

// The page's own title/description; without this the route inherits the locale
// layout's home-page metadata and announces itself as the home page.
export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ audience?: string }>;
}): Promise<Metadata> {
  const [{ locale: requestedLocale }, { audience: requestedAudience }] =
    await Promise.all([params, searchParams]);
  const locale =
    routing.locales.find((supported) => supported === requestedLocale) ??
    routing.defaultLocale;
  const audience = accountAudienceSchema
    .catch("candidate")
    .parse(requestedAudience);
  const copy = await getTranslations({
    locale,
    namespace: "AccountPages.register",
  });

  return createAuthPageMetadata({
    locale,
    pathname: "/register",
    title: copy(`${audience}.title`),
    description: copy(`${audience}.description`),
  });
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string }>;
}) {
  const { audience: requestedAudience } = await searchParams;
  const audience = accountAudienceSchema.catch("candidate").parse(requestedAudience);
  const copy = await getTranslations("AccountPages.register");
  // A malformed AUTH_OAUTH_PROVIDERS must not 500 the registration page; it
  // degrades to "no provider enabled", exactly like an empty value.
  const providers = resolveEnabledOAuthProviders(getEnabledOAuthProviders);

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
