import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  FileCheck2,
  LogOut,
  MapPin,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/features/identity/actions";
import { CompanyProfileForm } from "@/features/companies/company-profile-form";
import { markApplicationViewed } from "@/features/jobs/actions";
import { companyDirectory } from "@/features/companies/directory-data";
import { getCompanyProfileCompletion } from "@/features/companies/profile-completion";
import { getCompanyApplications, isJobCompanyMember } from "@/server/dal/jobs";
import { getApplicationStatusMessageKey } from "@/features/jobs/presentation";
import { getEmployerWorkspace } from "@/server/dal/companies";
import {
  getNorthernCyprusDistrictForLocation,
  northernCyprusDistricts,
  resolveNorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";
import { getLocalePrefix, routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type CompanyDashboardPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ company?: string }>;
};

export default async function CompanyDashboardPage({
  params,
  searchParams,
}: CompanyDashboardPageProps) {
  const [{ locale: requestedLocale }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const [{ user, companies, company, latestSubmission }, copy] =
    await Promise.all([
      getEmployerWorkspace(query.company),
      getTranslations("CompanyManagement"),
    ]);
  const submittedProfile =
    latestSubmission && latestSubmission.status !== "approved"
      ? latestSubmission
      : company;
  const submittedCompanyName =
    "company_name" in submittedProfile
      ? submittedProfile.company_name
      : submittedProfile.name;
  const directoryTarget =
    submittedProfile.directory_entry_id &&
    submittedProfile.directory_location_index !== null
      ? `${submittedProfile.directory_entry_id}:${submittedProfile.directory_location_index}`
      : "";
  const districtLabels = new Map(
    northernCyprusDistricts.map(({ value, key }) => [
      value,
      copy(`districts.${key}`),
    ]),
  );
  const submittedDistrict = resolveNorthernCyprusDistrict(
    submittedProfile.municipality,
  );
  const submittedDistrictLabel = submittedDistrict
    ? districtLabels.get(submittedDistrict)
    : null;
  const directoryTargetRows = companyDirectory.flatMap((entry) =>
    entry.locations.map((location, index) => {
      const district = getNorthernCyprusDistrictForLocation(location);
      return {
        value: `${entry.id}:${index}`,
        baseLabel: [
          entry.name,
          district ? districtLabels.get(district) : null,
          location.address,
          `${index + 1}`,
        ]
          .filter(Boolean)
          .join(" · "),
        categories: entry.categories,
        website: location.website,
        phone: location.phone,
        publicEmail: location.email ?? null,
        address: location.address,
        municipality: location.municipality,
      };
    }),
  );
  const directoryTargetLabelCounts = new Map<string, number>();
  for (const { baseLabel } of directoryTargetRows) {
    directoryTargetLabelCounts.set(
      baseLabel,
      (directoryTargetLabelCounts.get(baseLabel) ?? 0) + 1,
    );
  }
  const directoryTargetOccurrences = new Map<string, number>();
  const directoryTargets = directoryTargetRows.map(({ baseLabel, ...target }) => {
    const occurrence = (directoryTargetOccurrences.get(baseLabel) ?? 0) + 1;
    directoryTargetOccurrences.set(baseLabel, occurrence);
    return {
      ...target,
      label:
        (directoryTargetLabelCounts.get(baseLabel) ?? 0) > 1
          ? `${baseLabel} (${occurrence})`
          : baseLabel,
    };
  });
  const directoryTargetLabel =
    directoryTargets.find(({ value }) => value === directoryTarget)?.label ??
    null;
  const profileCompletion = getCompanyProfileCompletion({
    companyName: submittedCompanyName,
    profileDescription: submittedProfile.profile_description,
    categories: submittedProfile.categories,
    website: submittedProfile.website,
    phone: submittedProfile.phone,
    publicEmail: submittedProfile.public_email,
    address: submittedProfile.address,
    municipality: submittedProfile.municipality,
  });
  const reviewStatus = latestSubmission?.status ?? "notSubmitted";
  const companyInitial = Array.from(submittedCompanyName.trim())[0] ?? "Ş";
  const localePrefix = getLocalePrefix(locale);
  const canReviewApplications =
    company.verification_status === "verified" &&
    (await isJobCompanyMember(company.id));
  const applications = canReviewApplications
    ? await getCompanyApplications(company.id)
    : [];

  return (
    <main className="company-management page-container">
      <header className="company-management-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <div className="company-management-heading-row">
          <div>
            <h1>{copy("title", { name: user.displayName })}</h1>
            <p>{copy("description")}</p>
          </div>
          <div className="company-management-heading-actions">
            <Link className="button button-outline" href="/profile/dashboard">
              {copy("candidateWorkspaceLink")}
            </Link>
            <Link className="button button-outline" href="/company/new">
              <Plus size={16} aria-hidden="true" />
              {copy("addCompany")}
            </Link>
            <form action={signOut}>
              <button className="button button-outline" type="submit">
                <LogOut size={16} aria-hidden="true" />
                {copy("signOut")}
              </button>
            </form>
          </div>
        </div>
        {companies.length > 1 ? (
          <nav
            aria-label={copy("companySwitcher")}
            className="company-management-switcher"
          >
            {companies.map((item) => (
              <a
                aria-current={item.id === company.id ? "page" : undefined}
                href={`${localePrefix}/company/dashboard?company=${encodeURIComponent(item.id)}`}
                key={item.id}
              >
                {item.name}
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      <nav
        aria-label={copy("workspace.navigation")}
        className="company-workspace-nav"
      >
        <a href="#overview">{copy("workspace.overview")}</a>
        <a href="#company-profile">{copy("workspace.companyProfile")}</a>
        <a href="#directory-listing">{copy("workspace.directoryListing")}</a>
      </nav>

      {canReviewApplications ? (
        <section
          aria-labelledby="company-applications-title"
          className="company-applications"
          id="applications"
        >
          <header>
            <div>
              <p className="eyebrow">{copy("applicationsTitle")}</p>
              <h2 id="company-applications-title">
                {copy("applicationsTitle")}
              </h2>
              <p>{copy("applicationsDescription")}</p>
            </div>
            <span className="admin-count">{applications.length}</span>
          </header>
          {applications.length ? (
            <ul className="company-application-list">
              {applications.map((application) => (
                <li key={application.application_id}>
                  <article className="company-application-card">
                    <div>
                      <h3>{application.job_title}</h3>
                      <p>
                        {copy("candidateLabel")}: {application.candidate_name}
                      </p>
                      <p>
                        {copy(
                          getApplicationStatusMessageKey(
                            application.application_status,
                          ),
                        )}
                      </p>
                      <p>
                        {copy("applicationSubmittedAt")}:{" "}
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(application.submitted_at))}
                      </p>
                    </div>
                    <form action={markApplicationViewed}>
                      <input
                        name="applicationId"
                        type="hidden"
                        value={application.application_id}
                      />
                      <button className="button button-outline" type="submit">
                        {copy("openApplication")}
                      </button>
                    </form>
                  </article>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">{copy("noApplications")}</p>
          )}
        </section>
      ) : null}

      <section
        aria-labelledby="company-workspace-overview-title"
        className="company-workspace-overview"
        id="overview"
      >
        <div className="company-workspace-overview-copy">
          <p className="company-workspace-kicker">
            <Building2 size={15} aria-hidden="true" />
            {copy("workspace.overviewKicker")}
          </p>
          <h2 id="company-workspace-overview-title">
            {copy("workspace.overviewTitle")}
          </h2>
          <p className="company-workspace-overview-description">
            {copy("workspace.overviewDescription")}
          </p>
          <div className="company-workspace-company">
            <span aria-hidden="true" className="company-workspace-monogram">
              {companyInitial.toLocaleUpperCase(locale)}
            </span>
            <span>
              <strong>{submittedCompanyName}</strong>
              <span>
                {submittedDistrictLabel ||
                  copy("workspace.locationNotAdded")}
              </span>
            </span>
          </div>
          <div className="company-workspace-statuses">
            <span
              className={`company-workspace-pill company-workspace-pill--${company.verification_status}`}
            >
              <ShieldCheck size={14} aria-hidden="true" />
              {copy(`verification.${company.verification_status}`)}
            </span>
            <span
              className={`company-workspace-pill company-workspace-pill--${reviewStatus}`}
            >
              {reviewStatus === "pending" ? (
                <Clock3 size={14} aria-hidden="true" />
              ) : (
                <FileCheck2 size={14} aria-hidden="true" />
              )}
              {reviewStatus === "notSubmitted"
                ? copy("workspace.noSubmission")
                : copy(`submission.${reviewStatus}`)}
            </span>
          </div>
        </div>

        <div className="company-workspace-completion">
          <div className="company-workspace-completion-heading">
            <div>
              <p>{copy("workspace.profileCompleteness")}</p>
              <strong>
                {copy("workspace.completedFields", {
                  completed: profileCompletion.completed,
                  total: profileCompletion.total,
                })}
              </strong>
            </div>
            <output
              aria-label={copy("workspace.completionLabel", {
                percent: profileCompletion.percentage,
              })}
              className="company-workspace-completion-value"
            >
              {profileCompletion.percentage}%
            </output>
          </div>
          <progress
            aria-label={copy("workspace.profileCompleteness")}
            className="company-workspace-progress"
            max={100}
            value={profileCompletion.percentage}
          />
          <p className="company-workspace-completion-note">
            {copy("workspace.completionDescription")}
          </p>
          <a className="company-workspace-action-link" href="#company-profile">
            {copy("workspace.completeProfile")}
            <ArrowRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <div
        aria-label={copy("workspace.summary")}
        className="company-workspace-summary"
        role="group"
      >
        <article className="company-workspace-summary-card">
          <span className="company-workspace-summary-icon company-workspace-summary-icon--review">
            <Clock3 size={17} aria-hidden="true" />
          </span>
          <div>
            <p>{copy("workspace.reviewSummary")}</p>
            <strong>
              {reviewStatus === "notSubmitted"
                ? copy("workspace.noSubmission")
                : copy(`submission.${reviewStatus}`)}
            </strong>
            <span>{copy("workspace.reviewSummaryDescription")}</span>
          </div>
        </article>
        <article className="company-workspace-summary-card">
          <span className="company-workspace-summary-icon company-workspace-summary-icon--directory">
            <MapPin size={17} aria-hidden="true" />
          </span>
          <div>
            <p>{copy("workspace.directorySummary")}</p>
            <strong>
              {directoryTargetLabel ?? copy("workspace.directoryNotLinked")}
            </strong>
            <span>{copy("workspace.directorySummaryDescription")}</span>
          </div>
        </article>
        <article className="company-workspace-summary-card">
          <span className="company-workspace-summary-icon company-workspace-summary-icon--verification">
            {company.verification_status === "verified" ? (
              <BadgeCheck size={17} aria-hidden="true" />
            ) : (
              <ShieldCheck size={17} aria-hidden="true" />
            )}
          </span>
          <div>
            <p>{copy("workspace.verificationSummary")}</p>
            <strong>{copy(`verification.${company.verification_status}`)}</strong>
            <span>{copy("workspace.verificationSummaryDescription")}</span>
          </div>
        </article>
      </div>

      <div className="company-workspace-content">
        <section
          aria-label={copy("workspace.companyProfile")}
          className="company-workspace-profile"
          id="company-profile"
        >
          <CompanyProfileForm
            address={submittedProfile.address}
            categories={submittedProfile.categories}
            companyId={company.id}
            companyName={submittedCompanyName}
            directoryTarget={directoryTarget}
            directoryTargets={directoryTargets}
            municipality={submittedProfile.municipality}
            phone={submittedProfile.phone}
            profileDescription={submittedProfile.profile_description}
            publicEmail={submittedProfile.public_email}
            reviewNote={latestSubmission?.review_note ?? null}
            submissionStatus={latestSubmission?.status ?? null}
            verificationStatus={company.verification_status}
            website={submittedProfile.website}
          />
        </section>

        <aside
          aria-labelledby="company-directory-listing-title"
          className="company-workspace-aside"
          id="directory-listing"
        >
          <section className="company-workspace-preview-card">
            <header className="company-workspace-panel-heading">
              <div>
                <p>{copy("workspace.directoryListingEyebrow")}</p>
                <h2 id="company-directory-listing-title">
                  {copy("workspace.directoryListing")}
                </h2>
              </div>
              <span
                aria-hidden="true"
                className="company-workspace-preview-icon"
              >
                <Building2 size={18} />
              </span>
            </header>
            <div className="company-workspace-preview">
              <div className="company-workspace-preview-brand">
                <span
                  aria-hidden="true"
                  className="company-workspace-preview-monogram"
                >
                  {companyInitial.toLocaleUpperCase(locale)}
                </span>
                <div>
                  <p>{copy("workspace.profileLabel")}</p>
                  <strong>{submittedCompanyName}</strong>
                </div>
              </div>
              {submittedProfile.categories.length ? (
                <ul
                  aria-label={copy("categories")}
                  className="company-workspace-category-list"
                >
                  {submittedProfile.categories.slice(0, 4).map((category) => (
                    <li key={category}>{category}</li>
                  ))}
                  {submittedProfile.categories.length > 4 ? (
                    <li>
                      {copy("workspace.moreCategories", {
                        count: submittedProfile.categories.length - 4,
                      })}
                    </li>
                  ) : null}
                </ul>
              ) : (
                <p className="company-workspace-preview-empty">
                  {copy("workspace.categoriesNotAdded")}
                </p>
              )}
              <p className="company-workspace-preview-description">
                {submittedProfile.profile_description ||
                  copy("workspace.descriptionNotAdded")}
              </p>
              <dl className="company-workspace-preview-details">
                <div>
                  <dt>{copy("municipality")}</dt>
                  <dd>
                    {[
                      submittedDistrictLabel,
                      submittedProfile.address,
                    ]
                      .filter(Boolean)
                      .join(" · ") || copy("workspace.locationNotAdded")}
                  </dd>
                </div>
                <div>
                  <dt>{copy("website")}</dt>
                  <dd>
                    {submittedProfile.website || copy("workspace.notAdded")}
                  </dd>
                </div>
                <div>
                  <dt>{copy("phone")}</dt>
                  <dd>{submittedProfile.phone || copy("workspace.notAdded")}</dd>
                </div>
                <div>
                  <dt>{copy("publicEmail")}</dt>
                  <dd>
                    {submittedProfile.public_email || copy("workspace.notAdded")}
                  </dd>
                </div>
              </dl>
            </div>
            <p className="company-workspace-preview-note">
              {copy(
                latestSubmission?.status === "approved"
                  ? "workspace.listingPublishedNote"
                  : "workspace.listingPrivacyNote",
              )}
            </p>
          </section>

          <section className="company-workspace-trust-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <h2>{copy("workspace.verificationNoticeTitle")}</h2>
              <p>{copy("workspace.verificationNoticeDescription")}</p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
