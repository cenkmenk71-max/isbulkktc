import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { faqByLocale } from "@/content/ai-visibility/faq";
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

// The recall half of the *FAQ* paraphrase work. The FAQ answers what the
// platform is, what it costs, where it operates and how to reach a human — the
// questions the widget's own chips pose. A visitor rarely types the canonical
// question, though: they write a bare noun ("paket fiyatları"), a short
// interrogative ("hangi diller") or a first-person ask ("size nasıl
// ulaşabilirim"). Each of these fell through to the model (or the generic
// fallback) before the FAQ entries carried `paraphrases`; each must now resolve
// in-process. The `want` is a distinctive phrase from the FAQ answer, so a match
// to the wrong entry is caught, not just a fall-through.
test("a paraphrase of an FAQ question is answered in-process", () => {
  const cases: [string, string, RegExp][] = [
    // tr — the pricing/packaging family that surfaced the gap in production
    ["tr", "ilan paketleri", /ücretsizdir/],
    ["tr", "paket fiyatları", /ücretsizdir/],
    ["tr", "ilan paket fiyatları", /ücretsizdir/],
    ["tr", "ücretli mi", /ücretsizdir/],
    ["tr", "ilan ücretli mi", /ücretsizdir/],
    ["tr", "başvuru ücretli mi", /ücretsizdir/],
    ["tr", "ücretli", /ücretsizdir/],
    ["tr", "fiyat", /ücretsizdir/],
    ["tr", "ne kadar ücret", /ücretsizdir/],
    ["tr", "paketleri nereden görebilirim", /ücretsizdir/],
    // tr — the other FAQ topics
    ["tr", "hangi ilçelerde", /Lefkoşa/],
    ["tr", "hangi bölgeler", /Lefkoşa/],
    ["tr", "hangi diller", /altı dilde/],
    ["tr", "dil desteği", /altı dilde/],
    ["tr", "şirket rehberi nedir", /doğrulan/],
    ["tr", "şirketler doğrulanmış mı", /doğrulan/],
    ["tr", "iletişim bilgileri", /info@isbulkktc\.com/],
    ["tr", "telefon numarası", /info@isbulkktc\.com/],
    ["tr", "nasıl ulaşabilirim", /info@isbulkktc\.com/],
    // en
    ["en", "how much does it cost", /free for job seekers/i],
    ["en", "is it free", /free for job seekers/i],
    ["en", "free", /free for job seekers/i],
    ["en", "listing prices", /free for job seekers/i],
    ["en", "job packages", /free for job seekers/i],
    ["en", "which districts", /Nicosia/],
    ["en", "which languages", /six languages/],
    ["en", "phone number", /info@isbulkktc\.com/],
    ["en", "are companies verified", /verified/],
    // de
    ["de", "ist es kostenlos", /kostenlos/],
    ["de", "was kostet es", /kostenlos/],
    ["de", "anzeigenpakete", /kostenlos/],
    ["de", "kostenlos", /kostenlos/],
    ["de", "welche bezirke", /Nikosia/],
    ["de", "welche sprachen", /sechs Sprachen/],
    ["de", "wie erreiche ich euch", /info@isbulkktc\.com/],
    // ru
    ["ru", "это бесплатно", /бесплатн/],
    ["ru", "сколько стоит", /бесплатн/],
    ["ru", "пакеты вакансий", /бесплатн/],
    ["ru", "какие районы", /Никосия/],
    ["ru", "какие языки", /шести языках/],
    ["ru", "как с вами связаться", /info@isbulkktc\.com/],
    // el
    ["el", "είναι δωρεάν", /δωρεάν/],
    ["el", "πόσο κοστίζει", /δωρεάν/],
    ["el", "ποιες περιοχές", /Λευκωσία/],
    ["el", "ποιες γλώσσες", /έξι γλώσσες/],
    ["el", "πώς να επικοινωνήσω", /info@isbulkktc\.com/],
    // fa
    ["fa", "رایگان است", /رایگان/],
    ["fa", "چقدر هزینه دارد", /رایگان/],
    ["fa", "کدام مناطق", /نیکوزیا/],
    ["fa", "چه زبان‌هایی", /شش زبان/],
    ["fa", "چگونه تماس بگیرم", /info@isbulkktc\.com/],
  ];
  for (const [locale, message, expected] of cases) {
    const answer = answerFromKnowledge(message, locale as "tr");
    assert.ok(
      answer,
      `[${locale}] ${JSON.stringify(message)} should match an FAQ entry`,
    );
    assert.match(answer, expected);
  }
});

// The invariant that keeps the paraphrase data honest: every flow and every FAQ
// entry carries at least one alias, and no alias is rendered as a fact line of
// the model's prompt. The prompt renders each entry's `question` and `answer`; a
// paraphrase that started appearing as a `Q:` line would let the model answer
// from a phrasing the deterministic layer was supposed to own. (A paraphrase may
// still occur as a substring of the answer prose — that is the fact being
// restated.)
test("every entry carries paraphrases and none are rendered as prompt facts", () => {
  for (const locale of locales) {
    const prompt = buildSupportSystemPrompt(locale);
    const entries = [...faqByLocale[locale], ...supportFlowsByLocale[locale]];
    for (const entry of entries) {
      assert.ok(
        entry.paraphrases && entry.paraphrases.length > 0,
        `[${locale}] ${JSON.stringify(entry.question)} has no paraphrases`,
      );
      for (const paraphrase of entry.paraphrases) {
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
//
// "How much does a listing cost?" is the one deliberate exception: it is the
// canonical English way to ask the pricing question, so it now resolves to the
// pricing entry in-process instead of the model (see the pricing-recall test
// below). The remaining probes stay uncovered because the curated aliases do not
// claim them — the copy states no refund policy and no per-listing figure.
test("a question that only shares a generic word does not match", () => {
  for (const message of [
    "Tek ilan fiyatı nedir?",
    "Fiyatlarınız nedir?",
    "Kaç para?",
    "What is the refund policy?",
  ]) {
    const locale = message.includes("refund") ? "en" : "tr";
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
// The first three are synthetic answer-only probes. The last one — "İşverenler
// ilan yayınlayabilir mi?" — is a hiring question, not a pricing one, and the
// pricing entry deliberately does not claim it.
test("a question that only shares words with an answer does not match", () => {
  for (const message of [
    "Kuzey Kıbrıs Cumhuriyeti platformu",
    "ödeme IBAN talimatı",
    "geliştirilen kariyer platformudur",
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

// The single-word alias path ("free" → the pricing entry) is measured against
// the query, so it only fires when the query is essentially that one word. A
// longer question that merely contains the word must still fall through: "free
// CV review" shares "free" with the pricing entry but asks something the copy
// does not answer.
test("a single-word alias does not swallow a longer question", () => {
  for (const message of [
    "free CV review",
    "how do I get a free CV review",
    "is the CV builder free",
  ]) {
    assert.equal(
      answerFromKnowledge(message, "en"),
      null,
      `${JSON.stringify(message)} must not match on the single-word alias`,
    );
  }
});

test("the fallback reply is grounded copy that names a real contact channel", () => {
  for (const locale of locales) {
    const reply = fallbackReply(locale);
    assert.ok(reply.length > 0);
    assert.match(reply, /info@isbulkktc\.com/);
  }
});
