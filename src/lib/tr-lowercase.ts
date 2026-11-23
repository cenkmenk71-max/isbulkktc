/**
 * Environment-independent Turkish lowercase.
 *
 * Node.js builds without full ICU data (e.g., minimal Docker images) fall back
 * to the default locale for `toLocaleLowerCase("tr")`, causing `İ` → `i̇`
 * (dotted i) instead of `i`, and `I` → `i` instead of `ı`. This helper
 * implements the Turkish case mapping explicitly so behaviour is identical
 * across all runtimes.
 *
 * Rules (Unicode default case mapping + Turkish exceptions):
 * - `I` (U+0049) → `ı` (U+0131)  — not `i`
 * - `İ` (U+0130) → `i` (U+0069)  — not `i̇`
 * - All other code points use the standard Unicode lowercase mapping
 *   (`String.prototype.toLowerCase()`), which is locale-data-independent.
 */
const TR_UPPER_EXCEPTIONS: Record<string, string> = {
  I: "\u0131", // ı
  "\u0130": "i", // İ → i
};

export function trLowercase(value: string): string {
  return value.replace(/[Iİ]/g, (char) => (char === "I" ? "ı" : "i")).toLowerCase();
}