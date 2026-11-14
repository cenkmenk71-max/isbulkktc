import { faqByLocale, siteSummaryByLocale } from "@/content/ai-visibility/faq";
import { supportFlowsByLocale } from "@/content/ai-visibility/support-flows";
import type { AppLocale } from "@/i18n/routing";

/**
 * Deterministic, fact-grounded answers for the live-support widget.
 *
 * The bot answers only from the platform's own published copy: the six-language
 * FAQ bundle in `src/content/ai-visibility/faq.ts`, which restates the exact
 * sentences the about / contact / packages pages already ship, plus the
 * procedural flows in `support-flows.ts`, which restate the interface's own
 * steps (password reset, account creation, applying, employer listing, CV
 * privacy) from the shipped i18n copy. Nothing here invents a feature the site
 * does not have, and nothing reaches the network: an on-topic question is
 * answered in-process, so the common case costs no token and cannot hallucinate.
 *
 * Both catalogues are searched together, so a "how do I…" question the FAQ alone
 * cannot place is still answered in-process rather than handed to the model.
 *
 * Off-topic questions fall through to `fallbackReply`, which is still grounded
 * copy rather than a shrug.
 */

const MIN_TOKEN_LENGTH = 3;

/**
 * A question must share at least this share of the *matched phrasing's*
 * significant words before that phrasing may answer it. Pure overlap is too
 * eager here: every FAQ question ends in the same word for the language
 * ("nedir", "is", "ist"), so "Tek ilan fiyatı nedir?" would otherwise match
 * "İşBul KKTC nedir?" on the shared "nedir" alone and answer with an unrelated
 * fact.
 *
 * The share is measured against the entry (the curated, canonical phrasing), not
 * the query: a visitor's real question is the noisy side — "ich habe mein
 * passwort vergessen" carries three filler words that a query-relative share
 * would count against it and push a good match under the bar. Measuring the
 * entry keeps a short curated alias like "passwort vergessen" reachable, while a
 * long off-topic question still fails because it shares only one or two of the
 * entry's words.
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
 * The phrasings an entry may be matched on: its canonical `question`, plus the
 * curated `paraphrases` a flow carries. Both are matching-only — the answer is
 * what the visitor receives. FAQ entries have no paraphrases, so the list is
 * just their question.
 */
function matchPhrasings(entry: {
  question: string;
  paraphrases?: readonly string[];
}): readonly string[] {
  return entry.paraphrases?.length
    ? [entry.question, ...entry.paraphrases]
    : [entry.question];
}

/**
 * Best FAQ or flow answer for `message`, or `null` when nothing matches
 * confidently.
 *
 * Scoring is the overlap of significant tokens (length >= 3, so a locale's
 * articles and short particles drop out) between the query and each entry's
 * *question* and *paraphrases* — never its answer. The answer text is dense with
 * the platform's general vocabulary ("işverenler", "ilan", "için"), so scoring
 * it let a plain question like "İşverenler için ilan paketleri var mı?" ride
 * those words into the unrelated "İşBul KKTC nedir?" entry.
 *
 * Each phrasing is scored on its own — a curated paraphrase is a deliberately
 * tight target ("şifremi unuttum"), and pooling it with the canonical question
 * would dilute exactly the match it exists to make. A phrasing is accepted only
 * when it covers `MIN_COVERAGE` of its own distinct words *and* shares
 * `MIN_SHARED_TOKENS` of the query's, so a question the copy does not answer
 * falls through to the model. Ties keep the earlier entry, so the result is
 * stable.
 */
export function answerFromKnowledge(
  message: string,
  locale: AppLocale,
): string | null {
  const queryTokens = new Set(tokenize(message, locale));
  if (queryTokens.size === 0) return null;

  let best: { score: number; answer: string } | null = null;
  const entries = [...faqByLocale[locale], ...supportFlowsByLocale[locale]];
  for (const entry of entries) {
    for (const phrasing of matchPhrasings(entry)) {
      const phrasingTokens = new Set(tokenize(phrasing, locale));
      if (phrasingTokens.size === 0) continue;
      let score = 0;
      for (const token of queryTokens) {
        if (phrasingTokens.has(token)) score += 1;
      }
      if (score === 0) continue;
      const covers =
        score >= MIN_SHARED_TOKENS &&
        score / phrasingTokens.size >= MIN_COVERAGE;
      if (covers && (!best || score > best.score)) {
        best = { score, answer: entry.answer };
      }
    }
  }

  return best?.answer ?? null;
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
