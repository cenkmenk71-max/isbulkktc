import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AI_VISIBILITY_UPDATED,
  faqByLocale,
  faqSectionByLocale,
  siteSummaryByLocale,
} from "@/content/ai-visibility/faq";
import { buildLlmsBrief, buildLlmsFullBrief } from "@/content/ai-visibility/llms-brief";
import {
  buildFaqPageStructuredData,
  buildOrganizationGraph,
} from "@/content/ai-visibility/structured-data";
import {
  getConfiguredSocialProfiles,
  regionNames,
  servedDistricts,
  SITE_NAME,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_TEL,
} from "@/content/ai-visibility/site";
import { routing } from "@/i18n/routing";

/**
 * The GEO modules (`src/content/ai-visibility/**`) produce the JSON-LD and the
 * machine-readable briefs, but until now nothing asserted their *shape*: the
 * e2e SEO suite only checks that the served HTML contains a couple of
 * substrings. A typo in a schema.org key, a dropped district or a question that
 * diverges between the page and the JSON-LD would ship silently. These are pure
 * functions, so they can be checked directly here; `JobPosting` lives in
 * `src/features/jobs/job-posting-structured-data.ts`, which pulls in
 * `server-only` and therefore stays covered by the e2e suite.
 */

const BASE_URL = new URL("https://isbulkktc.com");

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function appPageExists(pathname: string): boolean {
  const candidates = [
    path.join(REPO_ROOT, "src/app/[locale]", `(public)${pathname}`, "page.tsx"),
    path.join(REPO_ROOT, "src/app/[locale]", pathname, "page.tsx"),
  ];
  return candidates.some((candidate) => existsSync(candidate));
}

test("the organization graph carries the required entity fields", () => {
  const graph = buildOrganizationGraph(BASE_URL) as {
    "@graph": Array<Record<string, unknown>>;
  };

  const website = graph["@graph"].find((node) => node["@type"] === "WebSite");
  const organization = graph["@graph"].find(
    (node) => node["@type"] === "Organization",
  );
  assert.ok(website, "WebSite node is missing");
  assert.ok(organization, "Organization node is missing");

  assert.equal(website.url, "https://isbulkktc.com");
  assert.equal(website.name, SITE_NAME);
  assert.deepEqual(website.inLanguage, routing.locales);
  assert.deepEqual(website.publisher, { "@id": organization["@id"] });

  // The sitelinks box must hit the parameter the jobs page actually reads;
  // `?q=` lands on the unfiltered listing and the search box silently breaks.
  const action = website.potentialAction as {
    target: { urlTemplate: string };
    "query-input": string;
  };
  assert.equal(
    action.target.urlTemplate,
    "https://isbulkktc.com/jobs?query={search_term_string}",
  );
  assert.equal(action["query-input"], "required name=search_term_string");

  assert.equal(organization.email, SUPPORT_EMAIL);
  assert.equal(organization.telephone, SUPPORT_PHONE_TEL);
  assert.equal(organization.url, "https://isbulkktc.com");
  assert.ok(
    String(organization.logo).startsWith("https://isbulkktc.com/"),
    "logo must be an absolute URL on the site origin",
  );
  assert.deepEqual(
    (organization.contactPoint as { availableLanguage: string[] })
      .availableLanguage,
    routing.locales,
  );
});

test("areaServed names every served district, not just the country", () => {
  const graph = buildOrganizationGraph(BASE_URL) as {
    "@graph": Array<Record<string, unknown>>;
  };
  const organization = graph["@graph"].find(
    (node) => node["@type"] === "Organization",
  )!;
  const areas = organization.areaServed as Array<Record<string, unknown>>;

  const country = areas.find((area) => area["@type"] === "Country");
  assert.equal(country?.identifier, "CY");

  const districts = areas.filter(
    (area) => area["@type"] === "AdministrativeArea",
  );
  assert.equal(
    districts.length,
    servedDistricts.length,
    "one AdministrativeArea per served district",
  );
  assert.deepEqual(
    districts.map((district) => district.name),
    servedDistricts.map((district) => district.tr),
  );
  // The canonical name must be the value the vacancy data stores. "Gazimağusa"
  // here would contradict the `JobPosting.jobLocation` the same site emits.
  assert.ok(
    !districts.some((district) => district.name === "Gazimağusa"),
    "the graph must not rename Mağusa",
  );
  for (const district of districts) {
    assert.equal(
      (district.containedInPlace as { identifier: string }).identifier,
      "CY",
      `${district.name} must be contained in the country node`,
    );
    // Every search form must be present: the Turkish label, the English name
    // and the "Gazimağusa" spelling an answer engine will actually see.
    const alternates = district.alternateName as string[];
    assert.ok(Array.isArray(alternates) && alternates.length > 0);
    const source = servedDistricts.find((entry) => entry.tr === district.name)!;
    assert.deepEqual(alternates, [...source.alternates]);
    assert.ok(
      alternates.includes(source.names.en),
      `${district.name} must carry its English alternate`,
    );
  }
});

