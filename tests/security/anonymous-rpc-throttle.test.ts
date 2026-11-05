import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The anonymous write RPCs are reachable *without* the Next.js server action.
 *
 * `submit_feedback` and `submit_sales_lead` are `security definer` functions
 * granted to `anon`, so anyone holding the publishable key can POST them
 * straight to PostgREST (`POST /rest/v1/rpc/submit_feedback`) and skip the
 * server action entirely.
 *
 * The only abuse control the repository ships — the fixed-window rate limiter in
 * `src/features/abuse/**` — runs inside the action (`submitFeedback` /
 * `submitSalesLead`), i.e. *above* the RPC. A caller that talks to PostgREST
 * directly never passes through it, so the throttle bounds the form but not the
 * endpoint. This is the residual gap the earlier finding (the actions had no
 * control at all) left behind.
 *
 * What the direct path can and cannot do, to scope the impact honestly:
 *
 *  - It **can** insert unbounded rows into `feedback_submissions` and
 *    `sales_leads`, carrying an attacker-chosen address and free text. Neither
 *    table has a retention job, so this is unbounded storage growth plus a
 *    PII-harvest surface (the team console reads the rows).
 *  - It **cannot** send mail: the fan-out lives in the action
 *    (`sendFeedbackEmails` / `sendSalesLeadEmails`), not in the RPC, so the
 *    mail-flood vector is closed for callers who skip the action.
 *
 * The fix belongs at the boundary the attacker actually uses: a database-side
 * throttle (a per-address counter maintained by a trigger or `pg_cron`), or
 * revoking the direct `anon` grant and proxying the write through a route that
 * re-applies the limiter. The RPC is LANE-SUPABASE's file; the action is
 * LANE-URUN's.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);
const allSql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
  .join("\n");

function read(relative: string): string {
  return readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");
}

/**
 * True when `signature` ends up granted to `anon`.
 *
 * A migration may revoke and then re-grant (the repository's convention), and a
 * later `grant` overrides an earlier `revoke`, so the answer depends on which
 * statement comes last, not on whether a revoke exists at all.
 */
function callableByAnon(signature: string): boolean {
  const escaped = signature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  const grant = new RegExp(
    `grant\\s+execute\\s+on\\s+function\\s+public\\.${escaped}\\s+to[^;]*\\banon\\b`,
    "gi",
  );
  const revoke = new RegExp(
    `revoke\\s+all\\s+on\\s+function\\s+public\\.${escaped}\\s+from[^;]*\\banon\\b`,
    "gi",
  );

  let lastGrant = -1;
  let lastRevoke = -1;
  for (const match of allSql.matchAll(grant)) lastGrant = match.index ?? -1;
  for (const match of allSql.matchAll(revoke)) lastRevoke = match.index ?? -1;

  return lastGrant > lastRevoke;
}

const anonymousWriteRpcs = [
  "submit_feedback(text, text, text, integer, text, text)",
  "submit_sales_lead(text, text, text, text, text, integer, text, text)",
];

test("the anonymous write RPCs are directly callable with the publishable key", () => {
  for (const signature of anonymousWriteRpcs) {
    assert.ok(
      callableByAnon(signature),
      `${signature} is expected to be anon-callable by design`,
    );
  }
});

test("the server action applies a throttle before it calls the RPC", () => {
  // The control exists — this half passes today and is the reason the earlier
  // "no abuse control at all" finding was closed. It is also why the gap below
  // is easy to miss: the form is protected, the endpoint is not.
  //
  // The assertion is *ordering*, not presence: the throttle must run before the
  // RPC (which stores the row) and before the mail fan-out. A version that only
  // matched `RateLimiter.check(` would pass even if the check were moved after
  // the RPC — the row would be written and the mail sent before the limit was
  // consulted, so the limit would bound nothing.
  for (const relative of [
    "src/features/feedback/actions.ts",
    "src/features/sales/actions.ts",
  ]) {
    const source = read(relative);
    const check = source.indexOf("RateLimiter.check(");
    assert.ok(check > -1, `${relative} no longer throttles before the RPC`);

    const rpc = source.indexOf('supabase.rpc("submit_');
    assert.ok(rpc > -1, `${relative}: the submit RPC call was not found`);
    assert.ok(
      check < rpc,
      `${relative} calls the RPC before it throttles, so the row is written ` +
        `before the limit is consulted`,
    );

    const mail = source.indexOf("sendFeedbackEmails(") >= 0
      ? source.indexOf("sendFeedbackEmails(")
      : source.indexOf("sendSalesLeadEmails(");
    assert.ok(mail > -1, `${relative}: the mail fan-out call was not found`);
    assert.ok(
      check < mail,
      `${relative} sends mail before it throttles, so a loop mails without bound`,
    );
  }
});

