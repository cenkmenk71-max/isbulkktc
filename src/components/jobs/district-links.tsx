import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getDistrictMessageKey } from "@/features/jobs/presentation";
import {
  districtSlug,
  northernCyprusDistrictValues,
} from "@/features/locations/northern-cyprus-districts";
import type { AppLocale } from "@/i18n/routing";

/**
 * Real `<a href>` links to every district's job page, so crawlers discover the
 * district landing pages from any of them (and from the job listing) instead of
 * leaving them orphaned. The current district is rendered as plain text — a
 * self-link adds nothing and would read oddly to a screen reader.
 */
export async function DistrictLinks({
  locale,
  currentDistrict,
  title,
  browseAllLabel,
}: {
  locale: AppLocale;
  currentDistrict?: string;
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
        {northernCyprusDistrictValues.map((district) => {
          const name = searchCopy(
            getDistrictMessageKey(district),
          );
          const slug = districtSlug(district);

          return (
            <li key={district}>
              {district === currentDistrict ? (
                <span className="district-links-current" aria-current="page">
                  <MapPin size={15} aria-hidden="true" />
                  {name}
                </span>
              ) : (
                <Link href={`/is-ilanlari/${slug}`}>
                  <MapPin size={15} aria-hidden="true" />
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
