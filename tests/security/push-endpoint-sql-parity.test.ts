import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { isAllowedPushEndpoint } from "@/server/push/push-endpoint";

/**
 * The push endpoint is validated twice: once in the app
 * (`isAllowedPushEndpoint`, a real `new URL` host parse) and once in the
 * database (`register_push_subscription`, a `split_part` of the raw string).
 *
 * The two must agree on which endpoints are push-service endpoints. They do
 * not. The SQL rule extracts the host with
 * `split_part(split_part(endpoint, '/', 3), ':', 1)` — a string split that
 * treats a backslash or a percent-encoded slash as an ordinary host character,
 * while the URL parser the app uses treats them as path separators or rejects
 * the URL. So a value the app refuses is a value the RPC accepts:
 *
 *   `https://evil.com\.push.apple.com/x`
 *      URL host = `evil.com`            -> app REJECTS
 *      raw segment = `evil.com\.push.apple.com` (endsWith `.push.apple.com`)
 *                                       -> RPC ACCEPTS
 *
 *   `https://evil.com@x.push.apple.com/x`
 *      URL host = `x.push.apple.com`, userinfo present
 *                                       -> app REJECTS (credentials)
 *      raw segment = `evil.com@x.push.apple.com` (endsWith `.push.apple.com`)
 *                                       -> RPC ACCEPTS (userinfo is just text)
 *
 * The RPC is directly callable with the publishable key, so an attacker can
 * store such a row without going through the app. It is not an SSRF today —
 * the send sink re-checks `isAllowedPushEndpoint` before `webpush.sendNotification`
 * (`src/server/push/vapid.ts`) — but the database guard does not enforce the
 * rule it claims to enforce, so the two layers can drift apart silently. The
 * gate below is the parity ratchet; the `todo` test is the finding, and it
 * passes on its own once the SQL matches the URL parse.
 *
 * The finding is owned by LANE-SUPABASE (the migration) and handed off there.
 * This file only proves it — see `tests/security/README.md`.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

/**
 * The body of the *effective* `register_push_subscription` — the last
 * definition across all migrations, so a fix shipped as a new migration is
 * picked up here rather than the stale original.
 */
function effectivePushRpcSql(): string {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const marker = "function public.register_push_subscription(";
  let body = "";
  for (const name of files) {
    const source = readFileSync(new URL(name, migrationsDir), "utf8");
    let from = 0;
    for (;;) {
      const start = source.indexOf(marker, from);
      if (start === -1) break;
      const asIndex = source.indexOf("as $$", start);
      const end = asIndex === -1 ? -1 : source.indexOf("$$;", asIndex + 5);
      if (asIndex > -1 && end > -1) body = source.slice(asIndex, end);
      from = start + marker.length;
    }
  }
  return body;
}

interface SqlHostRule {
  /** The exact-host `not in (...)` list, lower-cased. */
  exact: Set<string>;
  /** The `not like '%.suffix'` list, without the leading `%`, lower-cased. */
  suffixes: string[];
}

/**
 * The allowlist the RPC body actually encodes. Throws (via `assert`) when the
 * shape it is written against is gone, so the parity gate cannot pass against a
 * body that no longer contains the check.
 */
function sqlHostRule(sql: string): SqlHostRule {
  assert.ok(
    /split_part\(\s*\w+\s*,\s*'\/'\s*,\s*3\s*\)/.test(sql),
    "register_push_subscription no longer splits the endpoint on '/' to take the host",
  );
  const notIn = /v_host\s+not\s+in\s*\(([^)]*)\)/i.exec(sql);
  assert.ok(
    notIn,
    "register_push_subscription no longer carries a `not in (...)` exact-host list",
  );
  const exact = new Set(
    [...notIn[1].matchAll(/'([^']+)'/g)].map((match) => match[1].toLowerCase()),
  );
  const suffixes = [...sql.matchAll(/v_host\s+not\s+like\s+'%([^']+)'/gi)].map(
    (match) => match[1].toLowerCase(),
  );
  return { exact, suffixes };
}

/**
 * A faithful mirror of the SQL rule:
 * `lower(split_part(split_part(btrim(endpoint), '/', 3), ':', 1))`, then the
 * exact list, then the suffix list. Deliberately *not* a URL parse — the point
 * is to reproduce what the database does, not what it should do.
 */
