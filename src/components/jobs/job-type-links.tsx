import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getJobTypeMessageKey } from "@/features/jobs/presentation";
import type { AppLocale } from "@/i18n/routing";
import {
  jobTypeKeys,
  jobTypeSlugs,
  type JobTypeKey,
} from "@/features/jobs/job-type-slugs";

/**
 * Real `<a href>` links to every employment-type page ("Tam zamanlı iş
 * ilanları", "Staj", ...), so the six pages discover each other and are reachable
 * from a page that already has links pointing at it. The current type renders as
 * plain text rather than a self-link.
 */
export async function JobTypeLinks({
  locale,
  currentType,
  title,
  browseAllLabel,
}: {
  locale: AppLocale;
  currentType?: JobTypeKey;
  title: string;
  browseAllLabel: string;
}) {
  const searchCopy = await getTranslations({
    locale,
    namespace: "HomeJobSearch",
  });

  return (
    <nav className="district-links" aria-label={title}>
      <h2 className="district-links-title">{title}</h2>
      <ul>
        {jobTypeKeys.map((jobType) => {
          const name = searchCopy(getJobTypeMessageKey(jobType));
          const slug = jobTypeSlugs[jobType];

          return (
            <li key={jobType}>
              {jobType === currentType ? (
                <span className="district-links-current" aria-current="page">
                  <Clock size={15} aria-hidden="true" />
                  {name}
                </span>
              ) : (
                <Link href={`/is-turleri/${slug}`}>
                  <Clock size={15} aria-hidden="true" />
                  {name}
                </Link>
              )}
            </li>
          );
        })}
        <li>
          <Link className="district-links-all" href="/jobs">
            {browseAllLabel}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
