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
        // Google requires an Organization `logo` of at least 112x112px; the
        // 32px favicon is below that, so the 512px install icon is advertised.
        logo: `${siteUrl}/icons/icon-512.png`,
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
  const sectionUrl = `${siteUrl}${prefix}${pathname}`;
  const sectionName = pathname === "/blog" ? "Blog" : "Rehber";

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
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
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${url}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "İşBul KKTC", item: `${siteUrl}${prefix}` },
          { "@type": "ListItem", position: 2, name: sectionName, item: sectionUrl },
          { "@type": "ListItem", position: 3, name: title, item: url },
        ],
      },
    ],
  };
}

/**
 * The `BreadcrumbList` + `CollectionPage` graph shared by the two landing-page
 * families (a district and an employment type).
 *
 * Both are collections of live listings, not articles, so each declares
 * `CollectionPage` and names its subject in `about`. The breadcrumb gives answer
 * engines the hierarchy (home → jobs → collection) that the URL alone only
 * implies, which is what lets a result be attributed to the right place or role.
 *
 * Only the collection's own path, its subject name and the `about` node differ
 * between the families; sharing the body keeps the two graphs from drifting
 * apart.
 */
function buildCollectionPageGraph({
  locale,
  baseUrl,
  collectionPath,
  subjectName,
  about,
  jobsLabel,
  homeLabel,
}: {
  locale: AppLocale;
  baseUrl: URL;
  /** Path without the locale prefix, e.g. `/is-ilanlari/girne`. */
  collectionPath: string;
  /** The collection's own name, e.g. `Girne` or `Tam zamanlı`. */
  subjectName: string;
  about: Record<string, unknown>;
  jobsLabel: string;
  homeLabel: string;
}) {
  const siteUrl = baseUrl.origin;
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const jobsUrl = `${siteUrl}${prefix}/jobs`;
  const collectionUrl = `${siteUrl}${prefix}${collectionPath}`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${collectionUrl}#webpage`,
        url: collectionUrl,
        name: `${subjectName} İş İlanları`,
        inLanguage: locale,
        isPartOf: { "@id": `${siteUrl}/#website` },
        about,
        breadcrumb: { "@id": `${collectionUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${collectionUrl}#breadcrumb`,
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
            name: subjectName,
            item: collectionUrl,
          },
        ],
      },
    ],
  };
}

/**
 * The graph for a district landing page ("Lefkoşa iş ilanları"). A district is
 * an `AdministrativeArea` inside the country, so `about` carries the geography.
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
  return buildCollectionPageGraph({
    locale,
    baseUrl,
    collectionPath: `/is-ilanlari/${districtSlug}`,
    subjectName: districtName,
    about: {
      "@type": "AdministrativeArea",
      name: districtName,
      containedInPlace: {
        "@type": "Country",
        name: regionNames[locale],
        identifier: "CY",
      },
    },
    jobsLabel,
    homeLabel,
  });
}

/**
 * The graph for an employment-type landing page ("Tam zamanlı iş ilanları").
 *
 * The sibling of a district page — same `CollectionPage` + `BreadcrumbList`
 * shape, same route weight, same sitemap presence — so it carries the same
 * machine-readable hierarchy an answer engine needs to attribute a listing to a
 * role. An employment type is not a place, so `about` is a plain `Thing` rather
 * than an `AdministrativeArea`.
 */
export function buildJobTypePageStructuredData({
  locale,
  baseUrl,
  typeSlug,
  typeName,
  jobsLabel,
  homeLabel,
}: {
  locale: AppLocale;
  baseUrl: URL;
  typeSlug: string;
  typeName: string;
  jobsLabel: string;
  homeLabel: string;
}) {
  return buildCollectionPageGraph({
    locale,
    baseUrl,
    collectionPath: `/is-turleri/${typeSlug}`,
    subjectName: typeName,
    about: { "@type": "Thing", name: typeName },
    jobsLabel,
    homeLabel,
  });
}
