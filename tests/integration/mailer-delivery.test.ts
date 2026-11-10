import assert from "node:assert/strict";
import test, { mock } from "node:test";

/**
 * The Node-side transactional mailer (`src/server/email/mailer.ts`), driven
 * through its **real body** rather than a recorder.
 *
 * Every other integration suite mocks `@/server/email/mailer` wholesale
 * (`support/harness.ts`), which is right for an action test — it asserts *that*
 * a receipt was attempted — but it means the mailer itself is never executed in
 * this layer. `src/server/email/mailer-delivery-signal.test.ts` even documents
 * the gap: the module is behind `server-only`, so under `tsx --test` "its
 * `deliver` body cannot be driven directly from the unit layer". Here it can:
 * the harness's `server-only` and `next/*` fakes are not needed, only the
 * Resend edge is replaced, so `deliver`, `getResend`, `fromAddress`,
 * `getFeedbackInbox`, `getReplyToInbox` and `localeUrl` all run as written.
 *
 * That body is where three shipped fixes live and none of them had a functional
 * test:
 *
 *  - #186 — a present-but-malformed `RESEND_API_KEY` (a copied Supabase token,
 *    a truncated value) used to be treated exactly like a missing one and
 *    swallowed, so a wrong key failed every email in silence. `getResend` now
 *    names the case and emits the `email_health` signal.
 *  - #372 — a *returned* Resend error (`{ error }`, which is how the SDK reports
 *    a rejection and a network failure alike) must reach `reportDeliveryFailure`
 *    under `email_health`, not a bare sentence a rule cannot match.
 *  - #196 — promotional mail needs the RFC 8058 `List-Unsubscribe` pair and a
 *    `Reply-To` (the default `from` is `no-reply@…`), while transactional mail
 *    must carry `Reply-To` but **no** unsubscribe header.
 *
 * The Resend edge is a recorder, so a failure here means the production code
 * between the public `send*Email` functions and the SDK — the part no test
 * executed — behaved differently, not that a mock drifted.
 */

type SentPayload = {
  from?: string;
  to?: string[];
  subject?: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  replyTo?: string;
};

type SentCall = { payload: SentPayload; options?: { idempotencyKey?: string } };

/** What the next `resend.emails.send` should do: return `{ error }` or throw. */
type Outcome = { error?: unknown } | { throw: unknown };

const sent: SentCall[] = [];
let outcome: Outcome = {};

// The only faked edge. `server-only` resolves to its real throwing module here,
// which is the point — the production import graph stays intact.
mock.module("server-only", { namedExports: {} });
mock.module("resend", {
  namedExports: {
    Resend: class {
      emails = {
        send: async (
          payload: SentPayload,
          options?: { idempotencyKey?: string },
        ) => {
          sent.push({ payload, options });
          if ("throw" in outcome) throw outcome.throw;
          return { error: "error" in outcome ? outcome.error : null };
        },
      };
    },
  },
});

const mailer = () => import("@/server/email/mailer");

const APP_ORIGIN = "http://localhost:3000";
const VALID_KEY = "re_AbC123_xyz-789";
const TEAM_INBOX = "team@isbulkktc.com";

/** Set env for one test and restore it exactly, deleting what did not exist. */
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

/** Capture one console method for the duration of a test. */
function captureConsole(method: "error" | "warn"): {
  calls: unknown[][];
  restore: () => void;
} {
  const calls: unknown[][] = [];
  const original = console[method];
  console[method] = ((...args: unknown[]) => {
    calls.push(args);
  }) as typeof console.error;
  return {
    calls,
    restore: () => {
      console[method] = original;
    },
  };
}

/** A mailer that can send: a valid key and a configured origin. */
function deliverableEnv(): () => void {
  return withEnv({
    RESEND_API_KEY: VALID_KEY,
    NEXT_PUBLIC_APP_URL: APP_ORIGIN,
    APP_URL: undefined,
  });
}

function reset(): void {
  sent.length = 0;
  outcome = {};
}

const WELCOME = {
  to: "ada@example.com",
  audience: "candidate" as const,
  locale: "tr",
  name: "Ada",
  userId: "u-1",
};

// ---------------------------------------------------------------------------
// A successful send reaches Resend with the rendered message
// ---------------------------------------------------------------------------

test("a welcome email reaches Resend with the recipient, body and idempotency key", async () => {
  reset();
  const restore = deliverableEnv();
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);

    assert.equal(sent.length, 1, "one send per call");
    const { payload, options } = sent[0];
    assert.deepEqual(payload.to, ["ada@example.com"]);
    assert.equal(options?.idempotencyKey, "welcome/u-1");
    assert.ok(
      typeof payload.subject === "string" && payload.subject.trim().length > 0,
      "the subject is rendered, not empty",
    );
    // The candidate's call to action is their dashboard, on the configured
    // origin and under the locale prefix.
    assert.match(payload.html ?? "", /http:\/\/localhost:3000\/profile\/dashboard/);
  } finally {
    restore();
  }
});

