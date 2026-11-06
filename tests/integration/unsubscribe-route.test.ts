import assert from "node:assert/strict";
import test from "node:test";

import { installBoundaryMocks, recorded, resetBoundary } from "./support/harness";

installBoundaryMocks();

/**
 * `GET /api/email/unsubscribe` — the one-click opt-out for the promotional
 * digest.
 *
 * The link is followed from a mailbox, so there is no session and the HMAC in
 * `s` is the only authority. `tests/security/unsubscribe-route-auth.test.ts`
 * pins the source-text ordering (verify before the service client) and
 * `tests/unit/unsubscribe-token.test.ts` pins the HMAC primitives; what neither
 * reaches is the route's behaviour — that a valid link writes the *lowercased*
 * address through the service-role RPC, that an invalid one never touches the
 * database, and that the response is the same for an already-opted-out address
 * as for a new one, so the endpoint cannot be used to probe who is subscribed.
 *
 * The route body and the real HMAC core run as written.
 */

const UNSUB_SECRET = "integration-unsubscribe-secret-16";

const unsubscribeRoute = () => import("@/app/api/email/unsubscribe/route");
const tokenCore = () => import("@/server/email/unsubscribe-token-core");

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

function signedLink(email: string, signature?: string | null): string {
  const s = signature ?? sign(email);
  return `https://isbulkktc.test/api/email/unsubscribe?e=${encodeURIComponent(email)}&s=${encodeURIComponent(String(s))}`;
}

let cachedSignature: ((email: string) => string | null) | null = null;
function sign(email: string): string | null {
  if (!cachedSignature) {
    throw new Error("signature helper used before the token core was loaded");
  }
  return cachedSignature(email);
}

const optOutCalls = () =>
  recorded.supabase.filter(
    (call): call is Extract<(typeof recorded.supabase)[number], { kind: "rpc" }> =>
      call.kind === "rpc" && call.name === "opt_out_engagement",
  );

test("the unsubscribe route", async (t) => {
  const restore = withEnv({
    ENGAGEMENT_UNSUBSCRIBE_SECRET: UNSUB_SECRET,
    RESEND_API_KEY: undefined,
  });
  const { signUnsubscribeEmail } = await tokenCore();
  cachedSignature = signUnsubscribeEmail;
  t.after(restore);

  await t.test("a valid link writes the lowercased address through the service RPC", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();

    const res = await GET(new Request(signedLink("Ada@Example.com")));

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const calls = optOutCalls();
    assert.equal(calls.length, 1);
    // Lowercased before it reaches the RPC — a mixed-case link must still match
    // the address the digest was sent to.
    assert.deepEqual(calls[0].args, { _email: "ada@example.com", _reason: "email_link" });
  });

  await t.test("a tampered signature is refused before the database is touched", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();

    const res = await GET(new Request(signedLink("ada@example.com", "not-a-valid-signature")));

    assert.equal(res.status, 400);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("a valid signature for a different address is refused", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();

    // The signature is genuine, but for someone else's address: the digest binds
    // the two together, so swapping the address must invalidate the link.
    const res = await GET(new Request(signedLink("someone-else@example.com", sign("ada@example.com"))));

    assert.equal(res.status, 400);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("a missing signature is refused", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();

    const res = await GET(new Request("https://isbulkktc.test/api/email/unsubscribe?e=ada@example.com"));

    assert.equal(res.status, 400);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("an unconfigured deployment answers 503 and writes nothing", async () => {
    resetBoundary({}, null);
    const { GET } = await unsubscribeRoute();

    const res = await GET(new Request(signedLink("ada@example.com")));

    assert.equal(res.status, 503);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("an RPC failure answers 503 and does not claim success", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: { code: "57014" } } } });
    const { GET } = await unsubscribeRoute();

    const res = await GET(new Request(signedLink("ada@example.com")));

    assert.equal(res.status, 503);
    assert.ok(!(await res.text()).includes("removed from promotional"), "must not claim opt-out");
  });

  await t.test("an already-opted-out address is indistinguishable from a new one", async () => {
    // The RPC is an upsert; the route returns the same body and status whether
    // the row existed or not, so the endpoint is not a subscription oracle.
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();
    const fresh = await GET(new Request(signedLink("ada@example.com")));
    const freshBody = await fresh.text();

    resetBoundary({}, { rpcs: { opt_out_engagement: { data: { inserted: false }, error: null } } });
    const { GET: GET2 } = await unsubscribeRoute();
    const again = await GET2(new Request(signedLink("ada@example.com")));

    assert.equal(again.status, fresh.status);
    assert.equal(await again.text(), freshBody);
    assert.ok(!freshBody.includes("ada@example.com"), "the response must not echo the address");
  });
});
