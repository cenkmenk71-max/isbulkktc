import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { NewPasswordForm } from "@/features/identity/new-password-form";
import { getCurrentUser } from "@/server/dal/user";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

export default async function ResetPasswordPage() {
  const [user, copy] = await Promise.all([
    getCurrentUser(),
    getTranslations("AccountPages.resetPassword"),
  ]);

  if (!user) redirect("/forgot-password?error=expired");

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
