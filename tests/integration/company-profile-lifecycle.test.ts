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
 * The company-profile lifecycle, driven through the real action bodies.
 *
 * `tests/unit/identity-company-schemas.test.ts` proves the Zod schemas parse;
 * `tests/integration/authorization-boundary` proves an anonymous caller is
 * refused. Neither ever runs the *signed-in* body of `createCompany`,
 * `submitCompanyProfile` or `reviewCompanyProfile`, so the wiring those three
 * functions own had no test at all:
 *
 *  - `createCompany` mints the row through the `create_company` RPC and only then
 *    redirects to the new company's dashboard; a returned-but-null id must be a
 *    failure, not a redirect to `company=null`.
 *  - `submitCompanyProfile` writes only after `getOwnedCompany` proves the caller
 *    is an *active owner* of the target company, and it must UPDATE the open
 *    pending submission rather than open a second one.
 *  - `reviewCompanyProfile` gates on a hand-rolled submission-id/decision/note
 *    validator before it reads anything, then refuses to approve a submission
 *    whose directory branch no longer exists.
 *
 * The assertion is not only the returned state; it is the recorded boundary
 * calls. "Returned `unauthorized`" is worthless if the action already wrote the
 * row, so every refusal also asserts the protected call never happened.
 */

const USER = "00000000-0000-4000-8000-000000000001";
const COMPANY = "00000000-0000-4000-8000-0000000000c1";
const SUBMISSION = "00000000-0000-4000-8000-0000000000e1";

/** A real id from the bundled directory, with one location at index 0. */
const DIRECTORY_ENTRY = "ChIJHezyYQsN3hQR1SZhnXdwuHI";

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function companyProfileForm(overrides: Record<string, string> = {}): FormData {
  return form({
    companyId: COMPANY,
    companyName: "Örnek Şirket",
    profileDescription: "Kuzey Kıbrıs'ta yazılım geliştiren bir ekip.",
    categoriesText: "Kafe, Restoran",
    website: "https://example.invalid",
    phone: "+90 533 000 0000",
    publicEmail: "info@example.invalid",
    address: "Girne, KKTC",
    municipality: "Girne",
    directoryTarget: "",
    ...overrides,
  });
}

const actions = () => import("@/features/companies/actions");

function rpcCalls(name?: string) {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "rpc" }> =>
      call.kind === "rpc" && (name === undefined || call.name === name),
  );
}

function rpcArgs(name: string): Record<string, unknown> | undefined {
  return rpcCalls(name)[0]?.args;
}

function fromCalls(table: string) {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "from" }> =>
      call.kind === "from" && call.table === table,
  );
}

/** Every recorded `from(table)` operation string, across all calls. */
function opsFor(table: string): string[] {
  return fromCalls(table).flatMap((call) => call.ops);
}

function ownedCompanyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPANY,
    name: "Örnek Şirket",
    slug: "ornek-sirket",
    verification_status: "unverified",
    profile_description: null,
    categories: [],
    website: null,
    phone: null,
    public_email: null,
    address: null,
    municipality: null,
    directory_entry_id: null,
    directory_location_index: null,
    source_profile_url: null,
    logo_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function signedIn(script: Parameters<typeof resetBoundary>[0] = {}) {
  resetBoundary({
    user: fakeAuthUser({ id: USER }),
    tables: { profiles: { data: fakeProfileRow({ id: USER }), error: null } },
    ...script,
  });
}

/** The caller is the active owner of `COMPANY`; `getOwnedCompany` succeeds. */
function activeOwner(extra: Parameters<typeof resetBoundary>[0] = {}) {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: { company_id: COMPANY }, error: null },
      companies: { data: ownedCompanyRow(), error: null },
    },
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// createCompany — the RPC result gates the redirect
// ---------------------------------------------------------------------------

