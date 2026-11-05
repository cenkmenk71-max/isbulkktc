import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  fakeProfileRow,
  installBoundaryMocks,
  mailFailures,
  recorded,
  resetBoundary,
} from "./support/harness";

installBoundaryMocks();

/**
 * The data path: action -> DAL -> table/RPC, and how failures travel back.
 *
 * `tests/unit/**` proves the schemas; `tests/e2e/**` proves the happy path in a
 * browser. The gap is the *wiring*: does the action write the row it claims to,
 * to the table it should, with the caller's own id? And when the database answers
 * with an error, does the action surface it — or swallow it and report success?
 *
 * Every test here drives the real action body against the fake edge and asserts
 * on the recorded call, so "the profile is saved" means "an upsert to
 * `candidate_profiles` was attempted with `user_id` set to the session id", not
 * merely "the function returned success".
 */

const ID = "00000000-0000-4000-8000-000000000001";

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/**
 * The candidate profile form always submits its repeating sections as JSON
 * strings; a missing field parses to `null`, which the schema rejects (it wants
 * an array, and only `undefined` would take the `.default([])`).
 */
function candidateProfileForm(values: Record<string, string> = {}): FormData {
  return form({
    // The text fields are required strings in the schema; only the repeating
    // sections default, and only when the key is absent rather than `null`.
    headline: "",
    location: "",
    skillsText: "",
    experience: "[]",
    education: "[]",
    languages: "[]",
    certifications: "[]",
    ...values,
  });
}

function fromCalls(table: string): Extract<RecordedCall, { kind: "from" }>[] {
  return recorded.supabase.filter(
    (call): call is Extract<RecordedCall, { kind: "from" }> => call.kind === "from" && call.table === table,
  );
}

type RecordedCall = (typeof recorded.supabase)[number];

function rpcNames(): string[] {
  return recorded.supabase.filter((call) => call.kind === "rpc").map((call) => (call as { name: string }).name);
}

function rpcArgs(name: string): Record<string, unknown> | undefined {
  const call = recorded.supabase.find((entry) => entry.kind === "rpc" && entry.name === name);
  return call && call.kind === "rpc" ? call.args : undefined;
}

function activeCandidate() {
  return resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: {
      profiles: { data: fakeProfileRow({ id: ID }), error: null },
      candidate_profiles: { data: { user_id: ID }, error: null },
    },
  });
}

// ---------------------------------------------------------------------------
// 1. The write goes to the right table, bound to the session's own id.
// ---------------------------------------------------------------------------

test("saving a candidate profile upserts the caller's own row", async () => {
  activeCandidate();

  const { saveCandidateProfile } = await import("../../src/features/candidates/actions");
  const state = await saveCandidateProfile(
    { status: "idle", message: "idle" } as never,
    candidateProfileForm({
      fullName: "Ada Lovelace",
      headline: "Yazılım geliştirici",
      skillsText: "TypeScript, React",
    }),
  );

  assert.equal(state.status, "success");

  const upserts = fromCalls("candidate_profiles").flatMap((call) => call.ops.filter((op) => op.startsWith("upsert:")));
  assert.equal(upserts.length, 1, "exactly one upsert is expected");
  assert.ok(upserts[0].includes(`"user_id":"${ID}"`), `the row must be bound to the session id: ${upserts[0]}`);
});

test("the display name is written to profiles only when it changed", async () => {
  activeCandidate();

  const { saveCandidateProfile } = await import("../../src/features/candidates/actions");
  await saveCandidateProfile(
    { status: "idle", message: "idle" } as never,
    candidateProfileForm({ fullName: "Grace Hopper", headline: "", skillsText: "" }),
  );

  const profileUpdates = fromCalls("profiles").flatMap((call) => call.ops.filter((op) => op.startsWith("update:")));
  assert.equal(profileUpdates.length, 1, "the changed name must be written once");
  assert.ok(profileUpdates[0].includes(`"display_name":"Grace Hopper"`), profileUpdates[0]);
});

test("an unchanged display name is not written back", async () => {
  activeCandidate();

  const { saveCandidateProfile } = await import("../../src/features/candidates/actions");
  await saveCandidateProfile(
    { status: "idle", message: "idle" } as never,
    // fakeProfileRow's display_name is "Ada Lovelace".
    candidateProfileForm({ fullName: "Ada Lovelace", headline: "", skillsText: "" }),
  );

  const profileUpdates = fromCalls("profiles").flatMap((call) => call.ops.filter((op) => op.startsWith("update:")));
  assert.deepEqual(profileUpdates, [], "an unchanged name must not produce an UPDATE");
});

// ---------------------------------------------------------------------------
// 2. A database error is surfaced, never reported as success.
// ---------------------------------------------------------------------------

