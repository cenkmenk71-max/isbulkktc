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

function withVapid<T>(body: () => Promise<T>): Promise<T> {
  const saved = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  };
  Object.assign(process.env, VAPID);
  return body().finally(() => {
    process.env.VAPID_PUBLIC_KEY = saved.publicKey;
    process.env.VAPID_PRIVATE_KEY = saved.privateKey;
    process.env.VAPID_SUBJECT = saved.subject;
  });
}

function withoutVapid<T>(body: () => Promise<T>): Promise<T> {
  const saved = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  };
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
  return body().finally(() => {
    process.env.VAPID_PUBLIC_KEY = saved.publicKey;
    process.env.VAPID_PRIVATE_KEY = saved.privateKey;
    process.env.VAPID_SUBJECT = saved.subject;
  });
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