test("createCompany mints the company through the RPC and redirects to its dashboard", async () => {
  activeOwner({ rpcs: { create_company: { data: COMPANY, error: null } } });

  const { createCompany } = await actions();
  await assert.rejects(
    () => createCompany({ status: "idle", message: "idle" }, form({ name: " Örnek Şirket ", slug: "Ornek-Sirket" })),
    (error: unknown) => isRedirect(error),
  );

  // The RPC receives the *validated* values: trimmed name, lowercased slug.
  assert.deepEqual(rpcArgs("create_company"), {
    company_name: "Örnek Şirket",
    company_slug: "ornek-sirket",
  });
  assert.deepEqual(recorded.redirects, [
    `/company/dashboard?company=${COMPANY}&created=1`,
  ]);
});

test("createCompany treats a null company id as a failure, not a redirect", async () => {
  activeOwner({ rpcs: { create_company: { data: null, error: null } } });

  const { createCompany } = await actions();
  const state = await createCompany(
    { status: "idle", message: "idle" },
    form({ name: "Örnek Şirket", slug: "ornek-sirket" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "failed");
  assert.deepEqual(recorded.redirects, [], "a missing id must not redirect");
});

test("createCompany maps a unique-violation to the duplicate message", async () => {
  activeOwner({
    rpcs: { create_company: { data: null, error: { code: "23505", message: "duplicate key" } } },
  });

  const { createCompany } = await actions();
  const state = await createCompany(
    { status: "idle", message: "idle" },
    form({ name: "Örnek Şirket", slug: "ornek-sirket" }),
  );

  assert.equal(state.message, "duplicate");
});

test("createCompany maps a permission error from the RPC to unauthorized", async () => {
  activeOwner({
    rpcs: { create_company: { data: null, error: { code: "42501", message: "permission denied" } } },
  });

  const { createCompany } = await actions();
  const state = await createCompany(
    { status: "idle", message: "idle" },
    form({ name: "Örnek Şirket", slug: "ornek-sirket" }),
  );

  assert.equal(state.message, "unauthorized");
});

test("createCompany refuses a non-active account before it reaches the RPC", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER, status: "suspended" }), error: null },
    },
  });

  const { createCompany } = await actions();
  const state = await createCompany(
    { status: "idle", message: "idle" },
    form({ name: "Örnek Şirket", slug: "ornek-sirket" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "unauthorized");
  assert.deepEqual(rpcCalls("create_company"), [], "a suspended account must not mint a company");
});

test("createCompany rejects an invalid slug before it reaches the RPC", async () => {
  activeOwner();

  const { createCompany } = await actions();
  const state = await createCompany(
    { status: "idle", message: "idle" },
    form({ name: "Örnek Şirket", slug: "Not A Slug!" }),
  );

  assert.equal(state.message, "invalid");
  assert.deepEqual(rpcCalls("create_company"), [], "an invalid slug must not reach the RPC");
});

// ---------------------------------------------------------------------------
// submitCompanyProfile — the owner gate and insert-vs-update choice
// ---------------------------------------------------------------------------

test("submitCompanyProfile inserts a new submission bound to the owned company and caller", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: { company_id: COMPANY }, error: null },
      companies: { data: ownedCompanyRow(), error: null },
      company_profile_submissions: { data: null, error: null },
    },
  });

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    companyProfileForm(),
  );

  assert.equal(state.status, "success");
  assert.equal(state.message, "submitted");

  const inserts = opsFor("company_profile_submissions").filter((op) => op.startsWith("insert:"));
  assert.equal(inserts.length, 1, "exactly one insert is expected");
  assert.ok(inserts[0].includes(`"company_id":"${COMPANY}"`), inserts[0]);
  assert.ok(inserts[0].includes(`"submitted_by":"${USER}"`), inserts[0]);
  // The categories transform splits the free text into a deduplicated array.
  assert.ok(inserts[0].includes('"categories":["Kafe","Restoran"]'), inserts[0]);
  // No directory branch was selected, so both directory columns are null.
  assert.ok(inserts[0].includes('"directory_entry_id":null'), inserts[0]);
  assert.deepEqual(
    opsFor("company_profile_submissions").filter((op) => op.startsWith("update:")),
    [],
    "a first submission must insert, not update",
  );
});

