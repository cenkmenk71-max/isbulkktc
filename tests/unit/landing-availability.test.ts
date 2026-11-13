import assert from "node:assert/strict";
import test from "node:test";

import {
  availableDistricts,
  availableJobTypes,
  computeLandingAvailability,
} from "../../src/features/jobs/landing-availability";
import { northernCyprusDistrictValues } from "../../src/features/locations/northern-cyprus-districts";
import { jobTypeKeys } from "../../src/features/jobs/job-type-slugs";

test("computeLandingAvailability collects only the facets that have a vacancy", () => {
  const availability = computeLandingAvailability([
    { district: "Lefkoşa", jobType: "full_time" },
    { district: "Girne", jobType: "freelance" },
    { district: "Lefkoşa", jobType: "full_time" },
  ]);

  assert.deepEqual([...availability.districts].sort(), ["Girne", "Lefkoşa"]);
  assert.deepEqual([...availability.jobTypes].sort(), ["freelance", "full_time"]);
});

test("a district-less vacancy still marks its job type available", () => {
  // The RPC allows `district` to be null. A vacancy with no district must not
  // silently drop its employment type from the sitemap: the type landing page
  // does have a result, so it stays indexable and listed.
  const availability = computeLandingAvailability([
    { district: null, jobType: "part_time" },
  ]);

  assert.equal(availability.districts.size, 0);
  assert.deepEqual([...availability.jobTypes], ["part_time"]);
});

test("no vacancies means no landing is available", () => {
  const availability = computeLandingAvailability([]);

  assert.equal(availableDistricts(availability).length, 0);
  assert.equal(availableJobTypes(availability).length, 0);
});

test("availableDistricts preserves the canonical district order", () => {
  // The sitemap and the cross-link block must list districts in one order; a
  // Set's insertion order would follow the vacancy rows instead.
  const availability = computeLandingAvailability([
    { district: "Lefke", jobType: "full_time" },
    { district: "Girne", jobType: "full_time" },
    { district: "Mağusa", jobType: "full_time" },
  ]);

  assert.deepEqual(availableDistricts(availability), ["Mağusa", "Girne", "Lefke"]);
  assert.deepEqual(
    availableDistricts(availability),
    northernCyprusDistrictValues.filter((district) =>
      ["Mağusa", "Girne", "Lefke"].includes(district),
    ),
  );
});

test("availableJobTypes preserves the canonical job-type order", () => {
  const availability = computeLandingAvailability([
    { district: "Girne", jobType: "internship" },
    { district: "Girne", jobType: "full_time" },
  ]);

  assert.deepEqual(availableJobTypes(availability), ["full_time", "internship"]);
  assert.deepEqual(
    availableJobTypes(availability),
    jobTypeKeys.filter((key) => ["full_time", "internship"].includes(key)),
  );
});

test("a fully seeded catalogue leaves every landing available", () => {
  // Guards the regression the other way round: filtering must not drop a facet
  // that does have a vacancy, or the sitemap would omit a page that is indexable.
  const availability = computeLandingAvailability([
    ...northernCyprusDistrictValues.map((district) => ({
      district,
      jobType: "full_time" as const,
    })),
    ...jobTypeKeys.map((jobType) => ({ district: "Lefkoşa" as const, jobType })),
  ]);

  assert.deepEqual(availableDistricts(availability), [...northernCyprusDistrictValues]);
  assert.deepEqual(availableJobTypes(availability), [...jobTypeKeys]);
});
