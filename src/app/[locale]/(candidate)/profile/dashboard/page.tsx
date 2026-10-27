import { getTranslations } from "next-intl/server";
import { CandidateProfileForm } from "@/features/candidates/candidate-profile-form";
import { signOut } from "@/features/identity/actions";
import { getCandidateWorkspace } from "@/server/dal/user";
import { BriefcaseBusiness, LogOut } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { noIndexMetadata } from "@/lib/seo";
import { getMyApplications } from "@/server/dal/jobs";
import { getApplicationStatusMessageKey } from "@/features/jobs/presentation";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

export default async function CandidateDashboardPage() {
  const [{ user, profile }, copy, applicationData] = await Promise.all([
    getCandidateWorkspace(),
    getTranslations("CandidateDashboard"),
    getMyApplications(),
  ]);
  return (
    <div className="candidate-dashboard page-container">
      <header className="candidate-dashboard-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <div className="candidate-dashboard-heading-row">
          <div>
            <h1>{copy("title", { name: user.displayName })}</h1>
            <p>{copy("description")}</p>
          </div>
          <div className="candidate-dashboard-heading-actions">
            <Link className="button button-outline" href="/company/dashboard">
              <BriefcaseBusiness size={16} aria-hidden="true" />
              {copy("employerWorkspaceLink")}
            </Link>
            <form action={signOut} className="candidate-signout">
              <button className="button button-outline" type="submit">
                <LogOut size={16} aria-hidden="true" />
                {copy("signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <section
        aria-labelledby="candidate-applications-title"
        className="candidate-applications"
        id="my-applications"
      >
        <header>
          <div>
            <p className="eyebrow">{copy("eyebrow")}</p>
            <h2 id="candidate-applications-title">
              {copy("applicationsTitle")}
            </h2>
            <p>{copy("applicationsDescription")}</p>
          </div>
        </header>
        {applicationData.applications.length ? (
          <ul className="candidate-application-list">
            {applicationData.applications.map((application) => (
              <li key={application.application_id}>
                <article className="candidate-application-card">
                  <h3>
                    <Link href={`/jobs/${application.job_slug}`}>
                      {application.job_title}
                    </Link>
                  </h3>
                  <p>
                    <strong>
                      {copy(
                        getApplicationStatusMessageKey(
                          application.application_status,
                        ),
                      )}
                    </strong>
                  </p>
                  <dl>
                    <div>
                      <dt>{copy("applicationSubmittedAt")}</dt>
                      <dd>
                        {new Intl.DateTimeFormat(user.locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(application.submitted_at))}
                      </dd>
                    </div>
                    <div>
                      <dt>{copy("applicationViewedAt")}</dt>
                      <dd>
                        {application.first_viewed_at
                          ? new Intl.DateTimeFormat(user.locale, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(application.first_viewed_at))
                          : copy("applicationNotViewed")}
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">{copy("noApplications")}</p>
        )}
      </section>
      <CandidateProfileForm profile={profile} />
    </div>
  );
}
