import assert from "node:assert/strict";
import test from "node:test";

import { resolveJobDateModified } from "../../src/features/jobs/job-modified-at";

const PUBLISHED = "2026-10-20T12:00:00.000Z";

test("resolveJobDateModified passes a truthful modification date through", () => {
  assert.equal(
    resolveJobDateModified("2026-10-22T09:30:00.000Z", PUBLISHED),
    "2026-10-22T09:30:00.000Z",
  );
});

test("resolveJobDateModified degrades to datePosted when the value is absent", () => {
  // Google Jobs rejects dateModified < datePosted, so an unknown value must not
  // be emitted as an empty string; it collapses to the publication instant.
  assert.equal(resolveJobDateModified(null, PUBLISHED), PUBLISHED);
  assert.equal(resolveJobDateModified(undefined, PUBLISHED), PUBLISHED);
  assert.equal(resolveJobDateModified("", PUBLISHED), PUBLISHED);
  assert.equal(resolveJobDateModified("   ", PUBLISHED), PUBLISHED);
});

test("resolveJobDateModified never emits a modification before publication", () => {
  assert.equal(
    resolveJobDateModified("2026-10-01T00:00:00.000Z", PUBLISHED),
    PUBLISHED,
  );
});
