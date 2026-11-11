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
 * Off-topic questions fall through to the optional AI layer
 * (`requestAiReply`), and when that is unconfigured or declines, to
 * `fallbackReply`, which is still grounded copy rather than a shrug.
 */

const MIN_TOKEN_LENGTH = 3;

function tokenize(text: string, locale: AppLocale): string[] {
  return text
    .toLocaleLowerCase(locale)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/**
 * Best FAQ answer for `message`, or `null` when nothing matches confidently.
 *
 * Scoring is a plain overlap of significant tokens (length >= 3, so a locale's
 * articles and short particles drop out) between the question and each FAQ
 * entry. The threshold rises with the query length so a single incidental word
 * ("iş", "work") cannot answer an unrelated question, while a two-word lookup
 * like "nedir İşBul" still resolves. Ties keep the first entry, so the result is
 * stable across calls.
 */
export function answerFromKnowledge(
  message: string,
  locale: AppLocale,
): string | null {
  const queryTokens = new Set(tokenize(message, locale));
  if (queryTokens.size === 0) return null;

  let best: { score: number; answer: string } | null = null;
  for (const entry of faqByLocale[locale]) {
    const entryTokens = new Set(
      tokenize(`${entry.question} ${entry.answer}`, locale),
    );
    let score = 0;
    for (const token of queryTokens) {
      if (entryTokens.has(token)) score += 1;
    }
    if (score === 0) continue;
    if (!best || score > best.score) best = { score, answer: entry.answer };
  }

  if (!best) return null;
  const threshold = queryTokens.size <= 2 ? 1 : 2;
  return best.score >= threshold ? best.answer : null;
}

/**
 * Grounded reply for a question the knowledge base and the AI layer both
 * decline. It restates what the platform is and routes the visitor to the human
 * channels — both taken from the FAQ bundle, so every locale stays truthful.
 */
export function fallbackReply(locale: AppLocale): string {
  const summary = siteSummaryByLocale[locale];
  const contact = faqByLocale[locale].find((entry) =>
    entry.answer.includes("info@isbulkktc.com"),
  );
  return contact ? `${summary}\n\n${contact.answer}` : summary;
}
