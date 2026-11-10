import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

/**
 * The employer-verification boundary (#418 account journey, the security layer
 * micro-audit of the employer/candidate split).
 *
 * `public.companies.verification_status` is the gate that decides whether an
 * employer's job reaches the public board: `publish_approved_job` and every
 * `public_job_listing`/`public_source_jobs` RPC filter on
 * `verification_status = 'verified'`, and the package entitlement RPCs refuse a
 * company that is not verified. The column defaults to `pending`.
 *
 * What the audit found is not a leak but a dead end: **no code path promotes a
 * company to `verified`**. There is no RPC, no server action and no admin page
 * that writes the column — the only writer is a direct `update public.companies`
 * an operator runs by hand. A self-service employer therefore submits a profile
 * and waits forever; the approval form publishes the *profile* but explicitly
 * leaves verification alone ("Onay profil bilgisini yayımlar; şirketin ayrı
 * doğrulama durumunu değiştirmez").
 *
 * The gates below pin the parts that *are* enforced, so a refactor cannot
 * quietly drop the verification requirement; the last test documents the
 * missing writer as an open `todo` against the owning module.
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
const migrationFiles = listFiles(migrationsDir, /\.sql$/);
const migrations = migrationFiles.map((file) => readFileSync(file, "utf8")).join("\n");
// Split on statement terminators so a pattern cannot match across two unrelated
// statements (which is how a naive `grant[\s\S]*?public.companies` over-matches).
const statements = migrations
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const srcDir = new URL("src/", repoRoot);
const sourceFiles = listFiles(srcDir, /\.(ts|tsx)$/);
const source = sourceFiles.map((file) => readFileSync(file, "utf8")).join("\n");

// ---------------------------------------------------------------------------
// 1. Publishing a job still requires a verified company.
// ---------------------------------------------------------------------------

test("publish_approved_job refuses a company that is not verified", () => {
  const match = migrations.match(
    /create or replace function public\.publish_approved_job[\s\S]*?\$\$;/i,
  );
  assert.ok(match, "publish_approved_job is not defined in the migrations");
  assert.match(
    match[0],
    /verification_status\s*<>\s*'verified'/i,
    "the publish gate no longer checks verification_status",
  );
});

test("the platform job path requires a verified company", () => {
  // `source_site` listings come from the import pipeline and are gated by
  // `is_public_source_job` instead; employer-submitted (`platform`) jobs must
  // still sit behind `verification_status = 'verified'`. Several `create or
  // replace` versions exist, so the effective one is the last.
  const definitions = [
    ...migrations.matchAll(
      /create or replace function public\.search_public_jobs[\s\S]*?\$\$;/gi,
    ),
  ];
  assert.ok(definitions.length > 0, "search_public_jobs is not defined");
  const effective = definitions[definitions.length - 1][0];
  assert.match(
    effective,
    /publication_source\s*=\s*'platform'[\s\S]{0,200}?verification_status\s*=\s*'verified'/i,
    "the platform listing branch no longer requires a verified company",
  );
});

// ---------------------------------------------------------------------------
// 2. `verification_status` is not client-writable, and its admin reader is
//    guarded — the column is server-only state.
// ---------------------------------------------------------------------------

test("no client role is granted update on public.companies", () => {
  const grants = statements.filter(
    (statement) =>
      /^grant\s+update/i.test(statement) && /\bpublic\.companies\b/i.test(statement),
  );
  assert.deepEqual(grants, []);
});

test("admin_list_verified_companies requires a platform administrator", () => {
  const match = migrations.match(
    /create or replace function public\.admin_list_verified_companies[\s\S]*?\$\$;/i,
  );
  assert.ok(match, "admin_list_verified_companies is not defined");
  assert.match(
    match[0],
    /has_platform_role\(\s*'platform_admin'\s*\)/i,
    "the verified-company reader lost its role guard",
  );
});

// ---------------------------------------------------------------------------
// 3. Open gap: nothing promotes a company to `verified`.
// ---------------------------------------------------------------------------

test(
  "some code path promotes a company to `verified`",
  { todo: "employer self-service dead-ends at `pending` — no RPC, action or admin page writes verification_status (owner: the database layer + the product layer, #418)" },
  () => {
    // A writer looks like `update public.companies ... set verification_status = …`.
    const writers = statements.filter(
      (statement) =>
        /^update\s+public\.companies\b/i.test(statement) &&
        /verification_status\s*=/i.test(statement),
    );
    assert.deepEqual(
      writers.map((writer) => writer.slice(0, 60)),
      [],
    );

    // A verification RPC would be called from a server action.
    const verificationRpcs = [
      ...source.matchAll(/rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi),
    ]
      .map((match) => match[1])
      .filter((name) =>
        /^(?:verify_company|set_company_verified|admin_verify_company|approve_company)$/i.test(
          name,
        ),
      );
    assert.deepEqual(verificationRpcs, []);
  },
);
