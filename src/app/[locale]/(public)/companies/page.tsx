import type { Metadata } from "next";
import Image from "next/image";
import { connection } from "next/server";
import { ArrowUpRight, Building2 } from "lucide-react";
import { EmployerLogo } from "@/components/jobs/employer-logo";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CompanyDirectory } from "@/features/companies/company-directory";
import { withCompanyLogos } from "@/features/companies/company-logos";
import { companyDirectory } from "@/features/companies/directory-data";
import { applyCompanyDirectoryOverrides, deduplicateCompanyDirectory } from "@/features/companies/directory";
import { getPublicCompanyDirectoryOverrides } from "@/server/dal/companies";
import { getPublicJobCompanies } from "@/server/dal/jobs";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createLocalizedPageMetadata } from "@/lib/seo";

type CompaniesPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: CompaniesPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  const t = await getTranslations({ locale, namespace: "CompaniesMeta" });
  return createLocalizedPageMetadata({
    locale,
    pathname: "/companies",
    title: t("title"),
    description: t("description"),
  });
}

export default async function CompaniesPage({ params }: CompaniesPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  await connection();
  const [t, overrides, jobCompanies] = await Promise.all([
    getTranslations("CompanyDirectory"),
    getPublicCompanyDirectoryOverrides(),
    getPublicJobCompanies(),
  ]);
  const publishedCompanies = withCompanyLogos(
    deduplicateCompanyDirectory(
      applyCompanyDirectoryOverrides(companyDirectory, overrides),
    ),
  );

  return (
    <div className="company-directory-page">
      <div className="page-container">
        <header className="company-directory-hero">
          <Image
            src="/images/company-directory.webp"
            alt=""
            fill
            preload
            sizes="(max-width: 740px) 100vw, 1200px"
            quality={85}
            className="company-directory-hero-image"
          />
          <span className="company-directory-hero-shade" aria-hidden="true" />
          <div className="company-directory-hero-copy">
            <p className="company-directory-eyebrow">
              <span aria-hidden="true" />
              {t("eyebrow")}
            </p>
            <h1>{t("title")}</h1>
            <p className="company-directory-description">
              {t("description")}
            </p>
          </div>
          <div className="company-directory-total" aria-label={t("totalLabel", { count: publishedCompanies.length })}>
            <Building2 size={20} aria-hidden="true" />
            <strong>{publishedCompanies.length.toLocaleString(locale)}</strong>
            <span>{t("totalLabel", { count: publishedCompanies.length })}</span>
          </div>
        </header>

        {jobCompanies.length > 0 ? (
          <section
            className="company-job-employers"
            aria-labelledby="company-job-employers-title"
          >
            <div className="company-job-employers-heading">
              <div>
                <p className="company-directory-eyebrow">
                  {t("jobEmployersEyebrow")}
                </p>
                <h2 id="company-job-employers-title">
                  {t("jobEmployersTitle")}
                </h2>
                <p>{t("jobEmployersDescription")}</p>
              </div>
              <span>
                {t("jobEmployersCount", { count: jobCompanies.length })}
              </span>
            </div>
            <ul>
              {jobCompanies.map((company) => (
                <li key={company.company_slug}>
                  <article className="company-job-employer-card">
                    <div className="company-job-employer-heading">
                      <EmployerLogo
                        companyName={company.company_name}
                        logoUrl={company.logo_url}
                        className="company-job-employer-logo"
                        sizes="48px"
                      />
                      <div>
                        <strong>
                          <Link
                            href={`/jobs?query=${encodeURIComponent(company.company_name)}`}
                          >
                            {company.company_name}
                          </Link>
                        </strong>
                        <small>
                          {t("activeJobCount", {
                            count: company.active_job_count,
                          })}
                        </small>
                      </div>
                    </div>
                    {company.profile_description ? (
                      <p className="company-job-employer-description">
                        {company.profile_description}
                      </p>
                    ) : null}
                    {company.categories.length > 0 || company.municipality ? (
                      <div className="company-job-employer-facts">
                        {company.categories.map((category) => (
                          <span key={category}>{category}</span>
                        ))}
                        {company.municipality ? (
                          <span>{company.municipality}</span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="company-job-employer-links">
                      {company.website ? (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("companyWebsite")}:{" "}
                          {new URL(company.website).hostname}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      ) : null}
                      {company.source_profile_url ? (
                        <a
                          href={company.source_profile_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("sourceProfileLink")}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      ) : null}
                      {company.source_listing_url ? (
                        <a
                          href={company.source_listing_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t("sourceListingLink")}
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </a>
                      ) : null}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
            <p className="company-job-employers-note">
              {t("jobEmployersVerificationNote")}
            </p>
          </section>
        ) : null}
        <CompanyDirectory companies={publishedCompanies} />
      </div>
    </div>
  );
}
