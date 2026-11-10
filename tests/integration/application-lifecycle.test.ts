import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  fakeProfileRow,
  installBoundaryMocks,
  isRedirect,
  recorded,
  resetBoundary,
  type SupabaseCall,
} from "./support/harness";

installBoundaryMocks();

/**
 * The job-application lifecycle, exercised through the real action bodies.
 *
 * `tests/unit/jobs-schemas.test.ts` proves `applyToJobSchema` and
 * `applicationTransitionSchema` parse; `tests/integration/authorization-boundary`
 * proves an anonymous caller is refused. Neither ever runs the *signed-in* body.
 * Three shipped guards live exactly there and had no test at all:
 *
 *  - `applyToJob` answers `contactEmailUnverified` when the caller asks to share
 *    an address the account has not confirmed, *before* it reaches the RPC. The
 *    RPC raises `22023` both for that and for a closed job, so the DB cannot tell
 *    the two apart — the branch is the only thing that produces the specific copy.
 *  - `transitionApplication` splits on `application.candidate_id === user.id`:
 *    a candidate may only `withdraw` their own application, and an employer may
 *    only move someone else's. Getting the comparison backwards would let a
 *    candidate hire themselves, or an employer withdraw on a candidate's behalf.
 *  - `markApplicationViewed` re-derives the company from the job and re-checks
 *    membership before recording a view.
 *
 * The assertion is not only the returned state; it is the recorded boundary
 * calls. "Returned `unauthorized`" is worthless if the action already reached the
 * RPC, so every refusal also asserts the protected call never happened.
 */

const USER = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-0000000000a2";
const JOB = "00000000-0000-4000-8000-0000000000b1";
const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const APPLICATION = "00000000-0000-4000-8000-0000000000d1";

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function validApplicationForm(overrides: Record<string, string> = {}): FormData {
  return form({
    jobId: JOB,
    coverLetter: "Bu role uygun bir fintech ekibinde ürün geliştirdim.",
    ...overrides,
  });
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
    tables: { profiles: { data: fakeProfileRow({ id: USER }), error: null } },
    ...script,
  });
}

// ---------------------------------------------------------------------------
// applyToJob — the share-contact-email guard and the RPC outcome mapping
// ---------------------------------------------------------------------------

test("applyToJob refuses an unverified contact address before it reaches the RPC", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: USER, email_confirmed_at: null }),
    tables: { profiles: { data: fakeProfileRow({ id: USER }), error: null } },
  });

  const { applyToJob } = await actions();
  const state = await applyToJob(
    { status: "idle", message: "idle" },
    validApplicationForm({ shareContactEmail: "on" }),
  );

  assert.equal(state.message, "contactEmailUnverified");
  // The candidate-profile read and the RPC are both downstream of the guard.
  assert.deepEqual(fromCalls("candidate_profiles"), []);
  assert.deepEqual(rpcCalls("apply_to_job"), []);
});

test("applyToJob rejects a malformed form without reading or writing anything", async () => {
  signedIn();

  const { applyToJob } = await actions();
  const state = await applyToJob(
    { status: "idle", message: "idle" },
    validApplicationForm({ jobId: "not-a-uuid" }),
  );

  assert.equal(state.message, "invalid");
  assert.deepEqual(fromCalls("candidate_profiles"), []);
  assert.deepEqual(rpcCalls("apply_to_job"), []);
});

test("applyToJob refuses a caller with no candidate profile", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      candidate_profiles: { data: null, error: null },
    },
  });

  const { applyToJob } = await actions();
  const state = await applyToJob(
    { status: "idle", message: "idle" },
    validApplicationForm(),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("apply_to_job"), []);
});

test("applyToJob sends the parsed form to the RPC and reports applied", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      candidate_profiles: { data: { user_id: USER }, error: null },
    },
    rpcs: { apply_to_job: { data: null, error: null } },
  });

  const { applyToJob } = await actions();
  const state = await applyToJob(
    { status: "idle", message: "idle" },
    validApplicationForm({ coverLetter: "  Merhaba  ", shareContactEmail: "on" }),
  );

  assert.deepEqual(state, { status: "success", message: "applied" });
  const calls = rpcCalls("apply_to_job");
  assert.equal(calls.length, 1);
  // `coverLetter` is trimmed by the schema; the flag is the checkbox's boolean.
  assert.deepEqual(calls[0].args, {
    _job_id: JOB,
    _cover_letter: "Merhaba",
    _share_contact_email: true,
  });
});

