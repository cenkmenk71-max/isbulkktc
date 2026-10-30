import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The auth forms render `AuthForms.messages.<state.message>` for whatever the
// server action returns. If a state has no catalog entry next-intl throws at
// runtime, so the union in schemas.ts and the six catalogs must stay in step.
const languages = ["tr", "en", "ru", "el", "fa", "de"] as const;

const readMessages = (language: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../messages/${language}.json`, import.meta.url),
      "utf8",
    ),
  ) as { AuthForms: { messages: Record<string, string> } };

// Extract the `message` union members from the type so a new state cannot be
// added without also adding copy.
function stateMessages(): string[] {
  const source = readFileSync(
    new URL("./schemas.ts", import.meta.url),
    "utf8",
  );
  const union = source.slice(
    source.indexOf("message:"),
    source.indexOf("status:", source.indexOf("message:")),
  );
  return [...union.matchAll(/"([a-zA-Z]+)"/g)]
    .map(([, value]) => value)
    .filter((value) => value !== "idle");
}

test("the sign-in state union is discovered", () => {
  const messages = stateMessages();
  assert.ok(messages.length >= 10, "expected the state union to be parsed");
  assert.ok(messages.includes("emailNotConfirmed"));
  assert.ok(messages.includes("verificationResent"));
  assert.ok(messages.includes("resendFailed"));
});

test("every auth form state has copy in all six locales", () => {
  for (const language of languages) {
    const { messages } = readMessages(language).AuthForms;
    for (const state of stateMessages()) {
      assert.ok(
        typeof messages[state] === "string" && messages[state].length > 0,
        `${language}: AuthForms.messages.${state} is missing`,
      );
    }
  }
});

test("the resend affordance labels exist in all six locales", () => {
  for (const language of languages) {
    const authForms = readMessages(language).AuthForms as Record<string, unknown>;
    for (const key of ["resendVerification", "resendingVerification"]) {
      assert.equal(
        typeof authForms[key],
        "string",
        `${language}: AuthForms.${key} is missing`,
      );
    }
  }
});

test("email-not-confirmed copy is distinct from the generic sign-in failure", () => {
  for (const language of languages) {
    const { messages } = readMessages(language).AuthForms;
    assert.notEqual(
      messages.emailNotConfirmed,
      messages.signInFailed,
      `${language}: email_not_confirmed must not reuse the generic copy`,
    );
  }
});
