/**
 * Editorial normalisation for imported job listings.
 *
 * The listings arrive as one run-on string copied from another site: missing
 * spaces after punctuation ("aranmaktadır.Tercihen"), typos the source never
 * fixed ("deneyımlı", "dah aönce"), ALL-CAPS blocks, and the source site's own
 * branding left inside the text. Publishing that verbatim is both a poor read
 * and duplicate content, which is the one thing Google will not index.
 *
 * This module rewrites the *presentation* without touching the *facts*: the
 * employer, the role, the requirements and the location are never invented,
 * added to, or dropped — only reflowed into sentences, corrected and structured.
 * It is deliberately a pure function so the rules can be pinned by tests.
 */

/** Sentences the source wrote without a space after the full stop. */
const missingSpaceAfterStop = /([.!?])(?=[A-ZÇĞİÖŞÜ])/g;
/** A bullet character the source used, which we normalise to a separator. */
const bulletGlyphs = /[•▪◦·]/g;

/**
 * Common misspellings seen in the imported corpus, corrected conservatively.
 *
 * The boundaries are lookarounds over the Turkish alphabet, not `\b`: `\b` is
 * ASCII-based, so it never sees a boundary next to `ı`, `ş` or `ü`, and the rule
 * silently does nothing on exactly the words it exists for.
 */
const trLetter = "a-zA-ZçğıöşüÇĞİÖŞÜ";
const spellingFixes: ReadonlyArray<readonly [RegExp, string]> = [
  [new RegExp(`(?<![${trLetter}])deney[ıi]ml[ıi](?![${trLetter}])`, "g"), "deneyimli"],
  [new RegExp(`(?<![${trLetter}])dah\\s+aönce(?![${trLetter}])`, "gi"), "daha önce"],
  [new RegExp(`(?<![${trLetter}])ile[şs]itim(?![${trLetter}])`, "gi"), "iletişim"],
  [new RegExp(`(?<![${trLetter}])mü[şs]teri(?![${trLetter}])`, "gi"), "müşteri"],
  [new RegExp(`(?<![${trLetter}])personel[ıi](?![${trLetter}])`, "gi"), "personeli"],
];

/** Source-site names that must never appear in our copy. */
const sourceBrandPattern =
  /\b(iskibris|isbulkibris|kariyer\.net|kibrisonline|kktcjobs)\b/gi;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The first letter of each sentence, capitalised, and the rest left as written —
 * the source mixes ALL-CAPS headings with normal sentences, and re-casing
 * everything would flatten the emphasis the employer chose.
 */
function tidySentence(value: string): string {
  return value.replace(
    /(^|[.!?]\s+)([a-zçğıöşü])/g,
    (_match, lead: string, letter: string) => `${lead}${letter.toLocaleUpperCase("tr")}`,
  );
}

/**
 * Rewrites one block of imported text: normalises punctuation and spacing,
 * corrects the known misspellings, drops source-site branding, and capitalises
 * sentence starts. Returns null for input that carries no usable text.
 */
export function rewriteImportedJobText(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  let text = raw
    .replace(bulletGlyphs, " • ")
    .replace(missingSpaceAfterStop, "$1 ")
    .replace(sourceBrandPattern, "")
    .replace(/[ \t]+/g, " ");

  for (const [pattern, replacement] of spellingFixes) {
    text = text.replace(pattern, replacement);
  }

  // Rebuild the bullet list so each item starts on its own line, which is what
  // makes a long requirement list readable instead of a paragraph.
  text = text
    .split(/\s*•\s*/)
    .map((part) => collapseWhitespace(part))
    .filter(Boolean)
    .join("\n");

  text = text
    .split("\n")
    .map((line) => tidySentence(collapseWhitespace(line)))
    .filter(Boolean)
    .join("\n");

  return text.trim() || null;
}

/**
 * Builds the summary shown on listing cards: the first sentence or two of the
 * rewritten description, trimmed at a word boundary. Never longer than the
 * cards can render, and never a mid-word cut.
 */
export function buildListingSummary(
  rewrittenDescription: string,
  maxLength = 260,
): string {
  const normalized = collapseWhitespace(rewrittenDescription.replace(/\n+/g, " "));
  if (normalized.length <= maxLength) return normalized;

  const slice = normalized.slice(0, maxLength);
  const lastStop = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  if (lastStop > 80) return slice.slice(0, lastStop + 1).trim();

  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}