function sqlAllowsEndpoint(sql: string, endpoint: string): boolean {
  const { exact, suffixes } = sqlHostRule(sql);
  const segment = endpoint.trim().split("/")[2] ?? "";
  const host = segment.split(":")[0].toLowerCase();
  if (exact.has(host)) return true;
  return suffixes.some((suffix) => host.endsWith(suffix));
}

/** Real push-service endpoints both layers must accept. */
const acceptedEndpoints = [
  "https://fcm.googleapis.com/fcm/send/abc123",
  "https://android.googleapis.com/gcm/send/abc",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
  "https://web.push.apple.com/xyz",
  "https://wns2-par02p.notify.windows.com/w/?token=abc",
  "https://eu.web.push.apple.com/xyz",
];

/** Endpoints both layers must reject — the SSRF and non-push hosts. */
const rejectedEndpoints = [
  "https://127.0.0.1/internal-only",
  "https://169.254.169.254/latest/meta-data/",
  "https://[::1]/internal",
  "https://10.0.0.5/",
  "https://2130706433/",
  "https://localhost/",
  "https://evil.example/collect",
  "https://fcm.googleapis.com.evil.example/x",
  "https://notfcm.googleapis.com/x",
];

/**
 * The finding, direction 1: the real host (`new URL().hostname`) is **not** a
 * push service, yet the raw host segment ends with an allowed suffix, so the
 * SQL string split accepts the endpoint while the URL parse rejects it.
 */
const acceptedBySqlRejectedByApp = [
  "https://evil.com\\.push.apple.com/x",
  "https://evil.com\\.notify.windows.com/x",
  "https://evil.com\\.push.services.mozilla.com/x",
  "https://evil.com%2f.push.apple.com/x",
  "https://evil.com%5c.push.apple.com/x",
];

/**
 * The finding, a second shape of direction 1: the raw authority ends with an
 * allowed suffix, so the RPC accepts it, but the endpoint carries URL
 * credentials (`user:pass@host`). The real host *is* a push service, yet the app
 * rejects the endpoint outright — a push service never issues an endpoint with
 * credentials, and `isAllowedPushEndpoint` refuses one that has them. `split_part`
 * has no notion of userinfo, so it sees only the trailing suffix.
 */
const acceptedBySqlRejectedByAppForCredentials = [
  "https://evil.com@x.push.apple.com/x",
  "https://evil.com@eu.web.push.apple.com/x",
  "https://evil.com@wns2-par02p.notify.windows.com/x",
];

/**
 * The finding, direction 2: the real host **is** a push service (the app
 * accepts it), but the raw segment is not, so the SQL string split rejects it.
 * A raw-string rule cannot express either direction.
 */
const acceptedByAppRejectedBySql = ["https://fcm.googleapis.com\\evil.com/x"];

const divergentEndpoints = [
  ...acceptedBySqlRejectedByApp,
  ...acceptedBySqlRejectedByAppForCredentials,
  ...acceptedByAppRejectedBySql,
];

test("the RPC extractor returns the function body, not the whole migration (self-test)", () => {
  const sql = effectivePushRpcSql();
  assert.ok(sql.includes("register_push_subscription") || sql.includes("v_host"), "the RPC body was not extracted");
  assert.ok(sql.includes("security definer") || sql.includes("v_actor"), "the extracted text is not the function body");
  // The body must be the function, not the surrounding DDL.
  assert.ok(!sql.includes("revoke all on function"), "the extractor swallowed the grant/revoke tail");
});

test("the SQL allowlist extractor reads the real rule (self-test)", () => {
  const { exact, suffixes } = sqlHostRule(effectivePushRpcSql());
  for (const host of [
    "fcm.googleapis.com",
    "android.googleapis.com",
    "updates.push.services.mozilla.com",
    "web.push.apple.com",
  ]) {
    assert.ok(exact.has(host), `the SQL exact-host list no longer names ${host}`);
  }
  for (const suffix of [
    ".notify.windows.com",
    ".push.apple.com",
    ".push.services.mozilla.com",
  ]) {
    assert.ok(suffixes.includes(suffix), `the SQL suffix list no longer names ${suffix}`);
  }
});

