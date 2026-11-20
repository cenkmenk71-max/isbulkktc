import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { BriefcaseBusiness, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { getCompanyJobs, getCompanyJobEntitlements } from "@/server/dal/jobs";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type EmployerJobsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ company?: string }>;
};

export default async function EmployerJobsPage({
  params,
  searchParams,
}: EmployerJobsPageProps) {
  const [{ locale: requestedLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = routing.locales.find((item) => item === requestedLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const [{ company }, copy] = await Promise.all([
    getEmployerWorkspace(query.company),
    getTranslations("JobManagement.employer"),
  ]);
  const [jobs, entitlements] = await Promise.all([
    getCompanyJobs(company.id),
    getCompanyJobEntitlements(company.id),
  ]);
  const entitlement = entitlements[0] ?? null;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

  return (
    <main className="employer-jobs-page page-container">
      <header className="employer-jobs-heading">
        <p className="eyebrow"><span className="eyebrow-rule" />{company.name}</p>
        <div className="employer-jobs-heading-row">
          <div>
            <h1>{copy("title")}</h1>
            <p>{copy("description")}</p>
          </div>
          <Link
            className="button button-dark"
            href={{ pathname: "/company/jobs/new", query: { company: company.id } }}
          >
            <Plus size={16} aria-hidden="true" />
            {copy("newJob")}
          </Link>
        </div>
        {entitlement ? (
          <p className="employer-jobs-capacity">
            {copy("activeJobs")}: {copy("activeJobCount", { count: entitlement.active_jobs })} / {entitlement.max_active_jobs}
          </p>
        ) : null}
      </header>

      {jobs.length > 0 ? (
        <ul className="employer-job-list">
          {jobs.map((job) => {
            const status = job.status;
            const editable = status === "draft" || status === "rejected";
            return (
              <li key={job.id}>
                <article className="employer-job-card">
                  <div className="employer-job-card-main">
                    <p className="employer-job-card-status" data-status={status}>
                      {copy(status as "draft" | "pending_review" | "approved" | "rejected" | "published" | "expired")}
                    </p>
                    <h2>{job.title}</h2>
                    <p>{job.summary}</p>
                    <p className="employer-job-card-date">
                      {copy("createdAt")}: {dateFormatter.format(new Date(job.created_at))}
                    </p>
                    {status === "approved" ? <p role="status">{copy("approvedNote")}</p> : null}
                    {status === "rejected" ? <p role="status">{job.moderation_note || copy("rejectedNote")}</p> : null}
                    {status === "pending_review" ? <p role="status">{copy("pendingNote")}</p> : null}
                  </div>
                  {editable ? (
                    <Link
                      className="button button-outline"
                      href={`/company/jobs/${job.id}/edit?company=${encodeURIComponent(company.id)}`}
                    >
                      {copy("editJob")}
                    </Link>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="employer-jobs-empty">
          <BriefcaseBusiness size={28} aria-hidden="true" />
          <p>{copy("noJobs")}</p>
          <Link className="button button-outline" href={{ pathname: "/company/jobs/new", query: { company: company.id } }}>
            {copy("newJob")}
          </Link>
        </div>
      )}
    </main>
  );
}