test("a failing profile upsert is reported, not swallowed", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: {
      profiles: { data: fakeProfileRow({ id: ID }), error: null },
      candidate_profiles: { data: null, error: { code: "23514", message: "check violation" } },
    },
  });

  const { saveCandidateProfile } = await import("../../src/features/candidates/actions");
  const state = await saveCandidateProfile(
    { status: "idle", message: "idle" } as never,
    candidateProfileForm({ fullName: "Ada Lovelace", headline: "", skillsText: "" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "saveFailed");
});

test("a rejected RPC on publish surfaces a publish failure", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: {
      profiles: { data: fakeProfileRow({ id: ID }), error: null },
      jobs: { data: { company_id: "00000000-0000-4000-8000-0000000000aa" }, error: null },
    },
    rpcs: {
      is_active_company_member: { data: true, error: null },
      publish_approved_job: { data: null, error: { code: "22023", message: "job not approved" } },
    },
  });

  const { publishApprovedJob } = await import("../../src/features/jobs/actions");
  const state = await publishApprovedJob(
    { status: "idle", message: "idle" } as never,
    form({ jobId: ID }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "publishFailed");
});

test("a 42501 from the RPC is mapped to unauthorized, not to a generic failure", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: {
      profiles: { data: fakeProfileRow({ id: ID }), error: null },
      jobs: { data: { company_id: "00000000-0000-4000-8000-0000000000aa" }, error: null },
    },
    rpcs: {
      is_active_company_member: { data: true, error: null },
      publish_approved_job: { data: null, error: { code: "42501", message: "permission denied" } },
    },
  });

  const { publishApprovedJob } = await import("../../src/features/jobs/actions");
  const state = await publishApprovedJob({ status: "idle", message: "idle" } as never, form({ jobId: ID }));

  assert.equal(state.message, "unauthorized");
});

// ---------------------------------------------------------------------------
// 3. Mail is best-effort: a delivery failure never fails the stored write.
// ---------------------------------------------------------------------------

test("a feedback receipt failure does not turn a stored submission into an error", async () => {
  resetBoundary({
    user: undefined,
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });
  mailFailures.add("feedback");

  const { submitFeedback } = await import("../../src/features/feedback/actions");
  const state = await submitFeedback(
    { status: "idle", message: "idle" } as never,
    form({ message: "A real problem with the listing filter.", category: "bug", locale: "tr" }),
  );

  // The row is the source of truth; a mail problem must not lose it.
  assert.equal(state.status, "success");
  assert.equal(state.message, "submitted");
});

test("a sales receipt failure does not turn a stored lead into an error", async () => {
  resetBoundary({
    user: undefined,
    rpcs: { submit_sales_lead: { data: "00000000-0000-4000-8000-0000000000f2", error: null } },
  });
  mailFailures.add("sales");

  const { submitSalesLead } = await import("../../src/features/sales/actions");
  const state = await submitSalesLead(
    { status: "idle", message: "idle" } as never,
    form({ companyName: "Acme", email: "lead@example.invalid", locale: "tr" }),
  );

  assert.equal(state.status, "success");
  assert.equal(state.message, "submitted");
});

// ---------------------------------------------------------------------------
// 4. The RPC receives exactly the validated values (no caller id injection).
// ---------------------------------------------------------------------------

test("the feedback RPC receives the caller's message, not a caller-supplied id", async () => {
  resetBoundary({
    user: undefined,
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });

  const { submitFeedback } = await import("../../src/features/feedback/actions");
  const data = form({
    message: "The filter drops the district I picked.",
    category: "bug",
    locale: "tr",
    // An attacker-supplied field that the action must ignore.
    user_id: "00000000-0000-4000-8000-00000000dead",
  });
  await submitFeedback({ status: "idle", message: "idle" } as never, data);

  const args = rpcArgs("submit_feedback");
  assert.ok(args, "submit_feedback must be called");
  assert.equal(args._message, "The filter drops the district I picked.");
  assert.ok(
    !Object.keys(args).some((key) => key.includes("user")),
    `the RPC must not receive a user id from the form: ${Object.keys(args).join(", ")}`,
  );
});

// ---------------------------------------------------------------------------
// 5. A malformed request is rejected at the boundary, before any call.
// ---------------------------------------------------------------------------

test("an invalid feedback payload never reaches the database", async () => {
  resetBoundary({ user: undefined });

  const { submitFeedback } = await import("../../src/features/feedback/actions");
  const state = await submitFeedback(
    { status: "idle", message: "idle" } as never,
    form({ message: "", category: "not-a-category", locale: "tr" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "invalid");
  assert.deepEqual(rpcNames(), [], "an invalid payload must not reach the RPC");
});
