import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { NewPasswordForm } from "@/features/identity/new-password-form";
import { createAuthPageMetadata } from "@/features/identity/auth-metadata";
import { getCurrentUser } from "@/server/dal/user";
import { redirectLocalized } from "@/i18n/redirect";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

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
  const copy = await getTranslations({
    locale,
    namespace: "AccountPages.resetPassword",
  });

  return createAuthPageMetadata({
    locale,
    pathname: "/reset-password",
    title: copy("title"),
    description: copy("description"),
  });
}

export default async function ResetPasswordPage() {
  const [user, copy] = await Promise.all([
    getCurrentUser(),
    getTranslations("AccountPages.resetPassword"),
  ]);

  if (!user) return redirectLocalized("/forgot-password?error=expired");

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
      <NewPasswordForm />
    </EditorialFormPage>
  );
}
