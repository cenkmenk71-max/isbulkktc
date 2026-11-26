import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import { JobReviewForm } from "@/features/jobs/job-management-forms";
import { getPendingJobsForReview } from "@/server/dal/jobs";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminJobsPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ afterCreatedAt?: string; afterId?: string }>;
};

export default async function AdminJobsPage({
  params,
  searchParams,
}: AdminJobsPageProps) {
  const [{ locale: requestedLocale }, query] = await Promise.all([params, searchParams]);
  const locale = routing.locales.find((item) => item === requestedLocale);
  if (!locale) notFound();
  setRequestLocale(locale);

  const [mfa, copy, listingCopy] = await Promise.all([
    getPlatformAdminMfaStatus(),
    getTranslations("JobManagement.admin"),
    getTranslations("JobManagement.employer"),
  ]);

  if (!mfa.aal2) {
    return (
      <main className="admin-job-review-page page-container">
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  const { jobs, companyNames, nextCursor } = await getPendingJobsForReview({
    afterCreatedAt: query.afterCreatedAt,
    afterId: query.afterId,
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <main className="admin-job-review-page page-container">
      <header className="admin-job-review-heading">
        <p className="eyebrow"><span className="eyebrow-rule" /><ShieldCheck size={15} aria-hidden="true" />{copy("pageCount")}: {jobs.length}</p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <div className="admin-job-review-links">
          <Link href="/admin/packages">{copy("backToPackages")}</Link>
          <Link href="/admin/outreach">{copy("outreachLink")}</Link>
        </div>
      </header>

      {jobs.length ? (
        <ol className="admin-job-review-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <article className="admin-job-review-card">
                <header>
                  <div>
                    <p className="admin-job-review-company">{copy("company")}: {companyNames[job.company_id] ?? job.company_id}</p>
                    <h2>{job.title}</h2>
                    <p>{job.slug}</p>
                  </div>
                  <time dateTime={job.created_at}>{dateFormatter.format(new Date(job.created_at))}</time>
                </header>
                <p className="admin-job-review-summary">{job.summary}</p>
                <dl className="admin-job-review-details">
                  <div><dt>{copy("createdAt")}</dt><dd>{dateFormatter.format(new Date(job.created_at))}</dd></div>
                </dl>
                <details className="admin-job-review-full-details">
                  <summary>{copy("viewDetails")}</summary>
                  <dl className="admin-job-review-details">
                    <div><dt>{listingCopy("jobType")}</dt><dd>{listingCopy(job.job_type as "full_time" | "part_time" | "contract" | "temporary" | "internship" | "freelance")}</dd></div>
                    <div><dt>{listingCopy("workplaceMode")}</dt><dd>{listingCopy(job.workplace_mode as "on_site" | "hybrid" | "remote")}</dd></div>
                    <div><dt>{listingCopy("district")}</dt><dd>{job.district ?? "—"}</dd></div>
                  </dl>
                  <h3>{listingCopy("descriptionLabel")}</h3>
                  <p>{job.description}</p>
                  {job.requirements ? <><h3>{listingCopy("requirements")}</h3><p>{job.requirements}</p></> : null}
                  {job.responsibilities ? <><h3>{listingCopy("responsibilities")}</h3><p>{job.responsibilities}</p></> : null}
                </details>
                <JobReviewForm jobId={job.id} />
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <p className="admin-job-review-empty" role="status">{copy("noPending")}</p>
      )}

      {nextCursor ? (
        <nav aria-label={copy("nextPage")} className="admin-job-review-pagination">
          <Link
            className="button button-outline"
            href={{ pathname: "/admin/jobs", query: { afterCreatedAt: nextCursor.createdAt, afterId: nextCursor.id } }}
          >
            {copy("nextPage")}
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
