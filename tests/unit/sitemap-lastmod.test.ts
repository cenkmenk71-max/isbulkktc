import assert from "node:assert/strict";
import test from "node:test";

import { newestJobModifiedAt } from "../../src/features/jobs/sitemap-lastmod";

test("newestJobModifiedAt returns the newest modification instant", () => {
  const newest = newestJobModifiedAt([
    { modifiedAt: "2026-10-20T12:00:00.000Z" },
    { modifiedAt: "2026-10-22T09:30:00.000Z" },
    { modifiedAt: "2026-10-21T00:00:00.000Z" },
  ]);

  assert.equal(newest?.toISOString(), "2026-10-22T09:30:00.000Z");
});

test("newestJobModifiedAt ignores the publication date entirely", () => {
  // The listing routes must advertise the same instant the vacancy entry
  // carries. A vacancy published later but edited earlier is the regression:
  // the old implementation reduced over `publishedAt` and would have picked
  // 2026-10-25 here, disagreeing with the vacancy `<lastmod>`.
  const rows: { modifiedAt: string; publishedAt: string }[] = [
    { modifiedAt: "2026-10-01T00:00:00.000Z", publishedAt: "2026-10-25T00:00:00.000Z" },
    { modifiedAt: "2026-10-02T00:00:00.000Z", publishedAt: "2026-10-03T00:00:00.000Z" },
  ];

  assert.equal(newestJobModifiedAt(rows)?.toISOString(), "2026-10-02T00:00:00.000Z");
});

test("newestJobModifiedAt returns null when there are no vacancies", () => {
  assert.equal(newestJobModifiedAt([]), null);
});
