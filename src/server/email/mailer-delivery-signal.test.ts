import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * `mailer.ts` is behind `server-only`, which throws under `tsx --test` without a
 * bundler condition, so its `deliver` body cannot be driven directly from the
 * unit layer. The behaviour of the signal it emits is pinned in
 * `delivery-health.test.ts`; this file pins the *wiring* — that both ways a send
 * can fail reach `reportDeliveryFailure` rather than a bare `console.error` a
 * health rule cannot match.
 *
 * The silent-failure half of #186 was that a delivery error only produced a
 * sentence. #372 fixed the returned-error branch; the `catch` — the other way a
 * send can fail — still logged a sentence and emitted no `email_health` signal,
 * so the same outage stayed invisible on that path. A source guard is the only
 * way to hold that line while the module stays `server-only`.
 */

const mailerSource = readFileSync(new URL("./mailer.ts", import.meta.url), "utf8");

test("the mailer imports the email_health reporter", () => {
  assert.match(mailerSource, /import\s*\{[^}]*reportDeliveryFailure[^}]*\}\s*from\s*["']\.\/delivery-health["']/);
});

test("a returned Resend error is reported as an email_health signal", () => {
  // The branch that handles `result.error` from the SDK. Comments sit between
  // the brace and the call, so match across them.
  const returnedBranch = mailerSource.match(
    /if\s*\(\s*result\.error\s*\)\s*\{([\s\S]*?)\n\s*\}/,
  );
  assert.ok(returnedBranch, "mailer.ts should keep the `result.error` branch");
  assert.match(
    returnedBranch[1],
    /reportDeliveryFailure\(\s*result\.error\s*\)/,
    "a returned Resend error must call reportDeliveryFailure",
  );
});

test("a thrown transport failure is reported, not swallowed into a log line", () => {
  // The catch block must route through the same reporter. Reverting it to a
  // bare `console.error` is the exact regression #186 was about.
  const catchBlock = mailerSource.match(/catch\s*\((\w+)\)\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(catchBlock, "mailer.ts should keep a catch block around the send");
  assert.match(
    catchBlock[2],
    new RegExp(`reportDeliveryFailure\\(\\s*${catchBlock[1]}\\s*\\)`),
    "the catch block must call reportDeliveryFailure on the thrown error",
  );
  assert.doesNotMatch(
    catchBlock[2],
    /console\.error/,
    "the catch block must not fall back to a bare console.error",
  );
});
