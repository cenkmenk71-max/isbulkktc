import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
 * The gates below pin the parts that *are* enforced, so a refactor cannot
 * quietly drop the verification requirement or the administrative decision
 * boundary.
 */

const repoRoot = new URL("../../", import.meta.url);

function listFiles(directory: URL, suffix: RegExp): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = new URL(entry, directory);
    if (statSync(path).isDirectory()) files.push(...listFiles(new URL(`${entry}/`, directory), suffix));
    else if (suffix.test(entry)) files.push(fileURLToPath(path));
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
// 3. Company verification decisions are restricted to the admin boundary.
// ---------------------------------------------------------------------------

test("the verification writer is MFA-gated, narrow, and audited", () => {
  const match = migrations.match(
    /create or replace function public\.review_company_verification[\s\S]*?\$\$;/i,
  );
  assert.ok(match, "review_company_verification is not defined");
  assert.match(match[0], /security definer/i);
  assert.match(match[0], /set search_path\s*=\s*''/i);
  assert.match(
    match[0],
    /v_actor_id is null\s+or not public\.has_platform_role\(\s*'platform_admin'\s*\)/i,
    "the writer is not guarded by an active MFA-verified platform role",
  );
  assert.match(
    match[0],
    /_decision not in \(\s*'verified'\s*,\s*'rejected'\s*\)/i,
    "the writer accepts a status outside the reviewed decision set",
  );
  assert.match(match[0], /for update/i, "the company row is not locked");
  assert.match(match[0], /insert into public\.audit_logs/i);
  assert.match(match[0], /metadata_redacted/i);
});

test("the verification action and admin page use the guarded review RPC", () => {
  const action = readFileSync(
    new URL("src/features/companies/actions.ts", repoRoot),
    "utf8",
  );
  const form = readFileSync(
    new URL(
      "src/features/companies/company-verification-review-form.tsx",
      repoRoot,
    ),
    "utf8",
  );
  const page = readFileSync(
    new URL(
      "src/app/[locale]/(admin)/admin/company-profiles/page.tsx",
      repoRoot,
    ),
    "utf8",
  );

  assert.match(action, /companyVerificationReviewSchema\.safeParse/);
  assert.match(action, /hasAssignedPlatformRole\("platform_admin"\)/);
  assert.match(action, /rpc\("review_company_verification"/);
  assert.match(form, /reviewCompanyVerification/);
  assert.match(form, /value="verified"/);
  assert.match(form, /value="rejected"/);
  assert.match(page, /getAdminCompanyProfileReviewQueues/);
  assert.match(page, /CompanyVerificationReviewForm/);
});
