import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { JobDraftForm } from "@/features/jobs/job-management-forms";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { requireAuthenticatedUser } from "@/server/dal/user";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type NewEmployerJobPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ company?: string }>;
};

export default async function NewEmployerJobPage({
  params,
  searchParams,
}: NewEmployerJobPageProps) {
  const [{ locale: requestedLocale }, query] = await Promise.all([params, searchParams]);
  const locale = routing.locales.find((item) => item === requestedLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  await requireAuthenticatedUser({ audience: "employer" });
  const [{ company }, copy] = await Promise.all([
    getEmployerWorkspace(query.company),
    getTranslations("JobManagement.employer"),
  ]);
  if (query.company && company.id !== query.company) notFound();

  return (
    <main className="employer-job-editor page-container">
      <Link className="button button-outline" href={{ pathname: "/company/jobs", query: { company: company.id } }}>
        {copy("back")}
      </Link>
      <header>
        <p className="eyebrow"><span className="eyebrow-rule" />{company.name}</p>
        <h1>{copy("newJob")}</h1>
        <p>{copy("description")}</p>
      </header>
      <JobDraftForm companyId={company.id} />
    </main>
  );
}