test("submitCompanyProfile updates the open pending submission instead of opening a second one", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: { company_id: COMPANY }, error: null },
      companies: { data: ownedCompanyRow(), error: null },
      company_profile_submissions: { data: { id: SUBMISSION }, error: null },
    },
  });

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    companyProfileForm(),
  );

  assert.equal(state.message, "submitted");

  const updates = opsFor("company_profile_submissions").filter((op) => op.startsWith("update:"));
  assert.equal(updates.length, 1, "the pending row must be updated exactly once");
  assert.deepEqual(
    opsFor("company_profile_submissions").filter((op) => op.startsWith("insert:")),
    [],
    "an existing pending submission must not be duplicated",
  );
  assert.ok(
    fromCalls("company_profile_submissions").some((call) => call.ops.includes(`eq:id=${JSON.stringify(SUBMISSION)}`)),
    "the update must target the pending row's id",
  );
});

test("submitCompanyProfile refuses a caller who is not an active owner of the company", async () => {
  // The membership lookup finds nothing: the caller does not own this company.
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: null, error: null },
    },
  });

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    companyProfileForm(),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "unauthorized");
  assert.deepEqual(
    opsFor("company_profile_submissions"),
    [],
    "a non-owner must never reach the submissions table",
  );
});

test("submitCompanyProfile surfaces a membership-lookup failure instead of treating it as unauthorized", async () => {
  signedIn({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: null, error: { code: "08006", message: "connection failure" } },
    },
  });

  const { submitCompanyProfile } = await actions();
  // A database outage is not the same as "you do not own this": the DAL throws
  // so the failure is loud, and the action never downgrades it to a soft refusal.
  await assert.rejects(() => submitCompanyProfile({ status: "idle", message: "idle" }, companyProfileForm()));
});

test("submitCompanyProfile rejects a directory target that does not resolve to a branch", async () => {
  activeOwner();

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    // Well-formed, but no bundled entry carries this id.
    companyProfileForm({ directoryTarget: "not-a-real-entry:0" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "invalid");
  assert.deepEqual(opsFor("company_profile_submissions"), [], "an unresolvable branch must not be stored");
});

test("submitCompanyProfile carries a resolved directory branch onto the submission", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: { company_id: COMPANY }, error: null },
      companies: { data: ownedCompanyRow(), error: null },
      company_profile_submissions: { data: null, error: null },
    },
  });

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    companyProfileForm({ directoryTarget: `${DIRECTORY_ENTRY}:0` }),
  );

  assert.equal(state.message, "submitted");
  const insert = opsFor("company_profile_submissions").find((op) => op.startsWith("insert:"));
  assert.ok(insert, "an insert is expected");
  assert.ok(insert.includes(`"directory_entry_id":"${DIRECTORY_ENTRY}"`), insert);
  assert.ok(insert.includes('"directory_location_index":0'), insert);
});

test("submitCompanyProfile maps a unique-violation to the pending message", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_members: { data: { company_id: COMPANY }, error: null },
      companies: { data: ownedCompanyRow(), error: null },
      // Only the INSERT trips the unique constraint. The pending-lookup
      // `select` must succeed (no open submission), otherwise the action
      // reports `saveFailed` from the lookup error and never reaches the
      // 23505 branch this test is meant to exercise.
      company_profile_submissions: (ops) =>
        ops.some((op) => op.startsWith("insert:"))
          ? { data: null, error: { code: "23505", message: "duplicate pending submission" } }
          : { data: null, error: null },
    },
  });

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    companyProfileForm(),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "pending");
  assert.ok(
    opsFor("company_profile_submissions").some((op) => op.startsWith("insert:")),
    "the unique violation must come from an insert attempt",
  );
});

test("submitCompanyProfile rejects a municipality outside the district enum", async () => {
  activeOwner();

  const { submitCompanyProfile } = await actions();
  const state = await submitCompanyProfile(
    { status: "idle", message: "idle" },
    companyProfileForm({ municipality: "Atlantis" }),
  );

  assert.equal(state.message, "invalid");
  assert.deepEqual(opsFor("company_profile_submissions"), []);
});

// ---------------------------------------------------------------------------
// reviewCompanyProfile — the hand-rolled input gate and the branch check
// ---------------------------------------------------------------------------

