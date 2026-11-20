import assert from "node:assert/strict";
import test from "node:test";

import { installBoundaryMocks, recorded, resetBoundary } from "./support/harness";

installBoundaryMocks();

const dal = () => import("@/server/dal/jobs");

test("public job search preserves a valid empty catalogue as an empty result", async () => {
  resetBoundary({
    rpcs: {
      search_public_jobs: {
        data: { jobs: [], total: 0, page: 1, pageSize: 20 },
        error: null,
      },
    },
  });

  const { searchPublicJobs } = await dal();
  const result = await searchPublicJobs({});

  assert.deepEqual(result, { jobs: [], total: 0, page: 1, pageSize: 20 });
  assert.equal(
    recorded.supabase.filter(
      (call) => call.kind === "rpc" && call.name === "search_public_jobs",
    ).length,
    1,
  );
});

test("public job search rejects an RPC outage instead of returning a false empty catalogue", async () => {
  resetBoundary({
    rpcs: {
      search_public_jobs: {
        data: null,
        error: { code: "XX000", message: "simulated database outage" },
      },
    },
  });

  const { PublicJobDataUnavailableError, searchPublicJobs } = await dal();
  await assert.rejects(
    searchPublicJobs({}),
    PublicJobDataUnavailableError,
  );
});

test("public job detail preserves a genuine missing listing as null", async () => {
  resetBoundary({
    rpcs: {
      get_public_job_details: { data: null, error: null },
    },
  });

  const { getPublicJobBySlug } = await dal();
  assert.equal(await getPublicJobBySlug("missing-listing"), null);
});

test("public job detail rejects an RPC outage instead of converting it to not-found", async () => {
  resetBoundary({
    rpcs: {
      get_public_job_details: {
        data: null,
        error: { code: "XX000", message: "simulated database outage" },
      },
    },
  });

  const { PublicJobDataUnavailableError, getPublicJobBySlug } = await dal();
  await assert.rejects(
    getPublicJobBySlug("existing-listing"),
    PublicJobDataUnavailableError,
  );
});

test("job sitemap rejects catalogue outages instead of publishing a vacancy-free sitemap", async () => {
  resetBoundary({
    rpcs: {
      search_public_jobs: {
        data: null,
        error: { code: "XX000", message: "simulated database outage" },
      },
    },
  });

  const { PublicJobDataUnavailableError, listPublicJobSitemapEntries } =
    await dal();
  await assert.rejects(
    listPublicJobSitemapEntries(),
    PublicJobDataUnavailableError,
  );
});

test("public job previews reject catalogue outages instead of returning no previews", async () => {
  resetBoundary({
    rpcs: {
      search_public_job_previews: {
        data: null,
        error: { code: "XX000", message: "simulated database outage" },
      },
    },
  });

  const { PublicJobDataUnavailableError, searchPublicJobPreviews } =
    await dal();
  await assert.rejects(
    searchPublicJobPreviews({}),
    PublicJobDataUnavailableError,
  );
});

test("public company directory rejects job-catalogue outages instead of returning an empty directory", async () => {
  resetBoundary({
    rpcs: {
      search_public_job_companies: {
        data: null,
        error: { code: "XX000", message: "simulated database outage" },
      },
    },
  });

  const { PublicJobDataUnavailableError, getPublicJobCompanies } = await dal();
  await assert.rejects(
    getPublicJobCompanies(),
    PublicJobDataUnavailableError,
  );
});
