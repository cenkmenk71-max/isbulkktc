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
 * The audit answered the first (no — the column grant is per-column and omits
 * `status`) and the second (no — `signIn` never reads the row), plus a third
 * the owner's brief named directly: there is no deletion path at all, so a
 * "closed" account is a status nobody can reach.
 *
 * The gates below pin what *is* enforced and record the two open gaps as
 * `todo`s against the owning modules, so a refactor cannot quietly widen the
 * column grant or drop the status re-checks that already exist.
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

test(
  "an account can actually be suspended or closed",
  { todo: "profiles.status defaults to 'active' and no migration, RPC or action ever writes another value, so suspended/closed are unreachable and the status re-checks guard a state that cannot occur (owner: the database layer + the auth layer, #400)" },
  () => {
    // The column is only useful if something can move a row off `active`.
    // A writer is an `update ... profiles ... set ... status` statement or an
    // admin RPC that sets it; both are absent today.
    const statusWriters = statements.filter(
      (statement) =>
        /\bupdate\s+public\.profiles\b/i.test(statement) &&
        /\bstatus\s*=/i.test(statement),
    );
    assert.ok(
      statusWriters.length > 0,
      "no statement ever writes profiles.status, so 'suspended'/'closed' are dead states",
    );
  },
);

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
// 4. Open gap: there is no deletion path at all.
// ---------------------------------------------------------------------------

test(
  "a self-service account-deletion path exists",
  { todo: "no RPC, action or UI deletes a profile; KVKK/GDPR erasure is unmet (owner: the database layer + the auth layer, #400)" },
  () => {
    const deletionStatements = statements.filter(
      (statement) =>
        /\bdelete\s+from\s+auth\.users\b/i.test(statement) ||
        /\bdelete\s+from\s+public\.profiles\b/i.test(statement),
    );
    assert.deepEqual(
      deletionStatements.map((statement) => statement.slice(0, 60)),
      [],
    );

    const deletionRpcs = [...source.matchAll(/rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi)]
      .map((match) => match[1])
      .filter((name) =>
        /^(?:delete_account|delete_my_account|erase_account|close_account|anonymize_account)$/i.test(
          name,
        ),
      );
    assert.deepEqual(deletionRpcs, []);
  },
);

// ---------------------------------------------------------------------------
// 5. Open gap: API error responses may still be shared-cacheable (#424 M-03).
// ---------------------------------------------------------------------------

test(
  "an API route that can answer an error forbids shared caching",
  { todo: "error responses (4xx/5xx) from /api/push/subscriptions, /api/push/dispatch and /api/email/engagement-digest carry no Cache-Control of their own, so Vercel's `public, max-age=0, must-revalidate` stands (owner: the CI/infra layer/the product layer, #424/#435)" },
  () => {
    // #424 M-03 measured `public, max-age=0, must-revalidate` on 405/401/400
    // responses. The route files own the success path but not the error path:
    // `/api/email/unsubscribe`'s 400 (bad signature) still carries no `no-store`
    // while its 200 does. A route that can return an error should say so for
    // every response, or a CDN rule can start caching it.
    const routePattern = /\/src\/app\/api\/.+\/route\.tsx?$/;
    const errorStatus = /status:\s*[45]\d\d\b/;
    const routesWithErrors = sourceFiles
      .filter((path) => routePattern.test(path))
      .filter((path) => errorStatus.test(readFileSync(path, "utf8")));
    assert.ok(routesWithErrors.length >= 2, "expected API routes with error paths to be discovered");
    const unguarded = routesWithErrors.filter((path) => !/no-store/.test(readFileSync(path, "utf8")));
    assert.deepEqual(
      unguarded.map(relative),
      [],
      "an API route can answer 4xx/5xx without forbidding shared caching",
    );
  },
);
