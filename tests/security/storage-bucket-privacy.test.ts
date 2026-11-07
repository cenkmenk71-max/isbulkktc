import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * Storage bucket privacy.
 *
 * `docs/threat-model.md` claims the private buckets carry no upload/download RLS
 * policy (platform default deny) and lists a "negative Storage test" as the
 * control — but that control only existed in the pgTAP suite, which needs Docker
 * and a booted local stack. Nothing in the fast `static` job looked at the
 * buckets, so a migration that flipped `private-resumes` to `public = true`, or
 * added a permissive `storage.objects` policy, would ship with every gate green.
 *
 * These checks read the same migration text and pin three invariants:
 *
 *  1. a declared bucket is private (`public = false`) unless it is on the
 *     explicit public allowlist;
 *  2. the two private buckets are declared and stay private;
 *  3. no `storage.objects` policy exists (the buckets rely on default deny) and
 *     no `update storage.buckets` flips a bucket to public.
 *
 * Grep-level by design: it cannot prove runtime behaviour, and it is not a
 * substitute for the pgTAP suite. It exists so the invariant fails on the second
 * a migration lands rather than only after a Docker stack has booted.
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

/** Buckets that are allowed to be world-readable. Everything else must be private. */
const PUBLIC_BUCKETS = new Set(["public-company-assets"]);

/** The buckets the threat model's "no CV / receipt access" claim depends on. */
const PRIVATE_BUCKETS = ["private-resumes", "private-payment-receipts"];

interface Bucket {
  id: string;
  name: string;
  public: boolean;
  file: string;
}

/**
 * Every bucket declared by `insert into storage.buckets (…) values (…), …`.
 *
 * The `values` block runs to the statement's `;` and includes the trailing
 * `on conflict … set public = excluded.public`, whose bare `public` must not be
 * mistaken for a tuple — the tuple pattern requires a leading quoted id.
 */
function declaredBuckets(sql: string, file = "<inline>"): Bucket[] {
  const buckets: Bucket[] = [];
  const statementPattern =
    /insert\s+into\s+storage\.buckets\s*\([^)]*\)\s*values\s*([\s\S]*?);/gi;
  const tuplePattern = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(true|false)\s*\)/g;

  for (const statement of sql.matchAll(statementPattern)) {
    for (const tuple of statement[1].matchAll(tuplePattern)) {
      buckets.push({
        id: tuple[1],
        name: tuple[2],
        public: tuple[3].toLowerCase() === "true",
        file,
      });
    }
  }
  return buckets;
}

/** `update storage.buckets …` statements that set `public = true`. */
function bucketPublicFlips(sql: string): string[] {
  const flips: string[] = [];
  for (const statement of sql.matchAll(/update\s+storage\.buckets[\s\S]*?;/gi)) {
    if (/public\s*=\s*true/i.test(statement[0])) {
      flips.push(statement[0].replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return flips;
}

/** `create policy … on storage.objects` statements. */
function storageObjectPolicies(sql: string): string[] {
  const policies: string[] = [];
  for (const statement of sql.matchAll(/create\s+policy[\s\S]*?;/gi)) {
    if (/on\s+storage\.objects/i.test(statement[0])) {
      policies.push(statement[0].replace(/\s+/g, " ").slice(0, 120));
    }
  }
  return policies;
}

test("the bucket parser sees declared buckets (self-test)", () => {
  const parsed = declaredBuckets(`
    insert into storage.buckets (id, name, public)
    values
      ('private-resumes', 'private-resumes', false),
      ('public-company-assets', 'public-company-assets', true)
    on conflict (id) do update
      set name = excluded.name,
          public = excluded.public;
  `);
  assert.deepEqual(
    parsed.map((b) => [b.id, b.public]),
    [
      ["private-resumes", false],
      ["public-company-assets", true],
    ],
  );
});

test("the storage.objects policy detector sees a policy (self-test)", () => {
  const found = storageObjectPolicies(`
    create policy resumes_read_own
      on storage.objects for select to authenticated
      using (bucket_id = 'private-resumes');
  `);
  assert.equal(found.length, 1);
  // A policy on another table must not be counted.
  assert.deepEqual(
    storageObjectPolicies("create policy p on public.jobs for select using (true);"),
    [],
  );
});

test("the bucket-flip detector sees an update (self-test)", () => {
  assert.equal(
    bucketPublicFlips("update storage.buckets set public = true where id = 'private-resumes';")
      .length,
    1,
  );
  assert.deepEqual(
    bucketPublicFlips("update storage.buckets set public = false where id = 'private-resumes';"),
    [],
  );
});

test("every declared bucket is private unless it is on the public allowlist", () => {
  const offenders = declaredBuckets(allSql)
    .filter((bucket) => bucket.public !== PUBLIC_BUCKETS.has(bucket.id))
    .map((bucket) => `${bucket.id} (public=${bucket.public})`);

  assert.deepEqual(
    offenders,
    [],
    `buckets whose public flag disagrees with the allowlist: ${offenders.join(", ")}`,
  );
});

test("the private buckets are declared and stay private", () => {
  const declared = new Map(declaredBuckets(allSql).map((b) => [b.id, b]));
  const offenders: string[] = [];

  for (const id of PRIVATE_BUCKETS) {
    const bucket = declared.get(id);
    if (!bucket) offenders.push(`${id} (not declared)`);
    else if (bucket.public) offenders.push(`${id} (public=true)`);
  }

  assert.deepEqual(
    offenders,
    [],
    `private buckets missing or world-readable: ${offenders.join(", ")}`,
  );
});

test("no storage.objects policy is declared (default deny)", () => {
  assert.deepEqual(
    storageObjectPolicies(allSql),
    [],
    "a storage.objects policy appeared; the private buckets must stay default-deny until the scanning/access flow is approved",
  );
});

test("no migration flips a bucket to public with an update", () => {
  assert.deepEqual(
    bucketPublicFlips(allSql),
    [],
    "an update storage.buckets sets public = true, bypassing the insert-time allowlist",
  );
});
