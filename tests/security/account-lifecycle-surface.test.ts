import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * The account-lifecycle boundary (#418 "account journey" micro-audit,
 * the security layer).
 *
 * `public.profiles.status` is `active | suspended | closed` and nearly every
 * write RPC re-checks `status = 'active'` before it will act, so the column is
 * the account's kill switch. Two questions decide whether that switch is real:
 * can a client flip it, and does anything act on it at sign-in?
 *
 * The gates below pin what *is* enforced and keep the still-open status-transition
 * gap visible as a `todo`, so a refactor cannot quietly widen the column grant
 * or drop the status re-checks that already exist. Account deletion has a
 * separate positive gate below; its retention/FK limitations remain documented.
 */

const repoRoot = new URL("../../", import.meta.url);

function listFiles(directory: URL, suffix: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...listFiles(new URL(`${entry}/`, directory), suffix));
    else if (suffix.test(entry)) files.push(path.pathname);
  }
  return files;
}

const migrationsDir = new URL("supabase/migrations/", repoRoot);
const migrations = listFiles(migrationsDir, /\.sql$/)
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");
const statements = migrations
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const srcDir = new URL("src/", repoRoot);
const sourceFiles = listFiles(srcDir, /\.(ts|tsx)$/);
const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

function relative(path: string): string {
  return path.slice(path.indexOf("/src/") + 1);
}

// ---------------------------------------------------------------------------
// 1. The kill switch is not client-writable.
// ---------------------------------------------------------------------------

