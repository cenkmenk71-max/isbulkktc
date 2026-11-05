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
 * The authorization boundary, exercised through the real action bodies.
 *
 * `tests/unit/**` proves the schemas; `tests/e2e/**` proves the screens. Neither
 * proves the one thing that actually protects a row: that a server action refuses
 * an unauthorized caller **before** it reaches the database. A missing
 * `getCurrentUser()` guard is invisible to both layers — the unit test does not
 * call the action, and the E2E test only ever clicks as a signed-in user.
 *
 * So the assertion here is not only "returns an error"; it is "reaches the
 * network edge zero times". A protected action that answers `unauthorized`
 * *after* it has already written the row is still a breach, and only the call log
 * can tell the difference.
 */

const ID = "00000000-0000-4000-8000-000000000001";

type ActionCase = {
  /** Path relative to `src/`, for a readable failure message. */
  module: string;
  name: string;
  args: () => unknown[];
};

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** A valid job draft, so a failure cannot be blamed on schema validation. */
function validJobDraftForm(): FormData {
  return form({
    companyId: ID,
    title: "Kıdemli yazılım geliştirici",
    slug: "kidemli-yazilim-gelistirici",
    summary: "Kuzey Kıbrıs'ta bir fintech ekibi için ürün geliştirecek geliştirici.",
    description:
      "Ürün ekibimizde uçtan uca özellik geliştirecek, kod incelemesi yapacak ve dağıtımı yönetecek bir geliştirici arıyoruz.",
    jobType: "full_time",
    workplaceMode: "on_site",
  });
}

function validPackageForm(): FormData {
  return form({
    code: "starter",
    displayName: "Başlangıç",
    description: "",
    maxActiveJobs: "1",
    jobDurationDays: "30",
    isActive: "true",
  });
}

function validFaqForm(): FormData {
  return form({
    locale: "tr",
    question: "İlan vermek ücretli mi?",
    answer: "Temel ilan ücretsizdir; öne çıkarma paketleri ücretlidir.",
    sortOrder: "0",
    isPublished: "true",
  });
}

/**
 * The boundary calls that read or write *business* data. Two calls are excluded
 * because they are part of establishing authority rather than acting on it:
 * `from(profiles)` is the session bootstrap inside `getCurrentUser`, and
 * `rpc(has_platform_role)` is the role probe. Everything else is an action
 * touching data it was not authorized to touch.
 */
function businessCalls(): string[] {
  return recorded.supabase
    .filter((call) => call.kind !== "auth")
    .map((call) => (call.kind === "from" ? `from(${call.table})` : `rpc(${call.name})`))
    .filter((call) => call !== "from(profiles)" && call !== "rpc(has_platform_role)");
}

/** Every boundary call, for tests that must prove *nothing* was reached. */
function dataCalls(): string[] {
  return recorded.supabase
    .filter((call) => call.kind !== "auth")
    .map((call) => (call.kind === "from" ? `from(${call.table})` : `rpc(${call.name})`));
}

function fromCalls(table: string) {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "from" }> => call.kind === "from" && call.table === table,
  );
}

function rpcNames(): string[] {
  return recorded.supabase
    .filter((call): call is Extract<SupabaseCall, { kind: "rpc" }> => call.kind === "rpc")
    .map((call) => call.name);
}

async function callAction(module: string, name: string, args: unknown[]): Promise<unknown> {
  const loaded = (await import(`../../src/${module}`)) as Record<string, (...a: unknown[]) => unknown>;
  const action = loaded[name];
  assert.equal(typeof action, "function", `${module}#${name} is not exported`);
  return action(...args);
}

// ---------------------------------------------------------------------------
// 1. Anonymous caller: every protected action refuses and touches nothing.
// ---------------------------------------------------------------------------

