import "server-only";

import { unstable_cache } from "next/cache";
import { z } from "zod";
import {
  createSupabasePublicClient,
  createSupabaseServerClient,
} from "@/server/db/supabase-server";
import { faqByLocale, type FaqEntry } from "@/content/ai-visibility/faq";
import type { AppLocale } from "@/i18n/routing";
import type { Database } from "@/types/database";

export const CONTENT_TAGS = {
  legal: "managed-content:legal",
  faq: "managed-content:faq",
  plans: "managed-content:plans",
  directory: "managed-content:directory",
} as const;

/** How long a managed read may be served before it is re-fetched. */
const CONTENT_REVALIDATE_SECONDS = 3600;

type SiteContentRow =
  Database["public"]["Functions"]["get_public_site_content"]["Returns"][number];
type FaqRow = Database["public"]["Functions"]["get_public_faq"]["Returns"][number];
type PlanRow =
  Database["public"]["Functions"]["get_public_listing_plans"]["Returns"][number];
type DirectoryRow =
  Database["public"]["Functions"]["get_public_directory"]["Returns"][number];

export type SiteLegalKey = "privacy" | "cookies" | "terms";

export type SiteLegalSection = { title: string; paragraphs: string[] };

export type SiteLegalDocument = {
  title: string;
  intro: string;
  updated: string;
  sections: SiteLegalSection[];
};

const legalSectionSchema = z.object({
  title: z.string().min(1).max(300),
  paragraphs: z.array(z.string().min(1).max(4000)).max(40),
});

const legalDocumentSchema = z.object({
  title: z.string().min(1).max(300),
  intro: z.string().min(1).max(2000),
  updated: z.string().min(1).max(120),
  sections: z.array(legalSectionSchema).min(1).max(40),
});

/**
 * Parses a stored legal document. Returns `null` when the row is absent or does
 * not satisfy the schema, so the caller falls back to the bundled copy rather
 * than rendering a half-populated page.
 */
export function parseLegalDocument(
  document: unknown,
): SiteLegalDocument | null {
  const parsed = legalDocumentSchema.safeParse(document);
  return parsed.success ? parsed.data : null;
}

export function toFaqEntries(rows: readonly FaqRow[]): FaqEntry[] {
  return rows.map((row) => ({ question: row.question, answer: row.answer }));
}

export type PlanPriceOverride = {
  code: string;
  /** `null` when every duration is 0, which means "quote on request". */
  prices: Record<1 | 7 | 30, number> | null;
  listingCount: number | null;
};

export function toPlanPriceOverrides(
  rows: readonly PlanRow[],
): Map<string, PlanPriceOverride> {
  const overrides = new Map<string, PlanPriceOverride>();
  for (const row of rows) {
    const priced = row.price_1 > 0 || row.price_7 > 0 || row.price_30 > 0;
    overrides.set(row.code, {
      code: row.code,
      prices: priced
        ? { 1: row.price_1, 7: row.price_7, 30: row.price_30 }
        : null,
      listingCount: row.listing_count,
    });
  }
  return overrides;
}

const directoryLocationSchema = z.object({
  address: z.string().nullable().catch(null),
  municipality: z.string().nullable().catch(null),
  phone: z.string().nullable().catch(null),
  website: z.string().nullable().catch(null),
  email: z.string().nullable().catch(null),
});

const directoryLocationsSchema = z.array(directoryLocationSchema);

/**
 * Maps a managed directory row into the shape the directory page already
 * consumes. `locations` arrives as JSON, so it is validated and any malformed
 * entry degrades to `null` fields instead of failing the whole page.
 */
export function toDirectoryEntry(row: DirectoryRow): {
  id: string;
  name: string;
  categories: string[];
  locations: z.infer<typeof directoryLocationsSchema>;
  logo: string | null;
  logoAspect: number | null;
} {
  const locations = directoryLocationsSchema.safeParse(row.locations);
  return {
    id: row.directory_entry_id,
    name: row.name,
    categories: row.categories,
    locations: locations.success ? locations.data : [],
    logo: row.logo_file,
    logoAspect:
      row.logo_width && row.logo_height ? row.logo_width / row.logo_height : null,
  };
}

/**
 * The managed directory in the page's own entry shape, or `null` when the table
 * has not been loaded. Logos travel with each row, so the bundled
 * `company-logos.json` manifest is only needed on the fallback path.
 */
export async function getManagedDirectoryEntries(): Promise<
  {
    id: string;
    name: string;
    categories: string[];
    locations: {
      address: string | null;
      municipality: string | null;
      phone: string | null;
      website: string | null;
      email: string | null;
    }[];
    logo: string | null;
    logoAspect: number | null;
  }[] | null
> {
  const rows = await getManagedDirectoryRows();
  return rows ? rows.map(toDirectoryEntry) : null;
}

async function fetchSiteContentRows(
  locale: AppLocale,
  keys: readonly string[],
): Promise<SiteContentRow[]> {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase.rpc("get_public_site_content", {
    _locale: locale,
    _keys: [...keys],
  });

  if (error) throw new Error("Managed site content could not be loaded.", { cause: error });
  return data ?? [];
}

