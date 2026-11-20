import assert from "node:assert/strict";
import test from "node:test";

import { createMarketingConsentToken } from "@/server/email/marketing-consent-token-core";
import { installBoundaryMocks, recorded, resetBoundary } from "./support/harness";

installBoundaryMocks();

const route = () => import("@/app/api/email/confirm-marketing/route");
const KEY = "re_test_marketing_consent_key_2026_11";
const LEAD_ID = "84000000-0000-4000-8000-000000000001";
const EMAIL = "person@example.test";

function withEnv(vars: Record<string, string | undefined>): () => void {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function token(): string {
  return createMarketingConsentToken(LEAD_ID, "tr", EMAIL, KEY);
}

function env(): () => void {
  return withEnv({
    RESEND_API_KEY: KEY,
    ENGAGEMENT_UNSUBSCRIBE_SECRET: undefined,
    NEXT_PUBLIC_APP_URL: "https://isbulkktc.test",
  });
}

test("a mailbox GET is read-only and asks for an explicit confirmation POST", async () => {
  resetBoundary();
  const restore = env();
  try {
    const { GET } = await route();
    const response = await GET(
      new Request("https://isbulkktc.test/api/email/confirm-marketing?token=" + encodeURIComponent(token())),
    );
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.match(body, /method="post"/);
    assert.match(body, /Tanıtım e-postası iznimi onayla/);
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("only a valid explicit POST invokes the service-role confirmation RPC", async () => {
  resetBoundary({}, {
    rpcs: {
      confirm_sales_lead_marketing_consent: { data: true, error: null },
    },
  });
  const restore = env();
  try {
    const { POST } = await route();
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/confirm-marketing", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: token() }).toString(),
      }),
    );

    assert.equal(response.status, 200);
    assert.match(await response.text(), /tercihiniz doğrulandı/i);
    const call = recorded.supabase.find(
      (entry) => entry.kind === "rpc" && entry.name === "confirm_sales_lead_marketing_consent",
    );
    assert.ok(call);
    assert.equal(call.args._lead_id, LEAD_ID);
    assert.equal(call.args._consent_version, "sales-lead-marketing-v1");
    assert.equal(typeof call.args._email_hash, "string");
    assert.equal(String(call.args._email_hash).length, 64);
  } finally {
    restore();
  }
});

test("an invalid or altered token cannot reach the database", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = env();
  try {
    const { POST } = await route();
    const invalid = token().slice(0, -1) + "x";
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/confirm-marketing", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: invalid }).toString(),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("the confirmation POST rejects an oversized body before parsing", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = env();
  try {
    const { POST } = await route();
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/confirm-marketing", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "x".repeat(4097),
      }),
    );
    assert.equal(response.status, 413);
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("the confirmation endpoint rejects non-form POST content types", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = env();
  try {
    const { POST } = await route();
    const response = await POST(
      new Request("https://isbulkktc.test/api/email/confirm-marketing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token() }),
      }),
    );
    assert.equal(response.status, 415);
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});
