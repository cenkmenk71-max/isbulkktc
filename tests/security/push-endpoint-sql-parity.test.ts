import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { isAllowedPushEndpoint } from "@/server/push/push-endpoint";

/**
 * The push endpoint is validated twice: once in the app
 * (`isAllowedPushEndpoint`, a real `new URL` host parse) and once in the
 * database — in the `register_push_subscription` RPC and, since #282, on the
 * table itself (`public.is_allowed_push_endpoint`, the CHECK validator).
 *
 * The two must agree on which endpoints are push-service endpoints. They did
 * not: the SQL rule took the host with `split_part` of the *raw* string, where a
 * backslash, an `@`, a percent-encoded separator or a stray port is an ordinary
 * host character, while the URL parser the app uses treats them as separators or
 * rejects the URL. So a value the app refused was a value the RPC accepted:
 *
 *   `https://evil.com\.push.apple.com/x`
 *      URL host = `evil.com`            -> app REJECTS
 *      raw segment = `evil.com\.push.apple.com` (endsWith `.push.apple.com`)
 *                                       -> RPC ACCEPTED
 *
 *   `https://evil.com@x.push.apple.com/x`
 *      URL host = `x.push.apple.com`, userinfo present
 *                                       -> app REJECTS (credentials)
 *      raw segment = `evil.com@x.push.apple.com` (endsWith `.push.apple.com`)
 *                                       -> RPC ACCEPTED (userinfo is just text)
 *
 * #536 (`20261110130000_v4_push_endpoint_authority_guard.sql`) aligned the RPC
 * with the URL parser: the authority ends at the first `/`, `\`, `?` or `#`,
 * must be a bare hostname with an optional all-digit port (`<= 65535`), and only
 * then is the allowlist consulted. #282 (`20261110140000_v4_push_endpoint_table_check.sql`)
 * lifted the same rule onto the table as a CHECK, so it holds for every writer,
 * not just the RPC. The RPC is still directly callable with the publishable key,
 * which is why the two layers must agree — the parity gate below is the ratchet.
 *
 * The finding was owned by the database layer (the migrations) and handed off there;
 * this file proves it and now pins it. See `tests/security/README.md`.
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

/**
 * The body of the *effective* `public.is_allowed_push_endpoint` — the CHECK
 * validator on `public.push_subscriptions` (#282). Same extraction rule as the
 * RPC: the last definition across all migrations wins.
 */
function effectivePushHelperSql(): string {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const marker = "function public.is_allowed_push_endpoint(";
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

/**
 * The URL-parser-like authority rule the SQL encodes (#536): the authority ends
 * at the first `/`, `\`, `?` or `#`, must be a bare hostname and an optional
 * all-digit port. Asserts the shape is present so a body that lost the rule
 * cannot pass the parity gate vacuously.
 */
function assertAuthorityRuleShape(sql: string, label: string): void {
  // The first argument to `split_part` is the endpoint itself in the RPC but a
  // nested `split_part(...)` call in the helper, so match anything up to the
  // delimiter literal (a `;` cannot appear inside the expression).
  const cutsOn = (delimiter: string, part: string): boolean =>
    new RegExp(`split_part\\([^;]*?${delimiter}\\s*,\\s*${part}\\s*\\)`).test(sql);
  assert.ok(
    cutsOn("'/'", "3"),
    `${label}: no longer splits the endpoint on '/' to take the authority`,
  );
  assert.ok(
    sql.includes("E'\\\\'"),
    `${label}: no longer cuts the authority on a backslash (E'\\\\')`,
  );
  assert.ok(
    cutsOn("'\\?'", "1"),
    `${label}: no longer cuts the authority on '?'`,
  );
  assert.ok(
    cutsOn("'#'", "1"),
    `${label}: no longer cuts the authority on '#'`,
  );
  assert.ok(
    sql.includes("'^[A-Za-z0-9.-]+(:[0-9]+)?$'"),
    `${label}: no longer requires a bare hostname and optional all-digit port`,
  );
  assert.ok(
    /numeric\s*(?:<=|>)\s*65535/.test(sql),
    `${label}: no longer bounds the port at 65535`,
  );
}

interface SqlHostRule {
  /** The exact-host `in (...)` list, lower-cased. */
  exact: Set<string>;
  /** The `like '%.suffix'` list, without the leading `%`, lower-cased. */
  suffixes: string[];
}

/**
 * The allowlist the SQL body actually encodes — the `in (...)` list and the
 * `like '%.suffix'` list, whatever the left-hand expression is (`v_host` in the
 * RPC, `pg_catalog.lower(split_part(...))` in the helper). Throws (via `assert`)
 * when the shape it is written against is gone, so the parity gate cannot pass
 * against a body that no longer contains the check.
 */
function sqlHostRule(sql: string, label = "the SQL body"): SqlHostRule {
  assertAuthorityRuleShape(sql, label);
  const list = /in\s*\(([^)]*fcm\.googleapis\.com[^)]*)\)/.exec(sql);
  assert.ok(list, `${label}: no longer carries an \`in (...)\` exact-host list`);
  const exact = new Set(
    [...list[1].matchAll(/'([^']+)'/g)].map((match) => match[1].toLowerCase()),
  );
  const suffixes = [...sql.matchAll(/like\s+'%([^']+)'/gi)].map((match) =>
    match[1].toLowerCase(),
  );
  return { exact, suffixes };
}

