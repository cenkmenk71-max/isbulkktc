import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  SourceJobSite,
  SourceJobType,
  SourceWorkplaceMode,
} from "../src/features/jobs/source-job-import";

const TARGET_JOB_COUNT = 31;
const ISKIBRIS_QUOTA = 22;
const ISBULKIBRIS_QUOTA = TARGET_JOB_COUNT - ISKIBRIS_QUOTA;

// Records the E2E suite links to directly. They are pinned so the fixtures stay
// stable even when the upstream listings change.
const PINNED_JOB_SLUGS = [
  "source-iskibris-garson",
  "source-isbulkibris-muhasebe-denetim-personeli",
  "source-iskibris-mimar-insaat-muhendisi",
];

// Employer metadata that must match the hand-written assertions in the suite.
const EMPLOYER_OVERRIDES: Record<
  string,
  { profile_description?: string; categories?: string[] }
> = {
  "source-isbulkibris-fikri-co-chartered-accountants": {
    profile_description: "1979’da kurulan, ICAEW üyesi muhasebe ve denetim firması.",
    categories: ["Muhasebe & Denetim"],
  },
  "source-iskibris-four-vision-development-ltd": {
    profile_description:
      "Kaynak profilinde İskele merkez, inşaat sektörü, 100’den fazla çalışan ve hafta içi ile cumartesi yarım gün çalışma bilgileri paylaşılmıştır.",
    categories: ["İnşaat & Yapı"],
  },
};

type JobRow = {
  id: string;
  company_id: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  requirements: string;
  responsibilities: string;
  job_type: SourceJobType;
  workplace_mode: SourceWorkplaceMode;
  district: string | null;
  published_at: string;
};
type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  profile_description: string;
  categories: string[];
  website: string | null;
  municipality: string | null;
  source_profile_url: string | null;
  logo_url: string | null;
};

type ImportRow = {
  job_id: string;
  source: SourceJobSite;
  source_job_id: string;
};

type RenderedJob = JobRow & { ageDays: number };
type RenderedImport = ImportRow & { ageDays: number };

function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(resolve(process.cwd(), file));
    } catch {
      // Missing optional env files are fine; required values are checked below.
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNullableText(value: string | null): string {
  return value === null ? "null" : sqlText(value);
}

function sqlArray(values: readonly string[]): string {
  if (values.length === 0) return "array[]::text[]";
  return `array[${values.map(sqlText).join(", ")}]`;
}

function ageExpression(days: number): string {
  return `pg_catalog.now() - interval '${days} days'`;
}

async function pushToLive(
  client: SupabaseClient,
  companies: CompanyRow[],
  jobs: RenderedJob[],
  imports: RenderedImport[],
): Promise<void> {
  // Clear the previous fixture set first so the live catalogue matches the
  // generated seed exactly. jobs cascades job_source_imports; companies are
  // removed last because jobs reference them with on delete restrict.
  const { error: clearImports } = await client
    .from("job_source_imports")
    .delete()
    .not("job_id", "is", null);
  if (clearImports) throw new Error(`Kaynak eşlemeleri silinemedi: ${clearImports.message}`);

  const { data: sourceJobs, error: selectError } = await client
    .from("jobs")
    .select("id")
    .eq("publication_source", "source_site");
  if (selectError) throw new Error(`Kaynak ilanlar okunamadı: ${selectError.message}`);
  const sourceJobIds = (sourceJobs ?? []).map((row) => row.id as string);
  if (sourceJobIds.length > 0) {
    const { error } = await client.from("jobs").delete().in("id", sourceJobIds);
    if (error) throw new Error(`Eski kaynak ilanlar silinemedi: ${error.message}`);
  }

  const { data: sourceCompanies, error: companySelectError } = await client
    .from("companies")
    .select("id")
    .like("slug", "source-%");
  if (companySelectError) {
    throw new Error(`Eski kaynak işverenler okunamadı: ${companySelectError.message}`);
  }
  const sourceCompanyIds = (sourceCompanies ?? []).map((row) => row.id as string);
  if (sourceCompanyIds.length > 0) {
    const { error } = await client.from("companies").delete().in("id", sourceCompanyIds);
    if (error) throw new Error(`Eski kaynak işverenler silinemedi: ${error.message}`);
  }

  const { error: companyError } = await client.from("companies").insert(
    companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      verification_status: "pending" as const,
      profile_description: company.profile_description,
      categories: company.categories,
      website: company.website,
      municipality: company.municipality,
      source_profile_url: company.source_profile_url,
      logo_url: company.logo_url,
    })),
  );
  if (companyError) throw new Error(`İşverenler yazılamadı: ${companyError.message}`);

  const { error: jobError } = await client.from("jobs").insert(
    jobs.map((job) => ({
      id: job.id,
      company_id: job.company_id,
      created_by: null,
      title: job.title,
      slug: job.slug,
      summary: job.summary,
      description: job.description,
      requirements: job.requirements,
      responsibilities: job.responsibilities,
      job_type: job.job_type,
      workplace_mode: job.workplace_mode,
      district: job.district,
      status: "published" as const,
      reviewed_by: null,
      reviewed_at: null,
      published_at: new Date(Date.now() - job.ageDays * 86_400_000).toISOString(),
      expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString(),
      publication_source: "source_site" as const,
    })),
  );
  if (jobError) throw new Error(`İlanlar yazılamadı: ${jobError.message}`);

  const { error: importError } = await client.from("job_source_imports").insert(
    imports.map((row) => ({
      job_id: row.job_id,
      source: row.source,
      source_job_id: row.source_job_id,
      source_published_at: new Date(Date.now() - row.ageDays * 86_400_000).toISOString(),
      source_expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    })),
  );
  if (importError) throw new Error(`Kaynak eşlemeleri yazılamadı: ${importError.message}`);
}

