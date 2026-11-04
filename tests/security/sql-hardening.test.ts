import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Source-level invariants over the SQL migrations.
 *
 * The pgTAP suite (`supabase/tests/database/`) is the authority on runtime
 * behaviour, but it needs Docker and a booted local stack, so it only runs in
 * the `database` CI job. These checks read the same migration text and fail in
 * the fast `static` job when a *new* migration drops one of the repository's
 * standing security invariants:
 *
 *  1. every `public` table enables RLS in the same file that creates it;
 *  2. every `security definer` function pins `search_path` (empty string);
 *  3. every `grant execute ... to anon/authenticated` is paired with a
 *     `revoke all ... from public, anon, authenticated` first — the exact
 *     failure mode that leaked `list_engagement_recipients`;
 *  4. the pgTAP privilege ratchet's whitelist stays in step with the grants
 *     the migrations actually hand out.
 *
 * These are grep-level checks by design: they cannot prove behaviour, and they
 * are not a substitute for the pgTAP suite. They exist so the invariant is
 * enforced on the second a migration lands rather than only after a Docker
 * stack has booted.
 */

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url);

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(new URL(name, migrationsDir), "utf8") }));
}

const files = migrationFiles();
const allSql = files.map((f) => f.sql).join("\n");

// ---------------------------------------------------------------------------
// 1. RLS is enabled wherever a public table is created.
// ---------------------------------------------------------------------------

