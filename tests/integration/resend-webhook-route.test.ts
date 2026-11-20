import assert from "node:assert/strict";
import test from "node:test";

import { installBoundaryMocks, recorded, resetBoundary } from "./support/harness";

installBoundaryMocks();

const webhookRoute = () => import("@/app/api/email/resend-webhook/route");

function withEnv(name: string, value: string | undefined): () => void {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return () => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  };
}

test("the Resend webhook error response forbids shared caching", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = withEnv("RESEND_WEBHOOK_SECRET", "test-webhook-secret");
  try {
    const { POST } = await webhookRoute();
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/resend-webhook", {
        method: "POST",
        body: JSON.stringify({ type: "email.bounced", data: { to: ["ada@example.com"] } }),
      }),
    );

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});


test("the Resend webhook rejects a declared body over the byte limit before signature verification", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = withEnv("RESEND_WEBHOOK_SECRET", "test-webhook-secret");
  try {
    const { POST } = await webhookRoute();
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/resend-webhook", {
        method: "POST",
        headers: { "content-length": String(256 * 1024 + 1) },
        body: "small body",
      }),
    );

    assert.equal(response.status, 413);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("the Resend webhook enforces the stream byte limit when Content-Length is absent", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = withEnv("RESEND_WEBHOOK_SECRET", "test-webhook-secret");
  try {
    const { POST } = await webhookRoute();
    const oversizedBody = "x".repeat(256 * 1024 + 1);
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/resend-webhook", {
        method: "POST",
        body: oversizedBody,
      }),
    );

    assert.equal(response.status, 413);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("the Resend webhook rejects invalid UTF-8 before parsing or database access", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = withEnv("RESEND_WEBHOOK_SECRET", "test-webhook-secret");
  try {
    const { POST } = await webhookRoute();
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/resend-webhook", {
        method: "POST",
        body: new Uint8Array([0xc3, 0x28]),
      }),
    );

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});
