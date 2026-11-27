import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Building2 } from "lucide-react";
import { CompanyProfileReviewForm } from "@/features/companies/company-profile-review-form";
import { CompanyVerificationReviewForm } from "@/features/companies/company-verification-review-form";
import {
  getAdminCompanyProfileReviewQueues,
} from "@/server/dal/companies";
import { deleteCompany } from "@/features/companies/actions";
import { AdminRoleRequiredError, requirePlatformRole } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { DeleteCompanyButton } from "./delete-company-button";

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
  try {
    await requirePlatformRole("platform_admin");
  } catch (error) {
    if (error instanceof AdminRoleRequiredError) {
      return (
        <main className="page-container">
          <section aria-labelledby="admin-role-required-title">
            <h2 id="admin-role-required-title">Yönetici yetkisi gerekli</h2>
            <p>
              Bu sayfaya erişmek için platform yöneticisi
              (platform_admin) yetkisine sahip olmalısınız.
            </p>
          </section>
        </main>
      );
    }
    throw error;
  }
  const [queues, copy, adminCopy] = await Promise.all([
    getAdminCompanyProfileReviewQueues(),
    getTranslations("CompanyReview"),
    getTranslations("AdminPackages"),
  ]);
  const { submissions, verifications } = queues;

  async function deleteCompanyAction(formData: FormData) {
    "use server";
    await deleteCompany(null, formData);
  }

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

      <section aria-labelledby="company-verification-title">
        <header className="company-review-verification-heading">
          <p className="eyebrow">
            <span className="eyebrow-rule" />
            {copy("verificationEyebrow")}
          </p>
          <h2 id="company-verification-title">{copy("verificationTitle")}</h2>
          <p>{copy("verificationDescription")}</p>
        </header>
        {verifications.length === 0 ? (
          <section className="company-review-empty" role="status">
            <Building2 size={23} aria-hidden="true" />
            <h3>{copy("verificationEmptyTitle")}</h3>
            <p>{copy("verificationEmptyDescription")}</p>
          </section>
        ) : (
          <div className="company-review-list">
            {verifications.map((company) => (
              <article className="company-review-card" key={company.id}>
                <header>
                  <span data-status={company.verification_status}>
                    {company.verification_status === "pending"
                      ? copy("verificationPending")
                      : copy("verificationRejected")}
                  </span>
                  <time dateTime={company.created_at}>
                    {new Intl.DateTimeFormat(locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(company.created_at))}
                  </time>
                </header>
                <h3>{company.name}</h3>
                <p>{company.slug}</p>
                <dl>
                  {company.public_email ? (
                    <>
                      <dt>{copy("publicEmail")}</dt>
                      <dd>{company.public_email}</dd>
                    </>
                  ) : null}
                  {company.phone ? (
                    <>
                      <dt>{copy("phone")}</dt>
                      <dd>{company.phone}</dd>
                    </>
                  ) : null}
                  {company.website ? (
                    <>
                      <dt>{copy("website")}</dt>
                      <dd>
                        <a
                          href={company.website}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {company.website}
                        </a>
                      </dd>
                    </>
                  ) : null}
                  {company.address || company.municipality ? (
                    <>
                      <dt>{copy("location")}</dt>
                      <dd>
                        {[company.address, company.municipality]
                          .filter(Boolean)
                          .join(" · ")}
                      </dd>
                    </>
                  ) : null}
                </dl>
                <CompanyVerificationReviewForm companyId={company.id} />
              </article>
            ))}
          </div>
        )}
      </section>

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
                      <a href={submission.website} rel="noopener noreferrer" target="_blank">
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

      <section className="company-deletion-section">
        <header className="company-deletion-heading">
          <p className="eyebrow">
            <span className="eyebrow-rule" />
            {copy("deletionEyebrow")}
          </p>
          <h2>{copy("deletionTitle")}</h2>
          <p>{copy("deletionDescription")}</p>
        </header>
        <div className="company-deletion-table">
          <table>
            <thead>
              <tr>
                <th>{copy("company")}</th>
                <th>{copy("slug")}</th>
                <th>{copy("verificationStatus")}</th>
                <th>{copy("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {verifications.map((company) => (
                <tr key={company.id}>
                  <td>{company.name}</td>
                  <td>{company.slug}</td>
                  <td>
                    <span data-status={company.verification_status}>
                      {company.verification_status}
                    </span>
                  </td>
                  <td>
                  <form action={deleteCompanyAction}>
                    <input name="companyId" type="hidden" value={company.id} />
                    <DeleteCompanyButton companyName={company.name} />
                  </form>
                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
