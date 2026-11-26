import "server-only";

import { z } from "zod";
import { requirePlatformRole, getCurrentUser } from "@/server/dal/user";
import {
  createSupabasePublicClient,
  createSupabaseServerClient,
} from "@/server/db/supabase-server";
import {
  publicJobCompanySchema,
  publicJobListingSchema,
  publicJobSearchResultsSchema,
  publicJobSearchSchema,
  publicJobSlugSchema,
} from "@/features/jobs/schemas";
import type { Database } from "@/types/database";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type PlatformRole = Database["public"]["Enums"]["platform_role"];

export type PublicJobListing = z.infer<typeof publicJobListingSchema>;

/**
 * A public catalogue outage is not an empty catalogue and must never be
 * translated into a successful empty state or a genuine not-found response.
 * Route boundaries may render a retryable error page; valid empty RPC results
 * remain ordinary empty results.
 */
export class PublicJobDataUnavailableError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(`Public job data is temporarily unavailable (${operation}).`, options);
    this.name = "PublicJobDataUnavailableError";
  }
}

export async function isJobCompanyMember(
  companyId: string,
): Promise<boolean> {
  if (!z.string().uuid().safeParse(companyId).success) return false;
  const supabase = await createSupabaseServerClient();
  const { data: isMember, error } = await supabase.rpc(
    "is_active_company_member",
    {
      _company_id: companyId,
      _allowed_roles: ["owner", "recruiter"],
    },
  );

  if (error) {
    throw new Error("Company job permissions could not be verified.", {
      cause: error,
    });
  }
  return isMember;
}

export async function getJobCompanyId(jobId: string): Promise<string | null> {
  if (!z.string().uuid().safeParse(jobId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("company_id")
    .eq("id", jobId)
    .eq("publication_source", "platform")
    .maybeSingle();

  if (error) {
    throw new Error("The requested job could not be authorized.", {
      cause: error,
    });
  }

  return data?.company_id ?? null;
}

/**
 * Minimal job details needed to announce a publication: title, slug and the
 * owning company's display name. Read under the caller's RLS, so it only
 * returns rows the signed-in employer is allowed to see.
 */
export async function getJobPublishAnnouncement(jobId: string): Promise<{
  title: string;
  slug: string;
  companyName: string;
} | null> {
  if (!z.string().uuid().safeParse(jobId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("title, slug, company_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error("The job publication details could not be loaded.", {
      cause: error,
    });
  }
  if (!data) return null;

  let companyName = "";
  if (data.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    companyName = company?.name ?? "";
  }

  return { title: data.title, slug: data.slug, companyName };
}

export async function getJobForAdmin(jobId: string): Promise<{
  title: string;
  slug: string;
  district: string | null;
  jobDurationDays: number;
  expiresAt: string | null;
  companies: { name: string } | null;
} | null> {
  if (!z.string().uuid().safeParse(jobId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("title, slug, district, published_at, expires_at, company_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw new Error("The job details could not be loaded.", { cause: error });
  }
  if (!data) return null;

  // Calculate duration days from published_at and expires_at
  let jobDurationDays = 30;
  if (data.published_at && data.expires_at) {
    const diffMs = new Date(data.expires_at).getTime() - new Date(data.published_at).getTime();
    jobDurationDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  }

  // Fetch company name separately
  let companies: { name: string } | null = null;
  if (data.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", data.company_id)
      .maybeSingle();
    companies = company ? { name: company.name } : null;
  }

  return {
    title: data.title,
    slug: data.slug,
    district: data.district,
    jobDurationDays,
    expiresAt: data.expires_at,
    companies,
  };
}

export async function getApplicationForActor(applicationId: string) {
  if (!z.string().uuid().safeParse(applicationId).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("applications")
    .select("job_id, candidate_id")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error("The requested application could not be authorized.", {
      cause: error,
    });
  }

  return data;
}

export async function hasPlatformRole(role: PlatformRole): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("has_platform_role", {
    _role: role,
  });

  if (error) {
    throw new Error("Platform job permission could not be verified.", {
      cause: error,
    });
  }

  return data;
}

export async function searchPublicJobs(
  input: unknown,
): Promise<z.output<typeof publicJobSearchResultsSchema>> {
  const filters = publicJobSearchSchema.parse(input);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_public_jobs", {
      _query: filters.query,
      _district: filters.district,
      _job_type: filters.jobType,
      _workplace_mode: filters.workplaceMode,
      _page: filters.page,
    });

    if (error) {
      throw new Error("Public jobs could not be searched.", {
        cause: error,
      });
    }
    const results = publicJobSearchResultsSchema.safeParse(data);
    if (!results.success) {
      throw new Error("The public job search returned invalid result data.", {
        cause: results.error,
      });
    }

    return results.data;
  } catch (error) {
    console.error("The public job search failed.", {
      cause: error instanceof Error ? error.message : undefined,
    });
    throw new PublicJobDataUnavailableError("search", { cause: error });
  }
}

