import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PackageCheck, ShieldCheck } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import {
  CompanyPackageAssignmentForm,
  EditAdminPackageForm,
  NewAdminPackageForm,
} from "@/features/jobs/admin-package-forms";
import { getAdminPackageConsoleData } from "@/server/dal/admin-packages";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminPackagesPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminPackagesPage({
  params,
}: AdminPackagesPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const mfa = await getPlatformAdminMfaStatus();
  const copy = await getTranslations("AdminPackages");

  if (!mfa.aal2) {
    return (
      <main className="admin-packages-page page-container">
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  const { packages, companies } = await getAdminPackageConsoleData();

  return (
    <main className="admin-packages-page page-container">
      <header className="admin-packages-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <div className="admin-packages-links">
          <span><ShieldCheck size={15} aria-hidden="true" />{copy("mfaVerified")}</span>
          <Link href="/admin/company-profiles">{copy("companyReviews")}</Link>
        </div>
      </header>

      <section className="admin-packages-section" aria-labelledby="package-console-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("catalogEyebrow")}
            </p>
            <h2 id="package-console-title">{copy("catalogTitle")}</h2>
          </div>
          <span className="admin-count">{packages.length}</span>
        </header>

        <NewAdminPackageForm />
        {packages.length ? (
          <div className="admin-package-list">
            {packages.map((jobPackage) => (
              <article className="admin-package-card" key={jobPackage.id}>
                <header>
                  <div>
                    <span className="admin-package-code">{jobPackage.code}</span>
                    <h3>{jobPackage.display_name}</h3>
                  </div>
                  <span
                    className="admin-package-status"
                    data-active={jobPackage.is_active}
                  >
                    {jobPackage.is_active ? copy("active") : copy("inactive")}
                  </span>
                </header>
                <EditAdminPackageForm jobPackage={jobPackage} />
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-package-empty" role="status">
            <PackageCheck size={19} aria-hidden="true" />
            {copy("emptyPackages")}
          </p>
        )}
      </section>

      <section className="admin-packages-section" aria-labelledby="company-entitlement-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("companiesEyebrow")}
            </p>
            <h2 id="company-entitlement-title">{copy("companiesTitle")}</h2>
            <p>{copy("companiesDescription")}</p>
          </div>
          <span className="admin-count">{companies.length}</span>
        </header>

        <CompanyPackageAssignmentForm companies={companies} packages={packages} />
        {companies.length ? (
          <div className="admin-company-list">
            {companies.map((company) => (
              <article className="admin-company-package-card" key={company.id}>
                <div>
                  <h3>{company.name}</h3>
                  <p>{company.slug}</p>
                </div>
                {company.package_id ? (
                  <dl>
                    <div>
                      <dt>{copy("assignedPackage")}</dt>
                      <dd>{company.package_name} · {company.package_code}</dd>
                    </div>
                    <div>
                      <dt>{copy("activeJobs")}</dt>
                      <dd>{company.active_jobs} / {company.max_active_jobs}</dd>
                    </div>
                    <div>
                      <dt>{copy("jobDuration")}</dt>
                      <dd>{copy("days", { count: company.job_duration_days ?? 0 })}</dd>
                    </div>
                    <div>
                      <dt>{copy("assignmentExpiry")}</dt>
                      <dd>
                        {company.assignment_expires_at
                          ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
                              new Date(company.assignment_expires_at),
                            )
                          : copy("unlimited")}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="admin-no-assignment">{copy("noAssignment")}</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-package-empty" role="status">{copy("emptyCompanies")}</p>
        )}
      </section>
    </main>
  );
}