/**
 * The authority, cut the way the SQL cuts it: `split_part` on `/` to take the
 * third field, then on `\`, `?` and `#`. This is the URL parser's authority
 * boundary, expressed as string splits.
 */
function sqlAuthority(endpoint: string): string {
  const trimmed = endpoint.trim();
  const third = trimmed.split("/")[2] ?? "";
  return third.split("\\")[0].split("?")[0].split("#")[0];
}

/**
 * A faithful mirror of the SQL predicate (#536): trim, require `https://` and a
 * length in `[12, 1024]`, cut the authority at the first `/`, `\`, `?` or `#`,
 * require a bare hostname and an optional all-digit port `<= 65535`, then the
 * exact list and the suffix list. Deliberately *not* a URL parse — the point is
 * to reproduce what the database does, so a drift from the URL parse shows up as
 * a parity failure rather than being papered over.
 */
function sqlRuleAllows(rule: SqlHostRule, endpoint: string): boolean {
  const trimmed = endpoint.trim();
  if (trimmed.length < 12 || trimmed.length > 1024) return false;
  if (!trimmed.startsWith("https://")) return false;
  const authority = sqlAuthority(trimmed);
  if (!/^[A-Za-z0-9.-]+(:[0-9]+)?$/.test(authority)) return false;
  const port = authority.split(":")[1] ?? "";
  if (port !== "" && Number(port) > 65535) return false;
  const host = authority.split(":")[0].toLowerCase();
  if (rule.exact.has(host)) return true;
  return rule.suffixes.some((suffix) => host.endsWith(suffix));
}

/** The RPC predicate. */
function sqlAllowsEndpoint(sql: string, endpoint: string): boolean {
  return sqlRuleAllows(sqlHostRule(sql, "register_push_subscription"), endpoint);
}

/** The table CHECK predicate (`is_allowed_push_endpoint`). */
function sqlHelperAllowsEndpoint(sql: string, endpoint: string): boolean {
  return sqlRuleAllows(sqlHostRule(sql, "is_allowed_push_endpoint"), endpoint);
}

/** Real push-service endpoints both layers must accept. */
const acceptedEndpoints = [
  "https://fcm.googleapis.com/fcm/send/abc123",
  "https://android.googleapis.com/gcm/send/abc",
  // Chromium's staging FCM host — real devices on non-stable channels (#500).
  "https://jmt17.google.com/fcm/send/dOBGGJ9ZWp4",
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
  // Look-alikes of the staging host: the exact match must not leak (#500).
  "https://jmt17.google.com.evil.example/x",
  "https://notjmt17.google.com/x",
];

/**
 * Hostile endpoints the old raw-string rule accepted while the URL parse
 * rejected: a backslash or a percent-encoded separator is an ordinary host
 * character to `split_part`, so the raw segment ended with an allowed suffix
 * even though the real host did not. The SQL now cuts the authority the way the
 * URL parser does, so both layers reject every one of them — that convergence is
 * the gate below.
 */
const rejectedByApp = [
  "https://evil.com\\.push.apple.com/x",
  "https://evil.com\\.notify.windows.com/x",
  "https://evil.com\\.push.services.mozilla.com/x",
  "https://evil.com%2f.push.apple.com/x",
  "https://evil.com%5c.push.apple.com/x",
];

/**
 * A second shape the old rule accepted: the raw authority ended with an allowed
 * suffix, so the RPC accepted it, but the endpoint carries URL credentials
 * (`user:pass@host`). The real host *is* a push service, yet the app rejects the
 * endpoint outright — a push service never issues an endpoint with credentials.
 * The new SQL rule refuses `@` in the authority, so both layers now reject these.
 */
const rejectedForCredentials = [
  "https://evil.com@x.push.apple.com/x",
  "https://evil.com@eu.web.push.apple.com/x",
  "https://evil.com@wns2-par02p.notify.windows.com/x",
];

