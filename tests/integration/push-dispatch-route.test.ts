import assert from "node:assert/strict";
import { mock } from "node:test";
import test from "node:test";

import { installBoundaryMocks, recorded, resetBoundary } from "./support/harness";

installBoundaryMocks();

/**
 * `POST /api/push/dispatch` — the Web Push worker.
 *
 * `tests/security/cron-route-auth.test.ts` pins the bearer guard in source text
 * and `tests/e2e/pwa-install.spec.ts` only proves an unauthenticated POST is
 * refused. The *delivery loop* — claim a batch, look up each recipient's
 * devices, send, and record the per-device outcome — had no behavioural test at
 * all, even though it is the only place a device is retired, a row is marked
 * sent, and a failed claim is retried. A refactor could keep the guard green
 * while double-sending, or while retiring a live device on a transient error.
 *
 * The route body, `buildApplicationPushPayload` and the real `sendPushMessage`
 * classification logic are what is exercised; the two process edges (`web-push`
 * transport, Supabase RPCs) are faked. `sendPushMessage` is faked because the
 * real one performs a network send; its own classification (404/410 → gone,
 * 429/5xx → retryable) is covered separately and the route only reads the
 * status it returns.
 */

type PushSendResult =
  | { status: "delivered"; statusCode: number }
  | { status: "gone"; statusCode: number }
  | { status: "failed"; statusCode: number; retryable: boolean }
  | { status: "blocked" }
  | { status: "not_configured" };

// Per-endpoint send outcome, plus the payload each endpoint received. Reset per
// test so a leaked outcome cannot make the next test pass for the wrong reason.
const sendOutcomes = new Map<string, PushSendResult>();
const sentPayloads: { endpoint: string; payload: string }[] = [];

mock.module("@/server/push/vapid", {
  namedExports: {
    sendPushMessage: async (target: { endpoint: string }, payload: string): Promise<PushSendResult> => {
      sentPayloads.push({ endpoint: target.endpoint, payload });
      return sendOutcomes.get(target.endpoint) ?? { status: "delivered", statusCode: 201 };
    },
    isPushConfigured: () => true,
    getVapidPublicKey: () => "A".repeat(87),
  },
});

const dispatchRoute = () => import("@/app/api/push/dispatch/route");

const CRON_SECRET = "integration-push-cron-secret";
const FCM = "https://fcm.googleapis.com/fcm/send/device-a";
const MOZILLA = "https://updates.push.services.mozilla.com/wpush/v2/device-b";

type Claimed = {
  notification_id: string;
  user_id: string;
  event_type: string;
  job_title: string;
  application_status: string | null;
  application_id: string;
};

type Target = {
  subscription_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  locale: string | null;
};

function claim(overrides: Partial<Claimed> = {}): Claimed {
  return {
    notification_id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    event_type: "status_changed",
    job_title: "Backend Engineer",
    application_status: "shortlisted",
    application_id: "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
}

function target(overrides: Partial<Target> = {}): Target {
  return {
    subscription_id: "44444444-4444-4444-8444-444444444444",
    endpoint: FCM,
    p256dh: "p256dh-key",
    auth_key: "auth-key",
    locale: "tr",
    ...overrides,
  };
}

function serviceScript(
  claims: Claimed[],
  targetsByUser: Record<string, Target[]> = {},
  options: { claimError?: { code?: string }; targetError?: { code?: string } } = {},
) {
  return {
    rpcs: {
      claim_application_push_notifications: options.claimError
        ? { data: null, error: options.claimError }
        : { data: claims, error: null },
      list_push_targets_for_notification: (args: Record<string, unknown>) => {
        if (options.targetError) return { data: null, error: options.targetError };
        return { data: targetsByUser[args._user_id as string] ?? [], error: null };
      },
      record_push_delivery_result: { data: null, error: null },
      finish_application_push_notification: { data: null, error: null },
    },
  };
}

function withEnv(vars: Record<string, string | undefined>): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function request(authorization?: string): Request {
  return new Request("https://isbulkktc.test/api/push/dispatch", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

function rpcCalls(name: string) {
  return recorded.supabase.filter(
    (call): call is Extract<(typeof recorded.supabase)[number], { kind: "rpc" }> =>
      call.kind === "rpc" && call.name === name,
  );
}

function resetSendState(): void {
  sendOutcomes.clear();
  sentPayloads.length = 0;
}

test("an unauthenticated POST is refused before any work", async () => {
  resetBoundary({}, { rpcs: {} });
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request());

    assert.equal(res.status, 401);
    assert.deepEqual(recorded.supabase, [], "the guard must precede the service client");
    assert.deepEqual(sentPayloads, []);
  } finally {
    restore();
  }
});

test("an unconfigured service client answers 503 and claims nothing", async () => {
  resetBoundary({}, null);
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 503);
    assert.deepEqual(rpcCalls("claim_application_push_notifications"), []);
  } finally {
    restore();
  }
});

