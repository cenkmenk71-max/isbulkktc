import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

const readMessages = (locale: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../messages/${locale}.json`, import.meta.url),
      "utf8",
    ),
  ) as Record<string, unknown>;

const supportKeys = (locale: string) =>
  Object.keys(
    (readMessages(locale).support ?? {}) as Record<string, unknown>,
  ).sort();

// The widget reads a fixed key set through `useTranslations("support")`. A
// missing key renders the raw key path to the visitor, and a stray one is dead
// weight translators keep re-checking, so the namespace is pinned in all six
// catalogs.
const SUPPORT_KEYS = [
  "botLabel",
  "close",
  "composerLabel",
  "composerPlaceholder",
  "emailHint",
  "emailLabel",
  "emailPlaceholder",
  "greeting",
  "launcherLabel",
  "panelSubtitle",
  "panelTitle",
  "send",
  "sendFailed",
  "sending",
  "youLabel",
] as const;

test("every locale defines the support chat namespace", () => {
  for (const locale of locales) {
    assert.ok(
      readMessages(locale).support,
      `${locale} is missing the support namespace`,
    );
  }
});

test("the support namespace carries exactly the widget's key set", () => {
  for (const locale of locales) {
    assert.deepEqual(
      supportKeys(locale),
      [...SUPPORT_KEYS],
      `${locale}.support does not match the keys the widget reads`,
    );
  }
});

test("every support string is a non-empty value in every locale", () => {
  for (const locale of locales) {
    const support = readMessages(locale).support as Record<string, unknown>;
    for (const key of SUPPORT_KEYS) {
      const value = support[key];
      assert.equal(
        typeof value === "string" && value.length > 0,
        true,
        `${locale}.support.${key} must be a non-empty string`,
      );
    }
  }
});
