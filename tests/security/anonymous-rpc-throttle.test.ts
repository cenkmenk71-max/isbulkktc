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
  for (const relative of [
    "src/features/feedback/actions.ts",
    "src/features/sales/actions.ts",
  ]) {
    const source = read(relative);
    assert.match(
      source,
      /RateLimiter\.check\(/,
      `${relative} no longer throttles before the RPC`,
    );
  }
});

test(
  "the direct PostgREST path is throttled too, not just the form",
  { todo: "anon RPC throttle is action-only; direct PostgREST writes are unbounded (see docs/threat-model.md)" },
  () => {
    // The limiter is in-process and lives in the action. Nothing between a
    // direct PostgREST caller and the table enforces a rate: there is no
    // per-address counter, no insert trigger and no `pg_cron` job over the two
    // tables, and the `anon` grant is not revoked. So the boundary the attacker
    // uses is open. Marked `todo` so the suite documents the gap without failing
    // CI before the owning lane ships the fix — a database-side throttle, or an
    // `anon` revoke plus a proxying route that re-applies the limiter.
    const hasDatabaseThrottle =
      /pg_cron|cron\.schedule|rate.?limit|throttle/i.test(allSql);
    const allRevokedFromAnon = anonymousWriteRpcs.every(
      (signature) => !callableByAnon(signature),
    );

    assert.ok(
      hasDatabaseThrottle || allRevokedFromAnon,
      "a direct PostgREST caller skips the action-level limiter and writes " +
        "feedback_submissions / sales_leads without bound (see docs/threat-model.md)",
    );
  },
);
