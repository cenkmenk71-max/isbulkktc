import assert from "node:assert/strict";
import test from "node:test";
import {
  consentCategories,
  consentCookieMaxAgeSeconds,
  consentCookieName,
  consentMaxAgeMs,
  consentStateFromCookie,
  consentStorageKey,
  consentVersion,
  defaultDecision,
  encodeConsentCookie,
  isConsentCategory,
  parseConsent,
  parseConsentCookie,
  serializeConsent,
  undecidedConsent,
  withDecision,
} from "../../src/components/analytics/consent";

test("an absent value means the visitor has not decided", () => {
  assert.deepEqual(parseConsent(null), undecidedConsent);
  assert.deepEqual(parseConsent(undefined), undecidedConsent);
  assert.deepEqual(parseConsent(""), undecidedConsent);
  assert.equal(parseConsent(null).decided, false);
});

test("the legacy bare-string decisions are still honoured", () => {
  assert.deepEqual(parseConsent("granted"), {
    decided: true,
    analytics: true,
    marketing: false,
    updatedAt: null,
  });
  assert.deepEqual(parseConsent("denied"), {
    decided: true,
    analytics: false,
    marketing: false,
    updatedAt: null,
  });
});

test("the v2 object without a version parses", () => {
  assert.deepEqual(parseConsent(JSON.stringify({ analytics: true, marketing: true })), {
    decided: true,
    analytics: true,
    marketing: true,
    updatedAt: null,
  });
});

test("the current serialized shape round-trips", () => {
  const raw = serializeConsent({ analytics: true, marketing: false });
  const parsed = parseConsent(raw);
  assert.equal(parsed.decided, true);
  assert.equal(parsed.analytics, true);
  assert.equal(parsed.marketing, false);
  assert.equal(JSON.parse(raw).version, consentVersion);
  assert.ok(Number.isFinite(Date.parse(parsed.updatedAt ?? "")));
});

test("malformed or partial values fall back to undecided instead of guessing", () => {
  assert.deepEqual(parseConsent("{"), undecidedConsent);
  assert.deepEqual(parseConsent("null"), undecidedConsent);
  assert.deepEqual(parseConsent('"granted"'), undecidedConsent);
  assert.deepEqual(parseConsent(JSON.stringify({ analytics: true })), undecidedConsent);
  assert.deepEqual(
    parseConsent(JSON.stringify({ analytics: "yes", marketing: false })),
    undecidedConsent,
  );
});

test("the default decision denies every optional category", () => {
  const decision = defaultDecision();
  assert.deepEqual(decision, { analytics: false, marketing: false });
  for (const category of consentCategories) {
    assert.equal(decision[category], false, `${category} must default to denied`);
  }
});

test("withDecision records the decision and a timestamp", () => {
  const state = withDecision({ analytics: true, marketing: true }, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(state, {
    decided: true,
    analytics: true,
    marketing: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

test("the cookie encoding is compact and reversible", () => {
  assert.equal(encodeConsentCookie({ analytics: true, marketing: false }), "1:0");
  assert.equal(encodeConsentCookie({ analytics: false, marketing: true }), "0:1");
  assert.deepEqual(parseConsentCookie("1:0"), { analytics: true, marketing: false });
  assert.deepEqual(parseConsentCookie("0:0"), { analytics: false, marketing: false });
});

test("an invalid cookie is rejected rather than half-read", () => {
  assert.equal(parseConsentCookie(undefined), null);
  assert.equal(parseConsentCookie(""), null);
  assert.equal(parseConsentCookie("1"), null);
  assert.equal(parseConsentCookie("1:0:1"), null);
  assert.equal(parseConsentCookie("true:false"), null);
  assert.equal(parseConsentCookie("2:0"), null);
});

test("the storage and cookie names are stable, non-secret identifiers", () => {
  assert.equal(consentStorageKey, "isbulkkktc-cookie-consent-v3");
  assert.equal(consentCookieName, "ib_consent");
  // <= 13 months, the ceiling EU guidance places on a consent cookie's life.
  assert.ok(consentCookieMaxAgeSeconds <= 400 * 24 * 60 * 60);
  assert.ok(consentCookieMaxAgeSeconds > 0);
});

test("the withdrawn state cannot be mistaken for a fresh visitor", () => {
  // After withdrawal the stored value is removed; parsing nothing must produce
  // `decided: false` so the banner reappears rather than assuming denial.
  const withdrawn = parseConsent(null);
  assert.equal(withdrawn.decided, false);
  assert.notEqual(withdrawn.decided, true);
});

test("a decision older than the retention window is re-asked", () => {
  const now = Date.parse("2026-06-01T00:00:00.000Z");
  const fresh = JSON.stringify({
    version: consentVersion,
    analytics: true,
    marketing: true,
    updatedAt: new Date(now - 1000).toISOString(),
  });
  const stale = JSON.stringify({
    version: consentVersion,
    analytics: true,
    marketing: true,
    updatedAt: new Date(now - consentMaxAgeMs - 1000).toISOString(),
  });

  assert.equal(parseConsent(fresh, now).decided, true);
  assert.deepEqual(parseConsent(stale, now), undecidedConsent);
});

test("an undated legacy decision is not expired by the age check", () => {
  // v1/v2 records carry no timestamp; treating "no date" as "expired" would
  // silently drop a returning visitor's choice during an upgrade.
  assert.equal(parseConsent("granted").decided, true);
  assert.equal(parseConsent(JSON.stringify({ analytics: true, marketing: false })).decided, true);
});

test("isConsentCategory only accepts the known categories", () => {
  for (const category of consentCategories) {
    assert.equal(isConsentCategory(category), true);
  }
  assert.equal(isConsentCategory("advertising"), false);
  assert.equal(isConsentCategory(""), false);
});

test("a decision recovered from the cookie is decided and undated", () => {
  // The cookie is the fallback when localStorage was cleared or is unavailable;
  // it carries no timestamp, so it must not be treated as expired.
  assert.deepEqual(consentStateFromCookie("1:0"), {
    decided: true,
    analytics: true,
    marketing: false,
    updatedAt: null,
  });
  assert.deepEqual(consentStateFromCookie("0:1"), {
    decided: true,
    analytics: false,
    marketing: true,
    updatedAt: null,
  });
});

test("a missing or malformed cookie yields no state rather than a decision", () => {
  assert.equal(consentStateFromCookie(undefined), null);
  assert.equal(consentStateFromCookie(null), null);
  assert.equal(consentStateFromCookie(""), null);
  assert.equal(consentStateFromCookie("1"), null);
  assert.equal(consentStateFromCookie("true:false"), null);
  // An all-denied cookie is still an explicit decision, not "undecided".
  assert.equal(consentStateFromCookie("0:0")?.decided, true);
});
