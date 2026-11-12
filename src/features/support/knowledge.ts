import { faqByLocale, siteSummaryByLocale } from "@/content/ai-visibility/faq";
import type { AppLocale } from "@/i18n/routing";

/**
 * Deterministic, fact-grounded answers for the live-support widget.
 *
 * The bot answers only from the platform's own published copy — the six-language
 * FAQ bundle in `src/content/ai-visibility/faq.ts`, which restates the exact
 * sentences the about / contact / packages pages already ship. Nothing here
 * invents a feature the site does not have, and nothing reaches the network: an
 * on-topic question is answered in-process, so the common case costs no token
 * and cannot hallucinate.
 *
 * Off-topic questions fall through to `fallbackReply`, which is still grounded
 * copy rather than a shrug.
 */

const MIN_TOKEN_LENGTH = 3;

/**
 * A question must share at least this share of its significant words with an
 * entry before that entry may answer it. Pure overlap is too eager here: every
 * FAQ question ends in the same word for the language ("nedir", "is", "ist"),
 * so "Tek ilan fiyatı nedir?" would otherwise match "İşBul KKTC nedir?" on the
 * shared "nedir" alone and answer with an unrelated fact. Requiring the match to
 * also cover most of the query keeps a near-verbatim lookup working while an
 * off-topic question falls through to the model (or the grounded fallback).
 */
const MIN_COVERAGE = 0.6;

/** At least this many significant words must overlap, regardless of coverage. */
const MIN_SHARED_TOKENS = 2;

function tokenize(text: string, locale: AppLocale): string[] {
  return text
    .toLocaleLowerCase(locale)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Best FAQ answer for `message`, or `null` when nothing matches confidently.
 *
 * Scoring is the overlap of significant tokens (length >= 3, so a locale's
 * articles and short particles drop out) between the query and each FAQ entry's
 * *question* — never its answer. The answer text is dense with the platform's
 * general vocabulary ("işverenler", "ilan", "için"), so scoring it let a plain
 * question like "İşverenler için ilan paketleri var mı?" ride those words into
 * the unrelated "İşBul KKTC nedir?" entry. A match is accepted only when it
 * covers `MIN_COVERAGE` of the query's distinct words *and* shares
 * `MIN_SHARED_TOKENS` of them, so a question the copy does not answer falls
 * through to the model. Ties keep the first entry, so the result is stable.
 */
export function answerFromKnowledge(
  message: string,
  locale: AppLocale,
): string | null {
  const queryTokens = new Set(tokenize(message, locale));
  if (queryTokens.size === 0) return null;

  let best: { score: number; answer: string } | null = null;
  for (const entry of faqByLocale[locale]) {
    const entryTokens = new Set(tokenize(entry.question, locale));
    let score = 0;
    for (const token of queryTokens) {
      if (entryTokens.has(token)) score += 1;
    }
    if (score === 0) continue;
    if (!best || score > best.score) best = { score, answer: entry.answer };
  }

  if (!best) return null;
  const covers =
    best.score >= MIN_SHARED_TOKENS &&
    best.score / queryTokens.size >= MIN_COVERAGE;
  return covers ? best.answer : null;
}

/**
 * Grounded reply for a question the knowledge base cannot place. It restates
 * what the platform is and routes the visitor to the human channels — both
 * taken from the FAQ bundle, so every locale stays truthful.
 */
export function fallbackReply(locale: AppLocale): string {
  const summary = siteSummaryByLocale[locale];
  const contact = faqByLocale[locale].find((entry) =>
    entry.answer.includes("info@isbulkktc.com"),
  );
  return contact ? `${summary}\n\n${contact.answer}` : summary;
}
