import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The public unsubscribe endpoint's authority boundary.
 *
 * `GET /api/email/unsubscribe` is followed from a mailbox, so it has **no
 * session** and yet it writes to `email_engagement_optouts` through a
 * `service_role` client. The threat model states the rule: authority comes
 * entirely from the HMAC in `s`, so the signature must be verified **before**
 * the service client is constructed or the RPC is called, and the response must
 * not reveal whether an address was subscribed (no oracle).
 *
 * The token core itself is unit-tested (`tests/unit/unsubscribe-token.test.ts`),
 * but the route's ordering and no-oracle properties were not pinned anywhere: a
 * refactor that moved the verification after the service-client construction, or
 * that branched the success body on prior opt-out state, would ship unnoticed.
 */

const routeFile = "src/app/api/email/unsubscribe/route.ts";
const source = readFileSync(new URL(`../../${routeFile}`, import.meta.url), "utf8");

test("the route verifies the signature before it touches the service client", () => {
  const verifyIndex = source.indexOf("verifyUnsubscribeSignature(email, signature)");
  const serviceIndex = source.indexOf("createSupabaseServiceClient()");
  const rpcIndex = source.indexOf('supabase.rpc("opt_out_engagement"');
  assert.ok(verifyIndex > -1, "the signature verification was not found");
  assert.ok(serviceIndex > -1, "the service-client construction was not found");
  assert.ok(rpcIndex > -1, "the opt-out RPC call was not found");
  assert.ok(
    verifyIndex < serviceIndex,
    "the service client is constructed before the signature is verified, so an " +
      "unsigned request could reach a service_role path",
  );
  assert.ok(
    verifyIndex < rpcIndex,
    "the opt-out RPC runs before the signature is verified",
  );
});

test("a failed verification returns 400 without reaching the write", () => {
  // The guard is a single `if (... !verifyUnsubscribeSignature ...) return 400`.
  assert.match(
    source,
    /!verifyUnsubscribeSignature\(email, signature\)[\s\S]{0,80}status:\s*400/,
    "a rejected signature must return 400 immediately",
  );
});

test("the route length-checks the address before verifying (no giant-input HMAC)", () => {
  assert.match(source, /email\.length\s*<\s*3/);
  assert.match(source, /email\.length\s*>\s*254/);
});

test("the success body does not branch on prior opt-out state (no subscription oracle)", () => {
  // The opt-out RPC returns no "already subscribed" signal to the caller, and the
  // success copy is emitted exactly once — an identical response whether the
  // address was newly opted out or already was.
  const successCopies = source.match(/tanıtım e-postalarından çıkarıldı/g) ?? [];
  assert.equal(
    successCopies.length,
    1,
    "the success body must be a single fixed string, not branched on prior state",
  );
  // And the RPC's result is not echoed back to the caller.
  assert.ok(
    !/Response\([^)]*error\.message/.test(source),
    "the RPC error must not be reflected to the caller",
  );
});

test("the token core compares in constant time and guards the length", () => {
  const core = readFileSync(
    new URL("../../src/server/email/unsubscribe-token-core.ts", import.meta.url),
    "utf8",
  );
  assert.match(core, /timingSafeEqual/, "the comparison must be constant-time");
  assert.match(
    core,
    /length\s*!==/,
    "a length mismatch must be handled before timingSafeEqual (which throws on unequal lengths)",
  );
});
