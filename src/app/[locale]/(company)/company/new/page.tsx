import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CreateCompanyForm } from "@/features/companies/create-company-form";
import { getCurrentUser } from "@/server/dal/user";
import { EditorialFormPage } from "@/components/layout/editorial-form-page";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

export default async function NewCompanyPage() {
  const [user, copy] = await Promise.all([
    getCurrentUser(),
    getTranslations("CompanyRegistration"),
  ]);

  if (!user) redirect("/login?audience=employer");
  if (user.status !== "active") {
    redirect("/login?audience=employer&error=account");
  }

  return (
    <EditorialFormPage
      backHref="/profile/dashboard"
      backLabel={copy("back")}
      description={copy("description")}
      eyebrow={copy("eyebrow", { name: user.displayName })}
      storyBody={copy("storyBody")}
      storyEyebrow={copy("storyEyebrow")}
      storyTitle={copy("storyTitle")}
      title={copy("title")}
      variant="company"
    >
      <CreateCompanyForm />
    </EditorialFormPage>
  );
}
