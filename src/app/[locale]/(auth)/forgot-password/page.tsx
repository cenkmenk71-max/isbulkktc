import { getTranslations } from "next-intl/server";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { PasswordResetForm } from "@/features/identity/password-reset-form";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

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