test("the SQL mirror reproduces the raw-string split, not a URL parse (self-test)", () => {
  const sql = effectivePushRpcSql();
  // The mirror must agree with the raw split for the shapes the RPC sees.
  assert.equal(sqlAllowsEndpoint(sql, "https://fcm.googleapis.com/x"), true);
  assert.equal(sqlAllowsEndpoint(sql, "https://evil.example/x"), false);
  assert.equal(sqlAllowsEndpoint(sql, "https://wns2-par02p.notify.windows.com/x"), true);
  // A backslash is an ordinary host character to `split_part`, so the raw
  // segment ends with an allowed suffix even though the real host does not.
  assert.equal(sqlAllowsEndpoint(sql, "https://evil.com\\.push.apple.com/x"), true);
  assert.equal(new URL("https://evil.com\\.push.apple.com/x").hostname, "evil.com");
  assert.equal(isAllowedPushEndpoint("https://evil.com\\.push.apple.com/x"), false);
  // A URL credential is text to `split_part`, so the raw authority still ends
  // with an allowed suffix; the app rejects the endpoint for carrying it.
  assert.equal(sqlAllowsEndpoint(sql, "https://evil.com@x.push.apple.com/x"), true);
  assert.equal(new URL("https://evil.com@x.push.apple.com/x").hostname, "x.push.apple.com");
  assert.equal(isAllowedPushEndpoint("https://evil.com@x.push.apple.com/x"), false);
});

test("the app gate rejects every endpoint whose real host is not a push service", () => {
  // The invariant that must hold no matter which layer is asked: a real host
  // that is not a push service is rejected. Guards against "fixing" the
  // divergence by widening the app allowlist instead of tightening the SQL.
  for (const endpoint of acceptedBySqlRejectedByApp) {
    let host: string | null = null;
    try {
      host = new URL(endpoint).hostname;
    } catch {
      host = null; // the URL parser rejects the encoded-separator forms outright
    }
    assert.notEqual(host, "fcm.googleapis.com", `${endpoint} was expected to have a non-push host`);
    assert.equal(
      isAllowedPushEndpoint(endpoint),
      false,
      `${endpoint} (real host ${host ?? "unparseable"}) must be rejected by the app gate`,
    );
  }
  // Direction 2: the app gate accepts the real push-service host even when the
  // raw string is malformed around it — the app is right, the SQL is wrong.
  for (const endpoint of acceptedByAppRejectedBySql) {
    assert.equal(
      isAllowedPushEndpoint(endpoint),
      true,
      `${endpoint} must be accepted by the app gate (its real host is a push service)`,
    );
  }
});

test("the app gate and the SQL rule agree on the agreed corpus (parity gate)", () => {
  const sql = effectivePushRpcSql();
  for (const endpoint of acceptedEndpoints) {
    assert.equal(
      sqlAllowsEndpoint(sql, endpoint),
      isAllowedPushEndpoint(endpoint),
      `the SQL rule and the app gate disagree on the accepted endpoint ${endpoint}`,
    );
    assert.equal(isAllowedPushEndpoint(endpoint), true, `${endpoint} must be accepted`);
  }
  for (const endpoint of rejectedEndpoints) {
    assert.equal(
      sqlAllowsEndpoint(sql, endpoint),
      isAllowedPushEndpoint(endpoint),
      `the SQL rule and the app gate disagree on the rejected endpoint ${endpoint}`,
    );
    assert.equal(isAllowedPushEndpoint(endpoint), false, `${endpoint} must be rejected`);
  }
  // Non-vacuity: the corpus must contain at least one endpoint each way.
  assert.ok(acceptedEndpoints.length > 0 && rejectedEndpoints.length > 0);
});

test(
  "the SQL host rule agrees with the app gate on hostile endpoints (raw string vs URL parse)",
  {
    todo:
      "register_push_subscription extracts the host with split_part on the raw " +
      "string, so `https://evil.com\\.push.apple.com/x` (real host evil.com), " +
      "percent-encoded variants and `https://evil.com@x.push.apple.com/x` (URL " +
      "credentials) are accepted by the RPC while isAllowedPushEndpoint rejects " +
      "them (owner: LANE-SUPABASE, supabase/migrations/20261110000000_v4_push_endpoint_host_allowlist.sql)",
  },
  () => {
    const sql = effectivePushRpcSql();
    for (const endpoint of divergentEndpoints) {
      assert.equal(
        sqlAllowsEndpoint(sql, endpoint),
        isAllowedPushEndpoint(endpoint),
        `the SQL rule and the app gate disagree on ${endpoint}`,
      );
    }
  },
);