test("profiles.status is not grantable to a client role", () => {
  // `20261013000000_v4_identity_companies_security.sql` grants UPDATE on
  // `profiles` column-by-column: `grant update (display_name, locale)`. A
  // table-wide `grant update on public.profiles` would hand every authenticated
  // user the ability to un-suspend themselves, so the column list is the guard.
  const tableWide = statements.filter(
    (statement) =>
      /^grant\s+update/i.test(statement) &&
      /\bon\s+table\s+public\.profiles\b/i.test(statement) &&
      !/\(/i.test(statement.slice(0, statement.indexOf("on table"))),
  );
  assert.deepEqual(
    tableWide.map((statement) => statement.slice(0, 60)),
    [],
    "a table-wide UPDATE grant on public.profiles would expose the status column",
  );

  // The only column-level grant must not name `status`.
  const columnGrants = statements.filter(
    (statement) =>
      /^grant\s+update\s*\(/i.test(statement) &&
      /\bon\s+table\s+public\.profiles\b/i.test(statement),
  );
  assert.ok(columnGrants.length > 0, "the profiles column grant disappeared");
  for (const grant of columnGrants) {
    const columns = grant.slice(grant.indexOf("(") + 1, grant.indexOf(")"));
    assert.doesNotMatch(
      columns,
      /\bstatus\b/i,
      `a client role is granted UPDATE on profiles.status: ${grant.slice(0, 80)}`,
    );
  }
});

test("the write RPCs still refuse a non-active profile", () => {
  // These RPCs gate on the caller's own row being `active`; if one loses the
  // check a suspended account can keep acting through that RPC.
  const guarded = ["create_company", "register_push_subscription"];
  for (const name of guarded) {
    const match = migrations.match(
      new RegExp(
        `create or replace function public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
        "i",
      ),
    );
    assert.ok(match, `${name} is not defined in the migrations`);
    assert.match(
      match[0],
      /\.status\s*=\s*'active'/i,
      `${name} no longer requires an active profile`,
    );
  }
});

// ---------------------------------------------------------------------------
// 2. Open gap: nothing can flip the kill switch in the first place.
// ---------------------------------------------------------------------------

test("account suspension and closure remain an explicit, tested product gap", () => {
  // The application checks profiles.status at sign-in and in write RPCs, but
  // there is not yet an approved admin/API transition that changes that status.
  // Keep this as a passing, intentional finding rather than a failing TODO test:
  // when the transition feature is added, replace this assertion with positive
  // tests for authorised suspension, closure, audit logging and session revocation.
  function isProfileStatusWriter(statement: string): boolean {
    const sql = statement
      .replace(/^\s*--.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    return (
      /\bupdate\s+public\.profiles\b/i.test(sql) &&
      /\bstatus\s*=/i.test(sql)
    );
  }

  const statusWriters = statements.filter(isProfileStatusWriter);

  // Prove the detector recognises a real SQL writer but ignores commented-out
  // examples. This prevents the test from passing vacuously due to bad escaping.
  const representativeWriter =
    "update public.profiles set status = 'suspended' where id = auth.uid();";
  assert.equal(isProfileStatusWriter(representativeWriter), true);
  assert.equal(
    isProfileStatusWriter(["-- update public.profiles set status = 'closed';", "select 1;"].join("\n")),
    false,
  );
  assert.equal(
    isProfileStatusWriter("/* update public.profiles set status = 'closed'; */ select 1;"),
    false,
  );

  assert.equal(
    statusWriters.length,
    0,
    "a status transition writer has been added; replace this finding test with positive transition tests",
  );
});

// ---------------------------------------------------------------------------
// 3. The kill switch is consulted at sign-in (closed by the auth layer in #542).
//
// This was an open finding: `signIn` called `signInWithPassword` and redirected
// without reading `profiles.status`, so a suspended/closed account still got a
// working session. The auth layer closed it in `19f197f` (`#542`) by reading the
// caller's own row and dropping the session when the account is not active.
// The `todo` is gone; the assertion is now a gate, so the read cannot be
// removed without turning the suite red.
// ---------------------------------------------------------------------------

test("the signIn extractor ignores a regex-literal decoy (self-test)", () => {
  // `source` is every `src/**` file concatenated, and a sibling test file writes
  // the shape `/export async function signIn\b…/` as a regex literal. A `signIn\b`
  // pattern matched that literal, so the gate below asserted against a copy of
  // itself and could never fail on the real code. Requiring the open paren of a
  // declaration keeps the match on `actions.ts`.
  const decoy =
    'const signIn = source.match(/export async function signIn\\b[\\s\\S]*?\\n\\}/);';
  assert.equal(/export async function signIn\([\s\S]*?\n\}/.test(decoy), false);
  const real = "export async function signIn(\n  a: string,\n) {\n  return a;\n}";
  assert.ok(/export async function signIn\([\s\S]*?\n\}/.test(real));
});

test("sign-in refuses an account whose profile is not active", () => {
  const signIn = source.match(/export async function signIn\([\s\S]*?\n\}/);
  assert.ok(signIn, "signIn is not defined");
  assert.ok(
    signIn[0].includes("signInWithPassword"),
    "signIn extraction matched a decoy, not the function in actions.ts",
  );
  // A fix must read the caller's own profile row *and* act on its status. The
  // read alone is not enough: a suspended account must not keep the session, so
  // the block path has to sign the caller out. The two calls are pinned in
  // order — `isAccountBlocked` followed within a short window by `signOut()` —
  // so removing the sign-out (and leaving only the read) turns the gate red.
  assert.match(
    signIn[0],
    /from\(\s*["'`]profiles["'`]\)[\s\S]{0,300}?status/i,
    "signIn does not check profiles.status before granting a session",
  );
  assert.match(
    signIn[0],
    /isAccountBlocked\([\s\S]{0,160}?signOut\s*\(/,
    "signIn reads profiles.status but never signs the blocked caller out, so a suspended account keeps its session",
  );
});

// ---------------------------------------------------------------------------
// 4. Session-bound deletion path; retention and reauthentication remain open.
// ---------------------------------------------------------------------------

test("account deletion is session-bound, rate-limited and uses the service role", () => {
  const actionsPath = new URL("../../src/features/identity/actions.ts", import.meta.url);
  const actions = readFileSync(actionsPath, "utf8");
  const deletion = actions.match(/export async function deleteAccount\(\)[\s\S]*?\n\}/);

  assert.ok(deletion, "deleteAccount must remain a server action");
  assert.match(deletion[0], /createSupabaseServerClient\(\{\s*allowCookieWrites:\s*true\s*\}\)/);
  assert.match(deletion[0], /supabase\.auth\.getUser\(\)/);
  assert.match(deletion[0], /deleteAccountThrottle\.address\.check/);
  assert.match(deletion[0], /deleteAccountThrottle\.user\.check/);
  assert.match(deletion[0], /createSupabaseServiceClient\(\)/);
  assert.match(deletion[0], /auth\.admin\.deleteUser\(user\.id\)/);
  assert.match(deletion[0], /supabase\.auth\.signOut\(\)/);
  assert.match(deletion[0], /cookieStore\.delete\(cookie\.name\)/);
  assert.doesNotMatch(deletion[0], /\bfetch\s*\(/, "the action must not create a second cookie-less HTTP request");

  assert.ok(
    !sourceFiles.some((path) => relative(path) === "src/app/api/account/delete/route.ts"),
    "the unreferenced internal HTTP delete route should not remain exposed",
  );
});

// ---------------------------------------------------------------------------
// 5. API error responses must not be shared-cacheable (#424 M-03, #435).
// ---------------------------------------------------------------------------

test("an API route that can answer an error forbids shared caching", () => {
  const routePattern = /\/src\/app\/api\/.+\/route\.tsx?$/;
  const errorStatus = /status:\s*[45]\d\d\b/;
  const routesWithErrors = sourceFiles
    .filter((path) => routePattern.test(path))
    .filter((path) => errorStatus.test(readFileSync(path, "utf8")));
  assert.ok(routesWithErrors.length >= 2, "expected API routes with error paths to be discovered");
  const unguarded = routesWithErrors.filter((path) => {
    const route = readFileSync(path, "utf8");
    return !/no-store/i.test(route) && !/\b(?:json|text)NoStore\s*\(/.test(route);
  });
  assert.deepEqual(
    unguarded.map(relative),
    [],
    "an API route can answer 4xx/5xx without forbidding shared caching",
  );
});
