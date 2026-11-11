import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { POST } from "../../src/app/api/support/chat/route";
import { faqByLocale } from "../../src/content/ai-visibility/faq";
import { fallbackReply } from "../../src/features/support/knowledge";
import type { AppLocale } from "../../src/i18n/routing";

/**
 * The live-support chat is deterministic by contract: a turn is resolved from
 * the platform's own published FAQ copy in-process, and nothing leaves the
 * deployment to a third party. #610 shipped the route and the knowledge base
 * without a single test, so this file pins the behaviour the constraint rests
 * on — the answer *source*, the grounded fallback, call-to-call stability and
 * the absence of any wired AI SDK.
 */

const locales: AppLocale[] = ["tr", "en", "ru", "el", "fa", "de"];

let ipCounter = 0;
function post(body: unknown, ip?: string): Promise<Response> {
  // A fresh address per call keeps the per-address throttle out of the way
  // without depending on the limiter's window.
  ipCounter += 1;
  return POST(
    new Request("http://localhost/api/support/chat", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": ip ?? `203.0.113.${ipCounter}`,
      },
      body: JSON.stringify(body),
    }),
  );
}

test("an on-topic question is answered from the published FAQ, never the network", async () => {
  for (const locale of locales) {
    const answers = new Set(faqByLocale[locale].map((entry) => entry.answer));
    const response = await post({
      message: faqByLocale[locale][0].question,
      locale,
    });
    assert.equal(response.status, 200, `${locale} should answer 200`);
    const payload = (await response.json()) as { reply: string; source: string };
    assert.equal(payload.source, "knowledge", `${locale} should answer from knowledge`);
    assert.ok(
      answers.has(payload.reply),
      `${locale} reply must be verbatim FAQ copy, got: ${payload.reply}`,
    );
  }
});

test("an unplaceable question still gets grounded copy, never a shrug", async () => {
  for (const locale of locales) {
    const response = await post({
      message: "zzzz qqqq wwww xxxx", // no token matches any FAQ entry
      locale,
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { reply: string; source: string };
    assert.equal(payload.source, "fallback");
    assert.equal(payload.reply, fallbackReply(locale));
    assert.ok(payload.reply.length > 0);
  }
});

test("the same question always yields the same reply", async () => {
  const message = faqByLocale.tr[0].question;
  const first = (await (await post({ message, locale: "tr" })).json()) as {
    reply: string;
  };
  const second = (await (await post({ message, locale: "tr" })).json()) as {
    reply: string;
  };
  assert.deepEqual(first, second);
});

test("an unknown locale falls back to tr rather than erroring", async () => {
  const response = await post({ message: faqByLocale.tr[0].question, locale: "xx" });
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { reply: string };
  assert.ok(new Set(faqByLocale.tr.map((entry) => entry.answer)).has(payload.reply));
});

test("the route rejects a malformed turn without answering", async () => {
  assert.equal((await post({ message: "   ", locale: "tr" })).status, 400);
  assert.equal((await post({ message: "a".repeat(1001), locale: "tr" })).status, 400);
});

test("no third-party AI SDK or service is wired into the answer path", () => {
  // The constraint is "deterministic only": if a future change reaches for a
  // hosted model, this is the tripwire. Scans the modules that produce a reply.
  const forbidden =
    /openai|anthropic|generativelanguage|googleapis|mistral|cohere|huggingface|perplexity|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/i;
  for (const file of [
    "../../src/app/api/support/chat/route.ts",
    "../../src/features/support/knowledge.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, forbidden, `${file} must not wire a hosted model`);
  }
});
