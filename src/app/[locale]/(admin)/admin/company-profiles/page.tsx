import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { CompanyProfileReviewForm } from "@/features/companies/company-profile-review-form";
import { getPendingCompanyProfileSubmissions } from "@/server/dal/companies";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type CompanyProfileReviewPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function CompanyProfileReviewPage({
  params,
}: CompanyProfileReviewPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const [submissions, copy, adminCopy] = await Promise.all([
    getPendingCompanyProfileSubmissions(),
    getTranslations("CompanyReview"),
    getTranslations("AdminPackages"),
  ]);

  return (
    <main className="company-review-page page-container">
      <header className="company-review-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <Link className="admin-review-link" href="/admin/packages">
          {adminCopy("catalogTitle")}
        </Link>
      </header>

      {submissions.length === 0 ? (
        <section className="company-review-empty" role="status">
          <Building2 size={23} aria-hidden="true" />
          <h2>{copy("emptyTitle")}</h2>
          <p>{copy("emptyDescription")}</p>
        </section>
      ) : (
        <div className="company-review-list">
          {submissions.map((submission) => (
            <article className="company-review-card" key={submission.id}>
              <header>
                <span>{copy("pending")}</span>
                <time dateTime={submission.created_at}>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(submission.created_at))}
                </time>
              </header>
              <h2>{submission.company_name}</h2>
              {submission.profile_description ? (
                <p>{submission.profile_description}</p>
              ) : null}
              <dl>
                {submission.categories.length ? (
                  <>
                    <dt>{copy("categories")}</dt>
                    <dd>{submission.categories.join(", ")}</dd>
                  </>
                ) : null}
                {submission.public_email ? (
                  <>
                    <dt>{copy("publicEmail")}</dt>
                    <dd>{submission.public_email}</dd>
                  </>
                ) : null}
                {submission.phone ? (
                  <>
                    <dt>{copy("phone")}</dt>
                    <dd>{submission.phone}</dd>
                  </>
                ) : null}
                {submission.website ? (
                  <>
                    <dt>{copy("website")}</dt>
                    <dd>
                      <a href={submission.website} rel="noreferrer" target="_blank">
                        {submission.website}
                      </a>
                    </dd>
                  </>
                ) : null}
                {submission.address || submission.municipality ? (
                  <>
                    <dt>{copy("location")}</dt>
                    <dd>
                      {[submission.address, submission.municipality]
                        .filter(Boolean)
                        .join(" · ")}
                    </dd>
                  </>
                ) : null}
              </dl>
              <CompanyProfileReviewForm submissionId={submission.id} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