test("every district label matches the interface catalog, in all six locales", () => {
  // The graph, the brief and the search filter must agree on how a district is
  // written. `HomeJobSearch.districts` is the string the user actually sees, so
  // the GEO copy is checked against it rather than against a second hand list.
  const catalogs = routing.locales.map((locale) => ({
    locale,
    districts: JSON.parse(
      readFileSync(
        path.join(REPO_ROOT, `src/messages/${locale}.json`),
        "utf8",
      ),
    ).HomeJobSearch.districts as Record<string, string>,
  }));
  const keys = [
    "lefkosia",
    "magusa",
    "girne",
    "guzelyurt",
    "iskele",
    "lefke",
  ];
  assert.deepEqual(Object.keys(catalogs[0].districts).sort(), [...keys].sort());

  for (const { locale, districts } of catalogs) {
    for (const [index, key] of keys.entries()) {
      assert.equal(
        servedDistricts[index].names[locale],
        districts[key],
        `${servedDistricts[index].tr} label for ${locale} drifted from the catalog`,
      );
    }
  }
});

test("sameAs is omitted entirely when no social profile is configured", () => {
  // The graph must never advertise a profile that does not exist: with the
  // `NEXT_PUBLIC_SOCIAL_*` variables unset the key is absent, not an empty list.
  const keys = [
    "NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL",
    "NEXT_PUBLIC_SOCIAL_FACEBOOK_URL",
    "NEXT_PUBLIC_SOCIAL_LINKEDIN_URL",
    "NEXT_PUBLIC_SOCIAL_YOUTUBE_URL",
    "NEXT_PUBLIC_SOCIAL_X_URL",
  ];
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  try {
    assert.deepEqual(getConfiguredSocialProfiles(), []);
    const graph = buildOrganizationGraph(BASE_URL) as {
      "@graph": Array<Record<string, unknown>>;
    };
    const organization = graph["@graph"].find(
      (node) => node["@type"] === "Organization",
    )!;
    assert.ok(
      !("sameAs" in organization),
      "sameAs must be absent, not an empty array",
    );

    // A configured value is only accepted when it is a real http(s) URL, so a
    // half-filled variable cannot leak a bare handle into the graph.
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL = "instagram.com/isbulkktc";
    assert.deepEqual(
      getConfiguredSocialProfiles(),
      [],
      "a scheme-less value must be rejected, not guessed",
    );
    process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM_URL = "https://instagram.com/isbulkktc";
    assert.deepEqual(getConfiguredSocialProfiles(), [
      "https://instagram.com/isbulkktc",
    ]);
  } finally {
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("the FAQ graph matches the on-page FAQ for every locale", () => {
  for (const locale of routing.locales) {
    const faq = buildFaqPageStructuredData({
      locale,
      baseUrl: BASE_URL,
      pathname: "/about",
    }) as Record<string, unknown>;

    assert.equal(faq["@type"], "FAQPage");
    assert.equal(faq.inLanguage, locale);
    assert.equal(faq.dateModified, AI_VISIBILITY_UPDATED);

    // The default locale is unprefixed; the others carry their prefix.
    const expectedUrl =
      locale === routing.defaultLocale
        ? "https://isbulkktc.com/about"
        : `https://isbulkktc.com/${locale}/about`;
    assert.equal(faq.url, expectedUrl);
    assert.equal(faq["@id"], `${expectedUrl}#faq`);

    const entries = faqByLocale[locale];
    const mainEntity = faq.mainEntity as Array<Record<string, unknown>>;
    assert.equal(mainEntity.length, entries.length);
    assert.ok(mainEntity.length > 0, `${locale} must ask at least one question`);

    // The JSON-LD and the rendered block read the same source, so a divergence
    // here means a question was answered one way on the page and another way to
    // the answer engine.
    mainEntity.forEach((question, index) => {
      assert.equal(question["@type"], "Question");
      assert.equal(question.name, entries[index].question);
      assert.equal(
        (question.acceptedAnswer as { text: string }).text,
        entries[index].answer,
      );
    });

    const questions = entries.map((entry) => entry.question);
    assert.equal(
      new Set(questions).size,
      questions.length,
      `${locale} repeats a question`,
    );
    for (const entry of entries) {
      assert.ok(entry.question.trim().length > 0);
      assert.ok(entry.answer.trim().length > 0);
    }
  }
});

test("every locale has FAQ and summary copy, and none of it is Turkish", () => {
  for (const locale of routing.locales) {
    assert.ok(
      faqByLocale[locale].length >= 5,
      `${locale} has too few questions to be useful`,
    );
    assert.ok(siteSummaryByLocale[locale].trim().length > 40);
    const heading = faqSectionByLocale[locale];
    assert.ok(heading.kicker.trim() && heading.title.trim() && heading.lead.trim());
  }

  // A machine-translation slip would leave the Turkish summary under another
  // language key; the six summaries must be six distinct strings.
  const summaries = routing.locales.map((locale) => siteSummaryByLocale[locale]);
  assert.equal(new Set(summaries).size, summaries.length);

  const names = routing.locales.map((locale) => regionNames[locale]);
  assert.equal(new Set(names).size, names.length, "region name repeated");
  for (const name of names) assert.ok(name.trim().length > 0);
});

test("the brief advertises only routes the app actually serves", () => {
  const brief = buildLlmsBrief(BASE_URL);

  // The "Öne çıkan sayfalar" list is the canonical (default-locale) page set;
  // the prefix rule is explained separately with `/en/jobs` as an example.
  const primarySection = brief
    .split("## Öne çıkan sayfalar")[1]
    .split("Her sayfa altı dilde")[0];
  const primaryPaths = [
    ...primarySection.matchAll(/\]\((https:\/\/isbulkktc\.com[^)]*)\)/g),
  ].map((match) => new URL(match[1]).pathname);

  assert.equal(primaryPaths.length, 7, "the brief lists seven primary pages");
  for (const pathname of primaryPaths) {
    assert.ok(
      appPageExists(pathname),
      `the brief links ${pathname}, but no page.tsx serves it`,
    );
    // A localized path here would offer Google a second copy to canonicalise.
    assert.ok(
      !pathname.startsWith("/en/") && !pathname.startsWith("/tr/"),
      `the primary list must use canonical paths, got ${pathname}`,
    );
  }

  // The resources block points at the machine files the site serves.
  for (const resource of ["/sitemap.xml", "/robots.txt", "/llms-full.txt"]) {
    assert.ok(
      brief.includes(`https://isbulkktc.com${resource}`),
      `the brief omits ${resource}`,
    );
  }
});

test("the brief states the same facts the graph does", () => {
  const brief = buildLlmsBrief(BASE_URL);

  assert.ok(brief.startsWith(`# ${SITE_NAME}`));
  assert.ok(brief.includes(AI_VISIBILITY_UPDATED));
  assert.ok(brief.includes("https://isbulkktc.com/sitemap.xml"));
  assert.ok(brief.includes("https://isbulkktc.com/robots.txt"));
  assert.ok(brief.includes("https://isbulkktc.com/llms-full.txt"));

  // The contact answer names the same address the footer and the graph carry,
  // so an answer engine quoting the brief quotes a reachable channel.
  assert.ok(brief.includes(SUPPORT_EMAIL));

  // Every served district must be named, in both the Turkish canonical form and
  // the English alternate, so an English query can match. The canonical name is
  // "Mağusa"; "Gazimağusa" is listed as an alternate, not as the name.
  for (const district of servedDistricts) {
    assert.ok(brief.includes(district.tr), `brief omits ${district.tr}`);
    assert.ok(brief.includes(district.names.en), `brief omits ${district.names.en}`);
  }
  assert.ok(
    brief.includes("Gazimağusa"),
    "the brief must list the Gazimağusa spelling for search",
  );

  // The short brief is the default-locale document: it must carry that
  // language's summary and not leak another locale's as if it were canonical.
  assert.ok(brief.includes(siteSummaryByLocale[routing.defaultLocale]));
  for (const locale of routing.locales) {
    if (locale === routing.defaultLocale) continue;
    assert.ok(
      !brief.includes(siteSummaryByLocale[locale]),
      `the short brief must not carry the ${locale} summary`,
    );
  }
});

test("the full brief covers all six locales with their own copy", () => {
  const full = buildLlmsFullBrief(BASE_URL);

  for (const locale of routing.locales) {
    assert.ok(
      full.includes(`## ${locale} — ${regionNames[locale]}`),
      `full brief omits the ${locale} section`,
    );
    assert.ok(full.includes(siteSummaryByLocale[locale]));
    // Each section names its districts in its own language, with the canonical
    // Turkish form alongside, so a Russian or Greek query matches too.
    for (const district of servedDistricts) {
      assert.ok(
        full.includes(district.names[locale]),
        `full brief omits the ${locale} label for ${district.tr}`,
      );
    }
    for (const entry of faqByLocale[locale]) {
      assert.ok(
        full.includes(entry.question),
        `full brief omits a ${locale} question`,
      );
    }
  }

  // Six sections, each preceded by a `---` rule (the header block adds one),
  // so the full brief carries exactly six horizontal rules.
  assert.equal(
    full.split("\n---\n").length - 1,
    routing.locales.length,
    "one `---` per locale section",
  );
});
