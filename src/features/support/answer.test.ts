import assert from "node:assert/strict";
import test from "node:test";

import { planSupportReply } from "./answer";
import { fallbackReply } from "./knowledge";

/**
 * The precedence — deterministic first, AI only second, grounded copy last — is
 * the whole point of the live-support bot, so it is pinned here as a pure rule
 * rather than left to the route. The two cases that must never regress: a
 * definite platform fact is never replaced by a model's paraphrase, and a turn
 * with neither answer is never empty.
 */

test("a knowledge match always wins, even when the model also answered", () => {
  const result = planSupportReply({
    grounded: "Platformdan gelen kesin cevap.",
    aiReply: "A model's paraphrase of the same fact.",
    locale: "tr",
  });
  assert.equal(result.source, "knowledge");
  assert.equal(result.reply, "Platformdan gelen kesin cevap.");
});

test("the model answers only when the knowledge base had nothing", () => {
  const result = planSupportReply({
    grounded: null,
    aiReply: "A grounded answer from the model.",
    locale: "en",
  });
  assert.equal(result.source, "ai");
  assert.equal(result.reply, "A grounded answer from the model.");
});

test("with neither answer the grounded fallback copy is used, never empty", () => {
  for (const locale of ["tr", "en"] as const) {
    const result = planSupportReply({ grounded: null, aiReply: null, locale });
    assert.equal(result.source, "fallback");
    assert.equal(result.reply, fallbackReply(locale));
    assert.ok(result.reply.length > 0);
  }
});

test("an empty string is treated as no answer", () => {
  const result = planSupportReply({ grounded: "", aiReply: "", locale: "tr" });
  assert.equal(result.source, "fallback");
  assert.equal(result.reply, fallbackReply("tr"));
});