test("applyToJob maps each RPC error code to its own message", async () => {
  const cases: [string, string][] = [
    ["42501", "unauthorized"],
    ["23505", "duplicate"],
    ["22023", "applyFailed"],
    ["XX000", "applyFailed"],
  ];

  for (const [code, expected] of cases) {
    signedIn({
      tables: {
        profiles: { data: fakeProfileRow({ id: USER }), error: null },
        candidate_profiles: { data: { user_id: USER }, error: null },
      },
      rpcs: { apply_to_job: { data: null, error: { code } } },
    });

    const { applyToJob } = await actions();
    const state = await applyToJob(
      { status: "idle", message: "idle" },
      validApplicationForm(),
    );
    assert.equal(state.message, expected, `RPC code ${code}`);
  }
});

// ---------------------------------------------------------------------------
// transitionApplication — the candidate/employer split
// ---------------------------------------------------------------------------

test("a candidate may withdraw their own application", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: USER }, error: null },
    },
    rpcs: { transition_application: { data: null, error: null } },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "withdrawn" }),
  );

  assert.deepEqual(state, { status: "success", message: "updated" });
  const calls = rpcCalls("transition_application");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, {
    _application_id: APPLICATION,
    _next_status: "withdrawn",
  });
});

test("a candidate cannot withdraw someone else's application", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: OTHER }, error: null },
    },
    rpcs: { transition_application: { data: null, error: null } },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "withdrawn" }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("transition_application"), []);
});

test("a candidate cannot move their own application forward", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: USER }, error: null },
    },
    rpcs: { transition_application: { data: null, error: null } },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "shortlisted" }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("transition_application"), []);
});

test("an employer member moves an application forward", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: OTHER }, error: null },
      jobs: { data: { company_id: COMPANY }, error: null },
    },
    rpcs: {
      is_active_company_member: { data: true, error: null },
      transition_application: { data: null, error: null },
    },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "shortlisted" }),
  );

  assert.deepEqual(state, { status: "success", message: "updated" });
  assert.equal(rpcCalls("transition_application").length, 1);
});

test("an employer who is not a company member is refused before the RPC", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: OTHER }, error: null },
      jobs: { data: { company_id: COMPANY }, error: null },
    },
    rpcs: {
      is_active_company_member: { data: false, error: null },
      transition_application: { data: null, error: null },
    },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "shortlisted" }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("transition_application"), []);
});

test("an application the caller cannot see is refused", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: null, error: null },
    },
    rpcs: { transition_application: { data: null, error: null } },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "withdrawn" }),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("transition_application"), []);
});

test("transitionApplication maps the RPC 42501 refusal to unauthorized", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: OTHER }, error: null },
      jobs: { data: { company_id: COMPANY }, error: null },
    },
    rpcs: {
      is_active_company_member: { data: true, error: null },
      transition_application: { data: null, error: { code: "42501" } },
    },
  });

  const { transitionApplication } = await actions();
  const state = await transitionApplication(
    { status: "idle", message: "idle" },
    form({ applicationId: APPLICATION, nextStatus: "hired" }),
  );

  assert.equal(state.message, "unauthorized");
});

// ---------------------------------------------------------------------------
// markApplicationViewed — the membership re-check and the redirect
// ---------------------------------------------------------------------------

test("markApplicationViewed redirects an anonymous caller to login", async () => {
  resetBoundary({ user: undefined });

  const { markApplicationViewed } = await actions();
  await assert.rejects(
    () => markApplicationViewed(form({ applicationId: APPLICATION })),
    (error: unknown) => isRedirect(error),
  );
  assert.deepEqual(recorded.redirects, ["/login"]);
  assert.deepEqual(rpcCalls("mark_application_viewed"), []);
});

test("markApplicationViewed refuses a caller who is not a company member", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: OTHER }, error: null },
      jobs: { data: { company_id: COMPANY }, error: null },
    },
    rpcs: { is_active_company_member: { data: false, error: null } },
  });

  const { markApplicationViewed } = await actions();
  await assert.rejects(
    () => markApplicationViewed(form({ applicationId: APPLICATION })),
    /not authorized/,
  );
  assert.deepEqual(rpcCalls("mark_application_viewed"), []);
});

test("markApplicationViewed records the view for a company member and redirects", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      applications: { data: { job_id: JOB, candidate_id: OTHER }, error: null },
      jobs: { data: { company_id: COMPANY }, error: null },
    },
    rpcs: {
      is_active_company_member: { data: true, error: null },
      mark_application_viewed: { data: null, error: null },
    },
  });

  const { markApplicationViewed } = await actions();
  await assert.rejects(
    () => markApplicationViewed(form({ applicationId: APPLICATION })),
    (error: unknown) => isRedirect(error),
  );

  const calls = rpcCalls("mark_application_viewed");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, { _application_id: APPLICATION });
  // The default locale (`tr`) is unprefixed, so the destination is bare.
  assert.deepEqual(recorded.redirects, [
    `/company/dashboard/applications/${APPLICATION}`,
  ]);
});
