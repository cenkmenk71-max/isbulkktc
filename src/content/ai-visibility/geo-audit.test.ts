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
import {
  COUNTRY_CODE,
  buildPostalAddress,
  SITE_NAME,
  regionNames,
} from "@/content/ai-visibility/site";
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

test("the country code is declared once and used everywhere", () => {
  // The code appears in the postal address, the organization graph and the
  // per-vacancy JobPosting. A second literal in any of them is how one graph
  // silently diverges from the others, so the graph must carry the shared value.
  assert.equal(buildPostalAddress(BASE_URL).addressCountry, COUNTRY_CODE);

  const organization = buildOrganizationGraph(BASE_URL)["@graph"].find(
    (node) => node["@type"] === "Organization",
  )! as Record<string, unknown>;
  const areas = organization.areaServed as Record<string, unknown>[];
  assert.equal(areas[0].identifier, COUNTRY_CODE);
  for (const area of areas.slice(1)) {
    assert.equal(
      (area.containedInPlace as { identifier: string }).identifier,
      COUNTRY_CODE,
    );
  }

  const district = buildDistrictPageStructuredData({
    locale: "tr",
    baseUrl: BASE_URL,
    districtSlug: "girne",
    districtName: "Girne",
    jobsLabel: "İş İlanları",
    homeLabel: SITE_NAME,
  })["@graph"][0] as Record<string, unknown>;
  assert.equal(
    ((district.about as Record<string, unknown>).containedInPlace as {
      identifier: string;
    }).identifier,
    COUNTRY_CODE,
  );

  // A value check alone cannot tell the shared constant from a re-typed
  // literal — both render "CY". Reading the producers is what actually pins
  // single-source ownership, so a second literal fails even though the output
  // is unchanged. `job-posting-structured-data.ts` is `server-only` (pulls in
  // the app URL) and cannot be executed here, so it is source-checked only.
  const producers = {
    "src/content/ai-visibility/structured-data.ts": readFileSync(
      path.join(REPO_ROOT, "src/content/ai-visibility/structured-data.ts"),
      "utf8",
    ),
    "src/features/jobs/job-posting-structured-data.ts": readFileSync(
      path.join(REPO_ROOT, "src/features/jobs/job-posting-structured-data.ts"),
      "utf8",
    ),
  };
  for (const [file, source] of Object.entries(producers)) {
    assert.ok(
      !/["']CY["']/.test(source),
      `${file} re-types the country code; import COUNTRY_CODE instead`,
    );
    assert.ok(
      !/const AREA_NAME = ["']/.test(source),
      `${file} re-types the area name; derive it from regionNames`,
    );
    assert.match(
      source,
      /import \{[^}]*COUNTRY_CODE[^}]*\} from "@\/content\/ai-visibility\/site"/,
      `${file} must import COUNTRY_CODE from the shared site data`,
    );
  }
});

test("the brief describes the structured data the site actually emits", () => {
  const brief = buildLlmsBrief(BASE_URL);
  const section = brief
    .split("## Yapılandırılmış veri")[1]
    .split("## Kaynaklar")[0];
  const normalized = section.replace(/\s+/g, " ");

  // Every family the producers emit must be named, or an answer engine reading
  // the brief forms a wrong map of the site's markup.
  for (const type of [
    "Organization",
    "WebSite",
    "FAQPage",
    "CollectionPage",
    "BreadcrumbList",
    "Article",
    "JobPosting",
  ]) {
    assert.ok(
      new RegExp(`\\b${type}\\b`).test(normalized),
      `the brief omits ${type} from its structured-data map`,
    );
  }

  // `/sss` renders the same FAQPage as `/about`; naming only one understates it.
  assert.ok(normalized.includes("/sss"), "the brief omits the /sss FAQ page");

  // The families are named by their real route shape, not a made-up one.
  for (const route of ["/jobs", "/companies", "/rehber", "/blog", "/is-ilanlari/", "/is-turleri/"]) {
    assert.ok(normalized.includes(route), `the brief omits ${route}`);
  }
  assert.ok(
    regionNames.tr.length > 0,
    "the region name is the area the organization graph names",
  );
});

