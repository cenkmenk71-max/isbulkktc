import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { PasswordResetForm } from "@/features/identity/password-reset-form";
import { createAuthPageMetadata } from "@/features/identity/auth-metadata";
import { routing } from "@/i18n/routing";

// The page's own title/description; without this the route inherits the locale
// layout's home-page metadata and announces itself as the home page.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale =
    routing.locales.find((supported) => supported === requestedLocale) ??
    routing.defaultLocale;
  const copy = await getTranslations({ locale, namespace: "AccountPages.reset" });

  return createAuthPageMetadata({
    locale,
    pathname: "/forgot-password",
    title: copy("title"),
    description: copy("description"),
  });
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const copy = await getTranslations("AccountPages.reset");

  return (
    <EditorialFormPage
      backHref="/login"
      backLabel={copy("back")}
      description={copy("description")}
      eyebrow={copy("eyebrow")}
      sceneMediaLabel={copy("sceneMediaLabel")}
      sceneVideoUnavailable={copy("sceneVideoUnavailable")}
      storyBody={copy("storyBody")}
      storyEyebrow={copy("storyEyebrow")}
      storyTitle={copy("storyTitle")}
      title={copy("title")}
    >
      <PasswordResetForm />
      {error === "expired" ? (
        <p className="editorial-page-alert" aria-live="polite" role="status">
          {copy("expiredMessage")}
        </p>
      ) : null}
    </EditorialFormPage>
  );
}
