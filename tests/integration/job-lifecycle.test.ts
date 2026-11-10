import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  fakeProfileRow,
  installBoundaryMocks,
  mailFailures,
  recorded,
  resetBoundary,
  type SupabaseCall,
} from "./support/harness";

installBoundaryMocks();

/**
 * The job-moderation lifecycle, exercised through the real action bodies.
 *
 * `tests/unit/jobs-schemas.test.ts` proves the Zod shapes parse and
 * `tests/integration/authorization-boundary` proves an anonymous caller is
 * refused. Neither ever runs the *signed-in* body, so five shipped guards had no
 * test that could turn red:
 *
 *  - `saveJobDraft` checks company membership *before* it writes and refuses to
 *    move a draft into a company the caller does not own. Getting the order
 *    wrong would let a non-member insert a listing.
 *  - `submitJobForReview` / `publishApprovedJob` re-derive the company from the
 *    job id and re-check membership, then map `42501` to `unauthorized` rather
 *    than a generic failure.
 *  - `publishApprovedJob` treats the "listing is live" mail as best-effort: a
 *    send failure must not turn a successful publication into an error.
 *  - `saveJobPackage` / `assignCompanyJobPackage` / `reviewJob` gate on the
 *    `platform_admin` role *before* the admin RPC.
 *
 * The assertion is not only the returned state; it is the recorded boundary
 * calls. "Returned `unauthorized`" is worthless if the action already reached
 * the RPC, so every refusal also asserts the protected call never happened.
 */

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const JOB = "00000000-0000-4000-8000-0000000000b1";
const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const PACKAGE = "00000000-0000-4000-8000-0000000000d1";

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const actions = () => import("@/features/jobs/actions");

/** RPC calls by name, in order. */
function rpcCalls(name?: string) {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "rpc" }> =>
      call.kind === "rpc" && (name === undefined || call.name === name),
  );
}

function fromCalls(table: string) {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "from" }> =>
      call.kind === "from" && call.table === table,
  );
}

function signedIn(script: Parameters<typeof resetBoundary>[0] = {}) {
  resetBoundary({
    user: fakeAuthUser({ id: USER }),
    ...script,
    // A signed-in session always needs the profile row; a per-test `tables`
    // entry for another table must not drop it.
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      ...script.tables,
    },
  });
}

/** `is_active_company_member` returns a bare boolean, not a row. */
const memberRpc = (isMember: boolean) => ({
  is_active_company_member: { data: isMember, error: null },
});

