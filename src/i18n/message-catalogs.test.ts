import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { faqByLocale } from "@/content/ai-visibility/faq";
import { getArticles } from "@/content/editorial";
import { getGuides } from "@/content/guides";
import type { AppLocale } from "@/i18n/routing";

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;
const translatedLocales = ["en", "ru", "el", "fa", "de"] as const;

const readMessages = (locale: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;

function flatten(
  value: unknown,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      result[path] = child;
    } else {
      Object.assign(result, flatten(child, path));
    }
  }
  return result;
}

const turkish = flatten(readMessages("tr"));

// `contactEmail` is an address, not prose, so every locale legitimately keeps
// the same value. Everything else under `Legal` is user-facing copy and must be
// authored per language, not left as the Turkish original (the regression #141
// shipped).
const LEGAL_IDENTICAL_ALLOWLIST = new Set(["Legal.contactEmail"]);

test("Legal copy is authored per locale, not left as the Turkish original", () => {
  for (const locale of translatedLocales) {
    const messages = flatten(readMessages(locale));
    for (const [key, value] of Object.entries(turkish)) {
      if (!key.startsWith("Legal.")) continue;
      if (LEGAL_IDENTICAL_ALLOWLIST.has(key)) continue;
      assert.notEqual(
        messages[key],
        value,
        `${locale}.${key} is still the Turkish string; translate it or add it to the allowlist with a reason`,
      );
    }
  }
});

test("Legal page titles and section headings are translated in every locale", () => {
  const pages = ["privacy", "cookies", "terms"] as const;
  for (const locale of translatedLocales) {
    const messages = flatten(readMessages(locale));
    for (const page of pages) {
      assert.notEqual(
        messages[`Legal.${page}.title`],
        turkish[`Legal.${page}.title`],
        `${locale}.Legal.${page}.title must not be the Turkish title`,
      );
      const sectionKeys = Object.keys(turkish)
        .filter((key) => key.startsWith(`Legal.${page}.sections.`))
        .filter((key) => key.endsWith(".title"));
      assert.ok(
        sectionKeys.length > 0,
        `the Turkish catalog must define section headings for ${page}`,
      );
      for (const key of sectionKeys) {
        assert.notEqual(
          messages[key],
          turkish[key],
          `${locale}.${key} must not be the Turkish heading`,
        );
      }
    }
  }
});

// Keys whose rendering code was removed but whose strings stayed behind in all
// six catalogs. The district metric note went in #220; the rest were found by
// scanning every `src/**` file for a literal or template reference to each
// catalog leaf. A key with no caller is dead weight that translators keep
// re-checking, so this ratchet fails if one is reintroduced without its UI.
const RETIRED_KEYS = [
  "BlogPage.sourceSearchLink",
  "BlogPage.latestBadge",
  "BlogPage.localNewsBadge",
  "BlogPage.illustrativeImage",
  "BlogPage.emptyBody",
  "BlogPage.editorialNoteTitle",
  "BlogPage.editorialNoteBody",
  "BlogPage.photoLicense",
  "BlogPage.sourceLabel",
  "BlogPage.emptyTitle",
  "BlogPage.metaTitle",
  "BlogPage.metaDescription",
  "CompanyDirectory.sourceProfileLink",
  "CompanyDirectory.sourceListingLink",
  "CompanyDirectory.categoryPlaceholder",
  "CompanyDirectory.districtDataNote",
  "CandidateDashboard.sectionsDescription",
  "CompanyManagement.workspace.documentsTitle",
  "CompanyManagement.directoryTargetNone",
  "CompanyManagement.directoryTargetHint",
  "DistrictPage.countLabel",
  "JobTypePage.countLabel",
  "Guides.allGuides",
] as const;

test("no catalog keeps a message key whose rendering code was removed", () => {
  for (const locale of locales) {
    const messages = flatten(readMessages(locale));
    for (const key of RETIRED_KEYS) {
      assert.equal(
        key in messages,
        false,
        `${locale} defines the retired key ${key}; re-add it only with the UI that reads it`,
      );
    }
  }
});

