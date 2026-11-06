import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  installBoundaryMocks,
  recorded,
  resetBoundary,
} from "./support/harness";

installBoundaryMocks();

/**
 * `getPushPreferenceState` is the read half of the push feature and the only
 * push action with no test: the write actions are covered by
 * `authorization-boundary.test.ts`, but this one branches on configuration, on
 * session, and on the shape of two RPC replies, and none of that was pinned.
 *
 * It runs in the browser's install flow, so a wrong branch is user-visible: a
 * configured deployment that reports `unsupported`, or a signed-in visitor whose
 * saved preferences come back as the defaults. The three branches below are the
 * contract.
 */

// A well-formed VAPID triple: 87-char public point, 43-char private key, mailto
// subject. `isPushConfigured` only shape-checks; it never calls the push service.
const VAPID = {
  VAPID_PUBLIC_KEY: "A".repeat(87),
  VAPID_PRIVATE_KEY: "B".repeat(43),
  VAPID_SUBJECT: "mailto:ops@example.invalid",
};

const pwaActions = () => import("@/features/pwa/actions");

const VAPID_KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const;

/**
 * Restores the VAPID triple exactly as it was found. An absent variable must be
 * restored by `delete`, not by assigning `undefined`: `process.env` coerces that
 * to the *string* `"undefined"`, which would outlive the test and be visible to
 * every later test in the process.
 */
function restoreVapid(saved: Partial<Record<(typeof VAPID_KEYS)[number], string>>): void {
  for (const key of VAPID_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function withVapidEnv<T>(env: Partial<Record<(typeof VAPID_KEYS)[number], string>>, body: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(VAPID_KEYS.map((key) => [key, process.env[key]]));
  for (const key of VAPID_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return body().finally(() => restoreVapid(saved));
}

function withVapid<T>(body: () => Promise<T>): Promise<T> {
  return withVapidEnv(VAPID, body);
}

function withoutVapid<T>(body: () => Promise<T>): Promise<T> {
  return withVapidEnv({}, body);
}

test("an unconfigured deployment reports unsupported without opening a session", async () => {
  resetBoundary();
  const { getPushPreferenceState } = await pwaActions();

  const state = await withoutVapid(() => getPushPreferenceState());

  assert.deepEqual(state, {
    permission: "unsupported",
    subscribed: false,
    preferences: null,
    supported: false,
    authenticated: false,
  });
  assert.deepEqual(recorded.supabase, [], "no Supabase work is needed to report unsupported");
});

test("a configured deployment with no session reports supported but not authenticated", async () => {
  resetBoundary();
  const { getPushPreferenceState } = await pwaActions();

  const state = await withVapid(() => getPushPreferenceState());

  assert.equal(state.supported, true);
  assert.equal(state.authenticated, false);
  assert.equal(state.subscribed, false);
  assert.equal(state.preferences, null);
});

test("a signed-in visitor with a subscription and saved preferences gets them mapped", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: {
      list_my_push_subscriptions: { data: [{ id: "sub-1" }] },
      get_my_push_preferences: {
        data: [
          {
            application_updates: true,
            // The columns are booleans, but the reply is untyped JSON; every
            // field is coerced, so a 1/null/"yes" must not leak through as-is.
            job_alerts: 1,
            employer_applications: null,
            messages: 0,
            marketing: "yes",
          },
        ],
      },
    },
  });
  const { getPushPreferenceState } = await pwaActions();

  const state = await withVapid(() => getPushPreferenceState());

  assert.equal(state.authenticated, true);
  assert.equal(state.subscribed, true);
  assert.deepEqual(state.preferences, {
    applicationUpdates: true,
    jobAlerts: true,
    employerApplications: false,
    messages: false,
    marketing: true,
  });
});

test("no subscriptions means not subscribed and no preference row means null", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: {
      list_my_push_subscriptions: { data: [] },
      get_my_push_preferences: { data: [] },
    },
  });
  const { getPushPreferenceState } = await pwaActions();

  const state = await withVapid(() => getPushPreferenceState());

  assert.equal(state.authenticated, true);
  assert.equal(state.subscribed, false);
  assert.equal(state.preferences, null);
});

test("the VAPID env is restored exactly, so an absent key does not leak as 'undefined'", async () => {
  // The bug this pins: assigning `process.env.X = undefined` stores the string
  // "undefined", so a test that ran with VAPID unset would leave every later
  // test in the process seeing a configured deployment. The helper must `delete`
  // an absent key instead.
  const before = VAPID_KEYS.map((key) => [key, process.env[key]] as const);

  await withoutVapid(async () => {});
  await withVapid(async () => {});

  for (const [key, value] of before) {
    assert.equal(process.env[key], value, `${key} was not restored to its pre-call value`);
    assert.notEqual(process.env[key], "undefined", `${key} leaked as the literal string "undefined"`);
  }
});
