import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildLlmsBrief,
  buildLlmsFullBrief,
} from "@/content/ai-visibility/llms-brief";
import {
  buildArticleIndexStructuredData,
  buildCompaniesIndexStructuredData,
  buildDistrictPageStructuredData,
  buildGuideIndexStructuredData,
  buildGuideStructuredData,
  buildJobsIndexStructuredData,
  buildJobTypePageStructuredData,
  buildOrganizationGraph,
} from "@/content/ai-visibility/structured-data";
import { getGuides } from "@/content/guides";
import { SITE_NAME } from "@/content/ai-visibility/site";
import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Regression guards for the GEO surface that the existing
 * `tests/unit/ai-visibility-structured-data.test.ts` does not cover: the
 * per-locale links in the full brief and the Organization `logo` asset. Both
 * shipped broken once and nothing asserted them.
 */

const BASE_URL = new URL("https://isbulkktc.com");
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

function localeOf(pathname: string): AppLocale {
  const first = pathname.split("/").filter(Boolean)[0];
  return routing.locales.find((locale) => locale === first) ?? routing.defaultLocale;
}

test("every guide link in the full brief resolves in its own locale", () => {
  const full = buildLlmsFullBrief(BASE_URL);
  const links = [
    ...full.matchAll(/\]\((https:\/\/isbulkktc\.com[^)]*)\)/g),
  ].map((match) => new URL(match[1]));

  const guideLinks = links.filter((url) => /\/rehber\//.test(url.pathname));
  // Three guides per locale across six locales.
  assert.equal(
    guideLinks.length,
    routing.locales.length * getGuides(routing.defaultLocale).length,
  );

  for (const url of guideLinks) {
    const locale = localeOf(url.pathname);
    const slug = url.pathname.split("/").filter(Boolean).at(-1)!;
    // Guide slugs are translated per locale, so the Turkish slug must never be
    // reused under another prefix: `getGuides` is the same lookup the page uses,
    // and a miss here is a link an answer engine would follow into a 404.
    assert.ok(
      getGuides(locale).some((guide) => guide.slug === slug),
      `${url.pathname} does not resolve to a ${locale} guide`,
    );
  }
});

test("the short brief stays the default-locale document", () => {
  const brief = buildLlmsBrief(BASE_URL);
  for (const guide of getGuides(routing.defaultLocale)) {
    assert.ok(
      brief.includes(`/rehber/${guide.slug})`),
      `the short brief omits ${guide.slug}`,
    );
  }
});