function selectJobs(
  allJobs: JobRow[],
  sourceByJobId: Map<string, SourceJobSite>,
): JobRow[] {
  const bySlug = new Map(allJobs.map((job) => [job.slug, job]));
  const selected: JobRow[] = [];
  const usedSlugs = new Set<string>();
  const usedCompanies = new Set<string>();
  // The suite resolves some listings by an exact title link, so two listings
  // sharing a title would break strict-mode queries.
  const usedTitles = new Set<string>();

  for (const slug of PINNED_JOB_SLUGS) {
    const job = bySlug.get(slug);
    if (!job) throw new Error(`Sabitlenmiş ilan bulunamadı: ${slug}`);
    selected.push(job);
    usedSlugs.add(slug);
    usedCompanies.add(job.company_id);
    usedTitles.add(job.title);
  }

  const newestFirst = [...allJobs].sort(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at),
  );

  const countBySource = (source: SourceJobSite): number =>
    selected.filter((job) => sourceByJobId.get(job.id) === source).length;

  const tryAdd = (job: JobRow): boolean => {
    const source = sourceByJobId.get(job.id);
    if (!source || usedSlugs.has(job.slug) || usedTitles.has(job.title)) return false;
    const quota = source === "iskibris" ? ISKIBRIS_QUOTA : ISBULKIBRIS_QUOTA;
    if (countBySource(source) >= quota) return false;
    selected.push(job);
    usedSlugs.add(job.slug);
    usedCompanies.add(job.company_id);
    usedTitles.add(job.title);
    return true;
  };

  // Pass 1: newest listings that bring a new employer and a new job type.
  const seenTypes = new Set(selected.map((job) => job.job_type));
  for (const job of newestFirst) {
    if (selected.length >= TARGET_JOB_COUNT) break;
    if (usedCompanies.has(job.company_id) || seenTypes.has(job.job_type)) continue;
    if (tryAdd(job)) seenTypes.add(job.job_type);
  }

  // Pass 2: newest listings from employers not yet represented.
  for (const job of newestFirst) {
    if (selected.length >= TARGET_JOB_COUNT) break;
    if (usedCompanies.has(job.company_id)) continue;
    tryAdd(job);
  }

  // Pass 3: fill any remaining slots with the newest listings overall.
  for (const job of newestFirst) {
    if (selected.length >= TARGET_JOB_COUNT) break;
    tryAdd(job);
  }

  if (selected.length < TARGET_JOB_COUNT) {
    throw new Error(
      `Yalnızca ${selected.length} ilan seçilebildi; hedef ${TARGET_JOB_COUNT}.`,
    );
  }
  return selected.slice(0, TARGET_JOB_COUNT);
}

