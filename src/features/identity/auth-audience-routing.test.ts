import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  audienceFromCallbackParam,
  callbackAudienceParam,
  resolveAuthDestination,
} from "./auth-routing";
import { resendConfirmationSchema } from "./schemas";

// The callback recovers the audience from the `next` query param alone, so
// every flow that emails a confirmation link must encode it there. The resend
// flow used to hardcode `next=candidate`, which landed an employer who
// re-verified on the candidate dashboard. These tests pin the round trip.

test("callbackAudienceParam round-trips through audienceFromCallbackParam", () => {
  for (const audience of ["candidate", "employer"] as const) {
    assert.equal(
      audienceFromCallbackParam(callbackAudienceParam(audience)),
      audience,
    );
  }

  // Only the literal `company` means employer; anything else is a candidate.
  assert.equal(callbackAudienceParam("employer"), "company");
  assert.equal(callbackAudienceParam("candidate"), "candidate");
});

test("the employer audience resolves to the company dashboard, not the candidate one", () => {
  assert.equal(resolveAuthDestination("employer", "en"), "/en/company/dashboard");
  assert.equal(resolveAuthDestination("candidate", "en"), "/en/profile/dashboard");
});

test("the resend schema carries the audience alongside the address", () => {
  const parsed = resendConfirmationSchema.safeParse({
    email: "aday@example.com",
    audience: "employer",
    locale: "en",
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.success && parsed.data.audience, "employer");

  // A submission without an audience is rejected rather than silently defaulted
  // to candidate, which is what let the bug hide.
  assert.equal(
    resendConfirmationSchema.safeParse({
      email: "aday@example.com",
      locale: "en",
    }).success,
    false,
  );
});

test("the resend action encodes the audience in the confirmation link", () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const resend = source.slice(source.indexOf("export async function resendConfirmation"));

  assert.match(
    resend,
    /audience:\s*formData\.get\("audience"\)/,
    "resendConfirmation must read the audience from the form",
  );
  assert.match(
    resend,
    /next=\$\{callbackAudienceParam\(/,
    "resendConfirmation must derive `next` from the audience, not hardcode candidate",
  );
  assert.doesNotMatch(
    resend,
    /next=candidate/,
    "resendConfirmation still hardcodes the candidate destination",
  );
});

test("the resend form hands the audience back to the server action", () => {
  const source = readFileSync(
    new URL("./sign-in-form.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /<input name="audience" type="hidden" value=\{audience\} \/>/,
    "the resend form must post the audience",
  );
  assert.match(
    source,
    /<ResendConfirmationForm email=\{state\.email\} audience=\{audience\} \/>/,
    "the resend form must receive the sign-in audience",
  );
});
