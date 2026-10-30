import { routing } from "@/i18n/routing";
import { getLocalizedPageUrl } from "@/lib/seo";
import type { PublicJobListing } from "@/server/dal/jobs";

const employmentTypeByJobType: Record<
  PublicJobListing["job_type"],
  string
> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  temporary: "TEMPORARY",
  internship: "INTERN",
  freelance: "CONTRACTOR",
};

const REMOTE_WORKPLACE_MODE = "remote";

// Northern Cyprus is not an ISO 3166-1 country code, so the postal address
// carries the district as both locality and region and names the area in the
// address text; Google Jobs needs a country code, and "CY" is the only value
// that resolves the island for the geo lookup.
const COUNTRY_CODE = "CY";
const AREA_NAME = "Kuzey Kıbrıs Türk Cumhuriyeti";

function buildPostalAddress(district: string | null) {
  return {
    "@type": "PostalAddress",
    addressLocality: district ?? AREA_NAME,
    addressRegion: district ?? AREA_NAME,
    addressCountry: COUNTRY_CODE,
  };
}

/**
 * Builds the schema.org JobPosting graph for a public listing so Google Jobs and
 * answer engines can index individual vacancies. Returns a plain object; the
 * caller serialises it into a JSON-LD script tag.
 */
export function buildJobPostingStructuredData({
  job,
  baseUrl,
}: {
  job: PublicJobListing;
  baseUrl: URL;
}) {
  const description = job.description.trim() || job.summary.trim();
  // Listings are stored in Turkish and served identically under every locale
  // prefix, so the JobPosting URL must be the default-locale canonical the page
  // itself declares; a per-locale URL here would point Google Jobs at a copy
  // that canonicalises elsewhere.
  const canonicalUrl = getLocalizedPageUrl(
    routing.defaultLocale,
    `/jobs/${job.slug}`,
    baseUrl,
  ).toString();

  const isRemote = job.workplace_mode === REMOTE_WORKPLACE_MODE;

  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    "@id": `${canonicalUrl}#jobposting`,
    title: job.title,
    description,
    identifier: {
      "@type": "PropertyValue",
      name: "İşBul KKTC",
      value: job.id,
    },
    datePosted: job.published_at,
    validThrough: job.expires_at,
    employmentType: employmentTypeByJobType[job.job_type],
    directApply: true,
    url: canonicalUrl,
    hiringOrganization: {
      "@type": "Organization",
      name: job.company.name,
      ...(job.company.website ? { sameAs: job.company.website } : {}),
      ...(job.company.logo_url ? { logo: job.company.logo_url } : {}),
    },
    ...(isRemote
      ? {
          jobLocationType: "TELECOMMUTE",
          applicantLocationRequirements: {
            "@type": "Country",
            name: AREA_NAME,
          },
        }
      : {
          jobLocation: {
            "@type": "Place",
            address: buildPostalAddress(job.district),
          },
        }),
  };
}
