import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveAccountBlockedPath } from "./auth-routing";

const callbackSource = () =>
  readFileSync(
    new URL("../../app/[locale]/auth/callback/route.ts", import.meta.url),
    "utf8",
  );

// `profiles.status` is the account kill switch. `signIn` refuses a non-active
// account, but the callback route mints a session for every successful exchange
// (OAuth, e-mail confirmation, recovery), so it was the remaining way a
// suspended or closed account could obtain a working session — every later
// write then failed with a bare `42501` (#467/#418).

test("the blocked-account path lands on the login page's inactive branch", () => {
  // `error=account` is the login page's dedicated branch: it shows the inactive
  // message and a sign-out button, so the session the exchange minted can be
  // dropped. The audience is preserved so the picker stays on the right side.
  assert.equal(
    resolveAccountBlockedPath("en", "candidate"),
    "/en/login?audience=candidate&error=account",
  );
  assert.equal(
    resolveAccountBlockedPath("en", "employer"),
    "/en/login?audience=employer&error=account",
  );
  // The default locale is unprefixed (`localePrefix: "as-needed"`).
  assert.equal(
    resolveAccountBlockedPath("tr", "candidate"),
    "/login?audience=candidate&error=account",
  );
});

test("the callback reads profiles.status through the shared kill switch", () => {
  const source = callbackSource();

  assert.match(
    source,
    /\.from\("profiles"\)\s*\.select\("status"\)\s*\.eq\("id", userId\)/,
    "the callback must read the caller's own profiles.status",
  );
  assert.match(
    source,
    /isAccountBlocked\(data\?\.status\)/,
    "the callback must decide with the shared isAccountBlocked helper",
  );
});

test("every session-minting callback exit is gated by the kill switch", () => {
  const source = callbackSource();

  // The already-exchanged retry path mints a session too; it must be gated.
  assert.match(
    source,
    /already exchanged[\s\S]{0,400}isCallbackAccountBlocked\(supabase, sessionUser\.id\)/,
    "the already-exchanged retry path must apply the kill switch",
  );

  // The main success path must be gated before it redirects to a destination.
  const guardIndex = source.indexOf("isCallbackAccountBlocked(supabase, user.id)");
  const destinationIndex = source.lastIndexOf(
    "resolveAuthDestination(audience, locale)",
  );
  assert.ok(guardIndex > -1, "the main success path must apply the kill switch");
  assert.ok(
    guardIndex < destinationIndex,
    "the kill switch must run before the success destination redirect",
  );

  // A read failure denies: a session whose status cannot be confirmed is
  // exactly what this guard withholds.
  assert.match(
    source,
    /if \(error\) \{[\s\S]{0,200}return true;/,
    "the status read must fail closed",
  );
});

test("the callback drops the session it minted for a blocked account", () => {
  const source = callbackSource();

  // `signIn` signs the session out before redirecting; the callback must match,
  // or a blocked account keeps a live cookie until it clicks the branch's
  // sign-out button. Both gate sites must go through the sign-out exit.
  assert.match(
    source,
    /async function redirectBlockedAccount\([\s\S]{0,300}?await supabase\.auth\.signOut\(\)/,
    "the blocked-account exit must sign the session out",
  );
  const gateSites = source.match(/redirectBlockedAccount\(/g) ?? [];
  // One definition plus the two gate call sites (retry path, main path).
  assert.equal(
    gateSites.length,
    3,
    "both kill-switch gates must drop the session through redirectBlockedAccount",
  );
});

test("the login page renders the branch the callback sends blocked accounts to", () => {
  const loginSource = readFileSync(
    new URL("../../app/[locale]/(auth)/login/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    loginSource,
    /error === "account"/,
    "the login page must handle error=account",
  );
  assert.match(
    loginSource,
    /copy\("inactiveMessage"\)/,
    "the error=account branch must show the inactive message",
  );
  assert.match(
    loginSource,
    /<form action=\{signOut\}/,
    "the error=account branch must offer a sign-out",
  );
});