export async function getPublicJobBySlug(input: unknown) {
  const slug = publicJobSlugSchema.parse(input);

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("get_public_job_details", {
      _slug: slug,
    });

    if (error) {
      throw new Error("The requested public job could not be loaded.", {
        cause: error,
      });
    }
    if (data === null) return null;

    const job = publicJobListingSchema.safeParse(data);
    if (!job.success) {
      throw new Error("The public job detail returned invalid result data.", {
        cause: job.error,
      });
    }

    return job.data;
  } catch (error) {
    console.error("The public job detail could not be loaded.", {
      cause: error instanceof Error ? error.message : undefined,
    });
    throw new PublicJobDataUnavailableError("detail", { cause: error });
  }
}

export type PublicJobSitemapEntry = {
  slug: string;
  publishedAt: string;
  modifiedAt: string;
  // The two facets the district/type landing pages filter on. Carried here so
  // the sitemap can drop a landing whose filter matches nothing, keeping it out
  // of the index exactly as its `noindex` metadata claims (see
  // `computeLandingAvailability`).
  district: PublicJobListing["district"];
  jobType: PublicJobListing["job_type"];
};

const SITEMAP_JOBS_PAGE_SIZE = 20;
const SITEMAP_JOBS_MAX_PAGES = 60;

/**
 * Slugs of every currently published, indexable vacancy, for the sitemap.
 * Reuses the public search RPC rather than reading `public.jobs` directly: the
 * table is RLS-protected and only the `search_public_*` RPCs are granted to the
 * publishable key, so this keeps the same visibility rules the site itself uses.
 * Paging is capped so a pathological row count cannot turn the sitemap into an
 * unbounded loop.
 */
export async function listPublicJobSitemapEntries(): Promise<
  PublicJobSitemapEntry[]
> {
  try {
    const supabase = createSupabasePublicClient();
    const entries: PublicJobSitemapEntry[] = [];

    for (let page = 1; page <= SITEMAP_JOBS_MAX_PAGES; page += 1) {
      const { data, error } = await supabase.rpc("search_public_jobs", {
        _query: "",
        _district: null,
        _job_type: null,
        _workplace_mode: null,
        _page: page,
      });

      if (error) throw new Error("Sitemap jobs could not be searched.", { cause: error });

      const results = publicJobSearchResultsSchema.safeParse(data);
      if (!results.success) {
        throw new Error("The sitemap job search returned invalid result data.", {
          cause: results.error,
        });
      }

      for (const job of results.data.jobs) {
        entries.push({
          slug: job.slug,
          publishedAt: job.published_at,
          modifiedAt: job.modified_at,
          district: job.district,
          jobType: job.job_type,
        });
      }

      const lastPage = Math.max(
        1,
        Math.ceil(results.data.total / SITEMAP_JOBS_PAGE_SIZE),
      );
      if (page >= lastPage) break;
    }

    return entries;
  } catch (error) {
    // Returning [] here would publish a successful sitemap that falsely claims
    // there are no vacancies. Let Next return a non-success response instead.
    console.error("The job sitemap entries could not be listed.", {
      cause: error instanceof Error ? error.message : undefined,
    });
    throw new PublicJobDataUnavailableError("sitemap", { cause: error });
  }
}

