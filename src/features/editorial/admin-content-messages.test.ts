import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The content console renders `AdminContent.messages.<state.message>` for
// whatever the server actions return. If a state has no catalog entry next-intl
// throws at runtime, so the union in admin-content-schemas.ts and the six
// catalogs must stay in step.
const languages = ["tr", "en", "ru", "el", "fa", "de"] as const;

const readMessages = (language: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../messages/${language}.json`, import.meta.url),
      "utf8",
    ),
  ) as { AdminContent: { messages: Record<string, string> } };

// Extract the `message` union members from the type so a new state cannot be
// added without also adding copy.
function stateMessages(): string[] {
  const source = readFileSync(
    new URL("./admin-content-schemas.ts", import.meta.url),
    "utf8",
  );
  const union = source.slice(
    source.indexOf("message:"),
    source.indexOf("};", source.indexOf("message:")),
  );
  return [...union.matchAll(/"([a-zA-Z]+)"/g)]
    .map(([, value]) => value)
    .filter((value) => value !== "idle");
}

test("the content console state union is discovered", () => {
  const messages = stateMessages();
  assert.ok(messages.includes("saved"), "expected the state union to include saved");
  assert.ok(
    messages.includes("deleted"),
    "expected the state union to include deleted",
  );
});

test("every content console state has copy in all six locales", () => {
  for (const language of languages) {
    const { messages } = readMessages(language).AdminContent;
    for (const state of stateMessages()) {
      assert.ok(
        typeof messages[state] === "string" && messages[state].length > 0,
        `${language}: AdminContent.messages.${state} is missing`,
      );
    }
  }
});

test("success copy is distinct from the failure copy", () => {
  for (const language of languages) {
    const { messages } = readMessages(language).AdminContent;
    assert.notEqual(
      messages.saved,
      messages.saveFailed,
      `${language}: saved must not reuse the save-failure copy`,
    );
    assert.notEqual(
      messages.deleted,
      messages.deleteFailed,
      `${language}: deleted must not reuse the delete-failure copy`,
    );
  }
});
