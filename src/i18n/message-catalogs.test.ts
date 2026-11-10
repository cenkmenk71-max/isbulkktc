import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_COOKIE_OPTIONS } from "@supabase/ssr";
import { faqByLocale } from "@/content/ai-visibility/faq";
import { getArticles } from "@/content/editorial";
import { getGuides } from "@/content/guides";
import {
  consentCategories,
  consentCookieMaxAgeSeconds,
  type ConsentCategory,
} from "@/components/analytics/consent";
import { oauthSignupIntentMaxAgeSeconds } from "@/features/identity/oauth-signup-intent";
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

// The interface addresses the visitor with the formal second-person plural
// (`siz`, `-iniz`) everywhere, so a single informal singular slips into a
// different register than the rest of the product. Two notification blurbs
// shipped that way — "Başvuru durumun değiştiğinde ve sana … haberdar ol" and
// "… adaylardan mesaj aldığında haberdar ol" — beside their own formal twin on
// the push surface ("… durumunuz değiştiğinde … haberdar olun"), so the same
// sentence addressed the same reader two ways. The bare imperative of a button
// label ("Kaydet", "Giriş yap") is not flagged: only the unmistakable singular
// markers are. The lookarounds use `\p{L}` rather than `\b` because Turkish
// letters (`ı`, `ğ`, `ş` …) are not `\w`, so `\b` would match mid-word.
const INFORMAL_SECOND_PERSON =
  /(?<!\p{L})(sen|sana|seni|senden|sende|senin|seninle|kendin)(?!\p{L})|(?<!\p{L})\p{L}+(yorsun|acaksın|eceksin|abilirsin|ebilirsin|malısın|melisin|dığın|diğin|duğun|düğün)(?!\p{L})/iu;