function reviewForm(overrides: Record<string, string> = {}): FormData {
  return form({
    submissionId: SUBMISSION,
    decision: "approved",
    reviewNote: "",
    ...overrides,
  });
}

test("reviewCompanyProfile approves through the RPC and revalidates the affected paths", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_profile_submissions: {
        data: { directory_entry_id: null, directory_location_index: null },
        error: null,
      },
    },
    rpcs: { review_company_profile_submission: { data: null, error: null } },
  });

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm(),
  );

  assert.equal(state.status, "success");
  assert.equal(state.message, "approved");
  assert.deepEqual(rpcArgs("review_company_profile_submission"), {
    _submission_id: SUBMISSION,
    _decision: "approved",
    // An empty note is normalised to null, not an empty string.
    _review_note: null,
  });
  assert.deepEqual(recorded.revalidated, [
    "/admin/company-profiles",
    "/companies",
  ]);
});

test("reviewCompanyProfile passes a non-empty review note through to the RPC", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_profile_submissions: {
        data: { directory_entry_id: null, directory_location_index: null },
        error: null,
      },
    },
    rpcs: { review_company_profile_submission: { data: null, error: null } },
  });

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm({ decision: "rejected", reviewNote: "Belgeler eksik." }),
  );

  assert.equal(state.message, "rejected");
  assert.equal(rpcArgs("review_company_profile_submission")?._review_note, "Belgeler eksik.");
});

test("reviewCompanyProfile rejects a malformed submission id before any read", async () => {
  activeOwner();

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm({ submissionId: "not-a-uuid" }),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "failed");
  assert.deepEqual(
    fromCalls("company_profile_submissions"),
    [],
    "a malformed id must be refused before the table is read",
  );
  assert.deepEqual(rpcCalls("review_company_profile_submission"), []);
});

test("reviewCompanyProfile rejects an unknown decision before any read", async () => {
  activeOwner();

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm({ decision: "maybe" }),
  );

  assert.equal(state.message, "failed");
  assert.deepEqual(fromCalls("company_profile_submissions"), []);
});

test("reviewCompanyProfile rejects an over-long review note before any read", async () => {
  activeOwner();

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm({ reviewNote: "a".repeat(1_001) }),
  );

  assert.equal(state.message, "failed");
  assert.deepEqual(fromCalls("company_profile_submissions"), []);
});

test("reviewCompanyProfile refuses to approve a submission whose directory branch is gone", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_profile_submissions: {
        data: { directory_entry_id: "entry-that-was-removed", directory_location_index: 0 },
        error: null,
      },
    },
    rpcs: { review_company_profile_submission: { data: null, error: null } },
  });

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm(),
  );

  assert.equal(state.status, "error");
  assert.equal(state.message, "branchUnavailable");
  assert.deepEqual(
    rpcCalls("review_company_profile_submission"),
    [],
    "a missing branch must not reach the review RPC",
  );
});

test("reviewCompanyProfile reports a missing submission rather than approving nothing", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_profile_submissions: { data: null, error: null },
    },
  });

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm(),
  );

  assert.equal(state.message, "failed");
  assert.deepEqual(rpcCalls("review_company_profile_submission"), []);
});

test("reviewCompanyProfile maps a permission error from the RPC to unauthorized", async () => {
  activeOwner({
    tables: {
      profiles: { data: fakeProfileRow({ id: USER }), error: null },
      company_profile_submissions: {
        data: { directory_entry_id: null, directory_location_index: null },
        error: null,
      },
    },
    rpcs: {
      review_company_profile_submission: { data: null, error: { code: "42501", message: "not an admin" } },
    },
  });

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm(),
  );

  assert.equal(state.message, "unauthorized");
});

test("reviewCompanyProfile refuses an anonymous caller before any read", async () => {
  resetBoundary({ user: undefined });

  const { reviewCompanyProfile } = await actions();
  const state = await reviewCompanyProfile(
    { status: "idle", message: "idle" },
    reviewForm(),
  );

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(fromCalls("company_profile_submissions"), []);
  assert.deepEqual(rpcCalls("review_company_profile_submission"), []);
});
