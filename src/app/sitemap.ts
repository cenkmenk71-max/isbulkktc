import type { MetadataRoute } from "next";
import { newestJobModifiedAt } from "@/features/jobs/sitemap-lastmod";
import { districtSlug } from "@/features/locations/northern-cyprus-districts";
import { jobTypeSlugs } from "@/features/jobs/job-type-slugs";
import { GUIDE_UPDATED, getGuideSlugs, getGuides } from "@/content/guides";
import { ARTICLE_UPDATED, getArticleSlugs, getArticles } from "@/content/editorial";
import {
  availableDistricts,
  availableJobTypes,
  computeLandingAvailability,
} from "@/features/jobs/landing-availability";
import { routing, type AppLocale } from "@/i18n/routing";
import { getLocalizedPageUrl, getLocalizedSlugPathnames } from "@/lib/seo";
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
  { pathname: "/sss", changeFrequency: "monthly", priority: 0.7 },
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

  // A landing page whose filter matches nothing is `noindex` (see
  // `noIndexFollowMetadata`), so it must not appear here: a sitemap entry that
  // answers `noindex` is a contradiction Google and our own verifier both reject.
  const availability = computeLandingAvailability(jobs);

  // The listing routes advertise the newest vacancy `<lastmod>`, so it must be
  // the same instant the vacancy entries below carry (`modifiedAt`). See
  // `newestJobModifiedAt`.
  const newestJobDate = newestJobModifiedAt(jobs);

  // One entry per locale for a page that is localized and carries its own
  // canonical. `pathname` covers routes whose slug is identical in every
  // language (static pages, district/type landings); `pathnames` covers content
  // whose slug is translated (guides, articles), where reusing one language's
  // slug under another language's prefix would advertise URLs that 404.
  const buildLocalizedEntries = ({
    pathname,
    pathnames,
    lastModified,
    changeFrequency,
    priority,
  }: {
    pathname?: string;
    pathnames?: Record<AppLocale, string>;
    lastModified?: string | Date;
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
  }): MetadataRoute.Sitemap => {
    const pathnameFor = (locale: AppLocale) =>
      pathnames?.[locale] ?? pathname ?? "/";
    const languages = {
      ...Object.fromEntries(
        routing.locales.map((locale) => [
          locale,
          getLocalizedPageUrl(locale, pathnameFor(locale), baseUrl).toString(),
        ]),
      ),
      "x-default": getLocalizedPageUrl(
        routing.defaultLocale,
        pathnameFor(routing.defaultLocale),
        baseUrl,
      ).toString(),
    };

    return routing.locales.map((locale) => ({
      url: getLocalizedPageUrl(locale, pathnameFor(locale), baseUrl).toString(),
      alternates: { languages },
      ...(lastModified ? { lastModified } : {}),
      changeFrequency,
      priority,
    }));
  };

  const staticEntries: MetadataRoute.Sitemap = publicPages.flatMap(
    ({ pathname, changeFrequency, priority }) =>
      buildLocalizedEntries({
        pathname,
        changeFrequency,
        priority,
        ...(newestJobDate && routesWithListingDate.has(pathname)
          ? { lastModified: newestJobDate }
          : {}),
      }),
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
  // routes. Only districts with at least one live vacancy are listed: the rest
  // answer `noindex`, and a sitemap entry that answers `noindex` is a
  // contradiction. No `<lastmod>` is advertised: the projection carries the
  // district, but a per-district newest date is not tracked, and dating a
  // district page with the newest vacancy *anywhere* is the exact
  // "consistently and verifiably accurate" rule Google drops a `<lastmod>` for
  // — which is why the static routes above omit it too.
  const districtEntries: MetadataRoute.Sitemap = availableDistricts(
    availability,
  ).flatMap((district) =>
    buildLocalizedEntries({
      pathname: `/is-ilanlari/${districtSlug(district)}`,
      changeFrequency: "daily",
      priority: 0.7,
    }),
  );

  // Employment-type landing pages ("Tam zamanlı iş ilanları", "Staj", ...).
  // Same shape and same reasoning as the district pages: a type page changes
  // only when a vacancy of *that type* is published, so no unverifiable
  // `<lastmod>` is claimed. Only types with a live vacancy are listed.
  const jobTypeEntries: MetadataRoute.Sitemap = availableJobTypes(
    availability,
  ).flatMap((jobType) =>
    buildLocalizedEntries({
      pathname: `/is-turleri/${jobTypeSlugs[jobType]}`,
      changeFrequency: "daily",
      priority: 0.7,
    }),
  );

  // Editorial guides. Written for the site rather than imported, so they are the
  // one content family that is genuinely ours; each is localized with its own
  // copy and canonical. The index route (`/rehber`) has one slug for every
  // locale, but each guide's slug is translated, so its per-locale pathnames are
  // resolved by position rather than by reusing the Turkish slug under six
  // prefixes — which would advertise five URLs that 404.
  const guideIndexEntries: MetadataRoute.Sitemap = buildLocalizedEntries({
    pathname: "/rehber",
    changeFrequency: "monthly",
    priority: 0.8,
    lastModified: GUIDE_UPDATED,
  });
  const guideEntries: MetadataRoute.Sitemap = getGuideSlugs().flatMap((slug) => {
    const pathnames = getLocalizedSlugPathnames({
      section: "/rehber",
      locale: routing.defaultLocale,
      slug,
      siblings: getGuides,
    });
    return buildLocalizedEntries({
      pathnames,
      changeFrequency: "monthly",
      priority: 0.7,
      lastModified: GUIDE_UPDATED,
    });
  });

  // Editorial articles. Written for the site (not aggregated), so they are
  // indexable in their own right rather than duplicate headlines. Like guides,
  // their slugs are translated per locale, so each locale's URL is resolved
  // from the sibling slug.
  const articleEntries: MetadataRoute.Sitemap = getArticleSlugs().flatMap(
    (slug) => {
      const pathnames = getLocalizedSlugPathnames({
        section: "/blog",
        locale: routing.defaultLocale,
        slug,
        siblings: getArticles,
      });
      return buildLocalizedEntries({
        pathnames,
        changeFrequency: "monthly",
        priority: 0.6,
        lastModified: ARTICLE_UPDATED,
      });
    },
  );

  return [
    ...staticEntries,
    ...districtEntries,
    ...jobTypeEntries,
    ...guideIndexEntries,
    ...guideEntries,
    ...articleEntries,
    ...jobEntries,
  ];
}