test("Turkish catalog addresses the visitor in the formal register", () => {
  for (const [key, value] of Object.entries(turkish)) {
    const match = value.match(INFORMAL_SECOND_PERSON);
    assert.equal(
      match,
      null,
      `tr.${key} uses the informal singular "${match?.[0]}"; use the formal second-person plural`,
    );
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
// typed `{x, number}` (or sit inside a `plural`).
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

test("Persian numbers use the Persian numeral system, not bare Latin placeholders", () => {
  const messages = flatten(readMessages("fa"));
  for (const [key, message] of Object.entries(messages)) {
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

// `münhal` (a vacant post) and `iş ilanı` (the ad text for one) are near
// synonyms; pairing them in a single string reads as a pleonasm — "açık
// pozisyon ilanı" twice over. #399. `münhal` is deliberately kept as a
// standalone SEO term (#190), so the rule is only that the two never share a
// leaf; the two-sentence copy keeps each term on its own line.
test("the Turkish catalog never pairs 'münhal' with 'iş ilanı'", () => {
  const offenders = Object.entries(turkish).filter(([, value]) => {
    const folded = value.toLocaleLowerCase("tr");
    return folded.includes("münhal") && folded.includes("iş ilan");
  });
  assert.deepEqual(
    offenders,
    [],
    `pleonasm — these keys pair "münhal" with "iş ilanı": ${offenders
      .map(([key]) => key)
      .join(", ")}`,
  );
});

// The consent banner offers exactly the categories in `consentCategories`
// (`src/components/analytics/consent.ts`), and each one is a real choice: the
// `marketing` decision drives Google Consent Mode's `ad_storage`,
// `ad_user_data` and `ad_personalization` signals
// (`src/components/analytics/google-analytics.tsx`). The /cookies policy
// therefore has to document every category the visitor can accept. It did not:
// the banner shipped a Marketing toggle while the policy described analytics
// alone, so a visitor could consent to something the policy never named (#418).
//
// The banner label is a short noun ("Аналитика") while the policy needs a
// different grammatical form ("Аналитические cookie"), so matching the label
// verbatim reports a false miss. The check therefore runs on a per-locale stem:
// a fixed prefix of the banner label long enough to be unmistakable. Russian
// truncates to `Аналит`/`Маркет` (both cases differ in the final letters), the
// other five languages match their label exactly.
const CATEGORY_STEMS: Record<AppLocale, Record<ConsentCategory, string>> = {
  tr: { analytics: "analitik", marketing: "pazarlama" },
  en: { analytics: "analytics", marketing: "marketing" },
  ru: { analytics: "аналит", marketing: "маркет" },
  el: { analytics: "ανάλυσ", marketing: "μάρκετινγκ" },
  fa: { analytics: "تحلیل", marketing: "بازاریابی" },
  de: { analytics: "analyse", marketing: "marketing" },
};

/**
 * Assert that one legal policy names every consent category the banner offers.
 *
 * `policyKeys` are the flattened message keys that make up the policy's
 * consent paragraph; the check joins them and looks for each category's
 * per-locale stem. Shared by the cookie and privacy policy gates below — the
 * two documents describe the same consent surface and must not drift apart.
 */
function assertPolicyNamesConsentCategories(
  locale: AppLocale,
  policyLabel: string,
  policyKeys: readonly string[],
): void {
  const messages = flatten(readMessages(locale));
  const policy = policyKeys
    .map((key) => messages[key] ?? "")
    .join(" ")
    .toLocaleLowerCase(locale);

  for (const category of consentCategories) {
    const labelKey = `Analytics.${category}Label`;
    const label = messages[labelKey];
    assert.ok(
      typeof label === "string" && label.length > 0,
      `${locale}.${labelKey} must exist to label the banner category`,
    );
    assert.ok(
      policy.includes(CATEGORY_STEMS[locale][category]),
      `${locale} ${policyLabel} never names the "${category}" category the banner offers ("${label}")`,
    );
  }
}

// The ratchet ties the two surfaces together. It reads the banner's category
// list from the module rather than hardcoding it, so a category added to
// `consentCategories` must be documented in all six policies before CI passes.
test("the cookie policy documents every consent category the banner offers", () => {
  for (const locale of locales) {
    assertPolicyNamesConsentCategories(locale, "cookie policy", [
      "Legal.cookies.sections.s2.title",
      "Legal.cookies.sections.s2.p1",
    ]);
  }
});

// The privacy policy is the primary legal document and describes the same
// consent surface: `Legal.privacy.sections.s2.p2` is the paragraph that tells
// the visitor which optional cookies they can accept. Tur 9 fixed only the
// /cookies page, so the privacy policy still named analytics alone while the
// banner also offered marketing (#418 §6). This gate closes that drift for good
// — the two legal documents now move together.
test("the privacy policy documents every consent category the banner offers", () => {
  for (const locale of locales) {
    assertPolicyNamesConsentCategories(locale, "privacy policy", [
      "Legal.privacy.sections.s2.p2",
    ]);
  }
});

// The cookie policy states how long each cookie lasts. Those figures describe
// the running app, not editorial choices: the session cookie's lifetime is
// `@supabase/ssr`'s default (`DEFAULT_COOKIE_OPTIONS.maxAge`; the project never
// overrides `maxAge`), the security cookie's is `oauthSignupIntentMaxAgeSeconds`,
// and the consent decision's is `consentCookieMaxAgeSeconds`. This ratchet
// derives the documented numbers from those sources and requires each locale to
// state them in its own numerals, so a lifetime change cannot leave a stale
// claim on the /cookies page (#418 §6).
const sessionCookieDays = Math.round(
  (DEFAULT_COOKIE_OPTIONS.maxAge as number) / (24 * 60 * 60),
);
const securityCookieMinutes = Math.round(oauthSignupIntentMaxAgeSeconds / 60);
const consentCookieDays = Math.round(
  consentCookieMaxAgeSeconds / (24 * 60 * 60),
);
// Google Analytics `_ga` retention is set by Google, not by this project.
const analyticsCookieYears = 2;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const localizeDigits = (value: number, locale: AppLocale): string => {
  const western = String(value);
  return locale === "fa"
    ? western.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)])
    : western;
};

test("the cookie policy states each cookie's real lifetime", () => {
  const expectations: ReadonlyArray<{
    key: string;
    value: number;
    label: string;
  }> = [
    {
      key: "Legal.cookies.sections.s1.p1",
      value: sessionCookieDays,
      label: "session cookie days",
    },
    {
      key: "Legal.cookies.sections.s1.p1",
      value: securityCookieMinutes,
      label: "security cookie minutes",
    },
    {
      key: "Legal.cookies.sections.s2.p1",
      value: analyticsCookieYears,
      label: "analytics cookie years",
    },
    {
      key: "Legal.cookies.sections.s3.p1",
      value: consentCookieDays,
      label: "consent decision days",
    },
  ];

  for (const locale of locales) {
    const messages = flatten(readMessages(locale));
    for (const { key, value, label } of expectations) {
      const text = messages[key] ?? "";
      const token = localizeDigits(value, locale);
      assert.ok(
        text.includes(token),
        `${locale}.${key} does not state the ${label} (${token}); the policy drifted from the running app`,
      );
    }
  }
});