function validDraftForm(overrides: Record<string, string> = {}): FormData {
  return form({
    companyId: COMPANY,
    title: "Kıdemli Ürün Tasarımcısı",
    slug: "kidemli-urun-tasarimcisi",
    summary: "Fintech ekibimiz için deneyimli bir ürün tasarımcısı arıyoruz.",
    description:
      "Ürün ekibimizde uçtan uca tasarım sürecini yürütecek, araştırmadan teslime kadar sorumluluk alacak bir takım arkadaşı arıyoruz.",
    jobType: "full_time",
    workplaceMode: "on_site",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// saveJobDraft — the membership gate and the insert/update split
// ---------------------------------------------------------------------------

test("saveJobDraft refuses a non-member before it touches the jobs table", async () => {
  signedIn({ rpcs: memberRpc(false) });

  const { saveJobDraft } = await actions();
  const state = await saveJobDraft(
    { status: "idle", message: "idle" },
    validDraftForm(),
  );

  assert.equal(state.message, "unauthorized");
  // Membership is checked first; a non-member must never reach the write.
  assert.deepEqual(fromCalls("jobs"), []);
});

test("saveJobDraft rejects a malformed draft before the membership check", async () => {
  signedIn({ rpcs: memberRpc(true) });

  const { saveJobDraft } = await actions();
  const state = await saveJobDraft(
    { status: "idle", message: "idle" },
    validDraftForm({ slug: "Not A Slug" }),
  );

  assert.equal(state.message, "invalid");
  assert.deepEqual(rpcCalls("is_active_company_member"), []);
  assert.deepEqual(fromCalls("jobs"), []);
});

test("saveJobDraft inserts a new draft and returns the generated id", async () => {
  signedIn({
    rpcs: memberRpc(true),
    tables: { jobs: { data: { id: JOB }, error: null } },
  });

  const { saveJobDraft } = await actions();
  const state = await saveJobDraft(
    { status: "idle", message: "idle" },
    validDraftForm(),
  );

  assert.deepEqual(state, { status: "success", message: "saved", jobId: JOB });
  const jobs = fromCalls("jobs");
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].ops[0], /^insert:/);
  // The company comes from the parsed form, not from the caller.
  assert.match(jobs[0].ops[0], new RegExp(`"company_id":"${COMPANY}"`));
});

test("saveJobDraft updates a draft only when the caller owns its company", async () => {
  signedIn({
    rpcs: memberRpc(true),
    tables: {
      // The lookup (`select company_id`) and the write (`update …`) hit the same
      // table, so the scenario is bound to the operation, not to the table.
      jobs: (ops) =>
        ops[0].startsWith("select:")
          ? { data: { company_id: COMPANY }, error: null }
          : { data: { id: JOB }, error: null },
    },
  });

  const { saveJobDraft } = await actions();
  const state = await saveJobDraft(
    { status: "idle", message: "idle" },
    validDraftForm({ jobId: JOB }),
  );

  assert.deepEqual(state, { status: "success", message: "saved", jobId: JOB });
  const jobs = fromCalls("jobs");
  assert.equal(jobs.length, 2);
  assert.match(jobs[1].ops[0], /^update:/);
});

test("saveJobDraft refuses to move a draft into another company", async () => {
  signedIn({
    rpcs: memberRpc(true),
    tables: { jobs: { data: { company_id: OTHER }, error: null } },
  });

  const { saveJobDraft } = await actions();
  const state = await saveJobDraft(
    { status: "idle", message: "idle" },
    validDraftForm({ jobId: JOB }),
  );

  assert.equal(state.message, "unauthorized");
  // The only `jobs` access is the ownership lookup; nothing was written.
  const jobs = fromCalls("jobs");
  assert.equal(jobs.length, 1);
  assert.match(jobs[0].ops[0], /^select:/);
});

test("saveJobDraft maps a row-level refusal to unauthorized and a generic one to saveFailed", async () => {
  const cases: [string, string][] = [
    ["42501", "unauthorized"],
    ["PGRST116", "unauthorized"],
    ["XX000", "saveFailed"],
  ];

  for (const [code, expected] of cases) {
    signedIn({
      rpcs: memberRpc(true),
      tables: { jobs: { data: null, error: { code } } },
    });

    const { saveJobDraft } = await actions();
    const state = await saveJobDraft(
      { status: "idle", message: "idle" },
      validDraftForm(),
    );
    assert.equal(state.message, expected, `write error ${code}`);
  }
});

// ---------------------------------------------------------------------------
// submitJobForReview — the re-derived company and the RPC mapping
// ---------------------------------------------------------------------------

test("submitJobForReview refuses when the job's company is unknown or the caller is not a member", async () => {
  // (a) the job resolves to no company at all.
  signedIn({ tables: { jobs: { data: null, error: null } } });
  const { submitJobForReview } = await actions();
  let state = await submitJobForReview(
    { status: "idle", message: "idle" },
    form({ jobId: JOB }),
  );
  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("submit_job_for_review"), []);

  // (b) the company exists but the caller is not a member.
  signedIn({
    tables: { jobs: { data: { company_id: COMPANY }, error: null } },
    rpcs: memberRpc(false),
  });
  state = await submitJobForReview(
    { status: "idle", message: "idle" },
    form({ jobId: JOB }),
  );
  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("submit_job_for_review"), []);
});

test("submitJobForReview sends the job id to the RPC for a member", async () => {
  signedIn({
    tables: { jobs: { data: { company_id: COMPANY }, error: null } },
    rpcs: {
      ...memberRpc(true),
      submit_job_for_review: { data: null, error: null },
    },
  });

  const { submitJobForReview } = await actions();
  const state = await submitJobForReview(
    { status: "idle", message: "idle" },
    form({ jobId: JOB }),
  );

  assert.deepEqual(state, {
    status: "success",
    message: "submitted",
    jobId: JOB,
  });
  const calls = rpcCalls("submit_job_for_review");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { _job_id: JOB });
});

test("submitJobForReview maps 42501 to unauthorized and 22023 to submitFailed", async () => {
  const cases: [string, string][] = [
    ["42501", "unauthorized"],
    ["22023", "submitFailed"],
    ["XX000", "submitFailed"],
  ];

  for (const [code, expected] of cases) {
    signedIn({
      tables: { jobs: { data: { company_id: COMPANY }, error: null } },
      rpcs: {
        ...memberRpc(true),
        submit_job_for_review: { data: null, error: { code } },
      },
    });

    const { submitJobForReview } = await actions();
    const state = await submitJobForReview(
      { status: "idle", message: "idle" },
      form({ jobId: JOB }),
    );
    assert.equal(state.message, expected, `RPC code ${code}`);
  }
});

// ---------------------------------------------------------------------------
// publishApprovedJob — the package-error copy and the best-effort mail
// ---------------------------------------------------------------------------