const anonymousCases: ActionCase[] = [
  { module: "features/candidates/actions.ts", name: "saveCandidateProfile", args: () => [{}, form()] },
  { module: "features/companies/actions.ts", name: "createCompany", args: () => [{}, form()] },
  { module: "features/companies/actions.ts", name: "submitCompanyProfile", args: () => [{}, form()] },
  { module: "features/companies/actions.ts", name: "reviewCompanyProfile", args: () => [{}, form()] },
  { module: "features/editorial/admin-content-actions.ts", name: "saveLegalDocument", args: () => [{}, form()] },
  { module: "features/editorial/admin-content-actions.ts", name: "saveFaqEntry", args: () => [{}, validFaqForm()] },
  {
    module: "features/editorial/admin-content-actions.ts",
    name: "deleteFaqEntry",
    args: () => [{}, form({ faqId: ID })],
  },
  { module: "features/editorial/admin-content-actions.ts", name: "saveListingPlan", args: () => [{}, form()] },
  { module: "features/jobs/actions.ts", name: "saveJobDraft", args: () => [{}, validJobDraftForm()] },
  { module: "features/jobs/actions.ts", name: "submitJobForReview", args: () => [{}, form({ jobId: ID })] },
  { module: "features/jobs/actions.ts", name: "publishApprovedJob", args: () => [{}, form({ jobId: ID })] },
  { module: "features/jobs/actions.ts", name: "saveJobPackage", args: () => [{}, validPackageForm()] },
  {
    module: "features/jobs/actions.ts",
    name: "assignCompanyJobPackage",
    args: () => [{}, form({ companyId: ID, packageId: ID })],
  },
  { module: "features/jobs/actions.ts", name: "applyToJob", args: () => [{}, form({ jobId: ID })] },
  {
    module: "features/jobs/actions.ts",
    name: "transitionApplication",
    args: () => [{}, form({ applicationId: ID, nextStatus: "reviewing" })],
  },
  {
    module: "features/jobs/actions.ts",
    name: "reviewJob",
    args: () => [{}, form({ jobId: ID, decision: "approved" })],
  },
  { module: "features/jobs/actions.ts", name: "markApplicationViewed", args: () => [form({ applicationId: ID })] },
  { module: "features/identity/admin-mfa-actions.ts", name: "beginAdminMfa", args: () => [{}] },
  {
    module: "features/identity/admin-mfa-actions.ts",
    name: "verifyAdminMfa",
    args: () => [{}, form({ mode: "challenge", factorId: ID, challengeId: ID, code: "123456" })],
  },
];

for (const action of anonymousCases) {
  test(`anonymous caller cannot reach the database through ${action.module}#${action.name}`, async () => {
    resetBoundary({ user: undefined });

    if (action.name === "markApplicationViewed") {
      await assert.rejects(
        () => callAction(action.module, action.name, action.args()),
        (error: unknown) => isRedirect(error),
        `${action.name} must redirect an anonymous caller`,
      );
      assert.deepEqual(recorded.redirects, ["/login"]);
    } else {
      const state = await callAction(action.module, action.name, action.args());
      assert.equal(
        (state as { status?: string }).status,
        "error",
        `${action.name} must answer with an error state, got ${JSON.stringify(state)}`,
      );
      assert.equal(
        (state as { message?: string }).message,
        "unauthorized",
        `${action.name} must report "unauthorized", got ${JSON.stringify(state)}`,
      );
    }

    assert.deepEqual(
      dataCalls(),
      [],
      `${action.name} reached the database without a session: ${dataCalls().join(", ")}`,
    );
  });
}

// ---------------------------------------------------------------------------
// 2. The action-level role guard runs before the write it protects.
// ---------------------------------------------------------------------------

const roleGuardedCases: ActionCase[] = [
  { module: "features/jobs/actions.ts", name: "saveJobPackage", args: () => [{}, validPackageForm()] },
  {
    module: "features/jobs/actions.ts",
    name: "assignCompanyJobPackage",
    args: () => [{}, form({ companyId: ID, packageId: ID })],
  },
  {
    module: "features/jobs/actions.ts",
    name: "reviewJob",
    args: () => [{}, form({ jobId: ID, decision: "approved" })],
  },
];

for (const action of roleGuardedCases) {
  test(`a signed-in non-admin is stopped before the write in ${action.module}#${action.name}`, async () => {
    resetBoundary({
      user: fakeAuthUser(),
      tables: { profiles: { data: fakeProfileRow(), error: null }, user_roles: { data: null, error: null } },
      rpcs: { has_platform_role: { data: false, error: null } },
    });

    const state = await callAction(action.module, action.name, action.args());
    assert.equal((state as { message?: string }).message, "unauthorized");

    // Only the session bootstrap and the role probe are allowed; the protected
    // RPC must not be called.
    assert.deepEqual(
      businessCalls(),
      [],
      `${action.name} called the protected RPC without an admin role`,
    );
  });
}

// ---------------------------------------------------------------------------
// 3. Positive controls: the guard admits the caller it should.
//
// Without these, a guard that always refuses would pass every test above. Each
// one flips exactly the input the guard reads and asserts the protected call now
// happens.
// ---------------------------------------------------------------------------

test("an admin with the role reaches the protected package RPC", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: { profiles: { data: fakeProfileRow({ id: ID }), error: null } },
    rpcs: {
      has_platform_role: { data: true, error: null },
      admin_save_job_package: { data: null, error: null },
    },
  });

  const { saveJobPackage } = await import("../../src/features/jobs/actions");
  const state = await saveJobPackage({ status: "idle", message: "idle" } as never, validPackageForm());

  assert.equal(state.status, "success");
  assert.ok(rpcNames().includes("admin_save_job_package"), "the admin write must be attempted");
});

