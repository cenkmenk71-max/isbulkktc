import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchIskibrisJobs,
  fetchIsbulkibrisJobs,
} from "../../src/features/jobs/source-job-fetchers";

/**
 * The source fetchers had no test at all (481 lines) and they sit on the one
 * path where a bug deletes live data: the importer treats "the fetcher returned
 * nothing" as "these listings are gone". So the contract that matters most is
 * the one the code comments call out — an unreachable source must **abort**, not
 * return an empty array — and every other rule is pinned next to it: pagination
 * stop conditions, the record mapping, the liveness filters, and the retry that
 * keeps one throttled request from dropping a live listing.
 *
 * `fetch` is the only thing replaced; the real mapping helpers
 * (`source-job-import.ts`) run as written. Timings are kept small: one item per
 * page and `concurrency: 1`, so the built-in pacing sleeps stay short.
 */

const NOW = Date.parse("2026-06-01T00:00:00.000Z");

/** A detail that passes every liveness filter at `NOW`. */
function iskibrisDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    title: "Garson",
    body: "<p>Sunum ve servis yapılır, müşteri karşılama ve sipariş takibi.</p>",
    active: 1,
    is_published: 1,
    archived: 0,
    status: "active",
    published_at: "2026-05-01T00:00:00.000Z",
    endDate: "2026-07-01T00:00:00.000Z",
    employment_name: "Tam Zamanlı",
    company_id: 9,
    company: {
      name: "Acme Ltd",
      website: "https://acme.example",
      sector: { name_tr: "Turizm" },
      headquarter_place_name: "Girne",
    },
    place_name: "Girne",
    ...overrides,
  };
}

function isbulkibrisDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "abc",
    title: "Developer",
    description: "<p>Build and ship the platform with the team.</p>",
    employmentType: "full_time",
    remote: true,
    locationName: "Lefkoşa",
    publishedAt: "2026-05-01T00:00:00.000Z",
    expiresAt: "2026-07-01T00:00:00.000Z",
    professionGroupName: "IT",
    professionName: "Backend",
    company: {
      id: "c1",
      slug: "acme",
      name: "Acme",
      website: "https://acme.example",
      about: "We build.",
    },
    ...overrides,
  };
}

/**
 * Replaces `globalThis.fetch` and fast-forwards `setTimeout` for the duration of
 * `run`. `handler` sees the URL and the 1-based call count; both globals are
 * always restored.
 *
 * The fetcher paces its requests and backs off between retries with real
 * `sleep()` calls. Those are timing, not logic — the attempt counts that the
 * tests assert on are driven by call order, not by the clock — so collapsing
 * them keeps the whole file at ~20ms instead of ~10s in the fast gate. The one
 * thing that must not change is the retry *sequence*; fast-forwarding leaves it
 * intact.
 */