test("publishApprovedJob refuses a non-member before the RPC", async () => {
  signedIn({
    tables: { jobs: { data: { company_id: COMPANY }, error: null } },
    rpcs: memberRpc(false),
  });

  const { publishApprovedJob } = await actions();
  const state = await publishApprovedJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("publish_approved_job"), []);
});

test("publishApprovedJob maps a package error to its own copy", async () => {
  const cases: [string, string][] = [
    ["active package", "packageRequired"],
    ["limit reached", "packageLimit"],
  ];

  for (const [message, expected] of cases) {
    signedIn({
      tables: { jobs: { data: { company_id: COMPANY }, error: null } },
      rpcs: {
        ...memberRpc(true),
        publish_approved_job: { data: null, error: { code: "P0001", message } },
      },
    });

    const { publishApprovedJob } = await actions();
    const state = await publishApprovedJob(
      { status: "idle", message: "idle" },
      form({ jobId: JOB }),
    );
    assert.equal(state.message, expected, `P0001 "${message}"`);
  }
});

test("publishApprovedJob maps 42501 to unauthorized and 22023 to publishFailed", async () => {
  const cases: [string, string][] = [
    ["42501", "unauthorized"],
    ["22023", "publishFailed"],
    ["XX000", "publishFailed"],
  ];

  for (const [code, expected] of cases) {
    signedIn({
      tables: { jobs: { data: { company_id: COMPANY }, error: null } },
      rpcs: {
        ...memberRpc(true),
        publish_approved_job: { data: null, error: { code } },
      },
    });

    const { publishApprovedJob } = await actions();
    const state = await publishApprovedJob(
      { status: "idle", message: "idle" },
      form({ jobId: JOB }),
    );
    assert.equal(state.message, expected, `RPC code ${code}`);
  }
});

test("publishApprovedJob announces the listing by mail after a successful RPC", async () => {
  signedIn({
    tables: {
      jobs: {
        data: { company_id: COMPANY, title: "Ürün Tasarımcısı", slug: "urun-tasarimcisi" },
        error: null,
      },
      companies: { data: { name: "Acme" }, error: null },
    },
    rpcs: {
      ...memberRpc(true),
      publish_approved_job: { data: null, error: null },
    },
  });

  const { publishApprovedJob } = await actions();
  const state = await publishApprovedJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB }),
  );

  assert.deepEqual(state, {
    status: "success",
    message: "published",
    jobId: JOB,
  });
  assert.equal(recorded.mail.length, 1);
  assert.equal(recorded.mail[0].template, "jobPublished");
  assert.equal(recorded.mail[0].payload.jobTitle, "Ürün Tasarımcısı");
});

test("publishApprovedJob treats a mail failure as best-effort", async () => {
  signedIn({
    tables: {
      jobs: {
        data: { company_id: COMPANY, title: "Ürün Tasarımcısı", slug: "urun-tasarimcisi" },
        error: null,
      },
      companies: { data: { name: "Acme" }, error: null },
    },
    rpcs: {
      ...memberRpc(true),
      publish_approved_job: { data: null, error: null },
    },
  });
  mailFailures.add("jobPublished");

  const { publishApprovedJob } = await actions();
  const state = await publishApprovedJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB }),
  );

  // The listing is live; a mail outage must not turn that into an error.
  assert.deepEqual(state, {
    status: "success",
    message: "published",
    jobId: JOB,
  });
});

// ---------------------------------------------------------------------------
// saveJobPackage — the platform_admin gate
// ---------------------------------------------------------------------------

test("saveJobPackage refuses a non-admin before the admin RPC", async () => {
  signedIn({ rpcs: { has_platform_role: { data: false, error: null } } });

  const { saveJobPackage } = await actions();
  const state = await saveJobPackage(
    { status: "idle", message: "idle" },
    form({
      code: "starter",
      displayName: "Başlangıç",
      maxActiveJobs: "3",
      jobDurationDays: "30",
      isActive: "true",
    }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("admin_save_job_package"), []);
});

test("saveJobPackage calls the admin RPC and revalidates both package pages", async () => {
  signedIn({
    rpcs: {
      has_platform_role: { data: true, error: null },
      admin_save_job_package: { data: null, error: null },
    },
  });

  const { saveJobPackage } = await actions();
  const state = await saveJobPackage(
    { status: "idle", message: "idle" },
    form({
      code: "starter",
      displayName: "Başlangıç",
      maxActiveJobs: "3",
      jobDurationDays: "30",
      isActive: "true",
    }),
  );

  assert.deepEqual(state, { status: "success", message: "saved" });
  const calls = rpcCalls("admin_save_job_package");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args._code, "starter");
  assert.equal(calls[0].args._max_active_jobs, 3);
  assert.equal(calls[0].args._is_active, true);
  // `tr` is the default locale, so the prefix is empty.
  assert.deepEqual(recorded.revalidated, ["/admin/packages", "/packages"]);
});

