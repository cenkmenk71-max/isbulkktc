import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { isAllowedPushEndpoint } from "@/server/push/push-endpoint";

/**
 * The web-push endpoint is an attacker-supplied URL the server fetches.
 *
 * A signed-in visitor can register a push subscription, and the cron worker then
 * POSTs to that exact URL with `web-push` (`/api/push/dispatch` -> `sendPushMessage`
 * in `src/server/push/vapid.ts`). If the host is unchecked that is a blind SSRF:
 * `https://127.0.0.1:PORT/...` or `https://169.254.169.254/...` (cloud metadata)
 * makes the worker connect to an internal address from inside the deployment.
 *
 * That was a real finding (#262): the only check was
 * `url().min(12).max(1024).startsWith("https://")`, and a local listener recorded
 * the worker's TLS ClientHello. It is now fixed — `isAllowedPushEndpoint`
 * (`src/server/push/push-endpoint.ts`) accepts only `https://` endpoints on a
 * known push-service host and rejects IP literals, decimal-encoded addresses,
 * `localhost` and `.local`/`.internal` names. This test is the **gate** that keeps
 * it that way: it drives the real allowlist function and pins that every writer
 * and the send sink call it.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

function allSql(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");
}

/**
 * Every source file that writes a push endpoint, discovered by looking for the
 * `register_push_subscription` call rather than naming files by hand. There are
 * two today — the API route the service worker posts to, and the server action
 * the install page calls — and a third would silently escape a hard-coded list.
 */
function pushWritePaths(): string[] {
  const roots = ["src/app/api/push", "src/features/pwa", "src/features"];
  const found = new Set<string>();
  for (const root of roots) {
    const dir = new URL(`../../${root}/`, import.meta.url);
    let entries: string[];
    try {
      entries = readdirSync(dir, { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const source = readFileSync(new URL(entry, dir), "utf8");
      if (/register_push_subscription/.test(source)) {
        found.add(`${root}/${entry}`);
      }
    }
  }
  return [...found].sort();
}

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
}

test("every push-endpoint write path is discovered (self-test)", () => {
  // Guards the guard: if a new writer appears, the checks below must still scan
  // it. This asserts at least the two known writers are found.
  const paths = pushWritePaths();
  assert.ok(
    paths.length >= 2,
    `expected at least the route and the server action, found: ${paths.join(", ") || "(none)"}`,
  );
  assert.ok(
    paths.some((p) => p.includes("app/api/push/subscriptions")),
    `the API route was not discovered: ${paths.join(", ")}`,
  );
  assert.ok(
    paths.some((p) => p.includes("features/pwa/actions")),
    `the pwa server action was not discovered: ${paths.join(", ")}`,
  );
});

test("the allowlist accepts real push-service endpoints", () => {
  for (const endpoint of [
    "https://fcm.googleapis.com/fcm/send/abc123",
    // Chromium's staging FCM host, issued to non-stable channels (#500).
    "https://jmt17.google.com/fcm/send/dOBGGJ9ZWp4",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/xyz",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://eu.web.push.apple.com/xyz",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), true, `${endpoint} should be allowed`);
  }
});

test("the allowlist rejects internal, loopback and metadata addresses (the SSRF)", () => {
  for (const endpoint of [
    // Loopback and link-local / cloud metadata — the core SSRF payloads.
    "https://127.0.0.1/internal-only",
    "https://127.0.0.1:8443/internal-only",
    "https://169.254.169.254/latest/meta-data/",
    "https://[::1]/internal",
    // RFC1918.
    "https://10.0.0.5/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    // Decimal-encoded IPv4 (2130706433 == 127.0.0.1).
    "https://2130706433/",
    // Local names.
    "https://localhost/",
    "https://api.internal/",
    "https://box.local/",
    // A non-push public host.
    "https://evil.example/collect",
    // A host that merely ends with an allowed suffix but is not on it.
    "https://fcm.googleapis.com.evil.example/x",
    "https://notfcm.googleapis.com/x",
    // Look-alikes of the staging host: the exact match must not leak (#500).
    "https://jmt17.google.com.evil.example/x",
    "https://notjmt17.google.com/x",
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, `${endpoint} must be rejected`);
  }
});

test("the allowlist rejects non-https, credentials and non-strings", () => {
  for (const endpoint of [
    "http://fcm.googleapis.com/fcm/send/x",
    "ftp://fcm.googleapis.com/x",
    "https://user:pass@fcm.googleapis.com/x",
    "",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isAllowedPushEndpoint(endpoint), false, `${JSON.stringify(endpoint)} must be rejected`);
  }
});

test("every push write path enforces the host allowlist", () => {
  for (const relative of pushWritePaths()) {
    const source = read(relative);
    // The import alone is not enforcement: the schema must *call* it on the
    // endpoint. Assert the refine wiring, not a bare identifier match.
    assert.match(
      source,
      /refine\(\s*isAllowedPushEndpoint\b/,
      `${relative} stores an endpoint without the host allowlist, so an attacker ` +
        `can register an internal address (SSRF)`,
    );
  }
});

test("the send sink also checks the allowlist (defence in depth)", () => {
  // A row written before the guard existed (or via the RPC directly) must not
  // turn the worker into an SSRF probe.
  const vapid = read("src/server/push/vapid.ts");
  const check = vapid.indexOf("isAllowedPushEndpoint(target.endpoint)");
  const send = vapid.indexOf("webpush.sendNotification(subscription");
  assert.ok(check > -1, "the send sink no longer checks the endpoint host");
  assert.ok(send > -1, "the web-push send call was not found");
  assert.ok(
    check < send,
    "the send sink fetches the endpoint before it checks the host allowlist",
  );
});

test("the registration route requires a session before it parses the body", () => {
  // The route binds the row to `auth.uid()` through the RPC, but it must first
  // refuse an anonymous caller — otherwise anyone could register push
  // credentials. Dropping the gate is silent: the RPC would still run, and no
  // other test exercises this route's session check.
  const route = read("src/app/api/push/subscriptions/route.ts");
  const getUser = route.indexOf("supabase.auth.getUser()");
  const unauthorized = route.indexOf("Unauthorized");
  const parseBody = route.indexOf("request.json()");
  assert.ok(getUser > -1, "the route no longer resolves the session user");
  assert.ok(unauthorized > -1, "the route no longer returns 401 for a missing session");
  assert.ok(parseBody > -1, "the route no longer parses the request body");
  assert.ok(
    getUser < unauthorized && getUser < parseBody,
    "the route parses the body before it checks the session",
  );
});

test("the allowlist module names the real push services", () => {
  const source = read("src/server/push/push-endpoint.ts");
  for (const host of [
    "fcm.googleapis.com",
    "jmt17.google.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
    "notify.windows.com",
  ]) {
    assert.ok(source.includes(host), `the allowlist no longer names ${host}`);
  }
});

test("the RPC keeps the endpoint validation it can (the DB half)", () => {
  // The DB cannot know the push-service hostnames as cleanly as the app, but it
  // must still keep the https + length contract the app relies on.
  const sql = allSql();
  assert.match(sql, /v_endpoint !~ '\^https:\/\//, "register_push_subscription dropped its https check");
  assert.match(
    sql,
    /char_length\(v_endpoint\)\s*<\s*12/,
    "register_push_subscription dropped its minimum-length check",
  );
});