async function withFetch<T>(
  handler: (url: string, call: number) => Response,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let call = 0;
  globalThis.setTimeout = ((fn: () => void) => {
    fn();
    return 0;
  }) as typeof setTimeout;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    call += 1;
    return handler(String(input), call);
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

// ---------------------------------------------------------------------------
// 1. An unreachable source aborts; it never reports "no listings".
// ---------------------------------------------------------------------------

test("an unreachable first page aborts instead of returning zero listings", async () => {
  // A 5xx is transient, so the fetcher retries it — four times before giving up
  // (`maxAttempts` in `fetchJson`). The count is asserted so that "retried" and
  // "gave up immediately" cannot be confused: the point of the retry is that one
  // throttled response does not look like "the source is empty".
  let attempts = 0;
  await assert.rejects(
    () =>
      withFetch(
        () => {
          attempts += 1;
          return new Response("upstream error", { status: 500 });
        },
        () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
      ),
    /iskibris ilan listesi alınamadı/,
  );
  assert.equal(attempts, 4, "a transient 5xx must be retried, not treated as permanent");

  await assert.rejects(
    () =>
      withFetch(
        () => new Response("upstream error", { status: 500 }),
        () => fetchIsbulkibrisJobs({ now: NOW, concurrency: 1 }),
      ),
    /isbulkibris ilan listesi alınamadı/,
  );
});

test("a permanent 4xx is not retried", async () => {
  // A 404 will not succeed on retry; retrying it would only add latency. The
  // single call is the observable difference from the transient case above.
  let attempts = 0;
  await assert.rejects(
    () =>
      withFetch(
        () => {
          attempts += 1;
          return new Response("not found", { status: 404 });
        },
        () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
      ),
    /iskibris ilan listesi alınamadı/,
  );
  assert.equal(attempts, 1, "a non-transient 4xx must fail fast");
});

test("an empty first page is a real zero, not an abort", async () => {
  const jobs = await withFetch(
    () => json({ data: [], next_page_url: null }),
    () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
  );
  assert.deepEqual(jobs, [], "a source that answers with no listings returns []");
});

// ---------------------------------------------------------------------------
// 2. Pagination stops on the source's own signal.
// ---------------------------------------------------------------------------

test("pagination follows next_page_url and stops when it clears", async () => {
  const pages: string[] = [];
  const jobs = await withFetch(
    (url) => {
      pages.push(url);
      const page = Number(new URL(url).searchParams.get("page") ?? "1");
      if (page === 1) {
        return json({ data: [{ id: 1 }], next_page_url: "https://api.iskibris.com/api/v2/jobs/paginated?page=2" });
      }
      if (page === 2) {
        return json({ data: [{ id: 2 }], next_page_url: null });
      }
      return json({ data: [], next_page_url: null });
    },
    () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
  );

  assert.equal(
    pages.filter((url) => url.includes("/paginated?page=")).length,
    2,
    "the second page must be fetched, and the third must not",
  );
  // Both details are unreachable here, so no record survives; the point is the
  // page walk, not the records.
  assert.deepEqual(jobs, []);
});

// ---------------------------------------------------------------------------
// 3. The record mapping — the field each value lands in.
// ---------------------------------------------------------------------------

test("an iskibris detail maps to a source record field by field", async () => {
  const jobs = await withFetch(
    (url) =>
      url.includes("paginated")
        ? json({ data: [{ id: 1 }], next_page_url: null })
        : json(iskibrisDetail()),
    () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
  );

  assert.equal(jobs.length, 1);
  const record = jobs[0];
  assert.equal(record.source, "iskibris");
  assert.equal(record.sourceJobId, "1");
  assert.equal(record.title, "Garson");
  assert.equal(record.slug, "source-iskibris-garson");
  assert.equal(record.jobType, "full_time");
  assert.equal(record.district, "Girne");
  assert.equal(record.publishedAt, "2026-05-01T00:00:00.000Z");
  assert.equal(record.expiresAt, "2026-07-01T00:00:00.000Z");
  // The employer block, including the source profile URL and category.
  assert.equal(record.employer.name, "Acme Ltd");
  assert.equal(record.employer.municipality, "Girne");
  assert.deepEqual(record.employer.categories, ["Turizm"]);
  assert.equal(record.employer.sourceProfileUrl, "https://www.iskibris.com/companies/9");
  assert.equal(record.employer.website, "https://acme.example/");
});

test("an isbulkibris detail maps to a source record field by field", async () => {
  const jobs = await withFetch(
    (url) =>
      url.includes("api/jobs?")
        ? json({ items: [{ id: "abc" }] })
        : json(isbulkibrisDetail()),
    () => fetchIsbulkibrisJobs({ now: NOW, concurrency: 1 }),
  );

  assert.equal(jobs.length, 1);
  const record = jobs[0];
  assert.equal(record.source, "isbulkibris");
  assert.equal(record.sourceJobId, "abc");
  assert.equal(record.title, "Developer");
  assert.equal(record.jobType, "full_time");
  assert.equal(record.workplaceMode, "remote");
  assert.equal(record.district, "Lefkoşa");
  assert.deepEqual(record.employer.categories, ["IT", "Backend"]);
  assert.equal(record.employer.sourceProfileUrl, "https://isbulkibris.com/firmalar/acme");
  // The source publishes no modification date; the importer must not invent one.
  assert.equal(record.sourceUpdatedAt, null);
});

// ---------------------------------------------------------------------------
// 4. The liveness filters — a dead listing must not reach the importer.
// ---------------------------------------------------------------------------

for (const [label, override] of [
  ["inactive", { active: 0 }],
  ["unpublished", { is_published: 0 }],
  ["archived", { archived: 1 }],
  ["soft-deleted", { deleted_at: "2026-05-01T00:00:00.000Z" }],
  ["not status active", { status: "closed" }],
  ["already expired", { endDate: "2026-05-01T00:00:00.000Z" }],
  ["not yet published", { published_at: "2026-08-01T00:00:00.000Z" }],
  ["missing a title", { title: "" }],
  ["an unknown employment type", { employment_name: "Bilinmeyen" }],
  ["no company id", { company_id: null }],
] as const) {
  test(`an iskibris listing that is ${label} is dropped`, async () => {
    const jobs = await withFetch(
      (url) =>
        url.includes("paginated")
          ? json({ data: [{ id: 1 }], next_page_url: null })
          : json(iskibrisDetail(override)),
      () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
    );
    assert.deepEqual(jobs, [], `${label} must not become a source record`);
  });
}

// ---------------------------------------------------------------------------
// 5. A transient failure is retried; a permanent one drops only its own listing.
// ---------------------------------------------------------------------------

test("a detail that fails once transiently is recovered by the retry", async () => {
  let detailAttempts = 0;
  const jobs = await withFetch(
    (url) => {
      if (url.includes("paginated")) {
        return json({ data: [{ id: 1 }], next_page_url: null });
      }
      detailAttempts += 1;
      // The first attempt is a transient 500; the retry inside `fetchJson`
      // succeeds, so the listing survives.
      return detailAttempts === 1
        ? new Response("upstream error", { status: 500 })
        : json(iskibrisDetail());
    },
    () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
  );

  assert.equal(jobs.length, 1, "a single throttled request must not drop a live listing");
  assert.equal(jobs[0].sourceJobId, "1");
});

test("a detail that exhausts its retries in the first pass is recovered on the second", async () => {
  // This exercises the *outer* retry (`fetchDetailsWithRetry`), not the one
  // inside `fetchJson`: the first pass burns all four attempts and returns null,
  // then the second pass — after the batch pause — succeeds. Without the outer
  // retry a listing that is merely rate-limited for a moment is dropped, which
  // the comment on `fetchDetailsWithRetry` calls out as the thing it prevents.
  let detailAttempts = 0;
  const jobs = await withFetch(
    (url) => {
      if (url.includes("paginated")) {
        return json({ data: [{ id: 1 }], next_page_url: null });
      }
      detailAttempts += 1;
      // Fail the whole first pass (4 attempts), succeed on the retry pass.
      return detailAttempts <= 4
        ? new Response("upstream error", { status: 500 })
        : json(iskibrisDetail());
    },
    () => fetchIskibrisJobs({ now: NOW, concurrency: 1 }),
  );

  assert.equal(detailAttempts, 5, "four attempts in the first pass, one on the retry");
  assert.equal(jobs.length, 1, "the second pass must recover the listing");
  assert.equal(jobs[0].sourceJobId, "1");
});

test("a permanently unavailable detail drops only itself, not the batch", async () => {
  const progress: string[] = [];
  const jobs = await withFetch(
    (url) => {
      if (url.includes("paginated")) {
        return json({ data: [{ id: 1 }, { id: 2 }], next_page_url: null });
      }
      // Detail 1 is gone (a non-transient 404, so no retry); detail 2 is fine.
      return url.endsWith("/api/jobs/1")
        ? new Response("not found", { status: 404 })
        : json(iskibrisDetail({ id: 2, title: "Aşçı" }));
    },
    () => fetchIskibrisJobs({ now: NOW, concurrency: 1, onProgress: (m) => progress.push(m) }),
  );

  assert.equal(jobs.length, 1, "the healthy listing must still be returned");
  assert.equal(jobs[0].sourceJobId, "2");
  assert.ok(
    progress.some((line) => /1 ilan detayı alınamadı/.test(line)),
    `the failure must be reported, not silent: ${progress.join(" | ")}`,
  );
});
