import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relative: string) =>
  readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

/**
 * With confirmations on, `signUp` on an address that already has an account
 * returns an obfuscated user, no session, and sends no mail — GoTrue does this
 * on purpose so a visitor cannot probe which addresses are registered. GoTrue
 * marks the case with an empty `identities` array; a genuine new signup carries
 * the `email` identity it just created.
 *
 * The bug this pins: the action ignored the marker and fell through to
 * `verificationSent`, so someone re-registering an existing address was told a
 * verification link was on its way and waited for a mail that was never sent.
 */
test("signUp reports an existing address instead of a phantom verification mail", () => {
  const source = readSource("src/features/identity/actions.ts");

  assert.match(
    source,
    /data\.user\.identities\?\.length \?\? 0\) === 0/,
    "the obfuscated signup must be detected through the empty identities array",
  );
  assert.match(
    source,
    /message: "emailAlreadyRegistered"/,
    "an existing address must map to its own message",
  );

  // The detection has to sit *after* the session branch: a real signup that
  // returns a session must redirect, not be reported as a duplicate.
  const sessionIndex = source.indexOf("if (data.session)");
  const duplicateIndex = source.indexOf("identities?.length");
  assert.ok(sessionIndex > -1 && duplicateIndex > -1);
  assert.ok(
    sessionIndex < duplicateIndex,
    "the session redirect must come before the duplicate check",
  );

  // The final fall-through stays the success path for a genuinely new signup.
  const tail = source.slice(duplicateIndex);
  assert.match(tail, /message: "verificationSent"/);
});

test("every locale carries the already-registered copy", () => {
  for (const language of ["tr", "en", "ru", "el", "fa", "de"]) {
    const catalog = JSON.parse(
      readFileSync(
        new URL(`../../src/messages/${language}.json`, import.meta.url),
        "utf8",
      ),
    ) as { AuthForms: { messages: Record<string, string> } };
    const copy = catalog.AuthForms.messages.emailAlreadyRegistered;
    assert.equal(
      typeof copy,
      "string",
      `${language} is missing the emailAlreadyRegistered message`,
    );
    assert.ok(copy.length > 20, `${language} copy looks like a placeholder`);
  }
});
