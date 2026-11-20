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
 * `POST /api/email/engagement-digest` — the promotional-mail sender.
 *
 * The route is the only writer of the *promotional* email family, the one family
 * that requires consent, and it carries a `service_role` client. Its security
 * properties are pinned by source-text tests in `tests/security/**`
 * (`cron-route-auth.test.ts`): the bearer guard, its ordering, and no secret
 * reflection. What no test covered is the *behaviour*: that a configured digest
 * sends one email per recipient, that the link it embeds is a valid signed
 * opt-out for that exact address, that the recipient cursor advances (so a batch
 * of exactly `BATCH_SIZE` neither loops forever nor re-sends), and that failures
 * are counted rather than thrown. A refactor could keep every source-text
 * assertion true while sending the wrong link or dropping a page of recipients.
 *
 * The route body, the HMAC token core and the recipient/job mapping all run as
 * written; only the network edges are faked. `tests/unit/unsubscribe-token.test.ts`
 * proves the HMAC primitives, so these tests deliberately assert on the route's
 * *use* of them.
 */

const CRON_SECRET = "integration-cron-secret";
const UNSUB_SECRET = "integration-unsubscribe-secret-16";

const digestRoute = () => import("@/app/api/email/engagement-digest/route");
const tokenCore = () => import("@/server/email/unsubscribe-token-core");

type Recipient = {
  user_id: string;
  email: string;
  display_name: string | null;
  locale: string | null;
};

function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    user_id: "00000000-0000-4000-8000-0000000000a1",
    email: "ada@example.com",
    display_name: "Ada Lovelace",
    locale: "en",
    ...overrides,
  };
}

function jobRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Job ${index + 1}`,
    slug: `job-${index + 1}`,
    company: { name: `Company ${index + 1}` },
  }));
}

/**
 * The service-role client script. `pages` is the recipient list per
 * `list_engagement_recipients` call, in order; the route stops when a page is
 * shorter than `BATCH_SIZE` (50), so a single short page is one batch.
 */
function serviceScript(
  pages: Recipient[][],
  jobs: unknown[] = jobRows(3),
  listError: { code?: string } | null = null,
  jobsError: { code?: string } | null = null,
) {
  let call = 0;
  return {
    rpcs: {
      search_public_jobs: { data: jobsError ? null : { jobs }, error: jobsError },
      list_engagement_recipients: () => {
        if (listError) return { data: null, error: listError };
        return { data: pages[call++] ?? [], error: null };
      },
    },
  };
}

function request(authorization?: string, after?: string): Request {
  const url = new URL("https://isbulkktc.test/api/email/engagement-digest");
  if (after !== undefined) url.searchParams.set("after", after);
  return new Request(url, {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

/** Set env for the duration of one test and restore it afterwards. */
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
    ENGAGEMENT_CRON_SECRET: CRON_SECRET,
    ENGAGEMENT_UNSUBSCRIBE_SECRET: UNSUB_SECRET,
  });
}

function rpcCalls(name: string) {
  return recorded.supabase.filter(
    (call): call is Extract<(typeof recorded.supabase)[number], { kind: "rpc" }> =>
      call.kind === "rpc" && call.name === name,
  );
}

function assertNoStore(response: Response): void {
  assert.equal(response.headers.get("cache-control"), "no-store");
}

test("an unauthenticated POST is refused before any work", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request());

    assert.equal(res.status, 401);
    assertNoStore(res);
    assert.deepEqual(
      recorded.supabase,
      [],
      "authentication must precede the service client, so no call is recorded",
    );
    assert.deepEqual(recorded.engagementMail, []);
  } finally {
    restore();
  }
});

test("a wrong bearer secret is refused without touching the database", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request("Bearer not-the-secret"));

    assert.equal(res.status, 401);
    assertNoStore(res);
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});

test("a deployment without the service client answers 503 and sends nothing", async () => {
  resetBoundary({}, null);
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 503);
    assertNoStore(res);
    assert.deepEqual(recorded.engagementMail, []);
  } finally {
    restore();
  }
});

test("a deployment without a signing key answers 503 and sends nothing", async () => {
  resetBoundary({}, serviceScript([[recipient()]]));
  // No ENGAGEMENT_UNSUBSCRIBE_SECRET and no RESEND_API_KEY: signing is disabled,
  // so the route must refuse rather than emit an unsigned opt-out link.
  const restore = withEnv({
    ENGAGEMENT_CRON_SECRET: CRON_SECRET,
    ENGAGEMENT_UNSUBSCRIBE_SECRET: undefined,
    RESEND_API_KEY: undefined,
  });
  try {
    const { POST } = await digestRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 503);
    assertNoStore(res);
    assert.deepEqual(recorded.engagementMail, []);
  } finally {
    restore();
  }
});

test("a configured digest sends one signed, opt-out-aware email per recipient", async () => {
  resetBoundary({}, serviceScript([[recipient()]]));
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const { signUnsubscribeEmail } = await tokenCore();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.message, "Engagement digest complete");
    assert.equal(body.sent, 1);
    assert.equal(body.failed, 0);
    assert.equal(body.complete, true);
    assert.equal(body.nextCursor, null);

    assert.equal(recorded.engagementMail.length, 1);
    const mail = recorded.engagementMail[0];
    assert.equal(mail.to, "ada@example.com");
    assert.equal(mail.locale, "en");
    assert.equal(mail.name, "Ada Lovelace");
    assert.equal(mail.jobs.length, 3);
    assert.equal(mail.jobs[0].title, "Job 1");
    assert.equal(mail.jobs[0].company, "Company 1");
    // Every featured job must carry an absolute link, not just a title.
    const jobUrl = mail.jobs[0].url;
    assert.ok(jobUrl, "a featured job must carry a link");
    assert.equal(new URL(jobUrl).pathname, "/jobs/job-1");

    // The link must be a *valid* opt-out for this exact address — the route
    // signs the recipient's own e-mail, so an unsigned or mis-signed link fails.
    const unsubscribe = new URL(mail.unsubscribeUrl);
    assert.equal(unsubscribe.pathname, "/api/email/unsubscribe");
    assert.equal(unsubscribe.searchParams.get("e"), "ada@example.com");
    assert.equal(
      unsubscribe.searchParams.get("s"),
      signUnsubscribeEmail("ada@example.com"),
    );

    // One campaign id per recipient per day: the idempotency key that stops a
    // retried cron run from double-sending.
    assert.match(mail.campaignId, /^\d{4}-\d{2}-\d{2}\/00000000-0000-4000-8000-0000000000a1$/);
    const campaignMonday = new Date(`${mail.campaignId.split("/")[0]}T00:00:00.000Z`);
    assert.equal(campaignMonday.getUTCDay(), 1, "the campaign key must be the UTC Monday of the week");
  } finally {
    restore();
  }
});

test("with no featured jobs the digest sends nothing", async () => {
  resetBoundary({}, serviceScript([[recipient()]], []));
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 200);
    assertNoStore(res);
    assert.deepEqual(await res.json(), {
      message: "No jobs to feature",
      sent: 0,
      failed: 0,
      complete: true,
      nextCursor: null,
    });
    assert.deepEqual(recorded.engagementMail, []);
    assert.deepEqual(
      rpcCalls("list_engagement_recipients"),
      [],
      "the recipient list must not be walked when there is nothing to send",
    );
  } finally {
    restore();
  }
});

test("a recipient-list failure answers 502 and sends nothing", async () => {
  resetBoundary({}, serviceScript([], jobRows(1), { code: "57014" }));
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 502);
    assertNoStore(res);
    assert.deepEqual(await res.json(), {
      message: "Recipient list is temporarily unavailable",
      sent: 0,
      failed: 0,
    });
    assert.deepEqual(recorded.engagementMail, []);
  } finally {
    restore();
  }
});

test("a per-recipient send failure is counted, not thrown", async () => {
  resetBoundary({}, serviceScript([[recipient()]]));
  mailFailures.add("engagement");
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      message: "Engagement digest complete",
      sent: 0,
      failed: 1,
      complete: true,
      nextCursor: null,
    });
  } finally {
    restore();
  }
});

test("a full page returns a cursor and the next HTTP request resumes without repeating recipients", async () => {
  const firstPage = Array.from({ length: 50 }, (_, index) =>
    recipient({
      user_id: `00000000-0000-4000-8000-000000000${String(index).padStart(3, "0")}`,
      email: `u${index}@example.com`,
      display_name: null,
      locale: "tr",
    }),
  );
  const secondPage = [recipient({ user_id: "00000000-0000-4000-8000-000000000099", email: "last@example.com" })];
  resetBoundary({}, serviceScript([firstPage, secondPage]));
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const firstResponse = await POST(request(`Bearer ${CRON_SECRET}`));
    assert.equal(firstResponse.status, 200);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.message, "Engagement digest page complete");
    assert.equal(firstBody.sent, 50);
    assert.equal(firstBody.failed, 0);
    assert.equal(firstBody.complete, false);
    assert.equal(firstBody.nextCursor, firstPage[49].user_id);

    const secondResponse = await POST(request(`Bearer ${CRON_SECRET}`, firstBody.nextCursor));
    assert.equal(secondResponse.status, 200);
    const secondBody = await secondResponse.json();
    assert.equal(secondBody.message, "Engagement digest complete");
    assert.equal(secondBody.sent, 1);
    assert.equal(secondBody.failed, 0);
    assert.equal(secondBody.complete, true);
    assert.equal(secondBody.nextCursor, null);

    const calls = rpcCalls("list_engagement_recipients");
    assert.equal(calls.length, 2, "each HTTP request must fetch exactly one page");
    assert.equal(calls[0].args._after, null);
    assert.equal(calls[1].args._after, firstPage[49].user_id);
    assert.equal(recorded.engagementMail.length, 51);
    const links = new Set(recorded.engagementMail.map((mail) => mail.unsubscribeUrl));
    assert.equal(links.size, 51);
  } finally {
    restore();
  }
});

test("an invalid recipient cursor is rejected before any service-role work", async () => {
  resetBoundary({}, { rpcs: {} });
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const response = await POST(request(`Bearer ${CRON_SECRET}`, "not-a-uuid"));

    assert.equal(response.status, 400);
    assertNoStore(response);
    assert.deepEqual(await response.json(), { message: "Invalid recipient cursor" });
    assert.deepEqual(recorded.supabase, []);
  } finally {
    restore();
  }
});


test("a featured-job search failure answers 502 instead of masquerading as an empty digest", async () => {
  resetBoundary({}, serviceScript([], jobRows(1), null, { code: "57014" }));
  const restore = configured();
  try {
    const { POST } = await digestRoute();
    const res = await POST(request(`Bearer ${CRON_SECRET}`));

    assert.equal(res.status, 502);
    assertNoStore(res);
    assert.deepEqual(await res.json(), {
      message: "Featured jobs are temporarily unavailable",
    });
    assert.deepEqual(recorded.engagementMail, []);
    assert.deepEqual(
      rpcCalls("list_engagement_recipients"),
      [],
      "the recipient list must not be walked when the featured-job query failed",
    );
  } finally {
    restore();
  }
});