test("every public table enables row level security", () => {
  const offenders: string[] = [];

  for (const { name, sql } of files) {
    const created = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)/gi)].map(
      (m) => m[1],
    );
    for (const table of created) {
      const enabled = new RegExp(
        `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
        "i",
      ).test(sql);
      if (!enabled) offenders.push(`${name}: public.${table}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `tables created without RLS in the same migration: ${offenders.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 2. Every SECURITY DEFINER function pins search_path.
//
// A definer function runs with the owner's privileges; an unqualified name in
// its body resolves against the caller's `search_path` unless it is pinned, so
// a role that can create objects in a schema on that path could hijack it.
// The repository's convention is `set search_path = ''` plus fully-qualified
// references (all 82 definer functions follow it today).
// ---------------------------------------------------------------------------

test("every security definer function sets search_path = ''", () => {
  const offenders: string[] = [];

  for (const { name, sql } of files) {
    const re = /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\)([\s\S]*?)\$\$/gi;
    for (const match of sql.matchAll(re)) {
      const options = match[3];
      if (!/security\s+definer/i.test(options)) continue;
      if (!/set\s+search_path\s*=\s*''/i.test(options)) {
        offenders.push(`${name}: ${match[1]}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `definer functions without a pinned search_path: ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
// 3. A client grant is always preceded by an explicit revoke.
//
// `revoke ... from public` alone does not remove the per-role EXECUTE entries
// Supabase's `pg_default_acl` creates for `anon`/`authenticated`/`service_role`
// (documented in AGENTS.md and `20261031120000`). Every client-facing grant must
// therefore be preceded — anywhere in the migration set — by a revoke that names
// `anon` *and* `authenticated`, unless it is one of the deliberate public RPCs.
// ---------------------------------------------------------------------------

/** RPCs that are meant to be reachable with the publishable key. */
const deliberatePublicRpcs = new Set([
  "get_public_site_content(text, text[])",
  "get_public_faq(text)",
  "get_public_listing_plans()",
  "get_public_directory()",
  "submit_feedback(text, text, text, integer, text, text)",
  "submit_sales_lead(text, text, text, text, text, integer, text, text)",
]);

function normalizeArgs(args: string): string {
  return args.replace(/\s+/g, " ").trim();
}

function grantedToClients(sql: string): Set<string> {
  const granted = new Set<string>();
  const re = /grant\s+execute\s+on\s+function\s+public\.([a-z_]+)\s*\(([^)]*)\)\s+to\s+([^;]+);/gi;
  for (const match of sql.matchAll(re)) {
    if (/\banon\b|\bauthenticated\b/.test(match[3].toLowerCase())) {
      granted.add(`${match[1]}(${normalizeArgs(match[2])})`);
    }
  }
  return granted;
}

function revokedFromClients(sql: string): Set<string> {
  const revoked = new Set<string>();
  const re = /revoke\s+all\s+on\s+function\s+public\.([a-z_]+)\s*\(([^)]*)\)\s+from\s+([^;]+);/gi;
  for (const match of sql.matchAll(re)) {
    const roles = match[3].toLowerCase();
    if (/\banon\b/.test(roles) && /\bauthenticated\b/.test(roles)) {
      revoked.add(`${match[1]}(${normalizeArgs(match[2])})`);
    }
  }
  return revoked;
}

test("every client EXECUTE grant is paired with an explicit anon+authenticated revoke", () => {
  const granted = grantedToClients(allSql);
  const revoked = revokedFromClients(allSql);

  const unpaired = [...granted].filter(
    (signature) => !revoked.has(signature) && !deliberatePublicRpcs.has(signature),
  );

  assert.deepEqual(
    unpaired,
    [],
    `client-callable functions granted without a matching revoke: ${unpaired.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 4. The pgTAP privilege ratchet and the migrations agree.
//
// `function_privileges.test.sql` enumerates every signature a client role may
// execute and compares it to a reviewed whitelist. If a migration grants a new
// one and forgets the whitelist, the database job fails — but only after the
// stack boots. Cross-checking the two here turns that into a static failure and
// keeps the whitelist from silently drifting.
// ---------------------------------------------------------------------------

const ratchetFile = new URL(
  "../../supabase/tests/database/function_privileges.test.sql",
  import.meta.url,
);

/**
 * The whitelist and the grant statements spell the same signature differently —
 * the ratchet uses `pg_get_function_identity_arguments` (names *and* types, e.g.
 * `apply_to_job(_job_id uuid, _cover_letter text)`), a `grant execute` uses types
 * only (`apply_to_job(uuid, text)`). Both describe the same function, so the
 * comparison keys on name + arity rather than the literal text.
 */
function nameArity(signature: string): string {
  const match = signature.match(/^([a-z_]+)\(([\s\S]*)\)$/);
  if (!match) return signature;
  return `${match[1]}/${countArguments(match[2])}`;
}

function countArguments(args: string): number {
  const trimmed = args.trim();
  if (trimmed.length === 0) return 0;
  let depth = 0;
  let count = 1;
  for (const character of trimmed) {
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) count += 1;
  }
  return count;
}

function whitelistedSignatures(): Set<string> {
  const sql = readFileSync(ratchetFile, "utf8");
  // The whitelist is the single `array[ ... ]::text[]` literal in the file.
  const block = sql.match(/array\[([\s\S]*?)\]::text\[\]/);
  assert.ok(block, "could not find the whitelist array in function_privileges.test.sql");
  return new Set([...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/\s+/g, " ").trim()));
}

test("the pgTAP whitelist is not empty and covers the deliberate public RPCs", () => {
  const whitelist = whitelistedSignatures();
  assert.ok(whitelist.size > 20, `whitelist looks truncated: ${whitelist.size} entries`);

  const whitelistedArity = new Set([...whitelist].map(nameArity));
  for (const rpc of deliberatePublicRpcs) {
    assert.ok(
      whitelistedArity.has(nameArity(rpc)),
      `${rpc} is granted to clients but absent from the ratchet whitelist`,
    );
  }
});

test("the ratchet whitelist and the migration grants do not drift", () => {
  const whitelist = whitelistedSignatures();
  const granted = grantedToClients(allSql);

  const grantedArity = new Set([...granted].map(nameArity));
  const whitelistedArity = new Set([...whitelist].map(nameArity));

  // Every deliberately-granted signature must be whitelisted.
  const notWhitelisted = [...granted].filter((signature) => !whitelistedArity.has(nameArity(signature)));
  assert.deepEqual(
    notWhitelisted,
    [],
    `migrations grant these to clients but the pgTAP ratchet does not list them: ${notWhitelisted.join(", ")}`,
  );

  // And the whitelist must not name a signature no migration grants — that would
  // be a stale entry hiding a function that no longer exists.
  const notGranted = [...whitelist].filter((signature) => !grantedArity.has(nameArity(signature)));
  assert.deepEqual(
    notGranted,
    [],
    `the pgTAP ratchet lists signatures no migration grants: ${notGranted.join(", ")}`,
  );
});
