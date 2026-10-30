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

// The resend affordance is rendered inside the sign-in form, which already
// knows the audience. If the audience is dropped the confirmation link lands an
// employer on the candidate dashboard, so the wiring is asserted here.
test("resending a confirmation keeps the sign-in audience", () => {
  const actions = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const resend = actions.slice(
    actions.indexOf("export async function resendConfirmation"),
    actions.indexOf("export async function requestPasswordReset"),
  );
  assert.ok(
    resend.includes('formData.get("audience")'),
    "resendConfirmation must read the audience from the form",
  );
  assert.ok(
    resend.includes('result.data.audience === "employer" ? "company" : "candidate"'),
    "resendConfirmation must derive next= from the audience",
  );
  assert.ok(
    !resend.includes("?next=candidate"),
    "resendConfirmation must not hardcode the candidate destination",
  );

  const form = readFileSync(
    new URL("./sign-in-form.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    form.includes("<ResendConfirmationForm audience={audience}"),
    "the sign-in form must pass its audience to the resend form",
  );

  const shared = readFileSync(
    new URL("./resend-confirmation-form.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    shared.includes('name="audience" type="hidden"'),
    "the resend form must submit the audience",
  );

  // The same affordance is offered on the sign-up success screen so a candidate
  // whose mail never arrived does not have to fail a sign-in to retry.
  const signUpForm = readFileSync(
    new URL("./sign-up-form.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(
    signUpForm.includes('<ResendConfirmationForm audience={audience}'),
    "the sign-up success screen must offer a resend",
  );
  // A nested <form> is dropped by the browser and the button would do nothing,
  // so the resend form must be a sibling of the sign-up form, not a child.
  assert.ok(
    signUpForm.indexOf("<ResendConfirmationForm") >
      signUpForm.indexOf("</form>"),
    "the resend form must not be nested inside the sign-up form",
  );
});