test("saveJobPackage maps a duplicate code to invalid", async () => {
  signedIn({
    rpcs: {
      has_platform_role: { data: true, error: null },
      admin_save_job_package: { data: null, error: { code: "23505" } },
    },
  });

  const { saveJobPackage } = await actions();
  const state = await saveJobPackage(
    { status: "idle", message: "idle" },
    form({
      code: "starter",
      displayName: "Başlangıç",
      maxActiveJobs: "3",
      jobDurationDays: "30",
      isActive: "true",
    }),
  );

  assert.equal(state.message, "invalid");
});

// ---------------------------------------------------------------------------
// assignCompanyJobPackage — the computed expiry
// ---------------------------------------------------------------------------

test("assignCompanyJobPackage computes expires_at from the duration", async () => {
  signedIn({
    rpcs: {
      has_platform_role: { data: true, error: null },
      admin_assign_company_job_package: { data: null, error: null },
    },
  });

  const before = Date.now();
  const { assignCompanyJobPackage } = await actions();
  const state = await assignCompanyJobPackage(
    { status: "idle", message: "idle" },
    form({ companyId: COMPANY, packageId: PACKAGE, durationDays: "30" }),
  );

  assert.deepEqual(state, { status: "success", message: "assigned" });
  const calls = rpcCalls("admin_assign_company_job_package");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args._company_id, COMPANY);
  assert.equal(calls[0].args._package_id, PACKAGE);
  const expiresAt = new Date(calls[0].args._expires_at as string).getTime();
  const expected = 30 * 24 * 60 * 60 * 1000;
  assert.ok(
    Math.abs(expiresAt - before - expected) < 60_000,
    "expiry should be ~30 days from now",
  );
});

test("assignCompanyJobPackage passes a null expiry when no duration is given", async () => {
  signedIn({
    rpcs: {
      has_platform_role: { data: true, error: null },
      admin_assign_company_job_package: { data: null, error: null },
    },
  });

  const { assignCompanyJobPackage } = await actions();
  const state = await assignCompanyJobPackage(
    { status: "idle", message: "idle" },
    form({ companyId: COMPANY, packageId: PACKAGE, durationDays: "" }),
  );

  assert.deepEqual(state, { status: "success", message: "assigned" });
  assert.equal(rpcCalls("admin_assign_company_job_package")[0].args._expires_at, null);
});

test("assignCompanyJobPackage refuses a non-admin", async () => {
  signedIn({ rpcs: { has_platform_role: { data: false, error: null } } });

  const { assignCompanyJobPackage } = await actions();
  const state = await assignCompanyJobPackage(
    { status: "idle", message: "idle" },
    form({ companyId: COMPANY, packageId: PACKAGE, durationDays: "30" }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("admin_assign_company_job_package"), []);
});

// ---------------------------------------------------------------------------
// reviewJob — the moderation gate and the note requirement
// ---------------------------------------------------------------------------

test("reviewJob refuses a non-admin before the RPC", async () => {
  signedIn({ rpcs: { has_platform_role: { data: false, error: null } } });

  const { reviewJob } = await actions();
  const state = await reviewJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB, decision: "approved" }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("review_job"), []);
});

test("reviewJob rejects a rejection without a reason before the RPC", async () => {
  signedIn({ rpcs: { has_platform_role: { data: true, error: null } } });

  const { reviewJob } = await actions();
  const state = await reviewJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB, decision: "rejected", reviewNote: "" }),
  );

  assert.equal(state.message, "invalid");
  assert.deepEqual(rpcCalls("review_job"), []);
});

test("reviewJob sends the decision and note to the RPC for an admin", async () => {
  signedIn({
    rpcs: {
      has_platform_role: { data: true, error: null },
      review_job: { data: null, error: null },
    },
  });

  const { reviewJob } = await actions();
  const state = await reviewJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB, decision: "rejected", reviewNote: "Eksik maaş bilgisi." }),
  );

  assert.deepEqual(state, { status: "success", message: "reviewed" });
  const calls = rpcCalls("review_job");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, {
    _job_id: JOB,
    _decision: "rejected",
    _review_note: "Eksik maaş bilgisi.",
  });
});

test("reviewJob maps 22023 to reviewFailed", async () => {
  signedIn({
    rpcs: {
      has_platform_role: { data: true, error: null },
      review_job: { data: null, error: { code: "22023" } },
    },
  });

  const { reviewJob } = await actions();
  const state = await reviewJob(
    { status: "idle", message: "idle" },
    form({ jobId: JOB, decision: "approved" }),
  );

  assert.equal(state.message, "reviewFailed");
});