/**
 * Direction 2 of the old divergence: the real host **is** a push service (the
 * app accepts it), but the raw segment was not, so the old SQL string split
 * rejected it. The new authority cut takes the host up to the first `\`, so the
 * SQL now accepts it too.
 */
const acceptedByBothAfterFix = ["https://fcm.googleapis.com\\evil.com/x"];

/** Endpoints the app rejects that the SQL must reject as well. */
const rejectedByBoth = [
  ...rejectedByApp,
  ...rejectedForCredentials,
  "https://fcm.googleapis.com:65536/x",
];

/** Every hostile endpoint the parity gate checks in both directions. */
const divergentEndpoints = [...rejectedByBoth, ...acceptedByBothAfterFix];

test("the RPC extractor returns the function body, not the whole migration (self-test)", () => {
  const sql = effectivePushRpcSql();
  assert.ok(sql.includes("register_push_subscription") || sql.includes("v_host"), "the RPC body was not extracted");
  assert.ok(sql.includes("security definer") || sql.includes("v_actor"), "the extracted text is not the function body");
  // The body must be the function, not the surrounding DDL.
  assert.ok(!sql.includes("revoke all on function"), "the extractor swallowed the grant/revoke tail");
});

test("the table-check helper extractor returns the validator body (self-test)", () => {
  const sql = effectivePushHelperSql();
  assert.ok(
    sql.includes("is_allowed_push_endpoint") || sql.includes("authority"),
    "the is_allowed_push_endpoint body was not extracted",
  );
  // The body must be the function, not the surrounding `revoke`/`alter table`.
  assert.ok(
    !sql.includes("revoke all on function") && !sql.includes("alter table"),
    "the extractor swallowed the surrounding DDL",
  );
  // Non-vacuity: the body must actually carry the host rule, not be empty.
  assert.ok(
    sql.includes("fcm.googleapis.com"),
    "the extracted helper body does not carry the host allowlist",
  );
});

test("the SQL allowlist extractor reads the real rule (self-test)", () => {
  for (const [label, sql] of [
    ["register_push_subscription", effectivePushRpcSql()],
    ["is_allowed_push_endpoint", effectivePushHelperSql()],
  ] as const) {
    const { exact, suffixes } = sqlHostRule(sql, label);
    for (const host of [
      "fcm.googleapis.com",
      "android.googleapis.com",
      "jmt17.google.com",
      "updates.push.services.mozilla.com",
      "web.push.apple.com",
    ]) {
      assert.ok(exact.has(host), `${label}: the exact-host list no longer names ${host}`);
    }
    for (const suffix of [
      ".notify.windows.com",
      ".push.apple.com",
      ".push.services.mozilla.com",
    ]) {
      assert.ok(suffixes.includes(suffix), `${label}: the suffix list no longer names ${suffix}`);
    }
  }
});

test("the SQL mirror cuts the authority the way the URL parser does (self-test)", () => {
  const sql = effectivePushRpcSql();
  const helper = effectivePushHelperSql();
  // The rule accepts a real push service and rejects a non-push host.
  assert.equal(sqlAllowsEndpoint(sql, "https://fcm.googleapis.com/x"), true);
  assert.equal(sqlAllowsEndpoint(sql, "https://evil.example/x"), false);
  assert.equal(sqlAllowsEndpoint(sql, "https://wns2-par02p.notify.windows.com/x"), true);
  // A backslash now ends the authority, so the real host `evil.com` is what the
  // allowlist sees — the mirror rejects it, as the URL parse does.
  assert.equal(sqlAuthority("https://evil.com\\.push.apple.com/x"), "evil.com");
  assert.equal(sqlAllowsEndpoint(sql, "https://evil.com\\.push.apple.com/x"), false);
  assert.equal(new URL("https://evil.com\\.push.apple.com/x").hostname, "evil.com");
  assert.equal(isAllowedPushEndpoint("https://evil.com\\.push.apple.com/x"), false);
  // A URL credential is not a hostname character, so the `@` fails the bare-host
  // gate — the mirror rejects it, as the URL parse does.
  assert.equal(sqlAllowsEndpoint(sql, "https://evil.com@x.push.apple.com/x"), false);
  assert.equal(new URL("https://evil.com@x.push.apple.com/x").hostname, "x.push.apple.com");
  assert.equal(isAllowedPushEndpoint("https://evil.com@x.push.apple.com/x"), false);
  // The authority cut takes the host up to the first `\`, so the real push
  // service is what the allowlist sees — accepted, as the URL parse does.
  assert.equal(sqlAllowsEndpoint(sql, "https://fcm.googleapis.com\\evil.com/x"), true);
  assert.equal(new URL("https://fcm.googleapis.com\\evil.com/x").hostname, "fcm.googleapis.com");
  assert.equal(isAllowedPushEndpoint("https://fcm.googleapis.com\\evil.com/x"), true);
  // A port above 65535 makes `new URL(...)` throw; the mirror refuses it too.
  assert.equal(sqlAllowsEndpoint(sql, "https://fcm.googleapis.com:65536/x"), false);
  assert.equal(sqlHelperAllowsEndpoint(helper, "https://fcm.googleapis.com:65536/x"), false);
  assert.throws(() => new URL("https://fcm.googleapis.com:65536/x"));
  // The two SQL predicates (RPC and table CHECK) are the same rule.
  for (const endpoint of ["https://fcm.googleapis.com/x", "https://evil.example/x", "https://evil.com\\.push.apple.com/x"]) {
    assert.equal(
      sqlAllowsEndpoint(sql, endpoint),
      sqlHelperAllowsEndpoint(helper, endpoint),
      `the RPC and the table CHECK disagree on ${endpoint}`,
    );
  }
});

