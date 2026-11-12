import "./support/server-only-hook";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { faqByLocale } from "../../src/content/ai-visibility/faq";
import { fallbackReply } from "../../src/features/support/knowledge";
import type { AppLocale } from "../../src/i18n/routing";

/**
 * The live-support chat answers on-topic questions from the platform's own
 * published FAQ copy, in-process, so the common case costs no token and cannot
 * hallucinate. An unplaceable question may be handed to a hosted model, but only
 * when the operator has configured one — that call is server-side and
 * env-gated, so a deployment with no key behaves exactly as the deterministic
 * design did.
 *
 * #610 shipped the route and the knowledge base without a single test, so this
 * file pins the behaviour that rests on: the answer *source*, the grounded
 * fallback, call-to-call stability, that the knowledge path never touches the
 * network, and that no provider SDK is wired into the answer path itself.
 */

const locales: AppLocale[] = ["tr", "en", "ru", "el", "fa", "de"];

// The route pulls in the `server-only`-guarded adapter, so it is imported
// dynamically — after the hook above installs. A static import would be hoisted
// above the hook's side effect and throw under `tsx --test`.
const routeModule = () => import("../../src/app/api/support/chat/route");

let ipCounter = 0;
async function post(body: unknown, ip?: string): Promise<Response> {
  const { POST } = await routeModule();
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

/** Run `fn` with `SUPPORT_AI_*` set, restoring the previous environment after. */
async function withSupportEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(env)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
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

test("no provider SDK is imported into the answer path; the fallback is hand-rolled", () => {
  // The fallback must not add a dependency: the request shaping is ours
  // (`ai-protocol`), and the only network call lives in the guarded adapter. A
  // future change that reaches for `openai`/`@google/generative-ai` here is the
  // tripwire. The *provider hostnames* are allowed — they are data in the pure
  // config module, not an import.
  const forbiddenImport =
    /from\s+["'](openai|@google\/generative-ai|@anthropic-ai\/sdk|cohere-ai|@mistralai\/[^"']+|@huggingface\/[^"']+)["']/;
  for (const file of [
    "../../src/app/api/support/chat/route.ts",
    "../../src/features/support/knowledge.ts",
    "../../src/features/support/ai-config.ts",
    "../../src/features/support/ai-protocol.ts",
    "../../src/server/support/ai.ts",
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, forbiddenImport, `${file} must not import a provider SDK`);
  }
});

test("the knowledge path answers without any configured AI and without the network", async () => {
  // No `SUPPORT_AI_API_KEY` is set in the test environment, so the adapter
  // resolves to `null` and returns before any `fetch`. A working FAQ match must
  // therefore answer from knowledge with no network access at all — the global
  // `fetch` is replaced with a tripwire to prove it.
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    throw new Error("the knowledge path must not reach the network");
  }) as typeof fetch;
  try {
    const response = await post({
      message: faqByLocale.tr[0].question,
      locale: "tr",
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { source: string };
    assert.equal(payload.source, "knowledge");
    assert.equal(called, false, "an FAQ match must be answered in-process");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unplaceable question with no AI configured falls back without the network", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    throw new Error("no AI is configured, so nothing may be fetched");
  }) as typeof fetch;
  try {
    const response = await post({
      message: "zzzz qqqq wwww xxxx",
      locale: "tr",
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { reply: string; source: string };
    assert.equal(payload.source, "fallback");
    assert.equal(payload.reply, fallbackReply("tr"));
    assert.equal(called, false, "an env-gated fallback must not call out without a key");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("with a key configured, an unplaceable question is answered by the model", async () => {
  // The adapter is exercised end to end against a stubbed endpoint: the request
  // it builds is sent, the reply is parsed and sanitised, and the route reports
  // the `ai` source. The knowledge base still has nothing to say about the
  // message, so this is exactly the case the fallback exists for.
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: '  "Merhaba, size yardımcı olalım."  ' }] } },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
  try {
    const response = await withSupportEnv(
      { SUPPORT_AI_API_KEY: "test-key", SUPPORT_AI_PROVIDER: "gemini" },
      () => post({ message: "zzzz qqqq wwww xxxx", locale: "tr" }),
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { reply: string; source: string };
    assert.equal(payload.source, "ai");
    // The wrapper quotes are stripped and the padding collapsed.
    assert.equal(payload.reply, "Merhaba, size yardımcı olalım.");
    assert.equal(calls.length, 1, "the model endpoint must have been called once");
    assert.match(calls[0].url, /generativelanguage\.googleapis\.com/);
    // The key travels in the provider header, never in the body.
    assert.equal(
      (calls[0].init.headers as Record<string, string>)["x-goog-api-key"],
      "test-key",
    );
    assert.doesNotMatch(String(calls[0].init.body), /test-key/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a definite FAQ answer still wins even when a key is configured", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    throw new Error("a knowledge match must not be handed to the model");
  }) as typeof fetch;
  try {
    const response = await withSupportEnv(
      { SUPPORT_AI_API_KEY: "test-key" },
      () => post({ message: faqByLocale.tr[0].question, locale: "tr" }),
    );
    const payload = (await response.json()) as { source: string };
    assert.equal(payload.source, "knowledge");
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an unreachable model degrades to the grounded fallback, never an error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  try {
    const response = await withSupportEnv(
      { SUPPORT_AI_API_KEY: "test-key", SUPPORT_AI_PROVIDER: "groq" },
      () => post({ message: "zzzz qqqq wwww xxxx", locale: "en" }),
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { reply: string; source: string };
    assert.equal(payload.source, "fallback");
    assert.equal(payload.reply, fallbackReply("en"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a non-ok model response also degrades to the grounded fallback", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("upstream boom", { status: 500 })) as typeof fetch;
  try {
    const response = await withSupportEnv(
      { SUPPORT_AI_API_KEY: "test-key" },
      () => post({ message: "zzzz qqqq wwww xxxx", locale: "tr" }),
    );
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { reply: string; source: string };
    assert.equal(payload.source, "fallback");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
