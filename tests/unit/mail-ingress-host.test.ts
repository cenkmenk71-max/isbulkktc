import assert from "node:assert/strict";
import test from "node:test";

import {
  isAllowedMailIngressRequest,
  isMailIngressHost,
  MAIL_INGRESS_HOST,
} from "@/server/email/mail-ingress-host";

test("the mail ingress hostname is an exact, case-insensitive host match", () => {
  assert.equal(MAIL_INGRESS_HOST, "hooks.isbulkktc.com");
  assert.equal(isMailIngressHost("hooks.isbulkktc.com"), true);
  assert.equal(isMailIngressHost("HOOKS.ISBULKKTC.COM"), true);
  assert.equal(isMailIngressHost("hooks.isbulkktc.com."), true);
  assert.equal(isMailIngressHost("hooks.isbulkktc.com.evil.example"), false);
  assert.equal(isMailIngressHost("isbulkktc.com"), false);
  assert.equal(isMailIngressHost("isbulkktc-prod.vercel.app"), false);
});

test("only the three authenticated mail ingress POST routes are allowed", () => {
  const allowed = [
    "/api/email/resend-webhook",
    "/api/email/acquisition-campaign",
    "/api/email/engagement-digest",
  ];

  for (const pathname of allowed) {
    assert.equal(isAllowedMailIngressRequest("POST", pathname), true, pathname);
    assert.equal(isAllowedMailIngressRequest("GET", pathname), false, pathname);
    assert.equal(isAllowedMailIngressRequest("PUT", pathname), false, pathname);
  }
});

test("the mail ingress rejects every other route and path variant", () => {
  for (const pathname of [
    "/",
    "/login",
    "/api/auth/callback",
    "/api/push/dispatch",
    "/api/email/resend-webhook/",
    "/api/email/resend-webhook/extra",
    "/api%2Femail/resend-webhook",
    "/_next/static/chunk.js",
    "/robots.txt",
  ]) {
    assert.equal(isAllowedMailIngressRequest("POST", pathname), false, pathname);
  }
});
