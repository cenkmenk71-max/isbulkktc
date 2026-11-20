import assert from "node:assert/strict";
import test from "node:test";

import { installBoundaryMocks, recorded, resetBoundary } from "./support/harness";

installBoundaryMocks();

const unsubscribeRoute = () => import("@/app/api/email/unsubscribe/route");
const tokenCore = () => import("@/server/email/unsubscribe-token-core");
const UNSUB_SECRET = "integration-unsubscribe-secret-16";

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

let sign: ((email: string) => string | null) | null = null;

function signedLink(email: string, signature?: string | null): string {
  if (!signature && !sign) throw new Error("the unsubscribe signature helper is not loaded");
  const actual = signature ?? sign!(email);
  return "https://isbulkktc.test/api/email/unsubscribe?e=" +
    encodeURIComponent(email) + "&s=" + encodeURIComponent(String(actual));
}

const optOutCalls = () =>
  recorded.supabase.filter(
    (call): call is Extract<(typeof recorded.supabase)[number], { kind: "rpc" }> =>
      call.kind === "rpc" && call.name === "opt_out_engagement",
  );

function assertNoStore(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "no-store");
}

test("unsubscribe link access", async (t) => {
  const restore = withEnv({
    ENGAGEMENT_UNSUBSCRIBE_SECRET: UNSUB_SECRET,
    RESEND_API_KEY: undefined,
  });
  const { signUnsubscribeEmail } = await tokenCore();
  sign = signUnsubscribeEmail;
  t.after(restore);

  await t.test("a valid mailbox GET shows a confirmation page and never writes", async () => {
    resetBoundary({}, null);
    const { GET } = await unsubscribeRoute();
    const response = await GET(new Request(signedLink("Ada@Example.com")));
    const body = await response.text();

    assert.equal(response.status, 200);
    assertNoStore(response);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
    assert.match(body, /method="post"/);
    assert.match(body, /Tanıtım e-postalarını durdur/);
    assert.match(body, /sayfayı açmak aboneliğinizi değiştirmez/i);
    assert.ok(!body.includes("Ada@Example.com"), "the recipient address is not rendered");
    assert.deepEqual(recorded.supabase, []);
  });

  await t.test("an automatic GET prefetch cannot unsubscribe the recipient", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();
    const response = await GET(new Request(signedLink("ada@example.com")));
    assert.equal(response.status, 200);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("a tampered signature is refused before rendering or database access", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();
    const response = await GET(new Request(signedLink("ada@example.com", "not-a-valid-signature")));
    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(recorded.supabase, []);
  });

  await t.test("a valid signature for a different address is refused", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();
    const response = await GET(
      new Request(signedLink("someone-else@example.com", sign!("ada@example.com"))),
    );
    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(recorded.supabase, []);
  });

  await t.test("a missing signature is refused", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { GET } = await unsubscribeRoute();
    const response = await GET(
      new Request("https://isbulkktc.test/api/email/unsubscribe?e=ada@example.com"),
    );
    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(recorded.supabase, []);
  });

  await t.test("an explicit human POST writes the lowercased address through the service RPC", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { POST } = await unsubscribeRoute();
    const response = await POST(
      new Request(signedLink("Ada@Example.com"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "",
      }),
    );
    assert.equal(response.status, 200);
    assertNoStore(response);
    const calls = optOutCalls();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, { _email: "ada@example.com", _reason: "email_link" });
    assert.ok((await response.text()).includes("removed from promotional"));
  });

  await t.test("RFC 8058 List-Unsubscribe-Post still works with its one-click POST body", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { POST } = await unsubscribeRoute();
    const response = await POST(
      new Request(signedLink("Ada@Example.com"), {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
    );
    assert.equal(response.status, 200);
    assertNoStore(response);
    assert.deepEqual(optOutCalls()[0]?.args, { _email: "ada@example.com", _reason: "email_link" });
  });

  await t.test("a POST with a tampered signature is refused before the database is touched", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { POST } = await unsubscribeRoute();
    const response = await POST(
      new Request(signedLink("ada@example.com", "not-a-valid-signature"), { method: "POST" }),
    );
    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("an unconfigured service role answers 503 on POST and writes nothing", async () => {
    resetBoundary({}, null);
    const { POST } = await unsubscribeRoute();
    const response = await POST(new Request(signedLink("ada@example.com"), { method: "POST" }));
    assert.equal(response.status, 503);
    assertNoStore(response);
    assert.deepEqual(optOutCalls(), []);
  });

  await t.test("an RPC failure answers 503 and does not claim success", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: { code: "57014" } } } });
    const { POST } = await unsubscribeRoute();
    const response = await POST(new Request(signedLink("ada@example.com"), { method: "POST" }));
    assert.equal(response.status, 503);
    assertNoStore(response);
    assert.ok(!(await response.text()).includes("removed from promotional"));
  });

  await t.test("an already-opted-out address is indistinguishable from a new one", async () => {
    resetBoundary({}, { rpcs: { opt_out_engagement: { data: null, error: null } } });
    const { POST } = await unsubscribeRoute();
    const fresh = await POST(new Request(signedLink("ada@example.com"), { method: "POST" }));
    const freshBody = await fresh.text();

    resetBoundary({}, { rpcs: { opt_out_engagement: { data: { inserted: false }, error: null } } });
    const { POST: POST2 } = await unsubscribeRoute();
    const again = await POST2(new Request(signedLink("ada@example.com"), { method: "POST" }));

    assert.equal(again.status, fresh.status);
    assert.equal(await again.text(), freshBody);
    assert.ok(!freshBody.includes("ada@example.com"), "the response must not echo the address");
  });
});