test("the organization logo is an existing asset at Google's minimum size", () => {
  const graph = buildOrganizationGraph(BASE_URL) as {
    "@graph": Array<Record<string, unknown>>;
  };
  const organization = graph["@graph"].find(
    (node) => node["@type"] === "Organization",
  )!;
  const logo = String(organization.logo);
  assert.ok(
    logo.startsWith("https://isbulkktc.com/"),
    "logo must be an absolute URL on the site origin",
  );

  // Google requires the Organization `logo` to be at least 112x112px. Reading
  // the committed file — not a constant — is what makes a 32px favicon fail.
  const relative = new URL(logo).pathname.replace(/^\//, "");
  const file = path.join(REPO_ROOT, "public", relative);
  assert.ok(existsSync(file), `logo asset ${relative} is missing`);

  const header = readFileSync(file).subarray(0, 24);
  assert.equal(header.subarray(1, 4).toString("ascii"), "PNG");
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  assert.ok(
    width >= 112 && height >= 112,
    `logo is ${width}x${height}, below Google's 112x112 minimum`,
  );
});

type GraphNode = Record<string, unknown>;

function graphNodes(data: unknown): GraphNode[] {
  return (data as { "@graph": GraphNode[] })["@graph"];
}

function collectionPage(data: unknown): GraphNode {
  return graphNodes(data).find((node) => node["@type"] === "CollectionPage")!;
}

function breadcrumb(data: unknown): GraphNode[] {
  const node = graphNodes(data).find(
    (candidate) => candidate["@type"] === "BreadcrumbList",
  )!;
  return node.itemListElement as GraphNode[];
}

test("a job-type page carries the same collection graph a district page does", () => {
  const graph = buildJobTypePageStructuredData({
    locale: "tr",
    baseUrl: BASE_URL,
    typeSlug: "tam-zamanli",
    typeName: "Tam zamanlı",
    jobsLabel: "İş İlanları",
    homeLabel: SITE_NAME,
  });

  // The district page it mirrors is a known-good shape; asserting both keeps
  // the two families from drifting apart in a future edit.
  const district = buildDistrictPageStructuredData({
    locale: "tr",
    baseUrl: BASE_URL,
    districtSlug: "girne",
    districtName: "Girne",
    jobsLabel: "İş İlanları",
    homeLabel: SITE_NAME,
  });
  assert.deepEqual(
    Object.keys(collectionPage(graph)).sort(),
    Object.keys(collectionPage(district)).sort(),
  );

  const page = collectionPage(graph);
  assert.equal(page["@id"], "https://isbulkktc.com/is-turleri/tam-zamanli#webpage");
  assert.equal(page.url, "https://isbulkktc.com/is-turleri/tam-zamanli");
  // Mirrors the district's `"{district} İş İlanları"` shape.
  assert.equal(page.name, "Tam zamanlı İş İlanları");
  assert.equal(page.inLanguage, "tr");
  assert.deepEqual(page.isPartOf, { "@id": "https://isbulkktc.com/#website" });
  // An employment type is not a place.
  assert.deepEqual(page.about, { "@type": "Thing", name: "Tam zamanlı" });
  assert.deepEqual(page.breadcrumb, {
    "@id": "https://isbulkktc.com/is-turleri/tam-zamanli#breadcrumb",
  });

  const trail = breadcrumb(graph);
  assert.deepEqual(
    trail.map((step) => [step.position, step.name, step.item]),
    [
      [1, SITE_NAME, "https://isbulkktc.com"],
      [2, "İş İlanları", "https://isbulkktc.com/jobs"],
      [3, "Tam zamanlı", "https://isbulkktc.com/is-turleri/tam-zamanli"],
    ],
  );
});

test("the guide breadcrumb names its section in the caller's language", () => {
  // `sectionName` is the one input the generator cannot know: the localized
  // label lives in the route's message catalogue. Asserting that it flows into
  // the breadcrumb is what stops a hardcoded Turkish/Latin label from shipping
  // under a `de`/`fa` prefix (the district equivalent was fixed in #152).
  for (const locale of routing.locales) {
    const graph = buildGuideStructuredData({
      locale,
      baseUrl: BASE_URL,
      slug: "s",
      title: "T",
      description: "D",
      updated: "2026-11-04",
      sectionName: `SECTION-${locale}`,
    });
    const trail = breadcrumb(graph);
    assert.equal(trail[1].name, `SECTION-${locale}`, `${locale} section label`);
    // The section node points at the un-prefixed-for-default section URL.
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    assert.equal(trail[1].item, `https://isbulkktc.com${prefix}/rehber`);
  }
});

test("the short brief scopes its prefix rule to the pages it actually applies to", () => {
  const brief = buildLlmsBrief(BASE_URL);
  // The rule is written for the primary pages, whose slugs are identical in
  // every language. The guide links sit in the same list but do *not* follow it
  // (their slugs are translated), so the document must say so rather than let a
  // reader prefix a Turkish guide slug into a 404.
  const rule = brief
    .split("## Öne çıkan sayfalar")[1]
    .split("## Sıkça sorulan sorular")[0]
    .replace(/\s+/g, " ");
  assert.ok(
    /rehber bağlantıları bu kuralın istisnasıdır/i.test(rule),
    "the prefix rule must name the guide links as an exception",
  );
});

test("collection graphs localize the prefix for every locale", () => {
  for (const locale of routing.locales) {
    const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
    const graph = buildJobTypePageStructuredData({
      locale,
      baseUrl: BASE_URL,
      typeSlug: "staj",
      typeName: "Internship",
      jobsLabel: "Jobs",
      homeLabel: SITE_NAME,
    });
    const page = collectionPage(graph);
    // The non-default locales are prefixed; the default is not (as-needed).
    assert.equal(
      page.url,
      `https://isbulkktc.com${prefix}/is-turleri/staj`,
      `${locale} URL drifted`,
    );
    assert.equal(page.inLanguage, locale);

    const trail = breadcrumb(graph);
    assert.equal(trail[1].item, `https://isbulkktc.com${prefix}/jobs`);
    assert.equal(trail[2].item, `https://isbulkktc.com${prefix}/is-turleri/staj`);
  }
});

test("a collection page takes the caller's localized title as its name", () => {
  // `pageName` is what keeps the structured data from naming an English page in
  // Turkish. It must reach `CollectionPage.name`; the default preserves the old
  // Turkish-suffixed label so an un-updated caller still type-checks.
  const graph = buildDistrictPageStructuredData({
    locale: "en",
    baseUrl: BASE_URL,
    districtSlug: "girne",
    districtName: "Kyrenia",
    pageName: "Jobs in Kyrenia",
    jobsLabel: "Jobs",
    homeLabel: SITE_NAME,
  });
  const page = collectionPage(graph);
  assert.equal(page.name, "Jobs in Kyrenia");
  // The breadcrumb's final step stays the subject name, not the page title.
  assert.equal(breadcrumb(graph)[2].name, "Kyrenia");
});

const indexBuilders = {
  "/jobs": buildJobsIndexStructuredData,
  "/companies": buildCompaniesIndexStructuredData,
  "/rehber": buildGuideIndexStructuredData,
  "/blog": buildArticleIndexStructuredData,
} as const;

test("every index page emits a two-step CollectionPage breadcrumb", () => {
  for (const [pathname, build] of Object.entries(indexBuilders)) {
    for (const locale of routing.locales) {
      const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
      const label = `LABEL-${locale}`;
      const page = collectionPage(
        build({ locale, baseUrl: BASE_URL, pageLabel: label, homeLabel: SITE_NAME }),
      );

      const url = `https://isbulkktc.com${prefix}${pathname}`;
      assert.equal(page.url, url, `${pathname} ${locale} URL drifted`);
      assert.equal(page["@id"], `${url}#webpage`);
      // `name` is the product's own section label, never the hero slogan the
      // page renders as its <h1>.
      assert.equal(page.name, label);
      assert.equal(page.inLanguage, locale);
      assert.deepEqual(page.isPartOf, { "@id": "https://isbulkktc.com/#website" });
      // The page declares the topic it is named after.
      assert.deepEqual(page.about, { "@type": "Thing", name: label });
      assert.deepEqual(page.breadcrumb, { "@id": `${url}#breadcrumb` });

      // An index is the top of its hierarchy: home → the page itself.
      const trail = breadcrumb(
        build({ locale, baseUrl: BASE_URL, pageLabel: label, homeLabel: SITE_NAME }),
      );
      assert.deepEqual(
        trail.map((step) => [step.position, step.name, step.item]),
        [
          [1, SITE_NAME, `https://isbulkktc.com${prefix}`],
          [2, label, url],
        ],
        `${pathname} ${locale} breadcrumb drifted`,
      );
    }
  }
});