export async function searchPublicJobPreviews(input: unknown) {
  const filters = publicJobSearchSchema.parse(input);
  const pageSize = 6;

  try {
    const supabase = await createSupabaseServerClient();

    const searchPage = async (page: number) => {
      const { data, error } = await supabase.rpc("search_public_job_previews", {
        _query: filters.query,
        _district: filters.district,
        _job_type: filters.jobType,
        _workplace_mode: filters.workplaceMode,
        _page: page,
      });

      if (error) {
        throw new Error("Public job previews could not be searched.", {
          cause: error,
        });
      }
      if (!data) {
        throw new Error("The public job preview search returned no result data.");
      }

      return data;
    };

    let rows = await searchPage(filters.page);
    const total = rows[0]?.total_count ?? 0;
    const page = Math.min(
      filters.page,
      Math.max(1, Math.ceil(total / pageSize)),
    );
    if (page !== filters.page) {
      rows = await searchPage(page);
    }

    const previews = rows.flatMap((row) => {
      if (row.job_title === null && row.company_name === null) return [];
      if (row.job_title === null || row.company_name === null) {
        throw new Error("A public job preview is missing its title or company name.");
      }
      return [{ title: row.job_title, companyName: row.company_name }];
    });

    return { previews, total, page, pageSize };
  } catch (error) {
    console.error("Public job preview search failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw new PublicJobDataUnavailableError("previews", { cause: error });
  }
}

type PublicJobCompany = z.infer<typeof publicJobCompanySchema>;

function mergeJobCompaniesByName(
  companies: readonly PublicJobCompany[],
): PublicJobCompany[] {
  const merged = new Map<string, PublicJobCompany>();

  for (const company of companies) {
    const key = company.company_slug.trim().toLocaleLowerCase("tr");
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, { ...company });
      continue;
    }

    merged.set(key, {
      ...existing,
      active_job_count: existing.active_job_count + company.active_job_count,
      profile_description:
        existing.profile_description ?? company.profile_description,
      categories: [...new Set([...existing.categories, ...company.categories])],
      website: existing.website ?? company.website,
      municipality: existing.municipality ?? company.municipality,
      source_profile_url:
        existing.source_profile_url ?? company.source_profile_url,
      logo_url: existing.logo_url ?? company.logo_url,
      source_sites: [...new Set([...existing.source_sites, ...company.source_sites])],
      source_listing_url:
        existing.source_listing_url ?? company.source_listing_url,
    });
  }

  return [...merged.values()];
}

export async function getPublicJobCompanies(): Promise<PublicJobCompany[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("search_public_job_companies");

    if (error) {
      throw new Error("Companies with current source listings could not be loaded.", {
        cause: error,
      });
    }

    return mergeJobCompaniesByName(z.array(publicJobCompanySchema).parse(data));
  } catch (error) {
    console.error("Public job companies lookup failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
    throw new PublicJobDataUnavailableError("company directory", {
      cause: error,
    });
  }
}

export async function getCompanyJobs(companyId: string): Promise<JobRow[]> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    throw new Error("An active user session is required to read company jobs.");
  }
  if (!z.string().uuid().safeParse(companyId).success) {
    throw new Error("A valid company identifier is required.");
  }

  if (!(await isJobCompanyMember(companyId))) {
    throw new Error("The current user is not authorized for this company's jobs.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    // Source-site imports are platform catalogue records, never employer-owned
    // listings. Keep this invariant in the DAL as well as the write/RLS layer.
    .eq("publication_source", "platform")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error("Company jobs could not be loaded.", { cause: error });
  }

  return data;
}

const employerJobsCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export async function getCompanyJobsPage(
  companyId: string,
  input?: { afterCreatedAt?: string; afterId?: string },
): Promise<{ jobs: JobRow[]; nextCursor: { createdAt: string; id: string } | null }> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    throw new Error("An active user session is required to read company jobs.");
  }
  if (!z.string().uuid().safeParse(companyId).success) {
    throw new Error("A valid company identifier is required.");
  }
  if (!(await isJobCompanyMember(companyId))) {
    throw new Error("The current user is not authorized for this company's jobs.");
  }

  const hasCursorPart = Boolean(input?.afterCreatedAt) || Boolean(input?.afterId);
  const cursor = hasCursorPart
    ? moderationCursorSchema.safeParse({
        createdAt: input?.afterCreatedAt,
        id: input?.afterId,
      })
    : null;
  if (cursor && !cursor.success) {
    throw new Error("The employer jobs cursor is invalid.");
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("jobs")
    .select("*")
    .eq("company_id", companyId)
    .eq("publication_source", "platform")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (cursor?.success) {
    const { createdAt, id } = cursor.data;
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );
  }

  const { data, error } = await query.limit(51);
  if (error) {
    throw new Error("Company jobs could not be loaded.", { cause: error });
  }

  const hasMore = data.length > 50;
  const jobs = hasMore ? data.slice(0, 50) : data;
  const last = jobs.at(-1);

  return {
    jobs,
    nextCursor: hasMore && last
      ? { createdAt: last.created_at, id: last.id }
      : null,
  };
}

