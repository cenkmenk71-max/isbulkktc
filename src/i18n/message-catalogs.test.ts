import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