function renderSeed(
  jobs: RenderedJob[],
  companies: CompanyRow[],
  imports: RenderedImport[],
): string {
  const lines: string[] = [];
  lines.push("-- Generated by scripts/generate-source-job-seed.ts.");
  lines.push(
    "-- Deterministic source-listing fixtures for local Supabase and CI. Do not edit by hand;",
  );
  lines.push("-- run `npm run seed:source-jobs` to refresh from the live APIs.");
  lines.push("begin;");
  lines.push("");
  lines.push("delete from public.job_source_imports;");
  lines.push("delete from public.jobs where publication_source = 'source_site';");
  lines.push("delete from public.companies where slug like 'source-%';");
  lines.push("");
  lines.push("insert into public.companies (");
  lines.push("  id, name, slug, verification_status, profile_description, categories,");
  lines.push("  website, municipality, source_profile_url, logo_url");
  lines.push(")");
  lines.push("values");
  companies.forEach((company, index) => {
    lines.push("  (");
    lines.push(
      `    ${sqlText(company.id)}, ${sqlText(company.name)}, ${sqlText(company.slug)}, 'pending',`,
    );
    lines.push(
      `    ${sqlText(company.profile_description)}, ${sqlArray(company.categories)},`,
    );
    lines.push(
      `    ${sqlNullableText(company.website)}, ${sqlNullableText(company.municipality)},`,
    );
    lines.push(
      `    ${sqlNullableText(company.source_profile_url)}, ${sqlNullableText(company.logo_url)}`,
    );
    lines.push(`  )${index === companies.length - 1 ? "" : ","}`);
  });
  lines.push("on conflict (id) do update");
  lines.push("set");
  lines.push("  name = excluded.name,");
  lines.push("  slug = excluded.slug,");
  lines.push("  verification_status = 'pending',");
  lines.push("  profile_description = excluded.profile_description,");
  lines.push("  categories = excluded.categories,");
  lines.push("  website = excluded.website,");
  lines.push("  municipality = excluded.municipality,");
  lines.push("  source_profile_url = excluded.source_profile_url,");
  lines.push("  logo_url = excluded.logo_url,");
  lines.push("  updated_at = pg_catalog.now();");
  lines.push("");
  lines.push("insert into public.jobs (");
  lines.push("  id, company_id, created_by, title, slug, summary, description,");
  lines.push("  requirements, responsibilities, job_type, workplace_mode, district,");
  lines.push("  status, reviewed_by, reviewed_at, published_at, expires_at, publication_source");
  lines.push(")");
  lines.push("values");
  jobs.forEach((job, index) => {
    lines.push("  (");
    lines.push(`    ${sqlText(job.id)}, ${sqlText(job.company_id)}, null,`);
    lines.push(`    ${sqlText(job.title)}, ${sqlText(job.slug)},`);
    lines.push(`    ${sqlText(job.summary)}, ${sqlText(job.description)},`);
    lines.push(`    ${sqlText(job.requirements)}, ${sqlText(job.responsibilities)},`);
    lines.push(
      `    ${sqlText(job.job_type)}, ${sqlText(job.workplace_mode)}, ${sqlNullableText(job.district)},`,
    );
    lines.push("    'published', null, null,");
    lines.push(
      `    ${ageExpression(job.ageDays)}, pg_catalog.now() + interval '60 days',`,
    );
    lines.push("    'source_site'");
    lines.push(`  )${index === jobs.length - 1 ? "" : ","}`);
  });
  lines.push("on conflict (id) do update");
  lines.push("set");
  lines.push("  company_id = excluded.company_id,");
  lines.push("  created_by = null,");
  lines.push("  title = excluded.title,");
  lines.push("  slug = excluded.slug,");
  lines.push("  summary = excluded.summary,");
  lines.push("  description = excluded.description,");
  lines.push("  requirements = excluded.requirements,");
  lines.push("  responsibilities = excluded.responsibilities,");
  lines.push("  job_type = excluded.job_type,");
  lines.push("  workplace_mode = excluded.workplace_mode,");
  lines.push("  district = excluded.district,");
  lines.push("  status = excluded.status,");
  lines.push("  reviewed_by = null,");
  lines.push("  reviewed_at = null,");
  lines.push("  published_at = excluded.published_at,");
  lines.push("  expires_at = excluded.expires_at,");
  lines.push("  publication_source = excluded.publication_source,");
  lines.push("  updated_at = pg_catalog.now();");
  lines.push("");
  lines.push("insert into public.job_source_imports (");
  lines.push("  job_id, source, source_job_id, source_published_at, source_expires_at");
  lines.push(")");
  lines.push("values");
  imports.forEach((row, index) => {
    lines.push(
      `  (${sqlText(row.job_id)}, ${sqlText(row.source)}, ${sqlText(row.source_job_id)}, ` +
        `${ageExpression(row.ageDays)}, pg_catalog.now() + interval '60 days')` +
        `${index === imports.length - 1 ? "" : ","}`,
    );
  });
  lines.push("on conflict (job_id) do update");
  lines.push("set");
  lines.push("  source = excluded.source,");
  lines.push("  source_job_id = excluded.source_job_id,");
  lines.push("  source_published_at = excluded.source_published_at,");
  lines.push("  source_expires_at = excluded.source_expires_at;");
  lines.push("");
  lines.push("commit;");
  lines.push("");
  return lines.join("\n");
}

