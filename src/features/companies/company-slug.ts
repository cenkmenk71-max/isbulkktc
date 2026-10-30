const maximumSlugLength = 80;
const fallbackSlug = "sirket";

/**
 * Builds the public identifier of a company from its display name.
 *
 * The stored `companies.slug` must match `^[a-z0-9]+(-[a-z0-9]+)*$` and be 2–80
 * characters. Turkish letters are folded to ASCII so that a company typed as
 * "Şahin İnşaat" produces a stable, ASCII-only identifier.
 */
export function slugifyCompanyName(value: string): string {
  const base = value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base.length < 2) return fallbackSlug;
  if (base.length <= maximumSlugLength) return base;

  const trimmed = base.slice(0, maximumSlugLength);
  const lastDash = trimmed.lastIndexOf("-");
  const clamped = (lastDash > 1 ? trimmed.slice(0, lastDash) : trimmed).replace(
    /-+$/g,
    "",
  );

  return clamped.length >= 2 ? clamped : fallbackSlug;
}

/**
 * Sanitizes a partially typed identifier without forcing a minimum length, so
 * the input can be edited character by character. Turkish letters are folded to
 * ASCII and any other character becomes a single hyphen.
 */
export function normalizeSlugInput(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "");
}

/**
 * Finalises an identifier for submission. A trailing hyphen is allowed while
 * typing (otherwise the user could never start the segment after it) but the
 * stored slug must match `^[a-z0-9]+(-[a-z0-9]+)*$`.
 */
export function finalizeSlug(value: string): string {
  return normalizeSlugInput(value).replace(/-+$/, "");
}
