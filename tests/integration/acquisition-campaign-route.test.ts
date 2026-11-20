import assert from "node:assert/strict";
import test from "node:test";

import {
  installBoundaryMocks,
  mailFailures,
  recorded,
  resetBoundary,
  type SupabaseCall,
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
 * `list_marketing_recipients` call, in order; the route processes at most
 * `BATCH_SIZE` (25) leads per HTTP request.
 */
function serviceScript(
  pages: Lead[][],
  listError: { code?: string } | null = null,
  markError: { code?: string } | null = null,
) {
  let call = 0;
  return {
    tables: {
      // The explicit-consent schema probe succeeds by default. Tests for a
      // production database that has not received the consent migration
      // override this result with a missing-column error.
      sales_leads: { data: [], error: null },
    },
    rpcs: {
      list_marketing_recipients: () => {
        if (listError) return { data: null, error: listError };
        return { data: pages[call++] ?? [], error: null };
      },
      mark_marketing_lead_contacted: { data: null, error: markError },
    },
  };
}

function request(authorization?: string, after?: string, campaignDate?: string): Request {
  const url = new URL("https://isbulkktc.test/api/email/acquisition-campaign");
  if (after !== undefined) url.searchParams.set("after", after);
  if (campaignDate !== undefined) url.searchParams.set("campaignDate", campaignDate);
  return new Request(url, {
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
    // Test-only override. Production must not enable this until the versioned
    // consent source, confirmation flow and SQL recipient predicate are live.
    MARKETING_CAMPAIGN_CONSENT_READY: "true",
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

test("the acquisition campaign fails closed until affirmative-consent enforcement is deployed", async () => {
  resetBoundary({}, null);
  const restore = withEnv({
    MARKETING_CRON_SECRET: CRON_SECRET,
    ENGAGEMENT_UNSUBSCRIBE_SECRET: UNSUB_SECRET,
    MARKETING_CAMPAIGN_CONSENT_READY: undefined,
  });
  try {
    const { POST } = await campaignRoute();
    const response = await POST(request("Bearer " + CRON_SECRET));

    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      message: "Acquisition marketing consent enforcement is not ready",
    });
    assert.deepEqual(recorded.supabase, [], "the closed sender must not access recipients");
    assert.deepEqual(recorded.marketingMail, [], "the closed sender must not send promotional email");
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

test("a campaign fails closed when explicit-consent columns are absent", async () => {
  resetBoundary(
    {},
    {
      tables: {
        sales_leads: { data: null, error: { code: "42703" } },
      },
      rpcs: {},
    },
  );
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const response = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      message: "Marketing consent schema is not ready",
    });
    assert.equal(recorded.marketingMail.length, 0);
    assert.equal(
      recorded.supabase.some(
        (call) => call.kind === "rpc" && call.name === "list_marketing_recipients",
      ),
      false,
      "the recipient RPC must not run before the consent schema is verified",
    );
    const schemaProbe = recorded.supabase.find(
      (call) => call.kind === "from" && call.table === "sales_leads",
    );
    if (!schemaProbe || schemaProbe.kind !== "from") {
      assert.fail("the sales_leads consent schema probe must be recorded");
    }
    assert.ok(schemaProbe.ops.includes(
      "select:marketing_consent,marketing_consent_requested_at,marketing_consent_at,marketing_consent_version",
    ));
    assert.ok(schemaProbe.ops.includes("limit:0"));
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
    const body = await res.json();
    assert.equal(body.message, "Acquisition campaign complete");
    assert.equal(body.sent, 1);
    assert.equal(body.failed, 0);
    assert.equal(body.complete, true);
    assert.equal(body.nextCursor, null);
    assert.match(body.campaignDate, /^\d{4}-\d{2}-\d{2}$/);

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
    const body = await res.json();
    assert.equal(body.message, "Acquisition campaign complete");
    assert.equal(body.sent, 0);
    assert.equal(body.failed, 1);
    assert.equal(body.complete, true);
    assert.equal(body.nextCursor, null);
    assert.match(body.campaignDate, /^\d{4}-\d{2}-\d{2}$/);
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

test("a full campaign page returns a cursor and the next request resumes without duplicate recipients", async () => {
  const campaignDate = "2026-11-20";
  const firstPage = Array.from({ length: 25 }, (_, index) =>
    lead({
      lead_id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      email: `lead${index}@example.com`,
    }),
  );
  const secondPage = [
    lead({ lead_id: "00000000-0000-4000-8000-000000000099", email: "last@example.com" }),
  ];
  resetBoundary({}, serviceScript([firstPage, secondPage]));
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const firstResponse = await POST(request("Bearer " + CRON_SECRET, undefined, campaignDate));
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.message, "Acquisition campaign page complete");
    assert.equal(firstBody.sent, 25);
    assert.equal(firstBody.failed, 0);
    assert.equal(firstBody.complete, false);
    assert.equal(firstBody.nextCursor, firstPage[24].lead_id);
    assert.equal(firstBody.campaignDate, campaignDate);

    const secondResponse = await POST(request("Bearer " + CRON_SECRET, firstBody.nextCursor, campaignDate));
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.equal(secondBody.message, "Acquisition campaign complete");
    assert.equal(secondBody.sent, 1);
    assert.equal(secondBody.failed, 0);
    assert.equal(secondBody.complete, true);
    assert.equal(secondBody.nextCursor, null);
    assert.equal(secondBody.campaignDate, campaignDate);

    const listCalls = recorded.supabase.filter(
      (call): call is Extract<SupabaseCall, { kind: "rpc" }> =>
        call.kind === "rpc" && call.name === "list_marketing_recipients",
    );
    assert.equal(listCalls.length, 2);
    assert.equal(listCalls[0].args._after, null);
    assert.equal(listCalls[1].args._after, firstPage[24].lead_id);
    assert.equal(recorded.marketingMail.length, 26);
    assert.ok(recorded.marketingMail.every((mail) => mail.campaignId.startsWith(campaignDate + "/")));
    assert.equal(markCalls().length, 26);
  } finally {
    restore();
  }
});

test("an invalid campaign cursor or date is rejected before service-role work", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const invalidCursor = await POST(request("Bearer " + CRON_SECRET, "not-a-uuid"));
    assert.equal(invalidCursor.status, 400);
    assert.deepEqual(await invalidCursor.json(), { message: "Invalid recipient cursor" });

    const invalidDate = await POST(request("Bearer " + CRON_SECRET, undefined, "2026-02-30"));
    assert.equal(invalidDate.status, 400);
    assert.deepEqual(await invalidDate.json(), { message: "Invalid campaign date" });
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("a lead-state update error is counted as a campaign failure", async () => {
  resetBoundary({}, serviceScript([[lead()]], null, { code: "57014" }));
  const restore = configured();
  try {
    const { POST } = await campaignRoute();
    const response = await POST(request("Bearer " + CRON_SECRET));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.sent, 1);
    assert.equal(body.failed, 1);
    assert.equal(body.complete, true);
    assert.equal(markCalls().length, 1);
  } finally {
    restore();
  }
});
