import {
  ArrowUpRight,
  Building2,
  FileText,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";

/**
 * The step markers are decorative (the ordered list already carries the order),
 * but they are still digits a reader sees, so they must follow the locale's own
 * numeral system — Latin `01` beside Persian copy reads as a foreign leak on
 * `/fa`. `Intl.NumberFormat(locale)` picks the locale's default numbering system
 * (`fa` → `۰۱`), which a zero-prefixed string literal can never do.
 */
export function formatStepNumber(locale: AppLocale, index: number) {
  return new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  }).format(index + 1);
}

export async function HomeJourneys({ locale }: { locale: AppLocale }) {
  const copy = await getTranslations({ locale, namespace: "HomeJourney" });

  return (
    <section className="home-journeys" aria-labelledby="home-journeys-title">
      <div className="page-container home-journeys-inner">
        <header className="home-journeys-heading" data-reveal>
          <span className="sector-kicker">{copy("eyebrow")}</span>
          <h2 id="home-journeys-title">{copy("title")}</h2>
          <p>{copy("description")}</p>
        </header>

        <div className="home-journey-grid">
          <article
            className="home-journey-card home-journey-card--candidate"
            data-reveal
            aria-labelledby="home-candidate-journey-title"
          >
            <div className="home-journey-card-top">
              <span className="home-journey-icon">
                <UserRound size={21} aria-hidden="true" />
              </span>
              <span className="home-journey-audience">
                {copy("candidate.audience")}
              </span>
              <span className="home-journey-card-mark" aria-hidden="true">
                <FileText size={17} />
              </span>
            </div>
            <h3 id="home-candidate-journey-title">
              {copy("candidate.title")}
            </h3>
            <p className="home-journey-description">
              {copy("candidate.description")}
            </p>
            <ol className="home-journey-steps">
              {(["account", "resume", "profile"] as const).map(
                (step, index) => (
                  <li key={step}>
                    <span className="home-journey-step-number" aria-hidden="true">
                      {formatStepNumber(locale, index)}
                    </span>
                    <span>
                      <strong>{copy(`candidate.steps.${step}.title`)}</strong>
                      <small>
                        {copy(`candidate.steps.${step}.description`)}
                      </small>
                    </span>
                  </li>
                ),
              )}
            </ol>
            <div className="home-journey-card-footer">
              <p className="home-journey-note">
                <LockKeyhole size={15} aria-hidden="true" />
                <span>{copy("candidate.privacy")}</span>
              </p>
              <Link className="home-journey-link" href="/register">
                {copy("candidate.action")}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </article>

          <article
            className="home-journey-card home-journey-card--employer"
            aria-labelledby="home-employer-journey-title"
          >
            <div className="home-journey-card-top">
              <span className="home-journey-icon">
                <Building2 size={21} aria-hidden="true" />
              </span>
              <span className="home-journey-audience">
                {copy("employer.audience")}
              </span>
              <span className="home-journey-card-mark" aria-hidden="true">
                <Building2 size={17} />
              </span>
            </div>
            <h3 id="home-employer-journey-title">
              {copy("employer.title")}
            </h3>
            <p className="home-journey-description">
              {copy("employer.description")}
            </p>
            <ol className="home-journey-steps">
              {(["company", "review", "listing"] as const).map(
                (step, index) => (
                  <li key={step}>
                    <span className="home-journey-step-number" aria-hidden="true">
                      {formatStepNumber(locale, index)}
                    </span>
                    <span>
                      <strong>{copy(`employer.steps.${step}.title`)}</strong>
                      <small>
                        {copy(`employer.steps.${step}.description`)}
                      </small>
                    </span>
                  </li>
                ),
              )}
            </ol>
            <div className="home-journey-card-footer">
              <p className="home-journey-note">
                <LockKeyhole size={15} aria-hidden="true" />
                <span>{copy("employer.privacy")}</span>
              </p>
              <Link
                className="home-journey-link"
                href={{ pathname: "/register", query: { audience: "employer" } }}
              >
                {copy("employer.action")}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
