import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import {
  AI_VISIBILITY_UPDATED,
  faqByLocale,
  type FaqEntry,
} from "@/content/ai-visibility/faq";
import {
  buildPostalAddress,
  getConfiguredSocialProfiles,
  LOCATION_DISTRICT,
  LOCATION_LOCALITY,
  regionNames,
  SITE_NAME,
  servedDistricts,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_TEL,
} from "@/content/ai-visibility/site";

/**
 * The published locality's centroid, from OpenStreetMap (Nominatim
 * "Alsancak, Girne, Cyprus" -> 35.3394, 33.1961). This is a locality anchor, not
 * a rooftop coordinate: the operator publishes the municipality, not a street
 * address, so anything more precise would be invented.
 */
const LOCALITY_GEO = { latitude: 35.3394, longitude: 33.1961 } as const;

/**
 * The organization graph for the whole site. It is emitted once, in the locale
 * layout, so every page carries the same `@id`-addressable entity that the
 * per-vacancy `JobPosting` nodes and the FAQ page can reference.
 *
 * `areaServed` names the six districts the platform actually operates in, not
 * just a country, so an answer engine can answer "jobs in Girne" with this
 * entity. `sameAs` only lists social profiles the operator has configured, so
 * the graph never advertises a profile that does not exist.
 */
export function buildOrganizationGraph(baseUrl: URL) {
  const siteUrl = baseUrl.origin;
  const organizationId = `${siteUrl}/#organization`;
  const websiteId = `${siteUrl}/#website`;
  const socialProfiles = getConfiguredSocialProfiles();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: siteUrl,
        name: SITE_NAME,
        inLanguage: routing.locales,
        publisher: { "@id": organizationId },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteUrl}/jobs?query={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "Organization",
        "@id": organizationId,
        name: SITE_NAME,
        alternateName: "İşBul KKTC — Kuzey Kıbrıs iş platformu",
        url: siteUrl,
        logo: `${siteUrl}/icon-dark-32x32.png`,
        email: SUPPORT_EMAIL,
        telephone: SUPPORT_PHONE_TEL,
        address: buildPostalAddress(baseUrl),
        geo: {
          "@type": "GeoCoordinates",
          latitude: LOCALITY_GEO.latitude,
          longitude: LOCALITY_GEO.longitude,
        },
        areaServed: [
          {
            "@type": "Country",
            name: regionNames.tr,
            identifier: "CY",
          },
          ...servedDistricts.map((district) => ({
            "@type": "AdministrativeArea",
            name: district.tr,
            alternateName: district.alternates,
            containedInPlace: {
              "@type": "Country",
              name: regionNames.tr,
              identifier: "CY",
            },
          })),
        ],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: SUPPORT_EMAIL,
          telephone: SUPPORT_PHONE_TEL,
          availableLanguage: routing.locales,
        },
        ...(socialProfiles.length > 0 ? { sameAs: socialProfiles } : {}),
      },
    ],
  };
}

/**
 * The FAQ page graph for one locale. The questions and answers are authored per
 * language (see `faq.ts`), so each localized URL declares its own `inLanguage`
 * rather than reusing one language's text under six prefixes.
 *
 * `dateModified` is the FAQ copy's own authored date (`AI_VISIBILITY_UPDATED`),
 * not the request time: these nodes are statically rendered and carry no
 * per-listing data, so a build timestamp would claim an edit that never
 * happened. `datePublished` is intentionally omitted — the copy was authored in
 * one pass and the site does not record a separate first-publication date.
 */
export function buildFaqPageStructuredData({
  locale,
  baseUrl,
  pathname,
  entries,
}: {
  locale: AppLocale;
  baseUrl: URL;
  pathname: string;
  entries?: readonly FaqEntry[];
}) {
  const siteUrl = baseUrl.origin;
  const pageUrl =
    locale === routing.defaultLocale
      ? `${siteUrl}${pathname === "/" ? "" : pathname}`
      : `${siteUrl}/${locale}${pathname === "/" ? "" : pathname}`;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    url: pageUrl,
    inLanguage: locale,
    dateModified: AI_VISIBILITY_UPDATED,
    mainEntity: (entries ?? faqByLocale[locale]).map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}

/** The organization's display name for the region, per locale. */
export function getRegionName(locale: AppLocale): string {
  return regionNames[locale];
}

/**
 * The `Article` graph for an editorial guide.
 *
 * A guide is written for the site, so it declares `Article` with the site as
 * author and publisher, and a `dateModified` that is the copy's own authored
 * date rather than the request time — the page is statically rendered, and a
 * build timestamp would claim an edit that never happened.
 */
export function buildGuideStructuredData({
  locale,
  baseUrl,
  slug,
  title,
  description,
  updated,
  pathname = "/rehber",
}: {
  locale: AppLocale;
  baseUrl: URL;
  slug: string;
  title: string;
  description: string;
  updated: string;
  /** The section the article lives under (`/rehber` or `/blog`). */
  pathname?: string;
}) {
  const siteUrl = baseUrl.origin;
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const url = `${siteUrl}${prefix}${pathname}/${slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${url}#article`,
    headline: title,
    description,
    url,
    inLanguage: locale,
    datePublished: updated,
    dateModified: updated,
    author: { "@id": `${siteUrl}/#organization` },
    publisher: { "@id": `${siteUrl}/#organization` },
    isPartOf: { "@id": `${siteUrl}/#website` },
    mainEntityOfPage: url,
  };
}

/**
 * The `BreadcrumbList` + `CollectionPage` graph for a district landing page.
 *
 * A district page ("Lefkoşa iş ilanları") is a collection, not an article, so it
 * declares `CollectionPage` and names the district in `about`. The breadcrumb
 * gives answer engines the hierarchy (home → jobs → district) that the URL alone
 * only implies, which is what lets a result be attributed to the right place.
 *
 * The page URL and the district name are the only inputs, so nothing here can
 * drift from the page the route actually renders.
 */
export function buildDistrictPageStructuredData({
  locale,
  baseUrl,
  districtSlug,
  districtName,
  jobsLabel,
  homeLabel,
}: {
  locale: AppLocale;
  baseUrl: URL;
  districtSlug: string;
  districtName: string;
  jobsLabel: string;
  homeLabel: string;
}) {
  const siteUrl = baseUrl.origin;
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const jobsUrl = `${siteUrl}${prefix}/jobs`;
  const districtUrl = `${siteUrl}${prefix}/is-ilanlari/${districtSlug}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${districtUrl}#webpage`,
        url: districtUrl,
        name: `${districtName} İş İlanları`,
        inLanguage: locale,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about: {
          "@type": "AdministrativeArea",
          name: districtName,
          containedInPlace: {
            "@type": "Country",
            name: regionNames[locale],
            identifier: "CY",
          },
        },
        breadcrumb: { "@id": `${districtUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${districtUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: homeLabel,
            item: `${siteUrl}${prefix}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: jobsLabel,
            item: jobsUrl,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: districtName,
            item: districtUrl,
          },
        ],
      },
    ],
  };
}

export { LOCATION_DISTRICT, LOCATION_LOCALITY };
