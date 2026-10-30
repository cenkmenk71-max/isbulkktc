import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";

export const sourceJobSites = ["iskibris", "isbulkibris"] as const;
export type SourceJobSite = (typeof sourceJobSites)[number];

export const sourceJobTypes = [
  "full_time",
  "part_time",
  "contract",
  "temporary",
  "internship",
  "freelance",
] as const;
export type SourceJobType = (typeof sourceJobTypes)[number];

export const sourceWorkplaceModes = ["on_site", "hybrid", "remote"] as const;
export type SourceWorkplaceMode = (typeof sourceWorkplaceModes)[number];

export type SourceDistrict = (typeof northernCyprusDistrictValues)[number];

export type SourceEmployerRecord = {
  name: string;
  slug: string;
  profileDescription: string;
  categories: string[];
  website: string | null;
  municipality: SourceDistrict | null;
  sourceProfileUrl: string | null;
  logoUrl: string | null;
};

export type SourceJobRecord = {
  source: SourceJobSite;
  sourceJobId: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  requirements: string;
  responsibilities: string;
  jobType: SourceJobType;
  workplaceMode: SourceWorkplaceMode;
  district: SourceDistrict | null;
  publishedAt: string;
  expiresAt: string;
  employer: SourceEmployerRecord;
};

const turkishStopWords = new Set(["ve", "ile", "icin", "için", "the", "and", "of"]);

const districtAliases = new Map<string, SourceDistrict>([
  ["lefkosa", "Lefkoşa"],
  ["nicosia", "Lefkoşa"],
  ["magusa", "Mağusa"],
  ["gazimagusa", "Mağusa"],
  ["famagusta", "Mağusa"],
  ["girne", "Girne"],
  ["kyrenia", "Girne"],
  ["guzelyurt", "Güzelyurt"],
  ["morphou", "Güzelyurt"],
  ["iskele", "İskele"],
  ["lefke", "Lefke"],
]);

export function slugifySourceText(value: string): string {
  const base = value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const meaningful = base
    .split("-")
    .filter((segment) => segment.length > 0 && !turkishStopWords.has(segment));

  return (meaningful.length > 0 ? meaningful : base.split("-").filter(Boolean)).join("-");
}

function clampSlug(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;
  const trimmed = slug.slice(0, maxLength);
  const lastDash = trimmed.lastIndexOf("-");
  return (lastDash > 1 ? trimmed.slice(0, lastDash) : trimmed).replace(/-+$/g, "");
}

export function buildSourceCompanySlug(
  source: SourceJobSite,
  companyName: string,
): string {
  const prefix = `source-${source}-`;
  const body = slugifySourceText(companyName) || "company";
  return clampSlug(`${prefix}${body}`, 80);
}

export function buildSourceJobSlug(
  source: SourceJobSite,
  title: string,
  companyName: string,
  takenSlugs: ReadonlySet<string>,
): string {
  const prefix = `source-${source}-`;
  const base = clampSlug(`${prefix}${slugifySourceText(title) || "ilan"}`, 100);
  if (!takenSlugs.has(base)) return base;

  const withCompany = clampSlug(
    `${base}-${slugifySourceText(companyName)}`,
    100,
  );
  if (!takenSlugs.has(withCompany)) return withCompany;

  let counter = 2;
  let candidate = clampSlug(`${withCompany}-${counter}`, 100);
  while (takenSlugs.has(candidate)) {
    counter += 1;
    candidate = clampSlug(`${withCompany}-${counter}`, 100);
  }
  return candidate;
}

export function normalizeSourceDistrict(value: unknown): SourceDistrict | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const key = value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
  return districtAliases.get(key) ?? null;
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    );
}

export function htmlToPlainText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|ul|ol|div|h[1-6]|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const jobTypeMatchers: Array<[RegExp, SourceJobType]> = [
  [/tam[\s-]*zaman|full[\s_-]*time/i, "full_time"],
  [/yar[ıi]m[\s-]*zaman|part[\s_-]*time/i, "part_time"],
  [/s[öo]zle[sş]me|contract/i, "contract"],
  [/ge[çc]ici|temporary/i, "temporary"],
  [/staj|intern/i, "internship"],
  [/serbest|freelance/i, "freelance"],
];

export function normalizeSourceJobType(value: unknown): SourceJobType | null {
  const candidates = Array.isArray(value) ? value : [value];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const match = jobTypeMatchers.find(([pattern]) => pattern.test(candidate));
    if (match) return match[1];
  }
  return null;
}

export function normalizeSourceWorkplaceMode(
  remote: unknown,
  onSiteHint: unknown,
): SourceWorkplaceMode {
  if (remote === true || remote === 1 || remote === "1") return "remote";
  const hint = typeof onSiteHint === "string" ? onSiteHint.toLocaleLowerCase("tr") : "";
  if (/remote|uzaktan/.test(hint)) return "remote";
  if (/hybrid|hibrit/.test(hint)) return "hybrid";
  return "on_site";
}

