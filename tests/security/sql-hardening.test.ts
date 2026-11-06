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
 *  4. every `admin_*` RPC re-checks the platform-admin role in its own body;
 *  5. the pgTAP privilege ratchet's whitelist stays in step with the grants
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
    // `[a-z0-9_]+` so a digit-suffixed table name is captured whole; the earlier
    // `[a-z_]+` truncated `audit_log2` to `audit_log`, and a `create table` with
    // no matching `alter table … enable row level security` would then slip past
    // because the truncated name was never checked. Quoted identifiers are
    // captured too, so `public."Audit_Log"` is not invisible.
    const created = [
      ...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\."?([A-Za-z0-9_]+)"?/gi),
    ].map((m) => m[1]);
    for (const table of created) {
      const enabled = new RegExp(
        `alter\\s+table\\s+public\\.\\s*"?${table}"?\\s+enable\\s+row\\s+level\\s+security`,
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

test("the RLS table matcher handles digits and quoting (self-test)", () => {
  // Guards the guard: a create-table form the regex cannot see is a table whose
  // missing RLS is never reported.
  const captured = (sql: string) =>
    [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\."?([A-Za-z0-9_]+)"?/gi)].map(
      (m) => m[1],
    );
  assert.deepEqual(captured("create table public.audit_log2 (id int);"), ["audit_log2"]);
  assert.deepEqual(captured('create table public."Audit_Log" (id int);'), ["Audit_Log"]);
  assert.deepEqual(captured("create table if not exists public.t9 (id int);"), ["t9"]);
});

// ---------------------------------------------------------------------------
// 1b. Every public table is revoked from the client roles.
//
// RLS is the row-level gate; the table-level gate is the `revoke`. Supabase's
// `pg_default_acl` hands every new `public` table to `anon`/`authenticated`, and
// `revoke ... from public` does not remove those explicit per-role entries — the
// same mechanism that leaked `list_engagement_recipients` for functions
// (AGENTS.md). The function half of this is ratcheted by
// `function_privileges.test.sql`; the table half had no guard at all, so a new
// migration could `create table public.x` and forget the revoke while this suite
// (and the threat model's "every table is revoked" claim) stayed green. This
// test makes the table half fail in the fast job, before the Docker stack boots.
// ---------------------------------------------------------------------------

/** Every `public` table created anywhere in the migration set. */
function createdTables(): Set<string> {
  const tables = new Set<string>();
  for (const { sql } of files) {
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?public\."?([A-Za-z0-9_]+)"?/gi,
    )) {
      tables.add(match[1]);
    }
  }
  return tables;
}

/**
 * Tables revoked from *both* `anon` and `authenticated`. A `revoke` may name a
 * comma-separated list of tables (`revoke all on table public.a, public.b from
 * anon, authenticated;`), which the repository uses, so the table side is split
 * too rather than assumed to be a single identifier.
 */
function revokedTablesFromClients(sql: string): Set<string> {
  const revoked = new Set<string>();
  for (const match of sql.matchAll(
    /revoke\s+all\s+on\s+table\s+([^;]+?)\s+from\s+([^;]+);/gi,
  )) {
    const roles = match[2].toLowerCase();
    if (!/\banon\b/.test(roles) || !/\bauthenticated\b/.test(roles)) continue;
    for (const table of match[1].matchAll(/public\.\s*"?([A-Za-z0-9_]+)"?/g)) {
      revoked.add(table[1]);
    }
  }
  return revoked;
}

test("the table-revoke matcher handles comma-separated lists (self-test)", () => {
  const revoked = (sql: string) => [...revokedTablesFromClients(sql)];
  assert.deepEqual(revoked("revoke all on table public.a from anon, authenticated;"), ["a"]);
  assert.deepEqual(
    revoked("revoke all on table public.a, public.b, public.c from anon, authenticated;"),
    ["a", "b", "c"],
  );
  assert.deepEqual(
    revoked("revoke all on table public.a, public.b from public, anon, authenticated;"),
    ["a", "b"],
  );
  // A revoke that misses either client role does not count as covering the table.
  assert.deepEqual(revoked("revoke all on table public.a from anon;"), []);
  assert.deepEqual(revoked("revoke all on table public.a from public;"), []);
});