test("the direct PostgREST path is throttled inside the RPC, not just the form", () => {
  // LANE-SUPABASE shipped `20261106000000_v4_anon_write_throttle.sql`: the two
  // anon write RPCs now `perform public.consume_anon_write_quota(...)` before the
  // insert, so the bound lives at the boundary the attacker actually reaches.
  // This used to be a `todo`; the fix landed, so it is a gate now.
  //
  // The assertion is deliberately specific: the throttle call must be inside the
  // *body of each RPC*, not just somewhere in the migration text. A loose
  // `/throttle/i` match over all SQL would pass on a comment, which is how this
  // class of regression hides.
  for (const name of ["submit_feedback", "submit_sales_lead"]) {
    const body = latestFunctionBody(name);
    assert.ok(body, `${name} has no definition in the migrations`);
    assert.match(
      body,
      /perform\s+public\.consume_anon_write_quota\s*\(/,
      `${name} inserts without a per-caller throttle inside its own body — a direct ` +
        `PostgREST caller would be unbounded (see docs/threat-model.md, issue #139)`,
    );

    // And the throttle must run *before* the insert, or the row is written even
    // when the quota is already spent.
    const throttleAt = body.indexOf("consume_anon_write_quota");
    const insertAt = body.search(/insert\s+into\s+public\.(feedback_submissions|sales_leads)/i);
    assert.ok(insertAt > -1, `${name} has no insert to compare against`);
    assert.ok(
      throttleAt < insertAt,
      `${name} inserts before it consumes quota, so an over-budget call still writes a row`,
    );
  }

  // The throttle ledger and its helper must be invisible to client roles, or an
  // attacker could read the hashed counters or reset their own bucket.
  assert.match(
    allSql,
    /revoke\s+all\s+on\s+table\s+public\.anon_write_throttle\s+from\s+public,\s*anon,\s*authenticated/i,
    "the throttle ledger is not revoked from the client roles",
  );
  assert.match(
    allSql,
    /revoke\s+all\s+on\s+function\s+public\.consume_anon_write_quota\s*\([^)]*\)\s+from\s+public,\s*anon,\s*authenticated/i,
    "the throttle helper is not revoked from the client roles",
  );
});

/**
 * The body of the last `create [or replace] function public.<name>(…)` in the
 * migration set — the definition that actually wins, since every migration is
 * replayed in order.
 */
function latestFunctionBody(name: string): string | null {
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\([\\s\\S]*?\\)\\s*[\\s\\S]*?\\bas\\s+\\$[A-Za-z_0-9]*\\$([\\s\\S]*?)\\$[A-Za-z_0-9]*\\$`,
    "gi",
  );
  const matches = [...allSql.matchAll(re)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

test(
  "the app action forwards the visitor address the DB throttle keys on",
  {
    todo:
      "the DB throttle reads `request.headers` but the server action sends no visitor IP, " +
      "so the app-path IP dimension is one shared bucket (see docs/threat-model.md)",
  },
  () => {
    // The migration keys its IP bucket on `current_setting('request.headers')`
    // (`cf-connecting-ip` / `x-real-ip` / `x-forwarded-for`). Those are headers of
    // the *PostgREST* request. A direct attacker's request carries them; a request
    // the Next.js action makes through supabase-js does not — the client sends
    // only `apikey`, `authorization`, `content-type` and `x-client-info`
    // (verified against the installed `@supabase/supabase-js`). So every
    // server-action submission collapses onto one bucket, and the migration's
    // own note ("an absent header degrades to a single shared bucket") is the
    // *normal* case for the app, not an edge case: the sixth legitimate form
    // submission site-wide inside the window is rejected with the generic
    // "failed" copy. The app must pass the visitor address explicitly (an
    // argument or a `global.headers` override) for the IP dimension to mean
    // anything on this path. Owner: LANE-URUN (`src/features/**`) with
    // LANE-SUPABASE (`supabase/**`).
    for (const relative of [
      "src/features/feedback/actions.ts",
      "src/features/sales/actions.ts",
    ]) {
      const source = read(relative);
      const rpcCall = source.match(/supabase\.rpc\(\s*["']submit_[a-z_]+["']\s*,\s*\{([\s\S]*?)\}\s*\)/);
      assert.ok(rpcCall, `${relative} no longer calls the submit RPC directly`);
      assert.match(
        rpcCall![1],
        /_client_ip|_ip|clientIp/,
        `${relative} calls the RPC without forwarding the visitor address, so the ` +
          `DB throttle cannot tell two app-path callers apart (see docs/threat-model.md)`,
      );
    }
  },
);
