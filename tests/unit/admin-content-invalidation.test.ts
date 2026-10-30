import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * The managed-content console only becomes dynamic if every write path also
 * drops the `unstable_cache` entry it invalidated. `unstable_cache` persists to
 * disk (`.next/dev/cache/fetch-cache`) and survives a server restart, so a write
 * that saves to Postgres but skips `revalidateTag` leaves the previous values
 * on screen for up to `CONTENT_REVALIDATE_SECONDS`. These assertions pin the
 * contract: the actions file calls `revalidateTag` for the tag of every content
 * type it writes, and it never reintroduces the deprecated single-argument form.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const actionsSource = readFileSync(
  path.join(REPO_ROOT, "src/features/editorial/admin-content-actions.ts"),
  "utf8",
);
const dalSource = readFileSync(
  path.join(REPO_ROOT, "src/server/dal/content.ts"),
  "utf8",
);

test("the content DAL declares one cache tag per managed content type", () => {
  for (const [key, value] of [
    ["legal", "managed-content:legal"],
    ["faq", "managed-content:faq"],
    ["plans", "managed-content:plans"],
    ["directory", "managed-content:directory"],
  ] as const) {
    assert.match(
      dalSource,
      new RegExp(`${key}:\\s*"${value}"`),
      `CONTENT_TAGS.${key} must be "${value}"`,
    );
  }
});

test("the content DAL reads every managed type under its own tag", () => {
  for (const tag of ["CONTENT_TAGS.legal", "CONTENT_TAGS.faq", "CONTENT_TAGS.plans", "CONTENT_TAGS.directory"]) {
    assert.ok(
      dalSource.includes(`tags: [${tag}]`),
      `${tag} must be attached to its unstable_cache read`,
    );
  }
});

test("every write action invalidates the cache before returning", () => {
  const writeActions = [
    "saveLegalDocument",
    "saveFaqEntry",
    "deleteFaqEntry",
    "saveListingPlan",
  ];
  for (const action of writeActions) {
    const start = actionsSource.indexOf(`export async function ${action}(`);
    assert.ok(start !== -1, `${action} must exist`);
    const next = actionsSource.indexOf("export async function ", start + 1);
    const body = actionsSource.slice(start, next === -1 ? undefined : next);
    assert.match(
      body,
      /invalidateContent\(\[CONTENT_TAGS\.\w+\]\)/,
      `${action} must call invalidateContent with the matching tag`,
    );
  }
});

test("the invalidation helper passes the required cache-life profile", () => {
  // Next 16 requires the second argument; the legacy single-argument form is
  // deprecated and would silently serve stale data.
  assert.match(
    actionsSource,
    /revalidateTag\(tag,\s*\{\s*expire:\s*0\s*\}\)/,
    "revalidateTag must be called with an explicit { expire: 0 } profile",
  );
  assert.doesNotMatch(
    actionsSource,
    /revalidateTag\([^,)]*\)/,
    "no revalidateTag call may omit the cache-life profile",
  );
});

test("the console route is dynamic and never prerendered", () => {
  const pageSource = readFileSync(
    path.join(REPO_ROOT, "src/app/[locale]/(admin)/admin/content/page.tsx"),
    "utf8",
  );
  assert.match(pageSource, /export const dynamic = "force-dynamic"/);
});
