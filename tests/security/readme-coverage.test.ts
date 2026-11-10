import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

/**
 * The layer's own coverage table (`tests/security/README.md`) is a ratchet.
 *
 * The "What is covered" table is the audit's map of which boundary each file
 * proves. It drifted: four files (`account-lifecycle-surface`,
 * `auth-mail-throttle-surface`, `server-cookie-inventory`, `vercel-deploy-gate`)
 * existed and ran in CI but had no row, so a reader auditing "what does this
 * layer actually test?" saw a smaller surface than the suite covers — the same
 * drift class `cookie-inventory.test.ts` now ratchets for the `NEXT_LOCALE` row
 * (#508). A row naming a file that no longer exists is the mirror image: it
 * advertises coverage the suite does not have.
 *
 * This test fails when either side drifts, so the table cannot silently
 * under- or over-report. It checks file membership only, never the wording.
 */

const securityDir = new URL("./", import.meta.url);
const readmeUrl = new URL("./README.md", import.meta.url);

/** Test files the suite actually runs. */
function filesOnDisk(): string[] {
  return readdirSync(securityDir)
    .filter((name) => name.endsWith(".test.ts"))
    .sort();
}

/**
 * File names listed in the README's "What is covered" table, scoped to that
 * section so a name mentioned in prose elsewhere (the findings table, the
 * guard-self-tests paragraph) is not mistaken for a coverage row.
 */
function filesInCoverageTable(markdown: string): string[] {
  const section = markdown.split(/^## What is covered\s*$/m)[1] ?? "";
  const body = section.split(/^## /m)[0] ?? section;
  const names = new Set<string>();
  for (const match of body.matchAll(/^\|\s*`([^`]+\.test\.ts)`/gm)) names.add(match[1]);
  return [...names].sort();
}

const disk = filesOnDisk();
const documented = filesInCoverageTable(readFileSync(readmeUrl, "utf8"));

test("the coverage-table extractor reads rows and ignores prose (self-test)", () => {
  const sample = [
    "## What is covered",
    "",
    "| File | Boundary |",
    "|---|---|",
    "| `open-redirect.test.ts` | x |",
    "| `sql-hardening.test.ts` | mentions `other.test.ts` inline |",
    "",
    "## Findings",
    "",
    "| Finding | Owner | Status |",
    "|---|---|---|",
    "| `stale.test.ts` lacks a guard | LANE-URUN | open |",
  ].join("\n");
  assert.deepEqual(filesInCoverageTable(sample), [
    "open-redirect.test.ts",
    "sql-hardening.test.ts",
  ]);
});

test("every security test file has a row in the coverage table", () => {
  const missing = disk.filter((file) => !documented.includes(file));
  assert.deepEqual(missing, [], `security test files with no README row: ${missing.join(", ")}`);
});

test("the coverage table names no test file that does not exist", () => {
  const stale = documented.filter((file) => !disk.includes(file));
  assert.deepEqual(stale, [], `README rows for missing test files: ${stale.join(", ")}`);
});
