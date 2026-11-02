import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultInstallDestination,
  sanitizeNextPath,
} from "../../src/lib/pwa/destination";
import {
  isSupportedQrVersion,
  parseInstallCampaign,
  sanitizeCampaignValue,
} from "../../src/lib/pwa/campaign";

/**
 * The `next` parameter is attacker-influenced: the install URL is printed on a
 * poster, so anyone can craft a QR code that points at `/install?next=...`. A
 * miss here is an open redirect — the exact primitive a phishing campaign wants
 * — so every case below is a real bypass technique rather than a synthetic one.
 */

test("a plain same-origin path is preserved", () => {
  assert.equal(sanitizeNextPath("/jobs"), "/jobs");
  assert.equal(sanitizeNextPath("/jobs/backend-engineer"), "/jobs/backend-engineer");
});

test("query and hash are preserved, since a search result is a destination too", () => {
  assert.equal(
    sanitizeNextPath("/jobs?district=nicosia&type=full_time"),
    "/jobs?district=nicosia&type=full_time",
  );
  assert.equal(sanitizeNextPath("/profile/dashboard#applications"), "/profile/dashboard#applications");
});

test("absolute and protocol-relative URLs are rejected", () => {
  assert.equal(sanitizeNextPath("https://evil.example/steal"), null);
  assert.equal(sanitizeNextPath("http://evil.example"), null);
  assert.equal(sanitizeNextPath("//evil.example"), null);
  assert.equal(sanitizeNextPath("///evil.example"), null);
});

test("a backslash is rejected because the URL parser treats it as a slash", () => {
  // `/\evil.example` and `\/evil.example` both resolve to a different host even
  // though they start with a single slash.
  assert.equal(sanitizeNextPath("/\\evil.example"), null);
  assert.equal(sanitizeNextPath("/jobs\\@evil.example"), null);
});

test("non-HTTP schemes are rejected", () => {
  assert.equal(sanitizeNextPath("javascript:alert(1)"), null);
  assert.equal(sanitizeNextPath("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(sanitizeNextPath("/javascript:alert(1)"), null);
});

test("control characters are rejected", () => {
  assert.equal(sanitizeNextPath("/jobs\u0000/../../etc"), null);
  assert.equal(sanitizeNextPath("/jobs\u000aSet-Cookie: x"), null);
});

test("the install route itself is rejected so the journey cannot loop", () => {
  assert.equal(sanitizeNextPath("/install"), null);
  assert.equal(sanitizeNextPath("/en/install"), null);
  assert.equal(sanitizeNextPath("/install?next=/jobs"), null);
});

test("non-page handlers are rejected", () => {
  assert.equal(sanitizeNextPath("/api/qr"), null);
  assert.equal(sanitizeNextPath("/auth/callback"), null);
});

test("empty, missing and over-long values fall back to the default destination", () => {
  assert.equal(sanitizeNextPath(null), null);
  assert.equal(sanitizeNextPath(undefined), null);
  assert.equal(sanitizeNextPath(""), null);
  assert.equal(sanitizeNextPath("   "), null);
  assert.equal(sanitizeNextPath("/" + "a".repeat(3000)), null);
});

test("the default destination is a real in-scope public route", () => {
  assert.equal(defaultInstallDestination, "/jobs");
  assert.equal(sanitizeNextPath(defaultInstallDestination), "/jobs");
});

/**
 * Campaign fields reach both analytics and the page's own copy. Only opaque
 * tokens are accepted, so a rejected value can never become markup or a second
 * query parameter.
 */

test("campaign values accept opaque tokens and reject free-form text", () => {
  assert.equal(sanitizeCampaignValue("spring_2026", "name"), "spring_2026");
  assert.equal(sanitizeCampaignValue("qr-code.A1", "name"), "qr-code.A1");
  assert.equal(sanitizeCampaignValue("spring 2026", "name"), null);
  assert.equal(sanitizeCampaignValue("a&utm_source=evil", "name"), null);
  assert.equal(sanitizeCampaignValue("<script>", "name"), null);
  assert.equal(sanitizeCampaignValue("100%off", "name"), null);
  assert.equal(sanitizeCampaignValue("x".repeat(200), "name"), null);
  assert.equal(sanitizeCampaignValue("", "name"), null);
  assert.equal(sanitizeCampaignValue(null, "name"), null);
});

test("campaign parsing keeps only recognised fields", () => {
  const params = new URLSearchParams(
    "utm_source=poster&utm_medium=qr&utm_campaign=spring_2026&utm_id=42&gclid=ignored",
  );
  assert.deepEqual(parseInstallCampaign(params), {
    source: "poster",
    medium: "qr",
    name: "spring_2026",
    id: "42",
  });
});

test("campaign parsing returns null when nothing valid is present", () => {
  assert.equal(parseInstallCampaign(new URLSearchParams("")), null);
  assert.equal(
    parseInstallCampaign(new URLSearchParams("utm_source=has space")),
    null,
  );
});

test("only real QR versions are accepted", () => {
  assert.equal(isSupportedQrVersion(1), true);
  assert.equal(isSupportedQrVersion(40), true);
  assert.equal(isSupportedQrVersion(0), false);
  assert.equal(isSupportedQrVersion(41), false);
  assert.equal(isSupportedQrVersion(2.5), false);
  assert.equal(isSupportedQrVersion(Number.NaN), false);
});