const loadSiteContent = unstable_cache(
  fetchSiteContentRows,
  ["managed-site-content"],
  { tags: [CONTENT_TAGS.legal], revalidate: CONTENT_REVALIDATE_SECONDS },
);

/**
 * A managed legal document for one locale, or `null` when none is published.
 * The caller keeps rendering its bundled copy on `null`, so a locale whose
 * document has not been migrated yet is never blank.
 */
export async function getManagedLegalDocument(
  locale: AppLocale,
  key: SiteLegalKey,
): Promise<SiteLegalDocument | null> {
  try {
    const rows = await loadSiteContent(locale, [`legal.${key}`]);
    const row = rows.find((candidate) => candidate.content_key === `legal.${key}`);
    return row ? parseLegalDocument(row.document) : null;
  } catch (error) {
    console.warn("Managed legal content could not be read; using the bundled copy.", {
      key,
      cause: error instanceof Error ? error.message : undefined,
    });
    return null;
  }
}

const loadFaq = unstable_cache(
  async (locale: AppLocale): Promise<FaqRow[]> => {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("get_public_faq", {
      _locale: locale,
    });
    if (error) throw new Error("Managed FAQ could not be loaded.", { cause: error });
    return data ?? [];
  },
  ["managed-faq"],
  { tags: [CONTENT_TAGS.faq], revalidate: CONTENT_REVALIDATE_SECONDS },
);

/**
 * Published FAQ entries for a locale. An empty result falls back to the bundled
 * catalogue: the FAQ is always shown on `/about`, so "no rows" means "not
 * migrated yet", never "deliberately empty".
 */
export async function getManagedFaq(locale: AppLocale): Promise<FaqEntry[]> {
  try {
    const rows = await loadFaq(locale);
    if (rows.length === 0) return [...faqByLocale[locale]];
    return toFaqEntries(rows);
  } catch (error) {
    console.warn("Managed FAQ could not be read; using the bundled catalogue.", {
      locale,
      cause: error instanceof Error ? error.message : undefined,
    });
    return [...faqByLocale[locale]];
  }
}

const loadListingPlans = unstable_cache(
  async (): Promise<PlanRow[]> => {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("get_public_listing_plans");
    if (error) throw new Error("Managed listing plans could not be loaded.", { cause: error });
    return data ?? [];
  },
  ["managed-listing-plans"],
  { tags: [CONTENT_TAGS.plans], revalidate: CONTENT_REVALIDATE_SECONDS },
);

/**
 * Price/limit overrides for the plan catalogue. The tier *structure* stays in
 * code (the design gate and the vend machine depend on it); only the numbers an
 * operator may tune are read from the database. An empty map means "no
 * overrides", so the bundled prices stand.
 */
export async function getManagedPlanOverrides(): Promise<
  Map<string, PlanPriceOverride>
> {
  try {
    return toPlanPriceOverrides(await loadListingPlans());
  } catch (error) {
    console.warn("Managed listing plans could not be read; using bundled prices.", {
      cause: error instanceof Error ? error.message : undefined,
    });
    return new Map();
  }
}

const loadDirectory = unstable_cache(
  async (): Promise<DirectoryRow[]> => {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.rpc("get_public_directory");
    if (error) throw new Error("Managed directory could not be loaded.", { cause: error });
    return data ?? [];
  },
  ["managed-directory"],
  { tags: [CONTENT_TAGS.directory], revalidate: CONTENT_REVALIDATE_SECONDS },
);

/** Raw managed directory rows, or `null` when the table has not been loaded. */
export async function getManagedDirectoryRows(): Promise<DirectoryRow[] | null> {
  try {
    const rows = await loadDirectory();
    return rows.length > 0 ? rows : null;
  } catch (error) {
    console.warn("Managed directory could not be read; using the bundled bundle.", {
      cause: error instanceof Error ? error.message : undefined,
    });
    return null;
  }
}

export type AdminFaqEntry = FaqRow & { is_published: boolean; locale: string };

/** All FAQ rows (including drafts) for the administrator console. */
export async function getAdminFaqEntries(): Promise<AdminFaqEntry[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_faq_entries");

  if (error) {
    throw new Error("FAQ entries could not be loaded for administration.", {
      cause: error,
    });
  }

  return data ?? [];
}

export type AdminSiteContentEntry =
  Database["public"]["Functions"]["admin_list_site_content"]["Returns"][number];

/** Every managed content document, drafts included, for the console. */
export async function getAdminSiteContentEntries(): Promise<
  AdminSiteContentEntry[]
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_site_content");

  if (error) {
    throw new Error("Managed content could not be loaded for administration.", {
      cause: error,
    });
  }

  return data ?? [];
}

export type AdminListingPlan =
  Database["public"]["Functions"]["admin_list_listing_plans"]["Returns"][number];

/** Every listing plan, active or not, for the console. */
export async function getAdminListingPlans(): Promise<AdminListingPlan[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_listing_plans");

  if (error) {
    throw new Error("Listing plans could not be loaded for administration.", {
      cause: error,
    });
  }

  return data ?? [];
}