export function summarizeSourceText(text: string, maxLength = 260): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const slice = normalized.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim()}…`;
}

export function ensureMinimumText(
  text: string,
  minimum: number,
  fallback: string,
): string {
  const normalized = text.trim();
  if (normalized.length >= minimum) return normalized;
  return fallback.trim().slice(0, Math.max(minimum, fallback.trim().length));
}

export function normalizeHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

const isbulkibrisLogoPattern =
  /^\/api\/employer\/logo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iskibrisLogoPattern =
  /^\/[0-9]+_[0-9a-f]+(?:-thumb@[0-9]+)?\.(?:png|jpg|webp)$/i;

export function resolveEmployerLogoUrl(
  value: unknown,
  origin: string,
): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), origin);
    if (url.protocol !== "https:") return null;
    const supportedHost =
      url.hostname === "api.isbulkibris.com" ||
      url.hostname === "innovia-iskibris.s3.eu-west-2.amazonaws.com";
    if (!supportedHost) return null;
    url.pathname = url.pathname.replace(/-thumb(?:@\d+)?(?=\.[^.]+$)/i, "");
    // The companies.logo_url check constraint rejects query strings and paths
    // outside the two source CDNs, so mirror it here and drop anything else
    // rather than letting a whole import batch fail on one bad logo.
    const pattern =
      url.hostname === "api.isbulkibris.com"
        ? isbulkibrisLogoPattern
        : iskibrisLogoPattern;
    if (!pattern.test(url.pathname)) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isFutureTimestamp(value: string, now: number): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && time > now;
}

export function isWithinSourceWindow(
  publishedAt: string,
  expiresAt: string,
  now: number,
): boolean {
  const published = Date.parse(publishedAt);
  const expires = Date.parse(expiresAt);
  return (
    Number.isFinite(published) &&
    Number.isFinite(expires) &&
    published <= now + 5 * 60 * 1000 &&
    expires > now
  );
}

function clampText(value: string, minimum: number, maximum: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > maximum) {
    const slice = trimmed.slice(0, maximum);
    const lastSpace = slice.lastIndexOf(" ");
    return (lastSpace > minimum ? slice.slice(0, lastSpace) : slice).trim();
  }
  return trimmed;
}

function sanitizeCategories(categories: readonly string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const category of categories) {
    const value = clampText(category, 1, 80);
    if (value.length < 1 || seen.has(value)) continue;
    seen.add(value);
    cleaned.push(value);
    if (cleaned.length === 12) break;
  }
  return cleaned;
}

/**
 * Clamps every field to the live database check constraints so a single
 * out-of-range value cannot abort a batch insert.
 */
export function sanitizeSourceJobRecord(record: SourceJobRecord): SourceJobRecord {
  const title = clampText(record.title, 5, 140);
  const summary = clampText(record.summary, 20, 500);
  const description = clampText(record.description, 50, 20_000);

  return {
    ...record,
    title,
    summary,
    description,
    requirements: clampText(record.requirements, 0, 10_000),
    responsibilities: clampText(record.responsibilities, 0, 10_000),
    employer: {
      ...record.employer,
      name: clampText(record.employer.name, 2, 120),
      profileDescription: clampText(record.employer.profileDescription, 0, 2000),
      categories: sanitizeCategories(record.employer.categories),
      website:
        record.employer.website && record.employer.website.length <= 2048
          ? record.employer.website
          : null,
    },
  };
}

/**
 * Narrows a large upstream catalogue to the newest `limit` listings while
 * spreading them across employers, sectors and job types, so a small public
 * board stays varied instead of showing one company's hiring spree. Diversity is
 * filled first (rarest combinations win), then the remaining slots go to the
 * newest listings overall.
 */
export function selectDiverseSourceJobs(
  records: readonly SourceJobRecord[],
  limit: number,
): SourceJobRecord[] {
  if (limit <= 0) return [];
  const newestFirst = [...records].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  const selected: SourceJobRecord[] = [];
  const chosen = new Set<SourceJobRecord>();
  const usedCompanies = new Set<string>();
  const usedSectors = new Set<string>();
  const usedTypes = new Set<string>();

  const sectorOf = (record: SourceJobRecord): string =>
    (record.employer.categories[0] ?? "diger").trim().toLocaleLowerCase("tr-TR");

  const add = (record: SourceJobRecord): void => {
    chosen.add(record);
    selected.push(record);
    usedCompanies.add(record.employer.slug);
    usedSectors.add(sectorOf(record));
    usedTypes.add(record.jobType);
  };

  for (const record of newestFirst) {
    if (selected.length >= limit) break;
    if (chosen.has(record) || usedCompanies.has(record.employer.slug)) continue;
    if (usedSectors.has(sectorOf(record)) || usedTypes.has(record.jobType)) continue;
    add(record);
  }

  for (const record of newestFirst) {
    if (selected.length >= limit) break;
    if (chosen.has(record) || usedCompanies.has(record.employer.slug)) continue;
    add(record);
  }

  for (const record of newestFirst) {
    if (selected.length >= limit) break;
    if (chosen.has(record)) continue;
    add(record);
  }

  return selected.slice(0, limit);
}

