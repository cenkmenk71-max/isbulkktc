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
  "humanCta",
  "launcherLabel",
  "panelSubtitle",
  "panelTitle",
  "send",
  "sendFailed",
  "suggestion1",
  "suggestion2",
  "suggestion3",
  "suggestionsLabel",
  "thinking",
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

// The key list above is a hand-maintained mirror of the widget. If it drifts —
// a key the widget reads is renamed, or one it stopped reading is left behind —
// the exact-set test still passes while the widget renders a raw key path to a
// visitor. Reading the widget's own `t("…")` calls and its `SUGGESTION_KEYS`
// array closes that gap: the pinned set must equal what the component uses.
test("the pinned key set matches the keys the widget actually reads", () => {
  const widget = readFileSync(
    new URL("./support-widget.tsx", import.meta.url),
    "utf8",
  );
  const used = new Set<string>();
  for (const match of widget.matchAll(/\bt\(\s*"([a-zA-Z0-9]+)"\s*\)/g)) {
    used.add(match[1]);
  }
  const suggestions = /SUGGESTION_KEYS\s*=\s*\[([^\]]*)\]/.exec(widget)?.[1] ?? "";
  for (const match of suggestions.matchAll(/"([a-zA-Z0-9]+)"/g)) {
    used.add(match[1]);
  }
  assert.deepEqual(
    [...used].sort(),
    [...SUPPORT_KEYS],
    "the widget's translated keys drifted from the pinned support key set",
  );
});
