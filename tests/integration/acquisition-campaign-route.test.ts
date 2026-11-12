import assert from "node:assert/strict";
import test from "node:test";

import {
  installBoundaryMocks,
  mailFailures,
  recorded,
  resetBoundary,
} from "./support/harness";

installBoundaryMocks();

/**
 * `POST /api/email/acquisition-campaign` — the acquisition ("marketing") sender.
 *
 * The route is the only caller of `sendMarketingEmail`, the promotional family
 * that sends from `info@` and must carry a one-click opt-out. Its security
 * properties are pinned by source-text tests in `tests/security/**`
 * (`cron-route-auth.test.ts`). What no test covered is the *behaviour*: that a
 * configured campaign sends one signed, opt-out-aware email per lead, that the
 * link it embeds is a valid opt-out for that exact address, that a lead is
 * marked `contacted` after its send (so the next run does not re-mail it), that
 * the recipient cursor advances, and that failures are counted rather than
 * thrown. A refactor could keep every source-text assertion true while sending
 * the wrong link, re-mailing everyone, or dropping a page.
 *
 * The route body, the HMAC token core and the recipient mapping all run as
 * written; only the network edges are faked. `tests/unit/unsubscribe-token.test.ts`
 * proves the HMAC primitives, so these tests assert on the route's *use* of them.
 */

const CRON_SECRET = "integration-marketing-secret";
const UNSUB_SECRET = "integration-unsubscribe-secret-16";

const campaignRoute = () => import("@/app/api/email/acquisition-campaign/route");
const tokenCore = () => import("@/server/email/unsubscribe-token-core");

type Lead = { lead_id: string; email: string; locale: string | null };

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    lead_id: "00000000-0000-4000-8000-0000000000b1",
    email: "isletme@example.com",
    locale: "tr",
    ...overrides,
  };
}

/**
 * The service-role client script. `pages` is the recipient list per
 * `list_marketing_recipients` call, in order; the route stops when a page is
 * shorter than `BATCH_SIZE` (50), so a single short page is one batch.
 */
function serviceScript(
  pages: Lead[][],
  listError: { code?: string } | null = null,
) {
  let call = 0;
  return {
    rpcs: {
      list_marketing_recipients: () => {
        if (listError) return { data: null, error: listError };
        return { data: pages[call++] ?? [], error: null };
      },
      mark_marketing_lead_contacted: { data: null, error: null },
    },
  };
}

function request(authorization?: string): Request {
  return new Request("https://isbulkktc.test/api/email/acquisition-campaign", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
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

function configured(): () => void {
  return withEnv({
    MARKETING_CRON_SECRET: CRON_SECRET,
    ENGAGEMENT_UNSUBSCRIBE_SECRET: UNSUB_SECRET,
  });
}

function markCalls() {
  return recorded.supabase.filter(
    (call): call is Extract<(typeof recorded.supabase)[number], { kind: "rpc" }> =>
      call.kind === "rpc" && call.name === "mark_marketing_lead_contacted",
  );
}

test("an unauthenticated POST is refused before any work", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request());

    assert.equal(res.status, 401);
    assert.equal(
      res.headers.get("cache-control"),
      "no-store",
      "an error response must forbid shared caching",
    );
    assert.deepEqual(
      recorded.supabase,
      [],
      "authentication must precede the service client, so no call is recorded",
    );
    assert.deepEqual(recorded.marketingMail, []);
  } finally {
    restore();
  }
});

test("a wrong bearer secret is refused without touching the database", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request("Bearer not-the-secret"));

    assert.equal(res.status, 401);
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("a deployment without the service client answers 503 and sends nothing", async () => {
  resetBoundary({}, null);
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 503);
    assert.deepEqual(recorded.marketingMail, []);
  } finally {
    restore();
  }
});

