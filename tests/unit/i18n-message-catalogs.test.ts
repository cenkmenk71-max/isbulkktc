import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;
const readRawMessages = (locale: string) =>
  readFileSync(
    new URL(`../../src/messages/${locale}.json`, import.meta.url),
    "utf8",
  );
const readMessages = (locale: string) =>
  JSON.parse(readRawMessages(locale)) as Record<string, unknown>;

function isMessageObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenMessages(
  messages: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      result[path] = value;
    } else if (isMessageObject(value)) {
      Object.assign(result, flattenMessages(value, path));
    } else {
      throw new TypeError(`Invalid message value at ${path}`);
    }
  }
  return result;
}

function placeholders(message: string): string[] {
  const named = [...message.matchAll(/\{([a-zA-Z][\w]*)(?:,|\})/g)].map(
    ([, name]) => name,
  );
  const percent = [...message.matchAll(/%[A-Z][A-Z0-9_]*%/g)].map(
    ([placeholder]) => placeholder,
  );
  return [...named, ...percent].sort();
}

test("all supported locales include every English message key and placeholder", () => {
  const english = flattenMessages(readMessages("en"));

  for (const locale of locales) {
    const localized = flattenMessages(readMessages(locale));
    assert.deepEqual(
      Object.keys(localized).sort(),
      Object.keys(english).sort(),
      `${locale} message keys must match the English catalog`,
    );

    for (const [key, message] of Object.entries(english)) {
      assert.deepEqual(
        placeholders(localized[key]),
        placeholders(message),
        `${locale}.${key} must retain all interpolation placeholders`,
      );
    }
  }
});

test("locale catalogs do not define duplicate root sections", () => {
  for (const locale of locales) {
    const sections = [...readRawMessages(locale).matchAll(/^  "([^"]+)":/gm)].map(
      ([, key]) => key,
    );
    assert.equal(
      new Set(sections).size,
      sections.length,
      `${locale} must define each root message section exactly once`,
    );
  }
});
