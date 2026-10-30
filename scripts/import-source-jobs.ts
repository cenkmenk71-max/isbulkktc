import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchIskibrisJobs,
  fetchIsbulkibrisJobs,
} from "../src/features/jobs/source-job-fetchers";
import {
  buildSourceJobSlug,
  sanitizeSourceJobRecord,
  selectDiverseSourceJobs,
  sourceJobContentHash,
  type SourceEmployerRecord,
  type SourceJobRecord,
} from "../src/features/jobs/source-job-import";

function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) {
      process.loadEnvFile(path);
    }
  }
}

type ImportOptions = {
  dryRun: boolean;
  purge: boolean;
  limit: number | null;
};

function parseLimit(argv: string[]): number | null {
  const inline = argv.find((arg) => arg.startsWith("--limit="));
  const spaced = argv.indexOf("--limit");
  const raw =
    (inline ? inline.slice("--limit=".length) : undefined) ??
    (spaced >= 0 ? argv[spaced + 1] : undefined) ??
    process.env.SOURCE_JOB_LIMIT;
  const parsed = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseOptions(argv: string[]): ImportOptions {
  return {
    dryRun: argv.includes("--dry-run"),
    purge: !argv.includes("--keep-existing"),
    limit: parseLimit(argv),
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assignUniqueSlugs(records: SourceJobRecord[]): void {
  const taken = new Set<string>();
  for (const record of records) {
    const slug = buildSourceJobSlug(
      record.source,
      record.title,
      record.employer.name,
      taken,
    );
    record.slug = slug;
    taken.add(slug);
  }
}

function dedupeRecords(records: SourceJobRecord[]): SourceJobRecord[] {
  const seen = new Set<string>();
  const unique: SourceJobRecord[] = [];
  for (const record of records) {
    const key = `${record.source}:${record.sourceJobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(record);
  }
  return unique;
}

/**
 * A stored logo URL is not proof the image loads: the source can rotate an S3
 * object away and leave a 403 behind (that is how `Kıbet`'s logo broke). Probe
 * each one and blank the ones that do not answer, so the card falls back to its
 * monogram instead of a broken image. Failures are logged, never fatal.
 */
async function dropUnreachableLogos(
  employers: Map<string, SourceEmployerRecord>,
): Promise<number> {
  const withLogo = [...employers.values()].filter((employer) => employer.logoUrl);
  let dropped = 0;
  await Promise.all(
    withLogo.map(async (employer) => {
      const logoUrl = employer.logoUrl;
      if (!logoUrl) return;
      try {
        const response = await fetch(logoUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(10_000),
        });
        // The employer API answers 302 to its S3 object, which `fetch` follows;
        // the final response is what decides whether the image is served.
        if (response.ok) return;
        employer.logoUrl = null;
        dropped += 1;
        console.warn(`  · Logo erişilemedi (${response.status}): ${logoUrl}`);
      } catch (error) {
        employer.logoUrl = null;
        dropped += 1;
        console.warn(
          `  · Logo doğrulanamadı (${error instanceof Error ? error.message : "bilinmeyen hata"}): ${logoUrl}`,
        );
      }
    }),
  );
  return dropped;
}

function collectEmployers(records: SourceJobRecord[]): Map<string, SourceEmployerRecord> {
  const employers = new Map<string, SourceEmployerRecord>();
  for (const record of records) {
    const existing = employers.get(record.employer.slug);
    if (!existing) {
      employers.set(record.employer.slug, record.employer);
      continue;
    }
    employers.set(record.employer.slug, {
      ...existing,
      profileDescription:
        existing.profileDescription.length >= record.employer.profileDescription.length
          ? existing.profileDescription
          : record.employer.profileDescription,
      categories:
        existing.categories.length >= record.employer.categories.length
          ? existing.categories
          : record.employer.categories,
      website: existing.website ?? record.employer.website,
      municipality: existing.municipality ?? record.employer.municipality,
      sourceProfileUrl: existing.sourceProfileUrl ?? record.employer.sourceProfileUrl,
      logoUrl: existing.logoUrl ?? record.employer.logoUrl,
    });
  }
  return employers;
}

function assert(
  error: { message: string } | null,
  context: string,
): asserts error is null {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

async function purgeSourceData(client: SupabaseClient): Promise<void> {
  // Delete every imported listing, not only the ones currently mapped in
  // job_source_imports: a row can lose its mapping (or predate the mapping
  // table) and would otherwise survive every refresh forever.
  const { error: importsDeleteError } = await client
    .from("job_source_imports")
    .delete()
    .not("job_id", "is", null);
  assert(importsDeleteError, "Eski kaynak eşlemeleri silinemedi");

  const { data: sourceJobs, error: jobsSelectError } = await client
    .from("jobs")
    .select("id")
    .eq("publication_source", "source_site");
  assert(jobsSelectError, "Eski kaynak ilanlar okunamadı");

  const jobIds = (sourceJobs ?? []).map((row) => row.id as string);
  if (jobIds.length > 0) {
    const { error: deleteError } = await client.from("jobs").delete().in("id", jobIds);
    assert(deleteError, "Eski kaynak ilanlar silinemedi");
  }

  const { data: sourceCompanies, error: companySelectError } = await client
    .from("companies")
    .select("id")
    .like("slug", "source-%");
  assert(companySelectError, "Eski kaynak işverenler okunamadı");

  const companyIds = (sourceCompanies ?? []).map((row) => row.id as string);
  let removedCompanies = 0;
  if (companyIds.length > 0) {
    const { data: stillReferenced, error: referencedError } = await client
      .from("jobs")
      .select("company_id")
      .in("company_id", companyIds);
    assert(referencedError, "İşveren referansları okunamadı");

    const referencedIds = new Set(
      (stillReferenced ?? []).map((row) => row.company_id as string),
    );
    const deletableIds = companyIds.filter((id) => !referencedIds.has(id));

    if (deletableIds.length > 0) {
      const { error: companyDeleteError } = await client
        .from("companies")
        .delete()
        .in("id", deletableIds);
      assert(companyDeleteError, "Eski kaynak işverenler silinemedi");
      removedCompanies = deletableIds.length;
    }
  }

  console.info(
    `  · ${jobIds.length} eski kaynak ilan ve ${removedCompanies} bağlantısız işveren temizlendi.`,
  );
}

async function upsertEmployers(
  client: SupabaseClient,
  employers: Map<string, SourceEmployerRecord>,
): Promise<Map<string, string>> {
  const rows = [...employers.values()].map((employer) => ({
    name: employer.name.slice(0, 120),
    slug: employer.slug,
    verification_status: "pending" as const,
    profile_description: employer.profileDescription,
    categories: employer.categories,
    website: employer.website,
    municipality: employer.municipality,
    source_profile_url: employer.sourceProfileUrl,
    logo_url: employer.logoUrl,
  }));

  const { data, error } = await client
    .from("companies")
    .upsert(rows, { onConflict: "slug" })
    .select("id, slug");
  assert(error, "İşverenler yazılamadı");

  const idBySlug = new Map<string, string>();
  for (const row of data ?? []) {
    idBySlug.set(row.slug as string, row.id as string);
  }
  return idBySlug;
}

/**
 * Records the change ledger for every imported listing and returns the
 * modification instant to store per source/job id.
 *
 * iskibris publishes a real upstream `updated_at`, so its value is trusted
 * directly. isbulkibris publishes none, so the listing's content hash is
 * compared with the previous run: the stored `last_changed_at` only advances
 * when the hash moves, which keeps an untouched listing's date stable instead of
 * re-stamping it on every refresh. A first-seen listing starts at its
 * publication date so it never looks modified before it was posted.
 */
async function syncSourceSnapshots(
  client: SupabaseClient,
  records: SourceJobRecord[],
): Promise<Map<string, string | null>> {
  const hashes = new Map<string, string>();
  for (const record of records) {
    hashes.set(
      `${record.source}:${record.sourceJobId}`,
      sourceJobContentHash({
        title: record.title,
        summary: record.summary,
        description: record.description,
        requirements: record.requirements,
        responsibilities: record.responsibilities,
        jobType: record.jobType,
        workplaceMode: record.workplaceMode,
        district: record.district,
        expiresAt: record.expiresAt,
        employerName: record.employer.name,
      }),
    );
  }

  const keys = [...hashes.keys()];
  const previous = new Map<
    string,
    { content_hash: string; first_seen_at: string; last_changed_at: string }
  >();
  // `.in()` has a practical URL-length limit, so read the ledger in chunks.
  for (let start = 0; start < keys.length; start += 200) {
    const chunk = keys.slice(start, start + 200);
    const { data, error } = await client
      .from("job_source_snapshots")
      .select("source, source_job_id, content_hash, first_seen_at, last_changed_at")
      .in("source_job_id", chunk.map((key) => key.split(":")[1]));
    assert(error, "Kaynak anlık görüntüleri okunamadı");
    for (const row of data ?? []) {
      previous.set(`${row.source as string}:${row.source_job_id as string}`, {
        content_hash: row.content_hash as string,
        first_seen_at: row.first_seen_at as string,
        last_changed_at: row.last_changed_at as string,
      });
    }
  }

  const now = new Date().toISOString();
  const snapshotRows: Array<{
    source: string;
    source_job_id: string;
    content_hash: string;
    first_seen_at: string;
    last_changed_at: string;
  }> = [];
  const modifiedAtByKey = new Map<string, string | null>();

  for (const record of records) {
    const key = `${record.source}:${record.sourceJobId}`;
    const hash = hashes.get(key) as string;
    const prior = previous.get(key);
    const publishedAt = new Date(record.publishedAt).toISOString();

    if (record.sourceUpdatedAt) {
      // A real upstream modification date always wins.
      snapshotRows.push({
        source: record.source,
        source_job_id: record.sourceJobId,
        content_hash: hash,
        first_seen_at: prior?.first_seen_at ?? now,
        last_changed_at: prior?.last_changed_at ?? now,
      });
      modifiedAtByKey.set(key, record.sourceUpdatedAt);
      continue;
    }

    if (!prior) {
      snapshotRows.push({
        source: record.source,
        source_job_id: record.sourceJobId,
        content_hash: hash,
        first_seen_at: now,
        last_changed_at: now,
      });
      modifiedAtByKey.set(key, publishedAt);
      continue;
    }

    if (prior.content_hash !== hash) {
      snapshotRows.push({
        source: record.source,
        source_job_id: record.sourceJobId,
        content_hash: hash,
        first_seen_at: prior.first_seen_at,
        last_changed_at: now,
      });
      modifiedAtByKey.set(key, now);
      continue;
    }

    snapshotRows.push({
      source: record.source,
      source_job_id: record.sourceJobId,
      content_hash: hash,
      first_seen_at: prior.first_seen_at,
      last_changed_at: prior.last_changed_at,
    });
    modifiedAtByKey.set(key, prior.last_changed_at);
  }

  for (let start = 0; start < snapshotRows.length; start += 200) {
    const { error } = await client
      .from("job_source_snapshots")
      .upsert(snapshotRows.slice(start, start + 200), {
        onConflict: "source,source_job_id",
      });
    assert(error, "Kaynak anlık görüntüleri yazılamadı");
  }

  return modifiedAtByKey;
}

async function insertJobs(
  client: SupabaseClient,
  records: SourceJobRecord[],
  companyIdBySlug: Map<string, string>,
  modifiedAtByKey: Map<string, string | null>,
): Promise<void> {
  const jobRows = records.map((record) => {
    const companyId = companyIdBySlug.get(record.employer.slug);
    if (!companyId) {
      throw new Error(`İşveren eşleşmedi: ${record.employer.slug}`);
    }
    return {
      company_id: companyId,
      created_by: null,
      title: record.title.slice(0, 140),
      slug: record.slug,
      summary: record.summary,
      description: record.description,
      requirements: record.requirements,
      responsibilities: record.responsibilities,
      job_type: record.jobType,
      workplace_mode: record.workplaceMode,
      district: record.district,
      status: "published" as const,
      published_at: record.publishedAt,
      expires_at: record.expiresAt,
      publication_source: "source_site" as const,
    };
  });

  const { data, error } = await client
    .from("jobs")
    .insert(jobRows)
    .select("id, slug");
  assert(error, "İlanlar yazılamadı");

  const jobIdBySlug = new Map<string, string>();
  for (const row of data ?? []) {
    jobIdBySlug.set(row.slug as string, row.id as string);
  }

  const importRows = records.map((record) => {
    const jobId = jobIdBySlug.get(record.slug);
    if (!jobId) {
      throw new Error(`İlan kimliği eşleşmedi: ${record.slug}`);
    }
    return {
      job_id: jobId,
      source: record.source,
      source_job_id: record.sourceJobId,
      source_published_at: record.publishedAt,
      source_expires_at: record.expiresAt,
      source_updated_at:
        modifiedAtByKey.get(`${record.source}:${record.sourceJobId}`) ?? null,
    };
  });

  const { error: importError } = await client
    .from("job_source_imports")
    .upsert(importRows, { onConflict: "job_id" });
  assert(importError, "Kaynak ilan eşlemesi yazılamadı");
}

async function main(): Promise<void> {
  loadLocalEnv();
  const options = parseOptions(process.argv.slice(2));
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.info("Kaynak ilanlar getiriliyor…");
  const [iskibrisJobs, isbulkibrisJobs] = await Promise.all([
    fetchIskibrisJobs({ onProgress: (message) => console.info(`  · ${message}`) }),
    fetchIsbulkibrisJobs({ onProgress: (message) => console.info(`  · ${message}`) }),
  ]);

  const records = dedupeRecords([...iskibrisJobs, ...isbulkibrisJobs])
    .map(sanitizeSourceJobRecord)
    .filter((record) => record.title.length >= 5);

  // The upstream catalogue is far larger than the board we want to publish.
  // Keep the newest listings, but spread them across employers and sectors so
  // the public catalogue stays varied rather than one company's hiring spree.
  const selected =
    options.limit === null ? records : selectDiverseSourceJobs(records, options.limit);

  assignUniqueSlugs(selected);
  const employers = collectEmployers(selected);

  console.info(
    `  · ${records.length} kaynak ilan bulundu; ${selected.length} ilan yayınlanacak ` +
      `(iskibris: ${iskibrisJobs.length}, isbulkibris: ${isbulkibrisJobs.length}` +
      `${options.limit === null ? "" : `, limit: ${options.limit}`}).`,
  );
  console.info(`  · ${employers.size} işveren hazırlanacak.`);

  if (options.dryRun) {
    selected.forEach((record, index) => {
      console.info(
        `    ${String(index + 1).padStart(2, " ")}. [${record.source}] ${record.title} ` +
          `— ${record.employer.name} (${record.employer.categories[0] ?? "sektör yok"}, ${record.jobType})`,
      );
    });
    console.info("Kuru çalıştırma tamamlandı; veritabanına yazılmadı.");
    return;
  }

  // Never let a transient source outage wipe the live catalogue. With a limit we
  // expect exactly that many listings, so an under-filled selection signals a
  // source failure rather than a legitimately small board.
  const minimumExpectedJobs = options.limit ?? 10;
  if (selected.length < minimumExpectedJobs) {
    throw new Error(
      `Yalnızca ${selected.length} ilan bulundu; beklenen en az ${minimumExpectedJobs}. ` +
        "Kaynak siteler geçici olarak yanıt vermiyor olabilir, bu yüzden canlı veri korunuyor.",
    );
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (options.purge) {
    console.info("Eski kaynak veriler temizleniyor…");
    await purgeSourceData(client);
  }

  console.info("Değişiklik defteri güncelleniyor…");
  const modifiedAtByKey = await syncSourceSnapshots(client, selected);

  console.info("İşverenler yazılıyor…");
  const droppedLogos = await dropUnreachableLogos(employers);
  if (droppedLogos > 0) {
    console.info(`  · ${droppedLogos} erişilemeyen logo monograma düşürüldü.`);
  }
  const companyIdBySlug = await upsertEmployers(client, employers);

  console.info("İlanlar yazılıyor…");
  await insertJobs(client, selected, companyIdBySlug, modifiedAtByKey);

  console.info(
    `Tamamlandı: ${selected.length} ilan canlı Supabase veritabanına yazıldı.`,
  );
}

main().catch((error: unknown) => {
  console.error("İçe aktarma başarısız:", error);
  process.exitCode = 1;
});
