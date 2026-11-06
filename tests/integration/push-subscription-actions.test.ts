import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  installBoundaryMocks,
  recorded,
  resetBoundary,
  setRequestHeaders,
  type SupabaseCall,
} from "./support/harness";

installBoundaryMocks();

/**
 * The write half of the push feature: `savePushSubscription`,
 * `removePushSubscription` and `savePushPreferences`.
 *
 * `push-preference-boundary.test.ts` pins the read half and
 * `authorization-boundary.test.ts` proves the anonymous refusal, but the
 * *authorized* path of these three was never exercised: which RPC is called,
 * with which arguments, and what the caller gets back when the database says no.
 * A regression here is silent to every existing layer — the action still returns
 * `{ ok: true }` if the RPC name is mistyped, because the fake and the real
 * PostgREST client both answer a missing RPC with `{ data: null, error: null }`.
 *
 * The action bodies, the Zod schemas and the SSRF allowlist run as written; only
 * the Supabase client is faked.
 */

const pwaActions = () => import("@/features/pwa/actions");

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/dGVzdA";
const VALID_SUBSCRIPTION = {
  endpoint: ENDPOINT,
  keys: { p256dh: "0123456789abcdef", auth: "abcdefgh" },
};

function rpcCalls(): Extract<SupabaseCall, { kind: "rpc" }>[] {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "rpc" }> => call.kind === "rpc",
  );
}

// ---------------------------------------------------------------------------
// savePushSubscription
// ---------------------------------------------------------------------------

test("an anonymous caller is refused before the payload is even validated", async () => {
  resetBoundary({ user: undefined });
  const { savePushSubscription } = await pwaActions();

  // The payload is also invalid, but the session gate must answer first so an
  // anonymous caller learns nothing about the accepted endpoint shape.
  const result = await savePushSubscription({ endpoint: "nope" });

  assert.deepEqual(result, { ok: false, reason: "unauthenticated" });
  assert.deepEqual(rpcCalls(), []);
});

test("a signed-in caller with a malformed payload is refused without a write", async () => {
  resetBoundary({ user: fakeAuthUser() });
  const { savePushSubscription } = await pwaActions();

  const result = await savePushSubscription({
    endpoint: "https://evil.example/x",
    keys: { p256dh: "0123456789abcdef", auth: "abcdefgh" },
  });

  assert.deepEqual(result, { ok: false, reason: "invalid" });
  assert.deepEqual(rpcCalls(), []);
});

test("a valid subscription is stored with the caller's keys and a truncated user-agent", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { register_push_subscription: { data: null, error: null } },
  });
  setRequestHeaders({ "user-agent": "M".repeat(400) });
  const { savePushSubscription } = await pwaActions();

  const result = await savePushSubscription(VALID_SUBSCRIPTION);

  assert.deepEqual(result, { ok: true });
  const [call] = rpcCalls();
  assert.ok(call, "the registration RPC must be called exactly once");
  assert.equal(call.name, "register_push_subscription");
  assert.equal(call.args._endpoint, ENDPOINT);
  assert.equal(call.args._p256dh, "0123456789abcdef");
  assert.equal(call.args._auth_key, "abcdefgh");
  assert.equal(call.args._user_agent, "M".repeat(300));
});

test("a missing user-agent is forwarded as null, not the string 'undefined'", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { register_push_subscription: { data: null, error: null } },
  });
  const { savePushSubscription } = await pwaActions();

  await savePushSubscription(VALID_SUBSCRIPTION);

  const [call] = rpcCalls();
  assert.equal(call.args._user_agent, null);
});

test("a rejected registration surfaces as an error, not a silent success", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: {
      register_push_subscription: { data: null, error: { code: "42501", message: "denied" } },
    },
  });
  const { savePushSubscription } = await pwaActions();

  const result = await savePushSubscription(VALID_SUBSCRIPTION);

  assert.deepEqual(result, { ok: false, reason: "error" });
});

// ---------------------------------------------------------------------------
// removePushSubscription
// ---------------------------------------------------------------------------

test("an anonymous caller cannot revoke and reaches no RPC", async () => {
  resetBoundary({ user: undefined });
  const { removePushSubscription } = await pwaActions();

  const result = await removePushSubscription(ENDPOINT);

  assert.deepEqual(result, { ok: false });
  assert.deepEqual(rpcCalls(), []);
});

test("a signed-in caller revokes the endpoint it named", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { revoke_push_subscription: { data: null, error: null } },
  });
  const { removePushSubscription } = await pwaActions();

  const result = await removePushSubscription(ENDPOINT);

  assert.deepEqual(result, { ok: true });
  const [call] = rpcCalls();
  assert.equal(call.name, "revoke_push_subscription");
  assert.equal(call.args._endpoint, ENDPOINT);
});

test("a null endpoint is forwarded as null so the RPC can revoke everything", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { revoke_push_subscription: { data: null, error: null } },
  });
  const { removePushSubscription } = await pwaActions();

  await removePushSubscription(null);

  const [call] = rpcCalls();
  assert.equal(call.args._endpoint, null, "a null endpoint must not become the string 'null'");
});

test("a rejected revoke is reported, not swallowed", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { revoke_push_subscription: { data: null, error: { code: "42501" } } },
  });
  const { removePushSubscription } = await pwaActions();

  assert.deepEqual(await removePushSubscription(ENDPOINT), { ok: false });
});

// ---------------------------------------------------------------------------
// savePushPreferences
// ---------------------------------------------------------------------------

const VALID_PREFERENCES = {
  applicationUpdates: true,
  jobAlerts: false,
  employerApplications: true,
  messages: false,
  marketing: false,
};

test("a malformed preference payload is refused before any session work", async () => {
  resetBoundary({ user: fakeAuthUser() });
  const { savePushPreferences } = await pwaActions();

  const result = await savePushPreferences({ applicationUpdates: "yes" } as never);

  assert.deepEqual(result, { ok: false });
  assert.deepEqual(rpcCalls(), []);
});

test("a signed-in caller's preferences reach the RPC field-for-field", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { set_push_notification_preferences: { data: null, error: null } },
  });
  const { savePushPreferences } = await pwaActions();

  const result = await savePushPreferences(VALID_PREFERENCES);

  assert.deepEqual(result, { ok: true });
  const [call] = rpcCalls();
  assert.equal(call.name, "set_push_notification_preferences");
  assert.deepEqual(call.args, {
    _application_updates: true,
    _job_alerts: false,
    _employer_applications: true,
    _messages: false,
    _marketing: false,
  });
});

test("a rejected preference write is reported, not swallowed", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { set_push_notification_preferences: { data: null, error: { code: "42501" } } },
  });
  const { savePushPreferences } = await pwaActions();

  assert.deepEqual(await savePushPreferences(VALID_PREFERENCES), { ok: false });
});

test("an anonymous caller's preferences are refused", async () => {
  resetBoundary({ user: undefined });
  const { savePushPreferences } = await pwaActions();

  assert.deepEqual(await savePushPreferences(VALID_PREFERENCES), { ok: false });
  assert.deepEqual(rpcCalls(), []);
});