test("the brand name is not re-typed in any producer", () => {
  // The brand appears in the guide/article breadcrumb and in the JobPosting
  // identifier. A second literal is how a rename leaves the site naming itself
  // two different ways inside its own graph, so every producer must read
  // SITE_NAME.
  const guide = buildGuideStructuredData({
    locale: "tr",
    baseUrl: BASE_URL,
    slug: "s",
    title: "T",
    description: "D",
    updated: "2026-11-04",
  });
  const trail = breadcrumb(guide);
  assert.equal(trail[0].name, SITE_NAME);

  const producers = [
    "src/content/ai-visibility/structured-data.ts",
    "src/features/jobs/job-posting-structured-data.ts",
  ];
  for (const file of producers) {
    const source = readFileSync(path.join(REPO_ROOT, file), "utf8");
    assert.ok(
      !/"İşBul KKTC"/.test(source),
      `${file} re-types the brand name; import SITE_NAME instead`,
    );
  }
});

test("an article's datePublished is its publication date, not its edit date", () => {
  const args = {
    locale: "tr",
    baseUrl: BASE_URL,
    slug: "s",
    title: "T",
    description: "D",
    sectionName: "Blog",
    pathname: "/blog",
  } as const;

  // A caller that tracks the two dates separately must have both flow through.
  const edited = buildGuideStructuredData({
    ...args,
    published: "2026-10-01",
    updated: "2026-11-04",
  })["@graph"][0] as Record<string, unknown>;
  assert.equal(edited.datePublished, "2026-10-01");
  assert.equal(edited.dateModified, "2026-11-04");

  // A caller that does not (the historical shape) keeps a single date, so its
  // output is unchanged.
  const single = buildGuideStructuredData({
    ...args,
    updated: "2026-11-04",
  })["@graph"][0] as Record<string, unknown>;
  assert.equal(single.datePublished, "2026-11-04");
  assert.equal(single.dateModified, "2026-11-04");
});

/** The `- [label](url)` entries of a brief section, per locale. */
function briefLinkLabels(section: string): string[] {
  return [...section.matchAll(/^- \[([^\]]+)\]\(/gm)].map((match) => match[1]);
}

test("the brief anchors name their target, never a machine slug", () => {
  // Every other entry in the list carries a human label. A bare slug names
  // nothing a reader or an answer engine can quote, and it is the one place the
  // list stopped being a reading aid.
  for (const locale of routing.locales) {
    const brief = buildLlmsBrief(BASE_URL);
    const section =
      locale === routing.defaultLocale
        ? brief.split("## Öne çıkan sayfalar")[1].split("Her sayfa altı dilde")[0]
        : buildLlmsFullBrief(BASE_URL)
            .split(`## ${locale} — `)[1]!
            .split("### FAQ")[0];

    const labels = briefLinkLabels(section);
    assert.ok(labels.length > 0, `${locale} section has no links`);
    for (const label of labels) {
      assert.ok(
        !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(label),
        `${locale}: "${label}" is a bare slug, not an anchor label`,
      );
    }

    // The guides are named by their own title in the reader's language.
    for (const guide of getGuides(locale)) {
      assert.ok(
        labels.includes(guide.title),
        `${locale} brief does not name the guide "${guide.title}"`,
      );
    }
  }
});

test("the full brief's page labels are localized, not English everywhere", () => {
  const full = buildLlmsFullBrief(BASE_URL);
  // The German section must not carry the English label; that is the machine-
  // translation smell the localized sections exist to avoid.
  const en = full.split("## en — ")[1]!.split("### FAQ")[0];
  const de = full.split("## de — ")[1]!.split("### FAQ")[0];
  const enLabels = briefLinkLabels(en);
  const deLabels = briefLinkLabels(de);
  assert.equal(enLabels.length, deLabels.length, "section link counts differ");

  // The 7 primary pages are the first entries; the German label of the jobs page
  // is not the English one.
  assert.ok(
    deLabels.includes("Stellenangebote"),
    "the German section must name the jobs page in German",
  );
  assert.ok(
    !deLabels.includes("Job listings"),
    "the German section must not fall back to the English label",
  );
});