test("a failed claim answers 502 without leaking the database error", async () => {
  resetBoundary({}, serviceScript([], {}, { claimError: { code: "57014" } }));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    assert.equal(res.status, 502);
    assert.equal(body.message, "Claim failed");
    assert.ok(!JSON.stringify(body).includes("57014"), "the DB error code must not be reflected");
  } finally {
    restore();
  }
});

test("the claim is asked for the fixed batch size", async () => {
  resetBoundary({}, serviceScript([]));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    await POST(request(`Bearer ${CRON_SECRET}`));

    const claims = rpcCalls("claim_application_push_notifications");
    assert.equal(claims.length, 1);
    assert.equal(claims[0].args._batch_size, 25);
  } finally {
    restore();
  }
});

test("a claimed row with no device is marked sent and counted skipped", async () => {
  const row = claim();
  resetBoundary({}, serviceScript([row], {}));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    assert.deepEqual(
      { claimed: body.claimed, delivered: body.delivered, failed: body.failed, skipped: body.skipped },
      { claimed: 1, delivered: 0, failed: 0, skipped: 1 },
    );
    // Targets are looked up for the row's own user, under the application category.
    const lookups = rpcCalls("list_push_targets_for_notification");
    assert.equal(lookups.length, 1);
    assert.equal(lookups[0].args._user_id, row.user_id);
    assert.equal(lookups[0].args._category, "application_updates");

    // Marking sent is correct: retrying would never find a target.
    const finishes = rpcCalls("finish_application_push_notification");
    assert.equal(finishes.length, 1);
    assert.equal(finishes[0].args._notification_id, row.notification_id);
    assert.equal(finishes[0].args._delivered, true);
    assert.deepEqual(sentPayloads, []);
  } finally {
    restore();
  }
});

test("a delivered send records success and marks the row delivered", async () => {
  const row = claim();
  const device = target();
  resetBoundary({}, serviceScript([row], { [row.user_id]: [device] }));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    assert.deepEqual(
      { claimed: body.claimed, delivered: body.delivered, failed: body.failed, skipped: body.skipped },
      { claimed: 1, delivered: 1, failed: 0, skipped: 0 },
    );

    const results = rpcCalls("record_push_delivery_result");
    assert.equal(results.length, 1);
    assert.equal(results[0].args._subscription_id, device.subscription_id);
    assert.equal(results[0].args._delivered, true);
    assert.equal(results[0].args._permanent_failure, false);

    const finishes = rpcCalls("finish_application_push_notification");
    assert.equal(finishes[0].args._delivered, true);
  } finally {
    restore();
  }
});

test("a gone subscription is retired as a permanent failure", async () => {
  const row = claim();
  const device = target({ subscription_id: "55555555-5555-4555-8555-555555555555", endpoint: MOZILLA });
  resetBoundary({}, serviceScript([row], { [row.user_id]: [device] }));
  resetSendState();
  sendOutcomes.set(device.endpoint, { status: "gone", statusCode: 410 });
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    // A dead device is a failed delivery for the row, but the device is retired.
    assert.equal(body.failed, 1);
    const results = rpcCalls("record_push_delivery_result");
    assert.equal(results[0].args._delivered, false);
    assert.equal(results[0].args._permanent_failure, true, "a gone subscription must be retired");
    assert.equal(rpcCalls("finish_application_push_notification")[0].args._delivered, false);
  } finally {
    restore();
  }
});