test("the app gate rejects every endpoint whose real host is not a push service", () => {
  // The invariant that must hold no matter which layer is asked: a real host
  // that is not a push service is rejected. Guards against "fixing" the
  // divergence by widening the app allowlist instead of tightening the SQL.
  for (const endpoint of [...rejectedByApp, ...rejectedForCredentials]) {
    let host: string | null = null;
    try {
      host = new URL(endpoint).hostname;
    } catch {
      host = null; // the URL parser rejects the encoded-separator forms outright
    }
    assert.equal(
      isAllowedPushEndpoint(endpoint),
      false,
      `${endpoint} (real host ${host ?? "unparseable"}) must be rejected by the app gate`,
    );
  }
  // The app gate accepts the real push-service host even when the raw string is
  // malformed around it — the SQL now agrees.
  for (const endpoint of acceptedByBothAfterFix) {
    assert.equal(
      isAllowedPushEndpoint(endpoint),
      true,
      `${endpoint} must be accepted by the app gate (its real host is a push service)`,
    );
  }
});

test("the app gate and the SQL rule agree on the agreed corpus (parity gate)", () => {
  const sql = effectivePushRpcSql();
  const helper = effectivePushHelperSql();
  for (const endpoint of acceptedEndpoints) {
    for (const [label, allows] of [
      ["register_push_subscription", sqlAllowsEndpoint(sql, endpoint)],
      ["is_allowed_push_endpoint", sqlHelperAllowsEndpoint(helper, endpoint)],
    ] as const) {
      assert.equal(
        allows,
        isAllowedPushEndpoint(endpoint),
        `${label} and the app gate disagree on the accepted endpoint ${endpoint}`,
      );
    }
    assert.equal(isAllowedPushEndpoint(endpoint), true, `${endpoint} must be accepted`);
  }
  for (const endpoint of rejectedEndpoints) {
    for (const [label, allows] of [
      ["register_push_subscription", sqlAllowsEndpoint(sql, endpoint)],
      ["is_allowed_push_endpoint", sqlHelperAllowsEndpoint(helper, endpoint)],
    ] as const) {
      assert.equal(
        allows,
        isAllowedPushEndpoint(endpoint),
        `${label} and the app gate disagree on the rejected endpoint ${endpoint}`,
      );
    }
    assert.equal(isAllowedPushEndpoint(endpoint), false, `${endpoint} must be rejected`);
  }
  // Non-vacuity: the corpus must contain at least one endpoint each way.
  assert.ok(acceptedEndpoints.length > 0 && rejectedEndpoints.length > 0);
});

test("both SQL rules agree with the app gate on the hostile endpoints (the #536 gate)", () => {
  const sql = effectivePushRpcSql();
  const helper = effectivePushHelperSql();
  for (const endpoint of divergentEndpoints) {
    const app = isAllowedPushEndpoint(endpoint);
    assert.equal(
      sqlAllowsEndpoint(sql, endpoint),
      app,
      `register_push_subscription and the app gate disagree on ${endpoint}`,
    );
    assert.equal(
      sqlHelperAllowsEndpoint(helper, endpoint),
      app,
      `is_allowed_push_endpoint and the app gate disagree on ${endpoint}`,
    );
  }
  // Non-vacuity: the corpus must exercise both verdicts, so the gate cannot pass
  // by rejecting (or accepting) everything.
  assert.ok(
    divergentEndpoints.some((endpoint) => isAllowedPushEndpoint(endpoint)),
    "the hostile corpus has no endpoint the app accepts",
  );
  assert.ok(
    divergentEndpoints.some((endpoint) => !isAllowedPushEndpoint(endpoint)),
    "the hostile corpus has no endpoint the app rejects",
  );
});
