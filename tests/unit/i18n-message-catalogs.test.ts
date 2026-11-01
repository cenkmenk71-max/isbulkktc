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

// `JSON.parse` silently keeps the last of two identical keys, so a duplicated
// key hides whichever copy lost — a translator's edit can vanish with no error.
// The old root-section check missed this because the duplicates lived one level
// down (`Header.account`/`Header.signOut` were defined twice in all six
// catalogs). Scanning the parsed object cannot find them either, since parsing
// already collapsed them, so this walks the raw text.
function duplicateKeyPaths(locale: string): string[] {
  const raw = readRawMessages(locale);
  const duplicates: string[] = [];
  let index = 0;

  const skipWhitespace = () => {
    while (index < raw.length && /\s/.test(raw[index])) index += 1;
  };

  const readString = (): string => {
    const start = index;
    index += 1;
    while (index < raw.length) {
      if (raw[index] === "\\") {
        index += 2;
        continue;
      }
      if (raw[index] === '"') {
        index += 1;
        break;
      }
      index += 1;
    }
    return JSON.parse(raw.slice(start, index)) as string;
  };

  const parseValue = (path: string): void => {
    skipWhitespace();
    const character = raw[index];

    if (character === "{") {
      index += 1;
      const seen = new Set<string>();
      skipWhitespace();
      while (raw[index] !== "}") {
        skipWhitespace();
        const key = readString();
        const childPath = path ? `${path}.${key}` : key;
        if (seen.has(key)) duplicates.push(childPath);
        seen.add(key);
        skipWhitespace();
        index += 1; // ':'
        parseValue(childPath);
        skipWhitespace();
        if (raw[index] === ",") {
          index += 1;
          skipWhitespace();
        }
      }
      index += 1; // '}'
      return;
    }

    if (character === "[") {
      index += 1;
      let item = 0;
      skipWhitespace();
      while (raw[index] !== "]") {
        parseValue(`${path}[${item}]`);
        item += 1;
        skipWhitespace();
        if (raw[index] === ",") {
          index += 1;
          skipWhitespace();
        }
      }
      index += 1; // ']'
      return;
    }

    if (character === '"') {
      readString();
      return;
    }

    while (
      index < raw.length &&
      !",}]".includes(raw[index]) &&
      !/\s/.test(raw[index])
    ) {
      index += 1;
    }
  };

  parseValue("");
  return duplicates;
}

test("locale catalogs define every message key exactly once at any depth", () => {
  for (const locale of locales) {
    assert.deepEqual(
      duplicateKeyPaths(locale),
      [],
      `${locale} must not define a message key twice`,
    );
  }
});
