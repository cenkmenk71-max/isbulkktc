import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import { JobReviewForm } from "@/features/jobs/job-management-forms";
import { getPendingJobsForReview } from "@/server/dal/jobs";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { getLocalePrefix, routing } from "@/i18n/routing";
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

  const [mfa, copy] = await Promise.all([
    getPlatformAdminMfaStatus(),
    getTranslations("JobManagement.admin"),
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
  const prefix = getLocalePrefix(locale);

  return (
    <main className="admin-job-review-page page-container">
      <header className="admin-job-review-heading">
        <p className="eyebrow"><span className="eyebrow-rule" /><ShieldCheck size={15} aria-hidden="true" />{copy("pendingCount")}: {jobs.length}</p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <Link href="/admin/packages">{copy("backToPackages")}</Link>
      </header>

      {jobs.length ? (
        <ol className="admin-job-review-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <article className="admin-job-review-card">
                <header>
                  <div>
                    <p className="admin-job-review-company">{companyNames[job.company_id] ?? job.company_id}</p>
                    <h2>{job.title}</h2>
                    <p>{job.slug}</p>
                  </div>
                  <time dateTime={job.created_at}>{dateFormatter.format(new Date(job.created_at))}</time>
                </header>
                <p className="admin-job-review-summary">{job.summary}</p>
                <dl className="admin-job-review-details">
                  <div><dt>{copy("company")}</dt><dd>{companyNames[job.company_id] ?? job.company_id}</dd></div>
                  <div><dt>{copy("createdAt")}</dt><dd>{dateFormatter.format(new Date(job.created_at))}</dd></div>
                </dl>
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
            href={`${prefix}/admin/jobs?afterCreatedAt=${encodeURIComponent(nextCursor.createdAt)}&afterId=${encodeURIComponent(nextCursor.id)}`}
          >
            {copy("nextPage")}
          </Link>
        </nav>
      ) : null}
    </main>
  );
}
