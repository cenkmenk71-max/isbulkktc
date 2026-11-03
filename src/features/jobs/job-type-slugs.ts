/**
 * The employment types that get a landing page, and their URL slugs.
 *
 * Kept in one module so the page route, the cross-link block and the sitemap all
 * agree on a type's URL; a slug defined twice is a URL that 404s from one of
 * them.
 */
export const jobTypeSlugs = {
  full_time: "tam-zamanli",
  part_time: "yari-zamanli",
  contract: "sozlesmeli",
  temporary: "gecici",
  internship: "staj",
  freelance: "serbest-calisma",
} as const;

export type JobTypeKey = keyof typeof jobTypeSlugs;

export const jobTypeKeys = Object.keys(jobTypeSlugs) as JobTypeKey[];

/** Resolves a URL slug back to its employment type, or null. */
export function resolveJobTypeFromSlug(slug: string): JobTypeKey | null {
  const entry = (Object.entries(jobTypeSlugs) as [JobTypeKey, string][]).find(
    ([, value]) => value === slug,
  );
  return entry ? entry[0] : null;
}
