import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_AI_REPLY_LENGTH,
  buildSupportAiRequest,
  buildSupportSystemPrompt,
  parseSupportAiResponse,
  sanitizeModelReply,
} from "./ai-protocol";
import { resolveSupportAiConfig } from "./ai-config";

/**
 * The wire shaping for the optional AI fallback is pure, so the request each
 * provider receives and the text a reply is reduced to are pinned without a live
 * endpoint. Two properties matter most: the prompt is grounded in the platform's
 * own published copy (so the model cannot invent a feature), and the sanitiser
 * never lets a wrapper of quotes or an overlong answer reach the visitor.
 */

const gemini = resolveSupportAiConfig({ SUPPORT_AI_API_KEY: "k" })!;
const groq = resolveSupportAiConfig({
  SUPPORT_AI_API_KEY: "k",
  SUPPORT_AI_PROVIDER: "groq",
})!;

// ---------------------------------------------------------------------------
// The system prompt is grounded, in the visitor's language.
// ---------------------------------------------------------------------------

test("the prompt carries the platform facts and forbids invention", () => {
  const prompt = buildSupportSystemPrompt("tr");
  assert.match(prompt, /İşBul KKTC/);
  assert.match(prompt, /only the facts/i);
  assert.match(prompt, /Never invent/i);
  // The contact details the fallback must offer when a question is uncovered.
  assert.match(prompt, /info@isbulkktc\.com/);
});

test("the prompt asks for the visitor's language", () => {
  assert.match(buildSupportSystemPrompt("tr"), /Türkçe/);
  assert.match(buildSupportSystemPrompt("en"), /English/);
  assert.match(buildSupportSystemPrompt("de"), /Deutsch/);
});

test("an uncovered question is routed to real contact channels, not a promised hand-off", () => {
  const prompt = buildSupportSystemPrompt("tr");
  assert.match(prompt, /do not guess/i);
  assert.match(prompt, /info@isbulkktc\.com/);
  // There is no per-message routing to staff, so the model must not be told to
  // claim one; that promise would be false for every visitor who reads it.
  assert.doesNotMatch(prompt, /pass (it|this) to the team|notify the team/i);
});

// ---------------------------------------------------------------------------
// The request per provider.
// ---------------------------------------------------------------------------

test("gemini uses generateContent with the key in a header", () => {
  const { url, init } = buildSupportAiRequest(gemini, {
    message: "Merhaba",
    locale: "tr",
  });
  assert.match(url, /\/models\/.+:generateContent$/);
  assert.equal(init.method, "POST");
  assert.equal(init.headers["x-goog-api-key"], "k");
  assert.equal(init.headers.authorization, undefined);
  const body = JSON.parse(init.body);
  assert.ok(body.system_instruction);
  assert.equal(body.contents[0].parts[0].text, "Merhaba");
});

test("groq uses chat/completions with a bearer token", () => {
  const { url, init } = buildSupportAiRequest(groq, {
    message: "Hello",
    locale: "en",
  });
  assert.match(url, /\/chat\/completions$/);
  assert.equal(init.headers.authorization, "Bearer k");
  assert.equal(init.headers["x-goog-api-key"], undefined);
  const body = JSON.parse(init.body);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages[1].content, "Hello");
  assert.equal(body.model, groq.model);
});

// A reasoning model that burns its whole budget thinking returns an empty
// completion, which the visitor sees as a failed turn. The ceiling therefore
// leaves headroom for the hidden reasoning, and gpt-oss models are asked for low
// effort so that reasoning stays small in the first place.
test("the output ceiling leaves room for a reasoning model's hidden tokens", () => {
  const { init } = buildSupportAiRequest(groq, { message: "Hi", locale: "en" });
  const body = JSON.parse(init.body);
  assert.ok(
    body.max_tokens >= 1024,
    `expected headroom for reasoning tokens, got ${body.max_tokens}`,
  );
});

test("low reasoning effort is requested only for the models that honour it", () => {
  const oss = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_PROVIDER: "groq",
    SUPPORT_AI_MODEL: "openai/gpt-oss-20b",
  })!;
  const ossBody = JSON.parse(
    buildSupportAiRequest(oss, { message: "Hi", locale: "en" }).init.body,
  );
  assert.equal(ossBody.reasoning_effort, "low");

  // A model that does not reason this way must not receive the parameter: a
  // provider that rejected it would turn every turn into a fallback.
  const plain = resolveSupportAiConfig({
    SUPPORT_AI_API_KEY: "k",
    SUPPORT_AI_PROVIDER: "groq",
    SUPPORT_AI_MODEL: "llama-3.3-70b-versatile",
  })!;
  const plainBody = JSON.parse(
    buildSupportAiRequest(plain, { message: "Hi", locale: "en" }).init.body,
  );
  assert.equal(plainBody.reasoning_effort, undefined);

  // Gemini speaks its own wire shape; the OpenAI-only field never appears there.
  const geminiBody = JSON.parse(
    buildSupportAiRequest(gemini, { message: "Hi", locale: "en" }).init.body,
  );
  assert.equal(geminiBody.reasoning_effort, undefined);
});

// ---------------------------------------------------------------------------
// The response parse.
// ---------------------------------------------------------------------------

test("a gemini reply is read from the first candidate", () => {
  const text = parseSupportAiResponse(gemini, {
    candidates: [{ content: { parts: [{ text: "Merhaba, " }, { text: "buyurun." }] } }],
  });
  assert.equal(text, "Merhaba, buyurun.");
});

test("an openai reply is read from the first choice", () => {
  const text = parseSupportAiResponse(groq, {
    choices: [{ message: { content: "Here to help." } }],
  });
  assert.equal(text, "Here to help.");
});

test("a body with no answer parses to null rather than an empty bubble", () => {
  for (const payload of [
    null,
    "string",
    42,
    {},
    { candidates: [] },
    { candidates: [{ content: {} }] },
    { choices: [] },
    { choices: [{ message: {} }] },
    { choices: [{ message: { content: "   " } }] },
  ]) {
    assert.equal(
      parseSupportAiResponse(gemini, payload),
      null,
      `gemini: ${JSON.stringify(payload)}`,
    );
    assert.equal(
      parseSupportAiResponse(groq, payload),
      null,
      `groq: ${JSON.stringify(payload)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The sanitiser.
// ---------------------------------------------------------------------------

test("whitespace a model pads with is collapsed", () => {
  assert.equal(sanitizeModelReply("  Hello   there  \n\n\n  world "), "Hello there\n\nworld");
});

test("a reply wrapped entirely in one quote or backtick pair is unwrapped", () => {
  assert.equal(sanitizeModelReply('"Merhaba, buyurun."'), "Merhaba, buyurun.");
  assert.equal(sanitizeModelReply("`Merhaba`"), "Merhaba");
  // Only a full wrapper is stripped; inner quotes are part of the answer.
  assert.equal(sanitizeModelReply('He said "hi" today'), 'He said "hi" today');
});

test("nothing meaningful sanitises to null", () => {
  for (const value of [null, "", "   ", "\n\n", '""']) {
    assert.equal(sanitizeModelReply(value), null, JSON.stringify(value));
  }
});

test("an overlong reply is truncated to the cap with an ellipsis", () => {
  const long = "a".repeat(MAX_AI_REPLY_LENGTH + 50);
  const result = sanitizeModelReply(long);
  assert.ok(result);
  assert.ok(result.length <= MAX_AI_REPLY_LENGTH + 1, "must not exceed the cap");
  assert.ok(result.endsWith("…"), "truncation must be visible");
});
