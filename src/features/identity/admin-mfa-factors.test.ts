import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { staleUnverifiedTotpFactorIds } from "./admin-mfa-factors";

// `auth.mfa.listFactors()` buckets a factor into `totp` only when it is
// `verified`; an abandoned enrollment stays in `all` as `unverified` yet still
// occupies a row. GoTrue then refuses the next enroll with the same friendly
// name (`mfa_factor_name_conflict`) and counts it toward `MaxEnrolledFactors`,
// so an admin who left the setup screen once could never enroll again. These
// tests pin the selector that clears those stale rows.

test("selects an unverified TOTP factor left by an abandoned enrollment", () => {
  assert.deepEqual(
    staleUnverifiedTotpFactorIds([
      { id: "a", factor_type: "totp", status: "unverified" },
    ]),
    ["a"],
  );
});

test("never touches a verified TOTP factor", () => {
  // A verified factor is the one the challenge path must use; unenrolling it
  // here would drop the admin back to enrollment and break a working 2FA.
  assert.deepEqual(
    staleUnverifiedTotpFactorIds([
      { id: "a", factor_type: "totp", status: "verified" },
    ]),
    [],
  );
});

test("ignores non-TOTP factors regardless of status", () => {
  assert.deepEqual(
    staleUnverifiedTotpFactorIds([
      { id: "p", factor_type: "phone", status: "unverified" },
      { id: "w", factor_type: "webauthn", status: "unverified" },
      { id: "r", factor_type: "recovery_code", status: "verified" },
    ]),
    [],
  );
});

test("selects every stale TOTP factor when several accumulated", () => {
  assert.deepEqual(
    staleUnverifiedTotpFactorIds([
      { id: "a", factor_type: "totp", status: "unverified" },
      { id: "b", factor_type: "totp", status: "verified" },
      { id: "c", factor_type: "totp", status: "unverified" },
      { id: "d", factor_type: "phone", status: "unverified" },
    ]),
    ["a", "c"],
  );
});

test("returns nothing for an empty factor list", () => {
  assert.deepEqual(staleUnverifiedTotpFactorIds([]), []);
});

test("beginAdminMfa clears stale unverified factors before enrolling", () => {
  // The selector is useless unless the enrollment action actually applies it to
  // `factorList.all` before calling `mfa.enroll`. Guard the wiring statically so
  // a refactor cannot drop it silently.
  const source = readFileSync(
    new URL("./admin-mfa-actions.ts", import.meta.url),
    "utf8",
  );
  const begin = source.slice(
    source.indexOf("export async function beginAdminMfa"),
    source.indexOf("export async function verifyAdminMfa"),
  );

  assert.match(
    begin,
    /staleUnverifiedTotpFactorIds\(factorList\.all\)/,
    "beginAdminMfa must clear stale unverified factors from factorList.all",
  );
  assert.match(
    begin,
    /mfa\.unenroll\(\{\s*factorId/,
    "beginAdminMfa must unenroll the stale factor it selected",
  );

  const cleanupIndex = begin.indexOf("staleUnverifiedTotpFactorIds");
  const enrollIndex = begin.indexOf("mfa.enroll(");
  assert.ok(cleanupIndex >= 0 && enrollIndex >= 0, "expected both calls present");
  assert.ok(
    cleanupIndex < enrollIndex,
    "the stale-factor cleanup must run before mfa.enroll",
  );
});
