import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relative: string) =>
  readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");

/**
 * The OAuth/confirmation callback must not block its redirect on the outbound
 * welcome mail.
 *
 * `sendWelcomeEmail` is an HTTPS round trip to Resend (hundreds of ms, seconds
 * when the provider is slow). The callback awaited it before returning the
 * redirect, so a new sign-up waited on the mail provider before landing on the
 * dashboard — the "delay" reported in #161. The send is now scheduled with
 * Next's `after()`, which runs it once the response has been sent.
 *
 * This is a static guard: the timing cannot be asserted from a unit test, but
 * the *shape* that caused the delay can — an `await` on the mail send inside the
 * callback, before the redirect is returned.
 */
test("the callback does not await the welcome mail on the redirect path", () => {
  const source = readSource("src/app/[locale]/auth/callback/route.ts");
  // The GET handler is the redirect path. Inside it the mail must only be
  // *scheduled*; the send itself lives in the deferred `after()` task.
  const handler = source.slice(source.indexOf("export async function GET"));

  assert.doesNotMatch(
    handler,
    /await\s+sendWelcomeEmail\(/,
    "the welcome mail must not be awaited in the GET handler; schedule it with after()",
  );
  assert.doesNotMatch(
    handler,
    /await\s+greetNewAccount\(/,
    "greetNewAccount must not be awaited in the GET handler",
  );
  assert.match(
    handler,
    /scheduleWelcomeEmail\(/,
    "the GET handler must schedule the welcome mail",
  );

  // The send is deferred: `after(...)` wraps it and the scheduler is sync.
  assert.match(
    source,
    /import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*"next\/server"/,
    "the callback must import `after` from next/server",
  );
  assert.match(
    source,
    /after\(async\s*\(\)\s*=>\s*\{[\s\S]*?sendWelcomeEmail\(/,
    "the welcome mail must run inside after()",
  );
  assert.match(
    source,
    /function scheduleWelcomeEmail\([\s\S]*?\):\s*void\s*\{/,
    "scheduleWelcomeEmail must be synchronous so it cannot be awaited by mistake",
  );
});

test("the deferred send keeps its error handling (best-effort)", () => {
  const source = readSource("src/app/[locale]/auth/callback/route.ts");
  // A mail failure must never throw out of the deferred task and crash the
  // request after the response was already sent.
  assert.match(source, /Welcome email could not be sent/);
  assert.match(
    source,
    /catch\s*\(mailError\)/,
    "the deferred send must swallow a mail failure",
  );
});

test("the sign-up action does not await the welcome mail either", () => {
  // Same defect class as the callback: signUp sends the same welcome mail, and
  // it used to await the outbound Resend call before redirecting the new account
  // to its dashboard. Server Functions support `after()` too.
  const source = readSource("src/features/identity/actions.ts");

  assert.match(
    source,
    /import\s*\{[^}]*\bafter\b[^}]*\}\s*from\s*"next\/server"/,
    "actions.ts must import `after` from next/server",
  );

  // Scope to signUp: the send lives inside its own `after()` task.
  const signUp = source.slice(
    source.indexOf("export async function signUp"),
    source.indexOf("export async function resendConfirmation"),
  );

  const sendIndex = signUp.indexOf("sendWelcomeEmail(");
  assert.ok(sendIndex > -1, "signUp must send the welcome mail");
  assert.equal(
    signUp.split("sendWelcomeEmail(").length - 1,
    1,
    "signUp must send the welcome mail exactly once",
  );
  // The only send is wrapped in `after(async () => { … })`, so it runs after the
  // response; there is no bare `await sendWelcomeEmail` on the redirect path.
  const beforeSend = signUp.slice(0, sendIndex);
  assert.ok(
    /after\(async\s*\(\)\s*=>\s*\{[\s\S]*try\s*\{[\s\S]*await\s*$/.test(beforeSend),
    "the welcome mail must run inside after()",
  );
  // The redirect must follow the scheduling, so the response is not held.
  assert.ok(
    signUp.indexOf("after(async") <
      signUp.indexOf("redirect(resolveAuthDestination("),
    "the redirect must come after the mail is scheduled, not awaited",
  );
});
