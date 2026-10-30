import type { MetadataRoute } from "next";
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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl();

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

      return routing.locales.map((locale) => ({
        url: getLocalizedPageUrl(locale, pathname, baseUrl).toString(),
        alternates: { languages },
        changeFrequency,
        priority,
      }));
    },
  );

  // Vacancies are stored in Turkish and served identically under every locale
  // prefix, so each is advertised once, at its default-locale canonical URL.
  // Listing all six prefixes would ask Google to crawl six copies of one text.
  const jobEntries: MetadataRoute.Sitemap = (
    await listPublicJobSitemapEntries()
  ).map((job) => ({
    url: getLocalizedPageUrl(
      routing.defaultLocale,
      `/jobs/${job.slug}`,
      baseUrl,
    ).toString(),
    lastModified: job.modifiedAt,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticEntries, ...jobEntries];
}
