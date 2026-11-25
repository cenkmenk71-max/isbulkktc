import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  fakeProfileRow,
  installBoundaryMocks,
  recorded,
  resetBoundary,
  type RpcOutcome,
} from "./support/harness";

installBoundaryMocks();

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

function activeUser(rpcs: Record<string, RpcOutcome> = {}) {
  return resetBoundary({
    user: fakeAuthUser({ id: ID }),
    tables: { profiles: { data: fakeProfileRow({ id: ID }), error: null } },
    rpcs,
  });
}

test("company order DAL sends no client-authoritative price", async () => {
  activeUser({ create_order: { data: OTHER_ID, error: null } });

  const { createCompanyOrder } = await import("../../src/server/dal/billing");
  const orderId = await createCompanyOrder({
    companyId: ID,
    listingPlanCode: "starter-plan",
    durationDays: 7,
  });

  assert.equal(orderId, OTHER_ID);
  const call = recorded.supabase.find(
    (entry) => entry.kind === "rpc" && entry.name === "create_order",
  );
  assert.ok(call && call.kind === "rpc");
  assert.deepEqual(call.args, {
    _company_id: ID,
    _listing_plan_code: "starter-plan",
    _duration_days: 7,
  });
});

test("company order DAL rejects unknown price fields before database access", async () => {
  activeUser({ create_order: { data: OTHER_ID, error: null } });

  const { createCompanyOrder } = await import("../../src/server/dal/billing");
  await assert.rejects(
    createCompanyOrder({
      companyId: ID,
      listingPlanCode: "starter-plan",
      durationDays: 7,
      amountMinor: 1,
    } as never),
  );
  assert.equal(
    recorded.supabase.some(
      (entry) => entry.kind === "rpc" && entry.name === "create_order",
    ),
    false,
  );
});

test("resume metadata DAL binds the row to the authenticated candidate", async () => {
  activeUser({ create_resume: { data: OTHER_ID, error: null } });

  const { registerResume } = await import("../../src/server/dal/resumes");
  const resumeId = await registerResume({
    storagePath: `${ID}/resume.pdf`,
    originalFilename: "resume.pdf",
    fileSizeBytes: 1024,
    mimeType: "application/pdf",
    pageCount: 2,
  });

  assert.equal(resumeId, OTHER_ID);
  const call = recorded.supabase.find(
    (entry) => entry.kind === "rpc" && entry.name === "create_resume",
  );
  assert.ok(call && call.kind === "rpc");
  assert.equal(call.args._candidate_id, ID);
});

test("saved job DAL uses the authenticated user id for the insert", async () => {
  activeUser();

  const { saveJob } = await import("../../src/server/dal/saved-jobs");
  await saveJob(OTHER_ID);

  const call = recorded.supabase.find(
    (entry) => entry.kind === "from" && entry.table === "saved_jobs",
  );
  assert.ok(call && call.kind === "from");
  assert.ok(
    call.ops.some((operation) =>
      operation.includes(`"user_id":"${ID}"`),
    ),
  );
});

test("messaging DAL sends only the authenticated member's text payload", async () => {
  activeUser({ send_message: { data: OTHER_ID, error: null } });

  const { sendConversationMessage } = await import("../../src/server/dal/messaging");
  assert.equal(
    await sendConversationMessage({
      conversationId: OTHER_ID,
      body: "Synthetic message",
    }),
    OTHER_ID,
  );
  const call = recorded.supabase.find(
    (entry) => entry.kind === "rpc" && entry.name === "send_message",
  );
  assert.ok(call && call.kind === "rpc");
  assert.deepEqual(call.args, {
    _conversation_id: OTHER_ID,
    _body: "Synthetic message",
    _message_type: "text",
    _metadata: {},
  });
});