test("every public table is revoked from anon and authenticated", () => {
  const revoked = revokedTablesFromClients(allSql);
  const offenders = [...createdTables()].filter((table) => !revoked.has(table));
  assert.deepEqual(
    offenders,
    [],
    `public tables never revoked from the client roles: ${offenders.join(", ")}`,
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
    for (const match of definerFunctions(sql)) {
      if (!match.definer) continue;
      if (!/set\s+search_path\s*=\s*''/i.test(match.options)) {
        offenders.push(`${name}: ${match.signature}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `definer functions without a pinned search_path: ${offenders.join(", ")}`);
});

/**
 * Every `create function` in a migration, with the option block (between the
 * parameter list and the body) and a `security definer` flag.
 *
 * The body delimiter is matched as a *tagged* dollar quote (`$$`, `$fn$`, …) and
 * the option block is anchored on the `as` that introduces it, so a function
 * written with a named tag is not invisible to the `search_path` check the way
 * the earlier `… \$\$`-only pattern would have left it.
 */
function definerFunctions(sql: string): { signature: string; options: string; definer: boolean }[] {
  const re =
    /create\s+(?:or\s+replace\s+)?function\s+([\w."]+)\s*\(([\s\S]*?)\)\s*([\s\S]*?)\bas\s+(\$[A-Za-z_0-9]*\$)/gi;
  return [...sql.matchAll(re)].map((match) => ({
    signature: match[1],
    options: match[3],
    definer: /security\s+definer/i.test(match[3]),
  }));
}

test("the definer matcher sees tagged dollar quotes and flags an unpinned body (self-test)", () => {
  const unpinned = definerFunctions(
    "create function public.f() returns void language sql security definer as $fn$ select 1 $fn$;",
  );
  assert.equal(unpinned.length, 1);
  assert.equal(unpinned[0].definer, true);
  assert.equal(/set\s+search_path\s*=\s*''/i.test(unpinned[0].options), false);

  const pinned = definerFunctions(
    "create function public.f() returns void language sql security definer set search_path = '' as $$ select 1 $$;",
  );
  assert.equal(pinned.length, 1);
  assert.equal(/set\s+search_path\s*=\s*''/i.test(pinned[0].options), true);
});

// ---------------------------------------------------------------------------
// 2b. Every `admin_*` RPC re-checks the platform-admin role in its own body.
//
// The threat model claims every `admin_*` function calls
// `has_platform_role('platform_admin')` (which is AAL2-gated), so a client that
// can execute one cannot escalate without a verified admin session. That claim
// held for the 13 functions that exist today, but nothing *enforced* it: the
// pgTAP console suite pins only the two package RPCs, so a new `admin_*`
// function — callable by design, hence on the EXECUTE whitelist — could ship
// without the guard and no test would go red. This ratchets the whole set.
//
// The check reads each function's *last* definition (every migration is
// replayed, so the latest `create or replace` wins), strips line comments so a
// passing mention in prose cannot satisfy it, and requires the concrete call
// `public.has_platform_role('platform_admin')`.
// ---------------------------------------------------------------------------

/** The body of the last definition of every `public.<prefix>*` function. */
function latestFunctionBodies(prefix: string): Map<string, string> {
  const bodies = new Map<string, string>();
  const re = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.(${prefix}[a-z_0-9]*)\\s*\\([\\s\\S]*?\\)\\s*[\\s\\S]*?\\bas\\s+\\$[A-Za-z_0-9]*\\$([\\s\\S]*?)\\$[A-Za-z_0-9]*\\$`,
    "gi",
  );
  for (const match of allSql.matchAll(re)) {
    // Later definitions overwrite earlier ones — the replay order.
    bodies.set(match[1], match[2]);
  }
  return bodies;
}

/** Removes `--` line comments so a mention in prose does not count as code. */
function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}

test("the admin-guard matcher ignores comments and reads the latest body (self-test)", () => {
  // A comment that names the guard must NOT satisfy the check.
  assert.equal(
    /public\.has_platform_role\s*\(\s*'platform_admin'\s*\)/.test(
      stripSqlComments("begin -- public.has_platform_role('platform_admin')\n return; end;"),
    ),
    false,
  );
  // A real call does.
  assert.equal(
    /public\.has_platform_role\s*\(\s*'platform_admin'\s*\)/.test(
      stripSqlComments("begin if not public.has_platform_role('platform_admin') then raise; end if; end;"),
    ),
    true,
  );
});

test("every admin_* RPC re-checks the platform-admin role in its own body", () => {
  const bodies = latestFunctionBodies("admin_");
  assert.ok(bodies.size >= 10, `expected the admin_* set, found ${bodies.size}`);

  const offenders = [...bodies]
    .filter(([, body]) =>
      !/public\.has_platform_role\s*\(\s*'platform_admin'\s*\)/.test(stripSqlComments(body)),
    )
    .map(([name]) => name);

  assert.deepEqual(
    offenders,
    [],
    `admin_* functions without a platform-admin guard in their body: ${offenders.join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 2c. The role helper itself keeps the MFA gate.
//
// `has_platform_role` is the single chokepoint every admin RPC calls, and it is
// defined **twice**: `20261013000000` only checks `user_roles`, then
// `20261020194000` re-creates it to additionally require an `aal2` JWT claim and
// an `active` profile. Because every migration is replayed in order, the later
// definition wins — but nothing pinned *that*. A future migration that
// re-created the helper with the simpler first body (or a new file that sorted
// after the hardened one) would silently drop the MFA requirement while the
// admin-guard test above stayed green, since the RPCs would still "call the
// helper". This ratchets the winning body's semantics.
// ---------------------------------------------------------------------------

test("the winning has_platform_role body keeps the aal2 and active-profile gate", () => {
  const helper = latestFunctionBodies("has_platform_role");
  const body = helper.get("has_platform_role");
  assert.ok(body, "has_platform_role has no definition in the migrations");
  const code = stripSqlComments(body);

  assert.match(
    code,
    /->>\s*'aal'/,
    "has_platform_role no longer reads the `aal` claim, so MFA is not required",
  );
  assert.match(
    code,
    /=\s*'aal2'/,
    "has_platform_role no longer requires aal2, so an AAL1 session would pass",
  );
  assert.match(
    code,
    /status\s*=\s*'active'/,
    "has_platform_role no longer requires an active profile",
  );
});

test("the admin-guard ratchet reads the last definition, not the first (self-test)", () => {
  // Two definitions of the same helper; only the last (replay order) may count.
  const sql = [
    "create or replace function public.probe() returns boolean language sql as $$ select true $$;",
    "create or replace function public.probe() returns boolean language sql as $$ select false $$;",
  ].join("\n");
  const re =
    /create\s+(?:or\s+replace\s+)?function\s+public\.(probe)\s*\([\s\S]*?\)\s*[\s\S]*?\bas\s+\$[A-Za-z_0-9]*\$([\s\S]*?)\$[A-Za-z_0-9]*\$/gi;
  const bodies = new Map<string, string>();
  for (const match of sql.matchAll(re)) bodies.set(match[1], match[2]);
  assert.match(bodies.get("probe")!, /select\s+false/);
});

// ---------------------------------------------------------------------------
// 2d. Every service-role-only RPC re-checks `auth.role()` in its own body.
//
// A function granted to `service_role` is a worker primitive: the route that
// calls it already holds the service key, but the function itself must not rely
// on that. `list_engagement_recipients` is a full mailing-list dump
// (`user_id`, `email`, `display_name`, `locale`) and it once shipped callable
// with the publishable key — the revoke is the primary control, and the in-body
// `auth.role() <> 'service_role'` check is the second. Six of the eight
// service-role-only RPCs have it (the four push ones and the two outbox ones);
// `list_engagement_recipients` and `opt_out_engagement` do not.
//
// Documented as a `todo` because the fix belongs to LANE-SUPABASE. When the two
// are re-created with the guard (one trailing idempotent migration), the `todo`
// can be dropped and this becomes a gate.
// ---------------------------------------------------------------------------

/** The signatures granted to `service_role` (with their argument lists). */
function serviceRoleOnlySignatures(): string[] {
  const grantedToClients = new Set<string>();
  const grantedToService = new Set<string>();
  const re =
    /grant\s+execute\s+on\s+function\s+public\.\s*"?([a-z_0-9]+)"?\s*\(([^)]*)\)\s+to\s+([^;]+);/gi;
  for (const match of allSql.matchAll(re)) {
    const roles = match[3].toLowerCase();
    const signature = `${match[1]}(${normalizeArgs(match[2])})`;
    if (/\bservice_role\b/.test(roles)) grantedToService.add(signature);
    if (/\banon\b|\bauthenticated\b/.test(roles)) grantedToClients.add(signature);
  }
  return [...grantedToService].filter((signature) => !grantedToClients.has(signature)).sort();
}

// Matches both `(select auth.role()) <> 'service_role'` (the raise form) and
// `(select auth.role()) = 'service_role'` (a WHERE guard), with or without the
// closing paren and any spacing.
const serviceRoleGuard = /auth\.role\(\)\s*\)?\s*(?:<>|=)\s*'service_role'/;

test("the service-role guard matcher reads the latest body and ignores comments (self-test)", () => {
  assert.equal(
    serviceRoleGuard.test(stripSqlComments("begin if (select auth.role()) <> 'service_role' then raise; end if; end;")),
    true,
  );
  assert.equal(
    serviceRoleGuard.test(stripSqlComments("where (select auth.role()) = 'service_role' and p.status = 'active'")),
    true,
  );
  assert.equal(
    serviceRoleGuard.test(stripSqlComments("begin -- auth.role() <> 'service_role'\n return; end;")),
    false,
  );
});

test(
  "every service-role-only RPC re-checks auth.role() in its own body",
  {
    todo:
      "list_engagement_recipients and opt_out_engagement are granted to service_role " +
      "but do not re-check auth.role() in their bodies (see docs/threat-model.md)",
  },
  () => {
    const offenders: string[] = [];
    for (const signature of serviceRoleOnlySignatures()) {
      const name = signature.slice(0, signature.indexOf("("));
      const body = latestFunctionBodies(name).get(name);
      if (body === undefined) continue; // not a plpgsql/sql body we can read
      if (!serviceRoleGuard.test(stripSqlComments(body))) offenders.push(name);
    }
    assert.deepEqual(
      offenders,
      [],
      `service-role-only RPCs without an auth.role() guard: ${offenders.join(", ")}`,
    );
  },
);

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
  // `grant (execute|all)` and a role list that names `anon`, `authenticated` *or*
  // `public`. The earlier `grant execute … to (anon|authenticated)` form missed
  // two real exposures: `grant all on function …` (ALL includes EXECUTE) and
  // `grant … to public` (the implicit-PUBLIC grant every role inherits). Both are
  // exactly the shape the repository revokes; ignoring them would let a new
  // migration hand a function to every caller and still pass.
  const re =
    /grant\s+(?:execute|all)\s+on\s+function\s+public\.\s*"?([a-z_0-9]+)"?\s*\(([^)]*)\)\s+to\s+([^;]+);/gi;
  for (const match of sql.matchAll(re)) {
    if (/\b(?:anon|authenticated|public)\b/.test(match[3].toLowerCase())) {
      granted.add(`${match[1]}(${normalizeArgs(match[2])})`);
    }
  }
  return granted;
}

function revokedFromClients(sql: string): Set<string> {
  const revoked = new Set<string>();
  const re =
    /revoke\s+all\s+on\s+function\s+public\.\s*"?([a-z_0-9]+)"?\s*\(([^)]*)\)\s+from\s+([^;]+);/gi;
  for (const match of sql.matchAll(re)) {
    const roles = match[3].toLowerCase();
    if (/\banon\b/.test(roles) && /\bauthenticated\b/.test(roles)) {
      revoked.add(`${match[1]}(${normalizeArgs(match[2])})`);
    }
  }
  return revoked;
}

test("the grant matcher sees `grant all` and `to public` (self-test)", () => {
  const granted = (sql: string) => [...grantedToClients(sql)];
  assert.deepEqual(granted("grant execute on function public.f(text) to anon;"), ["f(text)"]);
  assert.deepEqual(granted("grant all on function public.f(text) to anon;"), ["f(text)"]);
  assert.deepEqual(granted("grant execute on function public.f(text) to public;"), ["f(text)"]);
  assert.deepEqual(granted("grant execute on function public.f(text) to service_role;"), []);
});

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