// The lane's rule is that a visitor only ever sees their own action explained,
// never how the pipeline works underneath. `CompanyDirectory.sourceNote` leaked
// "kaynak koordinatlarına göre" (the brief names that exact phrase as forbidden
// internal vocabulary), so this ratchet keeps implementation words off the
// surface. The list is deliberately narrow — only phrases that describe the
// system, not a legitimate user action like importing one's own CV.
const FORBIDDEN_INTERNAL_PHRASES = [
  "kaynak koordinat",
  "kaynak veri",
  "kaynak ilan",
  "sağlanan kaynak",
  "şube sayısı",
  "dahil edilmez",
  "hariç tutul",
] as const;

test("Turkish catalog keeps internal pipeline vocabulary off the visitor surface", () => {
  for (const [key, value] of Object.entries(turkish)) {
    for (const phrase of FORBIDDEN_INTERNAL_PHRASES) {
      assert.equal(
        value.toLowerCase().includes(phrase),
        false,
        `tr.${key} leaks internal vocabulary "${phrase}"; reword it as the user's own action`,
      );
    }
  }
});

// The ratchet above guards only the source language, so a translator can
// reintroduce the same leak in a target language unnoticed. These are the
// per-locale renderings of the internal phrases the brief forbids on the
// visitor surface: the "source coordinates" wording #220/#276 removed from
// `CompanyDirectory.sourceNote`, and "source data" / "source listings" /
// "supplied source files" — the pipeline's own names for the directory feed,
// which leaked in `ContactPage.nextBody`, `CompanyDirectory.jobEmployersDescription`
// and `AboutPage.realityBody` in all six locales. Each describes how the system
// is fed rather than the visitor's own action, so the list stays narrow enough
// not to flag ordinary copy.
const FORBIDDEN_SOURCE_VOCABULARY: Record<string, readonly string[]> = {
  tr: ["kaynak koordinat", "kaynak veri", "kaynak ilan", "sağlanan kaynak"],
  en: [
    "source coordinate",
    "source data",
    "source listing",
    "supplied source",
  ],
  de: ["quellkoordinat", "quelldaten", "quellanzeigen", "quellendatei"],
  ru: [
    "координат источника",
    "координаты источника",
    "исходных данных",
    "исходные данные",
    "исходных объявлен",
    "предоставленных источник",
  ],
  el: [
    "συντεταγμένες πηγής",
    "δεδομένων πηγής",
    "αγγελίες της πηγής",
    "παρεχόμενες πηγές",
  ],
  fa: ["مختصات منبع", "داده‌های منبع", "آگهی‌های منبع", "فایل‌های منبع"],
};

test("no locale reintroduces the forbidden source vocabulary", () => {
  for (const locale of locales) {
    const messages = flatten(readMessages(locale));
    for (const [key, value] of Object.entries(messages)) {
      for (const phrase of FORBIDDEN_SOURCE_VOCABULARY[locale] ?? []) {
        assert.equal(
          value.toLowerCase().includes(phrase),
          false,
          `${locale}.${key} leaks internal vocabulary "${phrase}"`,
        );
      }
    }
  }
});

// The FAQ copy lives in `src/content/ai-visibility/faq.ts` (the text portion of
// the content bundle), not in the message catalogs, so the ratchet above cannot
// see it. All six languages shipped the pipeline's own "supplied source files"
// wording (#308 removed it from the interface copy but not from the FAQ), so the
// per-locale forbidden vocabulary is applied to the FAQ text as well.
test("the FAQ copy keeps internal source vocabulary off the visitor surface", () => {
  for (const locale of locales) {
    for (const entry of faqByLocale[locale]) {
      const text = `${entry.question}\n${entry.answer}`.toLowerCase();
      for (const phrase of FORBIDDEN_SOURCE_VOCABULARY[locale] ?? []) {
        assert.equal(
          text.includes(phrase),
          false,
          `${locale} FAQ leaks internal vocabulary "${phrase}"`,
        );
      }
    }
  }
});