export async function getCompanyJobForEdit(
  companyId: string,
  jobId: string,
): Promise<JobRow | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return null;
  }
  if (
    !z.string().uuid().safeParse(companyId).success ||
    !z.string().uuid().safeParse(jobId).success
  ) {
    return null;
  }
  if (!(await isJobCompanyMember(companyId))) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("company_id", companyId)
    .eq("publication_source", "platform")
    .in("status", ["draft", "rejected"])
    .maybeSingle();

  if (error) {
    throw new Error("The requested editable company job could not be loaded.", {
      cause: error,
    });
  }

  return data;
}

export async function getCompanyJobEntitlements(companyId: string) {
  if (!z.string().uuid().safeParse(companyId).success) {
    throw new Error("A valid company identifier is required.");
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_company_job_entitlements", {
    _company_id: companyId,
  });

  if (error) {
    throw new Error("Company job package entitlements could not be loaded.", {
      cause: error,
    });
  }

  return data;
}

const moderationCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});

export async function getPendingJobsForReview(input?: {
  afterCreatedAt?: string;
  afterId?: string;
}): Promise<{
  jobs: JobRow[];
  companyNames: Record<string, string>;
  nextCursor: { createdAt: string; id: string } | null;
}> {
  await requirePlatformRole("platform_admin");

  const hasCursorPart = Boolean(input?.afterCreatedAt) || Boolean(input?.afterId);
  const cursor = hasCursorPart
    ? employerJobsCursorSchema.safeParse({
        createdAt: input?.afterCreatedAt,
        id: input?.afterId,
      })
    : null;
  if (cursor && !cursor.success) {
    throw new Error("The moderation queue cursor is invalid.");
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("jobs")
    .select("*")
    .eq("status", "pending_review")
    .eq("publication_source", "platform")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (cursor?.success) {
    const { createdAt, id } = cursor.data;
    query = query.or(
      `created_at.gt.${createdAt},and(created_at.eq.${createdAt},id.gt.${id})`,
    );
  }

  const { data, error } = await query.limit(51);
  if (error) {
    throw new Error("Pending jobs could not be loaded for review.", {
      cause: error,
    });
  }

  const hasMore = data.length > 50;
  const jobs = hasMore ? data.slice(0, 50) : data;
  const last = jobs.at(-1);
  const companyIds = [...new Set(jobs.map(({ company_id }) => company_id))];
  const companyNames: Record<string, string> = {};

  if (companyIds.length > 0) {
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds);

    if (companiesError) {
      throw new Error("Moderation queue company names could not be loaded.", {
        cause: companiesError,
      });
    }

    for (const company of companies) companyNames[company.id] = company.name;
  }

  return {
    jobs,
    companyNames,
    nextCursor: hasMore && last
      ? { createdAt: last.created_at, id: last.id }
      : null,
  };
}

export async function getMyApplications() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { applications: [], error: false };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_my_applications");

    if (error) {
      console.error("Candidate applications could not be loaded.", {
        code: error.code,
      });
      return { applications: [], error: true };
    }

    return { applications: data ?? [], error: false };
  } catch (caughtError) {
    console.error("Candidate applications lookup failed.", {
      error:
        caughtError instanceof Error ? caughtError.message : "unknown_error",
    });
    return { applications: [], error: true };
  }
}

export async function getCompanyApplications(companyId: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    throw new Error("An active user session is required to read applications.");
  }
  if (!z.string().uuid().safeParse(companyId).success) {
    throw new Error("A valid company identifier is required.");
  }

  if (!(await isJobCompanyMember(companyId))) {
    throw new Error("The current user is not authorized for this company's jobs.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("list_company_applications", {
    _company_id: companyId,
  });

  if (error) {
    throw new Error("Company applications could not be loaded.", {
      cause: error,
    });
  }

  return data;
}

export async function getCompanyApplicationDetail(applicationId: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    throw new Error("An active user session is required to read this application.");
  }
  if (!z.string().uuid().safeParse(applicationId).success) {
    throw new Error("A valid application identifier is required.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_company_application_detail",
    { _application_id: applicationId },
  );

  if (error) {
    if (error.code === "42501") return null;
    throw new Error("The company application detail could not be loaded.", {
      cause: error,
    });
  }
  if (data.length !== 1) return null;

  return data[0];
}
