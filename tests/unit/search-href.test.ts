import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicJobSearchHref } from "../../src/features/jobs/search-href";
import { publicJobSearchSchema } from "../../src/features/jobs/schemas";

test("shared job pagination href preserves filters for home and jobs routes", () => {
  const filters = publicJobSearchSchema.parse({
    query: "C++ & design",
    district: "Girne",
    jobType: "full_time",
    workplaceMode: "remote",
  });

  const search = "query=C%2B%2B+%26+design&district=Girne&jobType=full_time&workplaceMode=remote&page=2";
  assert.equal(buildPublicJobSearchHref(filters, 2, ""), `?${search}`);
  assert.equal(buildPublicJobSearchHref(filters, 2, "/jobs"), `/jobs?${search}`);
});

test("shared job pagination href emits a page even without active filters", () => {
  const filters = publicJobSearchSchema.parse({});

  assert.equal(buildPublicJobSearchHref(filters, 1, ""), "?page=1");
  assert.equal(buildPublicJobSearchHref(filters, 1, "/jobs"), "/jobs?page=1");
});
