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

async function fetchFallbackPublicJobs(): Promise<PublicJobListing[]> {
  return [];
}

async function searchFallbackPublicJobs(
  filters: z.output<typeof publicJobSearchSchema>,
): Promise<z.output<typeof publicJobSearchResultsSchema>> {
  const jobs = await fetchFallbackPublicJobs();
  const query = filters.query.trim().toLocaleLowerCase("tr");
  const filtered = jobs.filter((job) => {
    const haystack = [job.title, job.company.name, job.summary, job.description]
      .join(" ")
      .toLocaleLowerCase("tr");

    const matchesQuery = !query || haystack.includes(query);
    const matchesDistrict = !filters.district || job.district === filters.district;
    const matchesJobType = !filters.jobType || job.job_type === filters.jobType;
    const matchesWorkplaceMode = !filters.workplaceMode || job.workplace_mode === filters.workplaceMode;

    return matchesQuery && matchesDistrict && matchesJobType && matchesWorkplaceMode;
  });

  const pageSize = 20;
  const total = filtered.length;
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize) || 1));
  const start = (page - 1) * pageSize;
  const jobsPage = filtered.slice(start, start + pageSize);

  return {
    jobs: jobsPage,
    total,
    page,
    pageSize,
  };
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
    .maybeSingle();

  if (error) {
    throw new Error("The requested job could not be authorized.", {
      cause: error,
    });
  }

  return data?.company_id ?? null;
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
  } catch {
    const fallback = await searchFallbackPublicJobs(filters);
    return fallback as Awaited<ReturnType<typeof searchPublicJobs>>;
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
  } catch {
    const jobs = await fetchFallbackPublicJobs();
    const match = jobs.find((job) => job.slug === slug);
    if (!match) return null;
    return match as PublicJobListing;
  }
}

export type PublicJobSitemapEntry = {
  slug: string;
  publishedAt: string;
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
        });
      }

      const lastPage = Math.max(
        1,
        Math.ceil(results.data.total / SITEMAP_JOBS_PAGE_SIZE),
      );
      if (page >= lastPage) break;
    }

    return entries;
  } catch {
    return [];
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
  } catch {
    const jobs = await fetchFallbackPublicJobs();
    const query = filters.query.trim().toLocaleLowerCase("tr");
    const filtered = jobs.filter((job) => {
      const haystack = [job.title, job.company.name, job.summary, job.description]
        .join(" ")
        .toLocaleLowerCase("tr");
      const matchesQuery = !query || haystack.includes(query);
      const matchesDistrict = !filters.district || job.district === filters.district;
      const matchesJobType = !filters.jobType || job.job_type === filters.jobType;
      const matchesWorkplaceMode = !filters.workplaceMode || job.workplace_mode === filters.workplaceMode;
      return matchesQuery && matchesDistrict && matchesJobType && matchesWorkplaceMode;
    });

    const total = filtered.length;
    const page = Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize) || 1));
    const start = (page - 1) * pageSize;
    const fallbackPreviews = filtered.slice(start, start + pageSize).map((job) => ({
      title: job.title,
      companyName: job.company.name,
    }));
    return {
      previews: fallbackPreviews,
      total,
      page,
      pageSize,
    };
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
  } catch {
    return [];
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
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Company jobs could not be loaded.", { cause: error });
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

export async function getPendingJobsForReview(): Promise<JobRow[]> {
  await requirePlatformRole("platform_admin");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("status", "pending_review")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) {
    throw new Error("Pending jobs could not be loaded for review.", {
      cause: error,
    });
  }

  return data;
}

export async function getMyApplications() {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { applications: [], notifications: [] };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const [{ data, error }, { data: notifications, error: notificationsError }] =
      await Promise.all([
        supabase.rpc("list_my_applications"),
        supabase.rpc("list_my_application_notifications"),
      ]);

    if (error || notificationsError) {
      return { applications: [], notifications: [] };
    }

    return { applications: data ?? [], notifications: notifications ?? [] };
  } catch {
    return { applications: [], notifications: [] };
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
    throw new Error("The company application detail could not be loaded.", {
      cause: error,
    });
  }
  if (data.length !== 1) {
    throw new Error("The company application detail is missing.");
  }

  return data[0];
}