// #327: the `de` landing titles were exact copies of the English templates
// ("Jobs in {district}", "{type} Jobs"), so the German H1 contradicted its own
// German meta title while ru/el/fa carried their own. A visible landing title
// must be authored per language, never inherited from English.
test("landing page titles are authored per locale, not copied from English", () => {
  const english = flatten(readMessages("en"));
  const guarded = ["DistrictPage.title", "JobTypePage.title"];
  for (const locale of translatedLocales) {
    if (locale === "en") continue;
    const messages = flatten(readMessages(locale));
    for (const key of guarded) {
      assert.notEqual(
        messages[key],
        english[key],
        `${locale}.${key} is still the English template; translate it`,
      );
    }
  }
});

// Persian renders digits in the Persian numbering system (۰-۹), but ICU only
// applies it to typed placeholders: a bare `{count}` interpolates the raw Latin
// string. `fa` shipped "906 ورودی شرکت" beside "۹۰۶ شرکت پیدا شد" from the plural
// form — two numeral systems on one page. Every numeric placeholder must be
// typed `{x, number}` (or sit inside a `plural`), except the deferred
// `HomePage.sector*` templates: those are rendered with a literal "{count}"
// string, so typing them would format a non-number (see the LANE-TASARIM handoff).
const NUMERIC_PLACEHOLDERS = new Set([
  "count",
  "total",
  "current",
  "completed",
  "percent",
  "value",
  "minutes",
  "pages",
  "page",
  "number",
  "year",
]);
const FA_DEFERRED_PLACEHOLDERS = new Set([
  "HomePage.sectorTotalCount",
  "HomePage.sectorResultCountSingular",
  "HomePage.sectorResultCountPlural",
]);

test("Persian numbers use the Persian numeral system, not bare Latin placeholders", () => {
  const messages = flatten(readMessages("fa"));
  for (const [key, message] of Object.entries(messages)) {
    if (FA_DEFERRED_PLACEHOLDERS.has(key)) continue;
    for (const match of message.matchAll(/\{([a-zA-Z][\w]*)\}/g)) {
      assert.ok(
        !NUMERIC_PLACEHOLDERS.has(match[1]),
        `fa.${key} interpolates {${match[1]}} without a number format; type it as {${match[1]}, number}`,
      );
    }
  }
});

// The four catalogs that render the six district labels must agree. The company
// directory, the candidate profile and the employer dashboard previously carried
// their own glossed variants ("Kyrenia (Girne)", "Никосия" beside "Лефкоша"), so
// the same district read differently on different pages. `HomeJobSearch.districts`
// is the canonical set — it also feeds the district landing metadata.
test("every district label matches the canonical HomeJobSearch set", () => {
  const namespaces = [
    "CompanyDirectory",
    "CandidateDashboard",
    "CompanyManagement",
  ];
  const prefix = "HomeJobSearch.districts.";
  for (const locale of locales) {
    const messages = flatten(readMessages(locale));
    const leaves = Object.keys(messages)
      .filter((key) => key.startsWith(prefix))
      .map((key) => key.slice(prefix.length));
    assert.ok(leaves.length === 6, `${locale} must define all six districts`);
    for (const namespace of namespaces) {
      for (const leaf of leaves) {
        assert.equal(
          messages[`${namespace}.districts.${leaf}`],
          messages[`${prefix}${leaf}`],
          `${locale}.${namespace}.districts.${leaf} must match the canonical label`,
        );
      }
    }
  }
});