test("a blocked endpoint is retired like a gone subscription", async () => {
  const row = claim();
  const device = target({ subscription_id: "66666666-6666-4666-8666-666666666666" });
  resetBoundary({}, serviceScript([row], { [row.user_id]: [device] }));
  resetSendState();
  sendOutcomes.set(device.endpoint, { status: "blocked" });
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    await POST(request(`Bearer ${CRON_SECRET}`));

    const results = rpcCalls("record_push_delivery_result");
    assert.equal(results[0].args._delivered, false);
    assert.equal(results[0].args._permanent_failure, true);
  } finally {
    restore();
  }
});

test("a transient failure is recorded as retryable, not permanent", async () => {
  const row = claim();
  const device = target({ subscription_id: "77777777-7777-4777-8777-777777777777" });
  resetBoundary({}, serviceScript([row], { [row.user_id]: [device] }));
  resetSendState();
  sendOutcomes.set(device.endpoint, { status: "failed", statusCode: 503, retryable: true });
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    await POST(request(`Bearer ${CRON_SECRET}`));

    const results = rpcCalls("record_push_delivery_result");
    assert.equal(results[0].args._delivered, false);
    assert.equal(results[0].args._permanent_failure, false, "a 5xx must not retire the device");
  } finally {
    restore();
  }
});

test("a target-lookup error leaves the row unmarked so it is retried", async () => {
  const row = claim();
  resetBoundary({}, serviceScript([row], {}, { targetError: { code: "57014" } }));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    assert.equal(body.failed, 1);
    assert.deepEqual(
      rpcCalls("finish_application_push_notification"),
      [],
      "an unmarked row is claimed again on the next run",
    );
    assert.deepEqual(sentPayloads, []);
  } finally {
    restore();
  }
});

test("the payload carries the target locale and the application link", async () => {
  const row = claim({ application_id: "88888888-8888-4888-8888-888888888888", job_title: "Tasarımcı" });
  const device = target({ locale: "de" });
  resetBoundary({}, serviceScript([row], { [row.user_id]: [device] }));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(sentPayloads.length, 1);
    const payload = JSON.parse(sentPayloads[0].payload);
    assert.equal(
      payload.url,
      "/de/profile/dashboard#my-applications",
      "the link must target the candidate dashboard, prefixed",
    );
    assert.equal(payload.tag, `application-${row.application_id}`);
    assert.ok(payload.title && payload.body, "the payload must carry copy");
    assert.ok(
      !payload.url.includes("//"),
      "a protocol-relative link would leave the app",
    );
  } finally {
    restore();
  }
});

test("two devices for one row both receive the payload", async () => {
  const row = claim();
  const first = target({ subscription_id: "99999999-9999-4999-8999-999999999999", endpoint: FCM });
  const second = target({
    subscription_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    endpoint: MOZILLA,
  });
  resetBoundary({}, serviceScript([row], { [row.user_id]: [first, second] }));
  resetSendState();
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    assert.equal(sentPayloads.length, 2, "every device of the row is targeted");
    assert.equal(body.delivered, 1, "the row counts once even with two devices");
    assert.equal(rpcCalls("record_push_delivery_result").length, 2);
  } finally {
    restore();
  }
});

test("one device delivered makes the row delivered even if another failed", async () => {
  const row = claim();
  const good = target({ subscription_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", endpoint: FCM });
  const bad = target({
    subscription_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    endpoint: MOZILLA,
  });
  resetBoundary({}, serviceScript([row], { [row.user_id]: [good, bad] }));
  resetSendState();
  sendOutcomes.set(bad.endpoint, { status: "failed", statusCode: 500, retryable: true });
  const restore = withEnv({ PUSH_CRON_SECRET: CRON_SECRET });
  try {
    const { POST } = await dispatchRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));
    const body = await res.json();

    assert.equal(body.delivered, 1);
    assert.equal(body.failed, 0);
    assert.equal(rpcCalls("finish_application_push_notification")[0].args._delivered, true);
  } finally {
    restore();
  }
});
