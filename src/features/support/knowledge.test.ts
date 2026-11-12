import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { answerFromKnowledge, fallbackReply } from "./knowledge";

/**
 * The deterministic matcher is the bot's first line and its cheapest, so two
 * properties are pinned here: a question that really is in the FAQ is answered
 * without a model, and a question that only *shares a word* with one is not.
 *
 * The second is the one that regressed, twice. FAQ questions in a language end in
 * the same word ("nedir", "is", "ist"), so a pure token overlap let "Tek ilan
 * fiyatı nedir?" match "İşBul KKTC nedir?" on "nedir" alone. The coverage rule
 * fixes that. And the score originally counted an entry's *answer* too, whose
 * prose is dense with the platform's general vocabulary ("işverenler", "ilan",
 * "paket", "platform"), so an off-topic question could ride those words into an
 * unrelated entry; scoring the question text alone fixes that. These cases lock
 * both.
 */

const locales = ["tr", "en", "ru", "el", "fa", "de"] as const;

const readSupport = (locale: string) =>
  (
    JSON.parse(
      readFileSync(
        new URL(`../../messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    ) as { support: Record<string, string> }
  ).support;

// The widget offers these as chips, so they are the questions the bot is most
// often asked first. Every one must resolve to a published answer with no model
// in the loop — if a chip falls through, the visitor's first tap hits the AI or
// the generic fallback.
test("every suggestion chip resolves to a published answer", () => {
  for (const locale of locales) {
    const support = readSupport(locale);
    for (const key of ["suggestion1", "suggestion2", "suggestion3"]) {
      const chip = support[key];
      const answer = answerFromKnowledge(chip, locale);
      assert.ok(
        answer,
        `[${locale}] chip ${key} ${JSON.stringify(chip)} did not match the FAQ`,
      );
      assert.notEqual(answer, fallbackReply(locale));
    }
  }
});

test("a near-verbatim FAQ question is answered", () => {
  assert.match(
    answerFromKnowledge("İşBul KKTC nedir?", "tr") ?? "",
    /Kuzey Kıbrıs/,
  );
  assert.match(
    answerFromKnowledge("Hangi bölgelerde hizmet veriyorsunuz?", "tr") ?? "",
    /Lefkoşa/,
  );
  assert.match(
    answerFromKnowledge("Does it cost anything to post?", "en") ?? "",
    /free for job seekers/i,
  );
});

// The regression itself: these share a single generic word ("nedir") with an FAQ
// question but ask something the copy does not answer. A wrong confident answer
// is worse than no answer, so each must fall through (to the model, or the
// grounded fallback) rather than match.
test("a question that only shares a generic word does not match", () => {
  for (const message of [
    "Tek ilan fiyatı nedir?",
    "Fiyatlarınız nedir?",
    "Kaç para?",
    "How much does a listing cost?",
    "What is the refund policy?",
  ]) {
    const locale = message.includes("How") || message.includes("refund")
      ? "en"
      : "tr";
    assert.equal(
      answerFromKnowledge(message, locale),
      null,
      `${JSON.stringify(message)} must not match on a shared generic word`,
    );
  }
});

// The other half of the same defect: an entry's *answer* is prose, and its
// vocabulary ("işverenler", "ilan", "paket", "platform", "Kuzey", "Kıbrıs") is the
// platform's general vocabulary, so scoring it let an off-topic question ride
// those words into an unrelated entry. Each message below shares words with an
// FAQ *answer* but none with its *question*, so a correct matcher falls through.
// The last three are the employer-package questions that surfaced the bug in
// production ("İşverenler için ilan paketleri var mı?" answered with "İşBul KKTC
// nedir?"); the first three are synthetic answer-only probes.
test("a question that only shares words with an answer does not match", () => {
  for (const message of [
    "Kuzey Kıbrıs Cumhuriyeti platformu",
    "ödeme IBAN talimatı",
    "geliştirilen kariyer platformudur",
    "İşverenler için ilan paketleri var mı?",
    "İşverenler için ilan paketlerini nereden görebilirim?",
    "İşverenler ilan yayınlayabilir mi?",
  ]) {
    assert.equal(
      answerFromKnowledge(message, "tr"),
      null,
      `${JSON.stringify(message)} must not match on answer-only vocabulary`,
    );
  }
});

test("a greeting or an empty question never matches", () => {
  for (const message of ["Merhaba", "Hello", "", "   ", "???"]) {
    assert.equal(answerFromKnowledge(message, "tr"), null);
  }
});

test("the fallback reply is grounded copy that names a real contact channel", () => {
  for (const locale of locales) {
    const reply = fallbackReply(locale);
    assert.ok(reply.length > 0);
    assert.match(reply, /info@isbulkktc\.com/);
  }
});
