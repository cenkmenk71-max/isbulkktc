/**
 * The single-letter avatar shown when an account has no provider picture.
 *
 * `displayName.slice(0, 1)` takes the first UTF-16 *unit*, which halves an astral
 * character — an emoji, or a Deseret / CJK-extension letter — and the lone
 * surrogate renders as a replacement glyph. Taking the first code point instead
 * keeps the monogram whole. Kept free of React so the rule can be unit tested.
 */
export function monogramFor(displayName: string): string {
  return [...displayName][0]?.toLocaleUpperCase() ?? "";
}
