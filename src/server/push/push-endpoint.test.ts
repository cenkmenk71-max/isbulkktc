import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedPushEndpoint } from "./push-endpoint";

/**
 * The push `endpoint` is attacker-controlled and is later connected to from
 * inside the deployment, so only real push-service hosts may pass (#262).
 */

test("accepts endpoints from the real push services", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc123",
    // Chromium's staging FCM host — real devices on non-stable channels (#500).
    "https://jmt17.google.com/fcm/send/dOBGGJ9ZWp4",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/xyz",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://par02p.notify.windows.com/w/?token=abc",
    "https://eu.web.push.apple.com/xyz",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), true, `${endpoint} should be allowed`);
  }
});

test("rejects loopback, private and link-local addresses (the SSRF)", () => {
  for (const endpoint of [
    "https://127.0.0.1/internal-only",
    "https://127.0.0.1:8443/x",
    "https://10.0.0.5/x",
    "https://172.16.0.1/x",
    "https://192.168.1.1/x",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/x",
    "https://[fd00::1]/x",
    "https://2130706433/x",
    "https://localhost/x",
    "https://service.local/x",
    "https://db.internal/x",
    "https://metadata.google.internal/x",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, `${endpoint} should be blocked`);
  }
});

test("rejects non-push hosts, non-https and malformed values", () => {
  for (const endpoint of [
    "https://evil.example/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://notfcm.googleapis.com/x",
    // Look-alikes of the staging host must not slip through the exact match.
    "https://jmt17.google.com.evil.example/x",
    "https://notjmt17.google.com/x",
    "http://fcm.googleapis.com/fcm/send/x",
    "ftp://fcm.googleapis.com/x",
    "https://user:pass@fcm.googleapis.com/x",
    "not a url",
    "",
    "//fcm.googleapis.com/x",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, `${JSON.stringify(endpoint)} should be blocked`);
  }
});

test("rejects non-string input without throwing", () => {
  for (const value of [null, undefined, 42, {}, []]) {
    assert.equal(isAllowedPushEndpoint(value), false);
  }
});
