import assert from "node:assert/strict";
import test from "node:test";

import {
  fakeAuthUser,
  installBoundaryMocks,
  recorded,
  resetBoundary,
  type SupabaseCall,
} from "./support/harness";

installBoundaryMocks();

/**
 * `POST /api/push/subscriptions` — the service worker's re-registration endpoint.
 *
 * This route is how a rotated push subscription reaches the database. Until now
 * it had two partial guards: a source-text test in `tests/security/**` that
 * proves the session check *precedes* the body read, and an E2E test that only
 * ever posts as a signed-in visitor. Neither exercises the branches in between:
 * a malformed body, a body that fails the endpoint allowlist, a valid body whose
 * write fails. A refactor could keep the ordering assertion true while answering
 * the wrong status, calling the RPC with the wrong argument, or leaking the
 * database error text.
 *
 * The route body, its Zod schema and the SSRF allowlist (`isAllowedPushEndpoint`)
 * all run as written; only the Supabase client is faked. `push-endpoint-ssrf.test.ts`
 * proves the allowlist primitive, so these tests assert on the route's *use* of it.
 */

const route = () => import("@/app/api/push/subscriptions/route");

const VALID_ENDPOINT = "https://fcm.googleapis.com/fcm/send/dGVzdA";

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://isbulkktc.test/api/push/subscriptions", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    endpoint: VALID_ENDPOINT,
    keys: { p256dh: "0123456789abcdef", auth: "abcdefgh" },
    ...overrides,
  });
}

function registerCalls(): Extract<SupabaseCall, { kind: "rpc" }>[] {
  return recorded.supabase.filter(
    (call): call is Extract<SupabaseCall, { kind: "rpc" }> => call.kind === "rpc",
  );
}

// ---------------------------------------------------------------------------
// 1. The session gate: no session means no body read and no write.
// ---------------------------------------------------------------------------

test("an anonymous caller is refused with 401 before the RPC is reached", async () => {
  resetBoundary({ user: undefined });
  const { POST } = await route();

  const response = await POST(request(validPayload()));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: "Unauthorized" });
  assert.deepEqual(registerCalls(), [], "an unauthenticated request must not write a subscription");
});

// ---------------------------------------------------------------------------
// 2. Malformed body: JSON that does not parse is a 400, not a 500.
// ---------------------------------------------------------------------------

test("a body that is not JSON is answered 400 without reaching the RPC", async () => {
  resetBoundary({ user: fakeAuthUser() });
  const { POST } = await route();

  const response = await POST(request("{ not json"));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: "Invalid body" });
  assert.deepEqual(registerCalls(), []);
});

// ---------------------------------------------------------------------------
// 3. The schema + allowlist gate: a well-formed request whose endpoint or keys
//    fail validation is a 422, and nothing is stored.
// ---------------------------------------------------------------------------

const rejectedBodies: { label: string; body: string }[] = [
  { label: "a non-https endpoint", body: validPayload({ endpoint: "http://fcm.googleapis.com/x" }) },
  { label: "an endpoint on a non-allowlisted host", body: validPayload({ endpoint: "https://evil.example/x" }) },
  { label: "an endpoint that is a loopback literal", body: validPayload({ endpoint: "https://127.0.0.1/x" }) },
  { label: "a p256dh key that is too short", body: validPayload({ keys: { p256dh: "short", auth: "abcdefgh" } }) },
  { label: "a missing keys object", body: JSON.stringify({ endpoint: VALID_ENDPOINT }) },
];

for (const { label, body } of rejectedBodies) {
  test(`a payload with ${label} is answered 422 and stored nowhere`, async () => {
    resetBoundary({ user: fakeAuthUser() });
    const { POST } = await route();

    const response = await POST(request(body));

    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { message: "Invalid subscription" });
    assert.deepEqual(registerCalls(), [], `${label} must not be written`);
  });
}

// ---------------------------------------------------------------------------
// 4. The happy path: the RPC is called with the caller's own keys, and the
//    user-agent header is forwarded truncated to the documented 300 chars.
// ---------------------------------------------------------------------------

test("a valid signed-in subscription is stored with the forwarded user-agent", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { register_push_subscription: { data: null, error: null } },
  });
  const { POST } = await route();

  const longAgent = "A".repeat(400);
  const response = await POST(request(validPayload(), { "user-agent": longAgent }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { message: "ok" });

  const [call] = registerCalls();
  assert.ok(call, "the registration RPC must be called exactly once");
  assert.equal(call.name, "register_push_subscription");
  assert.equal(call.args._endpoint, VALID_ENDPOINT);
  assert.equal(call.args._p256dh, "0123456789abcdef");
  assert.equal(call.args._auth_key, "abcdefgh");
  assert.equal(call.args._user_agent, "A".repeat(300), "the user-agent must be truncated to 300 chars");
});

test("a request with no user-agent forwards null rather than the string 'undefined'", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: { register_push_subscription: { data: null, error: null } },
  });
  const { POST } = await route();

  await POST(request(validPayload()));

  const [call] = registerCalls();
  assert.equal(call.args._user_agent, null);
});

// ---------------------------------------------------------------------------
// 5. The write failure path: a database error is a 502, and the raw error text
//    is not reflected to the caller.
// ---------------------------------------------------------------------------

test("a failed write is answered 502 without leaking the database error", async () => {
  resetBoundary({
    user: fakeAuthUser(),
    rpcs: {
      register_push_subscription: {
        data: null,
        error: { code: "42501", message: "An active account is required." },
      },
    },
  });
  const { POST } = await route();

  const response = await POST(request(validPayload()));
  const body = await response.json();

  assert.equal(response.status, 502);
  assert.deepEqual(body, { message: "Subscription could not be stored" });
  assert.ok(
    !JSON.stringify(body).includes("An active account is required."),
    "the database error text must not be reflected to the caller",
  );
});