test("an active company member can save a job draft", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: {
      profiles: { data: fakeProfileRow({ id: ID }), error: null },
      jobs: { data: { id: ID }, error: null },
    },
    rpcs: { is_active_company_member: { data: true, error: null } },
  });

  const { saveJobDraft } = await import("../../src/features/jobs/actions");
  const state = await saveJobDraft({ status: "idle", message: "idle" } as never, validJobDraftForm());

  assert.equal(state.status, "success");
  assert.equal(state.jobId, ID);
  assert.ok(
    fromCalls("jobs").some((call) => call.ops.some((op) => op.startsWith("insert:"))),
    "an authorized employer must reach the insert",
  );
});

test("a non-member cannot save a job draft for a company they do not belong to", async () => {
  resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: { profiles: { data: fakeProfileRow({ id: ID }), error: null } },
    rpcs: { is_active_company_member: { data: false, error: null } },
  });

  const { saveJobDraft } = await import("../../src/features/jobs/actions");
  const state = await saveJobDraft({ status: "idle", message: "idle" } as never, validJobDraftForm());

  assert.equal(state.message, "unauthorized");
  assert.deepEqual(fromCalls("jobs"), [], "a non-member must not touch the jobs table");
});

// ---------------------------------------------------------------------------
// 4. A suspended account is refused exactly like an anonymous one.
// ---------------------------------------------------------------------------

test("a suspended account cannot save a job draft", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    tables: { profiles: { data: fakeProfileRow({ status: "suspended" }), error: null } },
  });

  const { saveJobDraft } = await import("../../src/features/jobs/actions");
  const state = await saveJobDraft({ status: "idle", message: "idle" } as never, validJobDraftForm());

  assert.equal(state.status, "error");
  assert.equal(state.message, "unauthorized");
  assert.deepEqual(businessCalls(), [], "a suspended account must not reach business data");
});

// ---------------------------------------------------------------------------
// 4. The push actions fail closed for an anonymous caller.
// ---------------------------------------------------------------------------

test("anonymous push subscription writes fail closed", async () => {
  resetBoundary({ user: undefined });

  const { savePushSubscription, removePushSubscription, savePushPreferences } = await import(
    "../../src/features/pwa/actions"
  );

  assert.deepEqual(
    await savePushSubscription({
      endpoint: "https://push.example.invalid/abc",
      keys: { p256dh: "B".repeat(40), auth: "A".repeat(20) },
    }),
    { ok: false, reason: "unauthenticated" },
  );
  assert.deepEqual(await removePushSubscription("https://push.example.invalid/abc"), { ok: false });
  assert.deepEqual(
    await savePushPreferences({
      applicationUpdates: true,
      jobAlerts: true,
      employerApplications: true,
      messages: true,
      marketing: false,
    }),
    { ok: false },
  );

  assert.deepEqual(dataCalls(), [], "an anonymous caller must not reach the push RPCs");
});

// ---------------------------------------------------------------------------
// 5. The two deliberately-anonymous actions DO reach the boundary.
// ---------------------------------------------------------------------------

test("the anonymous feedback action is not gated on a session", async () => {
  resetBoundary({
    user: undefined,
    rpcs: { submit_feedback: { data: "00000000-0000-4000-8000-0000000000f1", error: null } },
  });

  const { submitFeedback } = await import("../../src/features/feedback/actions");
  const state = await submitFeedback(
    { status: "idle", message: "idle" } as never,
    form({
      message: "The listing filter drops the district I picked.",
      category: "bug",
      locale: "tr",
    }),
  );

  assert.equal(state.status, "success");
  assert.ok(
    dataCalls().includes("rpc(submit_feedback)"),
    "feedback is an anonymous path and must reach its RPC",
  );
});

test("the anonymous sales action is not gated on a session", async () => {
  resetBoundary({
    user: undefined,
    rpcs: { submit_sales_lead: { data: "00000000-0000-4000-8000-0000000000f2", error: null } },
  });

  const { submitSalesLead } = await import("../../src/features/sales/actions");
  const state = await submitSalesLead(
    { status: "idle", message: "idle" } as never,
    form({ companyName: "Acme", email: "lead@example.invalid", locale: "tr" }),
  );

  assert.equal(state.status, "success");
  assert.ok(
    dataCalls().includes("rpc(submit_sales_lead)"),
    "sales is an anonymous path and must reach its RPC",
  );
});
