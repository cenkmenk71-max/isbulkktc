import type { MetadataRoute } from "next";
import { newestJobModifiedAt } from "@/features/jobs/sitemap-lastmod";
import {
  districtSlug,
  northernCyprusDistrictValues,
} from "@/features/locations/northern-cyprus-districts";
import { jobTypeKeys, jobTypeSlugs } from "@/features/jobs/job-type-slugs";
import { routing } from "@/i18n/routing";
import { getLocalizedPageUrl } from "@/lib/seo";
import { getAppBaseUrl } from "@/server/config/app-url";
import { listPublicJobSitemapEntries } from "@/server/dal/jobs";

// Regenerate at most once an hour; the search RPC fans out over every published
// listing and the sitemap is not latency-sensitive.
export const revalidate = 3600;

const publicPages = [
  { pathname: "/", changeFrequency: "weekly", priority: 1 },
  { pathname: "/jobs", changeFrequency: "daily", priority: 0.9 },
  { pathname: "/companies", changeFrequency: "weekly", priority: 0.8 },
  { pathname: "/freelance", changeFrequency: "monthly", priority: 0.7 },
  { pathname: "/packages", changeFrequency: "monthly", priority: 0.7 },
  { pathname: "/about", changeFrequency: "monthly", priority: 0.6 },
  { pathname: "/blog", changeFrequency: "hourly", priority: 0.8 },
  { pathname: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { pathname: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/cookies", changeFrequency: "yearly", priority: 0.3 },
  { pathname: "/terms", changeFrequency: "yearly", priority: 0.3 },
] as const;

// Only the two routes that render live listings have a date that can be checked
// against the page itself: publishing a vacancy changes both. Google keeps a
// `<lastmod>` only while it stays "consistently and verifiably accurate" and
// drops the signal once it does not, so the remaining pages advertise no date
// rather than a build timestamp that is stale the moment it ships.
const routesWithListingDate = new Set<string>(["/", "/jobs"]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl();

  const jobs = await listPublicJobSitemapEntries();

  // The listing routes advertise the newest vacancy `<lastmod>`, so it must be
  // the same instant the vacancy entries below carry (`modifiedAt`). See
  // `newestJobModifiedAt`.
  const newestJobDate = newestJobModifiedAt(jobs);

  const staticEntries: MetadataRoute.Sitemap = publicPages.flatMap(
    ({ pathname, changeFrequency, priority }) => {
      const languages = {
        ...Object.fromEntries(
          routing.locales.map((locale) => [
            locale,
            getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
          ]),
        ),
        "x-default": getLocalizedPageUrl(
          routing.defaultLocale,
          pathname,
          baseUrl,
        ).toString(),
      };
      const lastModified =
        newestJobDate && routesWithListingDate.has(pathname)
          ? newestJobDate
          : undefined;

      return routing.locales.map((locale) => ({
        url: getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
        alternates: { languages },
        ...(lastModified ? { lastModified } : {}),
        changeFrequency,
        priority,
      }));
    },
  );

  // Vacancies are stored in Turkish and served identically under every locale
  // prefix, so each is advertised once, at its default-locale canonical URL.
  // Listing all six prefixes would ask Google to crawl six copies of one text.
  const jobEntries: MetadataRoute.Sitemap = jobs.map((job) => ({
    url: getLocalizedPageUrl(
      routing.defaultLocale,
      `/jobs/${job.slug}`,
      baseUrl,
    ).toString(),
    lastModified: job.modifiedAt,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // District landing pages ("Lefkoşa iş ilanları", ...). Each is localized and
  // carries its own canonical, so it is listed per locale like the static
  // routes. They share the newest vacancy date: a new listing in a district is
  // the only thing that changes the page.
  const districtEntries: MetadataRoute.Sitemap =
    northernCyprusDistrictValues.flatMap((district) => {
      const slug = districtSlug(district);
      const pathname = `/is-ilanlari/${slug}`;
      const languages = {
        ...Object.fromEntries(
          routing.locales.map((locale) => [
            locale,
            getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
          ]),
        ),
        "x-default": getLocalizedPageUrl(
          routing.defaultLocale,
          pathname,
          baseUrl,
        ).toString(),
      };

      return routing.locales.map((locale) => ({
        url: getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
        alternates: { languages },
        ...(newestJobDate ? { lastModified: newestJobDate } : {}),
        changeFrequency: "daily" as const,
        priority: 0.7,
      }));
    });

  // Employment-type landing pages ("Tam zamanlı iş ilanları", "Staj", ...).
  // Same shape as the district pages: localized, self-canonical, sharing the
  // newest vacancy date.
  const jobTypeEntries: MetadataRoute.Sitemap = jobTypeKeys.flatMap((jobType) => {
    const slug = jobTypeSlugs[jobType];
    const pathname = `/is-turleri/${slug}`;
    const languages = {
      ...Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
        ]),
      ),
      "x-default": getLocalizedPageUrl(
        routing.defaultLocale,
        pathname,
        baseUrl,
      ).toString(),
    };

    return routing.locales.map((locale) => ({
      url: getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
      alternates: { languages },
      ...(newestJobDate ? { lastModified: newestJobDate } : {}),
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
  });

  return [...staticEntries, ...districtEntries, ...jobTypeEntries, ...jobEntries];
}

