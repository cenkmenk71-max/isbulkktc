import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { supportFlowsByLocale } from "@/content/ai-visibility/support-flows";

import { buildSupportSystemPrompt } from "./ai-protocol";
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

// The other half of the catalogue: procedural flows. A "how do I…" question is
// what a support visitor most often asks, and the FAQ alone cannot place it, so
// before the flows existed every one of these fell through to the model — which
// was itself told the interface was unknown and deflected. Each must now be
// answered in-process, from the product's own steps.
test("a how-to question is answered from the procedural flows, not the model", () => {
  const cases: [string, string, RegExp][] = [
    ["tr", "Şifremi nasıl sıfırlarım?", /Şifrenizi mi unuttunuz/],
    ["tr", "Şifremi nasıl değiştiririm?", /yeni şifre/],
    ["tr", "Nasıl hesap oluştururum?", /Aday olarak/],
    ["tr", "İlana nasıl başvururum?", /başvurunuz siteye kaydedilir/i],
    ["tr", "İşveren olarak nasıl ilan veririm?", /inceleme sürecine alınır/],
    ["tr", "CV dosyam güvenli mi?", /tarayıcınızda/],
    ["en", "How do I reset my password?", /Forgot your password/],
    ["en", "How do I apply for a job?", /candidate profile/i],
    ["en", "Is my CV file safe?", /not uploaded to the server/i],
  ];
  for (const [locale, message, expected] of cases) {
    const answer = answerFromKnowledge(message, locale as "tr" | "en");
    assert.ok(answer, `[${locale}] ${JSON.stringify(message)} should match a flow`);
    assert.match(answer, expected);
  }
});

// The recall half of the paraphrase work: a visitor rarely types the canonical
// question. These are the phrasings the widget actually receives — a bare noun
// ("şifre sıfırlama"), a first-person statement ("şifremi unuttum"), a filler-
// padded question ("ich habe mein passwort vergessen") — and each must resolve
// in-process from the entry's curated `paraphrases`, not fall through to the
// model. The `want` is a distinctive phrase from the flow's own answer, so a
// match to the *wrong* flow is caught too, not just a fall-through.
test("a paraphrase of a flow question is answered in-process", () => {
  const cases: [string, string, RegExp][] = [
    // tr
    ["tr", "şifre sıfırlama", /Şifrenizi mi unuttunuz/],
    ["tr", "şifremi unuttum", /Şifrenizi mi unuttunuz/],
    ["tr", "parolamı nasıl yenilerim", /Şifrenizi mi unuttunuz/],
    ["tr", "hesap açmak istiyorum", /Aday olarak/],
    ["tr", "üye olmak istiyorum", /Aday olarak/],
    ["tr", "kayıt olmak istiyorum", /Aday olarak/],
    ["tr", "mail doğrulama nasıl yapılır", /doğrulama bağlantısı/],
    ["tr", "doğrulama maili gelmedi", /doğrulama/],
    ["tr", "başvuru nasıl yapılır", /başvurunuz siteye kaydedilir/i],
    ["tr", "ilana başvurmak istiyorum", /başvurunuz siteye kaydedilir/i],
    ["tr", "ilan vermek istiyorum", /inceleme sürecine alınır/],
    ["tr", "şirket kaydı nasıl yapılır", /inceleme sürecine alınır/],
    ["tr", "cv gizliliği nasıl", /tarayıcınızda/],
    // en
    ["en", "i forgot my password", /Forgot your password/],
    ["en", "how to sign up", /candidate account/],
    ["en", "i want to register", /candidate account/],
    ["en", "email verification not working", /verification link/],
    ["en", "cover letter how to add", /cover letter/i],
    ["en", "where is my cv stored", /not uploaded to the server/i],
    // de — the case that was a live false positive before entry-relative coverage
    ["de", "ich habe mein passwort vergessen", /Passwort vergessen/],
    ["de", "passwort ändern", /Passwort vergessen/],
    ["de", "ich möchte mich registrieren", /Bewerberkonto/],
    ["de", "konto anlegen", /Bewerberkonto/],
    ["de", "bestätigungsmail nicht erhalten", /Bestätigungslink/],
    ["de", "wie kann ich mich bewerben", /Bewerbung erfolgt über das Formular/],
    ["de", "stellenanzeige schalten", /geprüft/],
    ["de", "lebenslauf datenschutz", /nicht auf den Server/],
    // ru
    ["ru", "я забыл пароль", /Забыли пароль/],
    ["ru", "сменить пароль", /Забыли пароль/],
    ["ru", "хочу зарегистрироваться", /аккаунт кандидата/],
    ["ru", "письмо подтверждения не пришло", /ссылку для подтверждения/],
    ["ru", "как подать заявку", /профиль кандидата/],
    // el
    ["el", "ξέχασα τον κωδικό μου", /Ξεχάσατε τον κωδικό/],
    ["el", "θέλω να εγγραφώ", /λογαριασμό υποψηφίου/],
    ["el", "πώς να κάνω αίτηση", /προφίλ υποψηφίου/],
    // fa
    ["fa", "گذرواژه‌ام را فراموش کرده‌ام", /گذرواژه را فراموش کرده/],
    ["fa", "می‌خواهم ثبت‌نام کنم", /حساب متقاضی/],
  ];
  for (const [locale, message, expected] of cases) {
    const answer = answerFromKnowledge(message, locale as "tr");
    assert.ok(
      answer,
      `[${locale}] ${JSON.stringify(message)} should match a flow`,
    );
    assert.match(answer, expected);
  }
});

// The invariant that keeps the paraphrase data honest: every flow carries at
// least one alias, and no alias is rendered as a fact line of the model's
// prompt. The prompt renders each entry's `question` and `answer`; a paraphrase
// that started appearing as a `Q:` line would let the model answer from a
// phrasing the deterministic layer was supposed to own. (A paraphrase may still
// occur as a substring of the answer prose — that is the fact being restated.)
test("every flow carries paraphrases and none are rendered as prompt facts", () => {
  for (const locale of locales) {
    const prompt = buildSupportSystemPrompt(locale);
    for (const flow of supportFlowsByLocale[locale]) {
      assert.ok(
        flow.paraphrases.length > 0,
        `[${locale}] ${JSON.stringify(flow.question)} has no paraphrases`,
      );
      for (const paraphrase of flow.paraphrases) {
        assert.ok(
          !prompt.includes(`Q: ${paraphrase}`),
          `[${locale}] paraphrase ${JSON.stringify(paraphrase)} rendered as a prompt fact`,
        );
      }
    }
  }
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
