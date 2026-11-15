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
 * Short tokens that are nonetheless significant in this domain: they name a
 * topic the support copy answers, so they survive the length filter *and* count
 * as content words (see `isAnchor`). "cv" is the résumé in every locale's
 * support copy — dropping it left "cv nasıl yüklenir" with only the generic
 * "nasıl"/"yüklenir" and let it match the unrelated apply flow ("cv yükleme nasıl
 * yapılır" → the application steps), a confident answer to a different question.
 * "dil"/"kaç" carry the language-support question ("kaç dil" — how many
 * languages), which is otherwise made only of three-letter tokens.
 */
const SHORT_SIGNIFICANT_TOKENS = new Set(["cv", "dil", "kaç"]);

/**
 * The length at which a token counts as a *content* word rather than a
 * function word. In the six support languages the articles, pronouns and
 * particles that carry no topic ("was", "ist", "das", "der", "die", "the",
 * "how", "and", "für") are three characters or fewer, while a word that
 * names the question's subject ("passwort", "wetter", "kostenlos", "fiyat",
 * "diller") is longer.
 */
const ANCHOR_TOKEN_LENGTH = 4;

/**
 * Whether a token can *anchor* a match — carry the topic, so two texts sharing
 * it are plausibly about the same thing. Every token the length filter keeps
 * that is four characters or more is an anchor, plus the curated short domain
 * tokens above.
 *
 * This is the fix for a whole class of confident wrong answers, not one string.
 * A phrasing made only of function words — the German alias "was ist das" was
 * exactly that — shares its tokens with *any* sentence in the language, so a
 * question about the weather or a refund cleared the coverage bar on "was" and
 * "ist" alone and was answered with the platform summary. Requiring at least one
 * shared *anchor* means a match must turn on a word that names the topic, which
 * a function-word-only phrasing cannot supply; a real paraphrase keeps its
 * content word ("passwort vergessen", "fiyatlar nedir") and still matches.
 */
function isAnchor(token: string): boolean {
  return (
    token.length >= ANCHOR_TOKEN_LENGTH || SHORT_SIGNIFICANT_TOKENS.has(token)
  );
}

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
    .filter(
      (token) =>
        token.length >= MIN_TOKEN_LENGTH ||
        SHORT_SIGNIFICANT_TOKENS.has(token),
    );
}

/**
 * The phrasings an entry may be matched on: its canonical `question`, plus the
 * curated `paraphrases` the entry carries. Both are matching-only — the answer
 * is what the visitor receives. An entry with no paraphrases is matched on its
 * question alone.
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
 *
 * A phrasing made of a single significant word is a deliberately narrow alias
 * ("ücretli mi" → "ücretli", "is it free" → "free"), and a query that is
 * essentially that one word is answered on it: the `MIN_SHARED_TOKENS` floor
 * would otherwise reject every such alias, and each is a real ask — a one-word
 * question the copy does answer. The match is measured against the *query*
 * here, so the alias only fires when the query holds little else ("free" alone,
 * not "free CV review"); a longer query that merely contains the word still has
 * to clear the overlap rule below.
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
      let anchored = false;
      for (const token of queryTokens) {
        if (phrasingTokens.has(token)) {
          score += 1;
          if (isAnchor(token)) anchored = true;
        }
      }
      if (score === 0) continue;
      const covers =
        (score >= MIN_SHARED_TOKENS && score / phrasingTokens.size >= MIN_COVERAGE) ||
        (phrasingTokens.size === 1 && score / queryTokens.size >= MIN_COVERAGE);
      if (covers && anchored && (!best || score > best.score)) {
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