test("the locale and audience reach the renderer rather than being ignored", async () => {
  reset();
  const restore = deliverableEnv();
  try {
    const { sendWelcomeEmail } = await mailer();

    await sendWelcomeEmail({ ...WELCOME, locale: "tr" });
    await sendWelcomeEmail({ ...WELCOME, locale: "en" });
    await sendWelcomeEmail({ ...WELCOME, audience: "employer", userId: "u-2" });

    const [tr, en, employer] = sent.map((call) => call.payload);

    // The default locale is unprefixed; every other locale carries its prefix,
    // so a mailer that dropped the locale would emit the same URL twice.
    assert.match(tr.html ?? "", /http:\/\/localhost:3000\/profile\/dashboard/);
    assert.match(en.html ?? "", /http:\/\/localhost:3000\/en\/profile\/dashboard/);
    assert.notEqual(tr.subject, en.subject, "the subject follows the locale");
    assert.notEqual(
      tr.subject,
      employer.subject,
      "the subject follows the audience",
    );
    assert.equal(
      sent[2].options?.idempotencyKey,
      "welcome/u-2",
      "the key tracks the user, not the audience",
    );
  } finally {
    restore();
  }
});

test("the default sender is used and RESEND_FROM_EMAIL overrides it", async () => {
  reset();
  const restore = deliverableEnv();
  const restoreFrom = withEnv({
    RESEND_FROM_EMAIL: "İşBul Destek <destek@isbulkktc.com>",
  });
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);
    assert.equal(sent[0].payload.from, "İşBul Destek <destek@isbulkktc.com>");
  } finally {
    restoreFrom();
    restore();
  }

  reset();
  const restorePlain = deliverableEnv();
  const restoreDefaultFrom = withEnv({ RESEND_FROM_EMAIL: undefined });
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);
    assert.equal(sent[0].payload.from, "İşBul KKTC <no-reply@isbulkktc.com>");
  } finally {
    restoreDefaultFrom();
    restorePlain();
  }
});

// ---------------------------------------------------------------------------
// #186 — a malformed key is named, not swallowed like a missing one
// ---------------------------------------------------------------------------

test("a missing key is a warning and no send attempt", async () => {
  reset();
  const restore = withEnv({ RESEND_API_KEY: undefined });
  const warn = captureConsole("warn");
  const error = captureConsole("error");
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);

    assert.equal(sent.length, 0, "nothing is sent without a key");
    assert.equal(error.calls.length, 0, "a missing key is not an error");
    assert.ok(
      warn.calls.some((args) => /RESEND_API_KEY is not configured/.test(String(args[0]))),
      "the skip is reported as a warning",
    );
  } finally {
    error.restore();
    warn.restore();
    restore();
  }
});

test("a malformed key is reported under email_health, not hidden as 'not configured' (#186)", async () => {
  reset();
  // A Supabase token pasted where a Resend key belongs — the shape #186 was about.
  const restore = withEnv({
    RESEND_API_KEY: "sbp_0123456789abcdef",
    NEXT_PUBLIC_APP_URL: APP_ORIGIN,
    APP_URL: undefined,
  });
  const error = captureConsole("error");
  const warn = captureConsole("warn");
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);

    assert.equal(sent.length, 0, "a malformed key must not be used to send");
    assert.equal(
      error.calls.length,
      1,
      "the malformed case emits exactly one health signal",
    );
    const [event, payload] = error.calls[0] as [string, { event?: string }];
    assert.equal(event, "email_health");
    assert.equal(payload.event, "resend_key_malformed");
    assert.equal(
      warn.calls.length,
      0,
      "a malformed key is not the optional 'not configured' case",
    );
  } finally {
    warn.restore();
    error.restore();
    restore();
  }
});

// ---------------------------------------------------------------------------
// #372 — both failure shapes reach the same email_health signal
// ---------------------------------------------------------------------------

test("a returned Resend error is reported under email_health with its code and status", async () => {
  reset();
  outcome = {
    error: { name: "validation_error", message: "recipient rejected", statusCode: 422 },
  };
  const restore = deliverableEnv();
  const error = captureConsole("error");
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);

    assert.equal(sent.length, 1, "the send was attempted");
    assert.equal(error.calls.length, 1);
    const [event, payload] = error.calls[0] as [string, Record<string, unknown>];
    assert.equal(event, "email_health");
    assert.equal(payload.event, "email_delivery_failed");
    assert.equal(payload.code, "validation_error");
    assert.equal(payload.statusCode, 422);
  } finally {
    error.restore();
    restore();
  }
});