// The FAQ answer that lists the six districts is the one place the content
// bundle and the interface both name them, so a second transliteration set can
// drift in unnoticed — the Persian answer shipped the Turkish-derived names
// (لفکوشا، غازی‌ماغوسا، گوزلیورت، ایسکله) while every other Persian surface used
// نیکوزیا، فاماگوستا، مورفو، ترکومو. The Turkish, Russian and German answers
// legitimately carry an inflected or alternate form, listed here so the ratchet
// stays honest about which variants are accepted.
const DISTRICT_ALIASES: Record<string, Record<string, string[]>> = {
  tr: { "Mağusa": ["Gazimağusa"] },
  ru: { "Лефке": ["Лефка"] },
  el: { "Αμμόχωστος": ["Αμμόχωστο"] },
  de: { "Lefke": ["Lefka"] },
};

test("the FAQ names the districts as the interface does", () => {
  const prefix = "HomeJobSearch.districts.";
  for (const locale of locales) {
    const messages = flatten(readMessages(locale));
    const labels = Object.entries(messages)
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
    assert.ok(labels.length === 6, `${locale} must define all six districts`);
    const text = faqByLocale[locale]
      .map((entry) => `${entry.question}\n${entry.answer}`)
      .join("\n");
    for (const label of labels) {
      const variants = [label, ...(DISTRICT_ALIASES[locale]?.[label] ?? [])];
      assert.ok(
        variants.some((variant) => text.includes(variant)),
        `${locale} FAQ must name "${label}" as the interface does`,
      );
    }
  }
});

// The guides and editorial articles name the districts too. Two guards, because
// a drifted name appears in two shapes: a gloss `نیکوزیا (Lefkoşa)`, anchored on
// the Turkish name, and a bare mention in a sentence, which only an explicit
// forbidden list catches. The FAQ has its own guard above and is excluded here
// so a correct answer cannot mask a drifted guide.
const TURKISH_TO_LEAF: Record<string, string> = {
  Lefkoşa: "lefkosia",
  Mağusa: "magusa",
  Girne: "girne",
  Güzelyurt: "guzelyurt",
  İskele: "iskele",
  Lefke: "lefke",
};

const FORBIDDEN_DISTRICT_VARIANTS: Record<string, Record<string, string>> = {
  fa: { "تریکومو": "ترکومو", "لفکا": "لفکه" },
};

test("the content bundle names the districts as the interface does", () => {
  const prefix = "HomeJobSearch.districts.";
  for (const locale of locales) {
    const messages = flatten(readMessages(locale));
    const canonical: Record<string, string> = {};
    for (const [key, value] of Object.entries(messages)) {
      if (key.startsWith(prefix)) canonical[key.slice(prefix.length)] = value;
    }
    assert.ok(
      Object.keys(canonical).length === 6,
      `${locale} must define all six districts`,
    );

    const appLocale = locale as AppLocale;
    const text = [
      ...getGuides(appLocale).flatMap((guide) => [
        guide.title,
        guide.description,
        guide.lead,
        ...guide.sections.flatMap((section) => [
          section.heading,
          ...section.body,
          ...(section.list ?? []),
        ]),
      ]),
      ...getArticles(appLocale).flatMap((article) => [
        article.title,
        article.description,
        ...article.sections.flatMap((section) => [
          section.heading,
          ...section.body,
          ...(section.list ?? []),
        ]),
      ]),
    ].join("\n");

    for (const match of text.matchAll(/([^\s()،,;]+)\s*\(([^()]+)\)/g)) {
      const leaf = TURKISH_TO_LEAF[match[2].trim()];
      if (!leaf) continue;
      const expected = canonical[leaf];
      const accepted = [
        expected,
        ...(DISTRICT_ALIASES[locale]?.[expected] ?? []),
      ];
      assert.ok(
        accepted.includes(match[1]),
        `${locale} content glosses "${match[2].trim()}" as "${match[1]}", expected "${expected}"`,
      );
    }

    for (const [variant, replacement] of Object.entries(
      FORBIDDEN_DISTRICT_VARIANTS[locale] ?? {},
    )) {
      assert.ok(
        !text.includes(variant),
        `${locale} content uses "${variant}"; the interface uses "${replacement}"`,
      );
    }
  }
});