async function main(): Promise<void> {
  loadEnv();
  const client = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: jobRows, error: jobError } = await client
    .from("jobs")
    .select(
      "id, company_id, title, slug, summary, description, requirements, responsibilities, job_type, workplace_mode, district, published_at",
    )
    .eq("status", "published");
  if (jobError) throw new Error(`İlanlar okunamadı: ${jobError.message}`);

  const { data: importRows, error: importError } = await client
    .from("job_source_imports")
    .select("job_id, source, source_job_id");
  if (importError) {
    throw new Error(`İçe aktarma kayıtları okunamadı: ${importError.message}`);
  }

  const { data: companyRows, error: companyError } = await client
    .from("companies")
    .select(
      "id, name, slug, profile_description, categories, website, municipality, source_profile_url, logo_url",
    );
  if (companyError) throw new Error(`İşverenler okunamadı: ${companyError.message}`);

  const allJobs = (jobRows ?? []) as JobRow[];
  const sourceByJobId = new Map(
    (importRows ?? []).map((row) => [
      row.job_id as string,
      row.source as SourceJobSite,
    ]),
  );
  const importByJobId = new Map(
    (importRows ?? []).map((row) => [row.job_id as string, row as ImportRow]),
  );
  const companyById = new Map(
    (companyRows ?? []).map((row) => [row.id as string, row as CompanyRow]),
  );

  const selected = selectJobs(allJobs, sourceByJobId);
  const now = Date.now();
  const ageDaysFor = (publishedAt: string): number =>
    Math.max(1, Math.round((now - Date.parse(publishedAt)) / 86_400_000));

  const orderedCompanyIds = [...new Set(selected.map((job) => job.company_id))];
  const renderedCompanies: CompanyRow[] = orderedCompanyIds.map(
    (originalId, index) => {
      const company = companyById.get(originalId);
      if (!company) throw new Error(`İşveren bulunamadı: ${originalId}`);
      const override = EMPLOYER_OVERRIDES[company.slug] ?? {};
      const liveDescription = company.profile_description.trim();
      return {
        ...company,
        ...override,
        // Placeholder values such as "X" add noise without informing readers.
        profile_description:
          override.profile_description ??
          (liveDescription.length >= 20 ? liveDescription : ""),
        id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      };
    },
  );
  const companyIdMap = new Map<string, string>();
  orderedCompanyIds.forEach((originalId, index) => {
    companyIdMap.set(originalId, renderedCompanies[index].id);
  });

  const renderedJobs: RenderedJob[] = selected.map((job, index) => ({
    ...job,
    id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    company_id: companyIdMap.get(job.company_id)!,
    ageDays: ageDaysFor(job.published_at),
  }));

  const renderedImports: RenderedImport[] = selected.map((job, index) => {
    const source = importByJobId.get(job.id);
    if (!source) throw new Error(`Kaynak kaydı bulunamadı: ${job.slug}`);
    return {
      job_id: renderedJobs[index].id,
      source: source.source,
      source_job_id: source.source_job_id,
      ageDays: renderedJobs[index].ageDays,
    };
  });

  const output = renderSeed(renderedJobs, renderedCompanies, renderedImports);
  const target = resolve(process.cwd(), "supabase/seed-source-jobs.sql");
  writeFileSync(target, output, "utf8");

  if (process.argv.includes("--push")) {
    console.info("Seçilen veri canlı Supabase veritabanına yazılıyor…");
    await pushToLive(client, renderedCompanies, renderedJobs, renderedImports);
    console.info("Canlı veritabanı güncellendi.");
  }

  const bySource = renderedImports.reduce<Record<string, number>>(
    (accumulator, row) => {
      accumulator[row.source] = (accumulator[row.source] ?? 0) + 1;
      return accumulator;
    },
    {},
  );
  const jobTypes = [...new Set(renderedJobs.map((job) => job.job_type))].sort();
  console.info(
    `Seed yazıldı: ${renderedJobs.length} ilan, ${renderedCompanies.length} işveren ` +
      `(iskibris: ${bySource.iskibris ?? 0}, isbulkibris: ${bySource.isbulkibris ?? 0}).`,
  );
  console.info(`İlan türleri: ${jobTypes.join(", ")}`);
  console.info(`Kaynak dosya: ${target}`);
}

main().catch((error: unknown) => {
  console.error("Seed üretimi başarısız:", error);
  process.exitCode = 1;
});