test("a thrown transport error is reported under the same signal, with the network code", async () => {
  reset();
  const thrown = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  outcome = { throw: thrown };
  const restore = deliverableEnv();
  const error = captureConsole("error");
  try {
    const { sendWelcomeEmail } = await mailer();
    // The mailer swallows the throw: a delivery problem must not fail the
    // caller's primary action.
    await assert.doesNotReject(() => sendWelcomeEmail(WELCOME));

    assert.equal(error.calls.length, 1);
    const [event, payload] = error.calls[0] as [string, Record<string, unknown>];
    assert.equal(event, "email_health");
    assert.equal(payload.event, "email_delivery_failed");
    assert.equal(payload.code, "ECONNRESET", "the system code, not the constructor name");
    assert.equal(payload.statusCode, null, "a transport failure has no HTTP status");
  } finally {
    error.restore();
    restore();
  }
});

// ---------------------------------------------------------------------------
// #196 — deliverability headers, split by message family
// ---------------------------------------------------------------------------

test("a promotional digest carries the RFC 8058 one-click pair and a Reply-To", async () => {
  reset();
  const restore = deliverableEnv();
  const restoreInbox = withEnv({ SALES_INBOX_EMAIL: TEAM_INBOX });
  try {
    const { sendEngagementEmail } = await mailer();
    const unsubscribeUrl = "https://isbulkktc.com/api/email/unsubscribe?token=abc";
    await sendEngagementEmail({
      to: "ada@example.com",
      locale: "tr",
      name: "Ada",
      jobs: [{ title: "Depo Görevlisi", company: "Acme" }],
      unsubscribeUrl,
      campaignId: "c-1",
    });

    assert.equal(sent.length, 1);
    const { payload, options } = sent[0];
    assert.equal(options?.idempotencyKey, "engagement/c-1");
    assert.equal(payload.replyTo, TEAM_INBOX, "replies reach a monitored inbox");
    assert.equal(
      payload.headers?.["List-Unsubscribe-Post"],
      "List-Unsubscribe=One-Click",
    );
    const listUnsubscribe = payload.headers?.["List-Unsubscribe"] ?? "";
    assert.match(listUnsubscribe, new RegExp(`<${unsubscribeUrl.replace(/[?]/g, "\\?")}>`));
    assert.match(listUnsubscribe, /<mailto:team@isbulkktc\.com\?subject=unsubscribe>/);
  } finally {
    restoreInbox();
    restore();
  }
});

test("a transactional welcome keeps Reply-To but never an unsubscribe header", async () => {
  reset();
  const restore = deliverableEnv();
  const restoreInbox = withEnv({ SALES_INBOX_EMAIL: TEAM_INBOX });
  try {
    const { sendWelcomeEmail } = await mailer();
    await sendWelcomeEmail(WELCOME);

    const { payload } = sent[0];
    assert.equal(payload.replyTo, TEAM_INBOX);
    assert.equal(
      payload.headers,
      undefined,
      "transactional mail must not advertise an unsubscribe",
    );
  } finally {
    restoreInbox();
    restore();
  }
});

// ---------------------------------------------------------------------------
// getFeedbackInbox — the pure env rule behind the feedback flow
// ---------------------------------------------------------------------------

test("getFeedbackInbox prefers the dedicated inbox, falls back to sales, then null", async () => {
  const { getFeedbackInbox } = await mailer();

  const dedicated = withEnv({
    FEEDBACK_INBOX_EMAIL: "feedback@isbulkktc.com",
    SALES_CONTACT_EMAIL: "sales@isbulkktc.com",
  });
  try {
    assert.equal(getFeedbackInbox(), "feedback@isbulkktc.com");
  } finally {
    dedicated();
  }

  const fallback = withEnv({
    FEEDBACK_INBOX_EMAIL: undefined,
    SALES_CONTACT_EMAIL: "sales@isbulkktc.com",
  });
  try {
    assert.equal(getFeedbackInbox(), "sales@isbulkktc.com");
  } finally {
    fallback();
  }

  const none = withEnv({
    FEEDBACK_INBOX_EMAIL: undefined,
    SALES_CONTACT_EMAIL: undefined,
  });
  try {
    assert.equal(getFeedbackInbox(), null, "an address-less value is not an inbox");
  } finally {
    none();
  }

  const notAnAddress = withEnv({
    FEEDBACK_INBOX_EMAIL: "not-an-address",
    SALES_CONTACT_EMAIL: undefined,
  });
  try {
    assert.equal(getFeedbackInbox(), null);
  } finally {
    notAnAddress();
  }
});
