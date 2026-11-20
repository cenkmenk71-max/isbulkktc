import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { JobDraftForm } from "@/features/jobs/job-management-forms";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { getCompanyJobForEdit } from "@/server/dal/jobs";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type EditEmployerJobPageProps = {
  params: Promise<{ locale: string; jobId: string }>;
  searchParams: Promise<{ company?: string }>;
};

export default async function EditEmployerJobPage({
  params,
  searchParams,
}: EditEmployerJobPageProps) {
  const [{ locale: requestedLocale, jobId }, query] = await Promise.all([params, searchParams]);
  const locale = routing.locales.find((item) => item === requestedLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const [{ company }, copy] = await Promise.all([
    getEmployerWorkspace(query.company),
    getTranslations("JobManagement.employer"),
  ]);
  const job = await getCompanyJobForEdit(company.id, jobId);
  if (!job) notFound();

  return (
    <main className="employer-job-editor page-container">
      <Link className="button button-outline" href={{ pathname: "/company/jobs", query: { company: company.id } }}>
        {copy("back")}
      </Link>
      <header>
        <p className="eyebrow"><span className="eyebrow-rule" />{company.name}</p>
        <h1>{copy("editJob")}</h1>
        <p>{job.title}</p>
      </header>
      <JobDraftForm
        companyId={company.id}
        job={{
          id: job.id,
          status: job.status,
          title: job.title,
          slug: job.slug,
          summary: job.summary,
          description: job.description,
          requirements: job.requirements,
          responsibilities: job.responsibilities,
          job_type: job.job_type,
          workplace_mode: job.workplace_mode,
          district: job.district,
        }}
      />
    </main>
  );
}