test("a deployment without a signing key answers 503 and sends nothing", async () => {
  resetBoundary({}, serviceScript([[lead()]]));
  // No ENGAGEMENT_UNSUBSCRIBE_SECRET: signing is disabled, so the route must
  // refuse rather than emit an unsigned opt-out link.
  const restore = withEnv({
    MARKETING_CRON_SECRET: CRON_SECRET,
    ENGAGEMENT_UNSUBSCRIBE_SECRET: undefined,
    RESEND_API_KEY: undefined,
  });
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 503);
    assert.deepEqual(recorded.marketingMail, []);
  } finally {
    restore();
  }
});

test("a recipient list failure answers 502 and sends nothing", async () => {
  resetBoundary({}, serviceScript([], { code: "57014" }));
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 502);
    assert.deepEqual(recorded.marketingMail, []);
  } finally {
    restore();
  }
});

test("a configured campaign sends one signed, opt-out-aware email per lead", async () => {
  resetBoundary({}, serviceScript([[lead()]]));
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const { signUnsubscribeEmail } = await tokenCore();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), {
      message: "Acquisition campaign complete",
      sent: 1,
      failed: 0,
    });

    assert.equal(recorded.marketingMail.length, 1);
    const mail = recorded.marketingMail[0];
    assert.equal(mail.to, "isletme@example.com");
    assert.equal(mail.locale, "tr");

    // The link must be a *valid* opt-out for this exact address — the route
    // signs the recipient's own e-mail, so an unsigned or mis-signed link fails.
    const unsubscribe = new URL(mail.unsubscribeUrl);
    assert.equal(unsubscribe.pathname, "/api/email/unsubscribe");
    assert.equal(unsubscribe.searchParams.get("e"), "isletme@example.com");
    assert.equal(
      unsubscribe.searchParams.get("s"),
      signUnsubscribeEmail("isletme@example.com"),
    );

    // One campaign id per lead per day: the idempotency key that stops a retried
    // cron run from double-sending.
    assert.match(
      mail.campaignId,
      /^\d{4}-\d{2}-\d{2}\/00000000-0000-4000-8000-0000000000b1$/,
    );

    // The lead advances out of the `new` queue so the next run skips it.
    const marks = markCalls();
    assert.equal(marks.length, 1);
    assert.equal(
      marks[0].args._lead_id,
      "00000000-0000-4000-8000-0000000000b1",
    );
  } finally {
    restore();
  }
});

test("a lead whose send is rejected is counted, not thrown, and stays in the queue", async () => {
  resetBoundary({}, serviceScript([[lead()]]));
  const restore = configured();
  // The real mailer reports a Resend rejection as a returned `false`, never a
  // throw — so this is the path a real failed send takes.
  mailFailures.add("marketing");
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      message: "Acquisition campaign complete",
      sent: 0,
      failed: 1,
    });
    assert.equal(recorded.marketingMail.length, 0);
    assert.equal(
      markCalls().length,
      0,
      "a rejected send must not mark the lead contacted",
    );
  } finally {
    mailFailures.clear();
    restore();
  }
});

test("the recipient cursor advances across a full batch so nobody is re-sent", async () => {
  // A full page of 50 followed by a short page: the route must send all 51 and
  // stop, not loop on the first page.
  const firstPage = Array.from({ length: 50 }, (_, index) =>
    lead({
      lead_id: `00000000-0000-4000-8000-00000000${String(index).padStart(4, "0")}`,
      email: `lead${index}@example.com`,
    }),
  );
  const secondPage = [lead({ lead_id: "00000000-0000-4000-8000-000000000099", email: "last@example.com" })];
  resetBoundary({}, serviceScript([firstPage, secondPage]));
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      message: "Acquisition campaign complete",
      sent: 51,
      failed: 0,
    });
    assert.equal(recorded.marketingMail.length, 51);
    // The second call must have resumed *after* the last id of the first page.
    const listCalls = recorded.supabase.filter(
      (call): call is Extract<(typeof recorded.supabase)[number], { kind: "rpc" }> =>
        call.kind === "rpc" && call.name === "list_marketing_recipients",
    );
    assert.equal(listCalls.length, 2);
    assert.equal(listCalls[0].args._after, null);
    assert.equal(listCalls[1].args._after, "00000000-0000-4000-8000-000000000049");
  } finally {
    restore();
  }
});
