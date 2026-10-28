import {
  buildSourceCompanySlug,
  buildSourceJobSlug,
  ensureMinimumText,
  htmlToPlainText,
  isWithinSourceWindow,
  normalizeHttpsUrl,
  normalizeSourceDistrict,
  normalizeSourceJobType,
  normalizeSourceWorkplaceMode,
  resolveEmployerLogoUrl,
  summarizeSourceText,
  type SourceEmployerRecord,
  type SourceJobRecord,
} from "./source-job-import";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const requestTimeoutMs = 20_000;

export type FetchSourceJobsOptions = {
  now?: number;
  concurrency?: number;
  onProgress?: (message: string) => void;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", "user-agent": userAgent },
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      // 429/5xx are transient; other 4xx responses will not succeed on retry.
      if (response.status !== 429 && response.status < 500) return null;
    } catch {
      // Network timeouts and aborted requests are retried below.
    }
    if (attempt < maxAttempts) {
      await sleep(400 * 2 ** (attempt - 1));
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
        // Space out requests so the source API does not throttle the batch.
        await sleep(150);
      }
    }),
  );
  return results;
}

/**
 * Fetches every detail, then retries the ones that failed after a pause.
 * A single throttled request should not silently drop a live listing.
 */
async function fetchDetailsWithRetry<TItem, TDetail>(
  items: readonly TItem[],
  concurrency: number,
  toUrl: (item: TItem) => string,
): Promise<(TDetail | null)[]> {
  const firstPass = await mapWithConcurrency(items, concurrency, (item) =>
    fetchJson<TDetail>(toUrl(item)),
  );

  const failedIndices = firstPass
    .map((detail, index) => (detail === null ? index : -1))
    .filter((index) => index >= 0);

  if (failedIndices.length === 0) return firstPass;

  await sleep(1500);
  const retries = await mapWithConcurrency(
    failedIndices,
    Math.max(1, Math.floor(concurrency / 2)),
    (index) => fetchJson<TDetail>(toUrl(items[index])),
  );

  const merged = [...firstPass];
  failedIndices.forEach((index, position) => {
    merged[index] = retries[position];
  });
  return merged;
}

type IskibrisListItem = {
  id: number;
  title?: string;
  company_id?: number;
  company_name?: string;
  company_logo?: string | null;
  city_name?: string | null;
  place_name?: string | null;
};

type IskibrisDetail = {
  id: number;
  title?: string;
  body?: string;
  active?: number | boolean;
  archived?: number | boolean;
  status?: string;
  is_published?: number | boolean;
  deleted_at?: string | null;
  published_at?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  metadata?: string | null;
  employment_name?: string | null;
  company_id?: number;
  company_name?: string | null;
  company_logo?: string | null;
  company?: {
    id?: number;
    name?: string;
    logo?: string | null;
    website?: string | null;
    about?: string | null;
    address?: string | null;
    sector?: { name_tr?: string } | null;
    headquarter_place_name?: string | null;
  } | null;
  place_name?: string | null;
  place_name_tr?: string | null;
  city_name?: string | null;
  is_good_for_remote?: number | boolean;
};

type IsbulkibrisListItem = { id: string };

type IsbulkibrisDetail = {
  id: string;
  slug?: string;
  title?: string;
  description?: string | null;
  employmentType?: string[] | string | null;
  remote?: boolean | null;
  locationName?: string | null;
  publishedAt?: string | null;
  expiresAt?: string | null;
  professionGroupName?: string | null;
  professionName?: string | null;
  company?: {
    id?: string;
    slug?: string;
    name?: string;
    logoUrl?: string | null;
    website?: string | null;
    about?: string | null;
    address?: string | null;
  } | null;
};

function resolveIskibrisExpiry(detail: IskibrisDetail): string | null {
  const candidates: number[] = [];
  if (detail.endDate) {
    const parsed = Date.parse(detail.endDate);
    if (Number.isFinite(parsed)) candidates.push(parsed);
  }
  if (detail.metadata) {
    try {
      const metadata = JSON.parse(detail.metadata) as { expires_at?: unknown };
      if (typeof metadata.expires_at === "string") {
        const parsed = Date.parse(metadata.expires_at);
        if (Number.isFinite(parsed)) candidates.push(parsed);
      }
    } catch {
      // Ignore malformed metadata; endDate remains the authoritative expiry.
    }
  }
  if (candidates.length === 0) return null;
  return new Date(Math.min(...candidates)).toISOString();
}

function buildIskibrisSummary(
  detail: IskibrisDetail,
  description: string,
): string {
  const summary = summarizeSourceText(description, 400);
  if (summary.length >= 20) return summary;
  const company = detail.company_name ?? "İşveren";
  const district = normalizeSourceDistrict(detail.place_name ?? detail.city_name);
  const parts = [
    `${company} ${district ? `${district} bölgesinde` : "Kuzey Kıbrıs'ta"} çalışacak takım arkadaşı arıyor.`,
    "İlan detayları ve başvuru koşulları kaynak ilanda listelenmektedir.",
  ];
  return summarizeSourceText(parts.join(" "), 400);
}

function toIskibrisRecord(
  detail: IskibrisDetail,
  now: number,
): SourceJobRecord | null {
  const isActive = detail.active === 1 || detail.active === true;
  const isPublished = detail.is_published === 1 || detail.is_published === true;
  const isArchived = detail.archived === 1 || detail.archived === true;
  const isDeleted = detail.deleted_at !== null && detail.deleted_at !== undefined;

  if (!isActive || !isPublished || isArchived || isDeleted) return null;
  if (detail.status !== "active") return null;

  const publishedAtRaw = detail.published_at ?? detail.startDate ?? null;
  const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : null;
  if (!publishedAt || !Number.isFinite(publishedAt.getTime())) return null;

  const expiresAtRaw = resolveIskibrisExpiry(detail);
  if (!expiresAtRaw) return null;

  const title = detail.title?.trim() ?? "";
  const companyName = (detail.company?.name ?? detail.company_name ?? "").trim();
  const jobType = normalizeSourceJobType(detail.employment_name);
  if (!title || !companyName || !jobType) return null;

  const record = {
    publishedAt: publishedAt.toISOString(),
    expiresAt: expiresAtRaw,
  };
  if (!isWithinSourceWindow(record.publishedAt, record.expiresAt, now)) {
    return null;
  }

  const bodyText = htmlToPlainText(detail.body ?? "");
  const description = ensureMinimumText(
    bodyText,
    50,
    `${companyName} tarafından verilen "${title}" ilanının ayrıntıları kaynak ilanda listelenmektedir. Başvuru koşulları ve çalışma düzeni için kaynak ilanı inceleyebilirsiniz.`,
  );

  const companyWebsite = normalizeHttpsUrl(detail.company?.website);
  const employer: SourceEmployerRecord = {
    name: companyName,
    slug: buildSourceCompanySlug("iskibris", companyName),
    profileDescription: summarizeSourceText(
      htmlToPlainText(detail.company?.about ?? ""),
      2000,
    ),
    categories: detail.company?.sector?.name_tr
      ? [detail.company.sector.name_tr]
      : [],
    website: companyWebsite,
    municipality: normalizeSourceDistrict(
      detail.company?.headquarter_place_name ?? detail.place_name ?? detail.city_name,
    ),
    sourceProfileUrl: `https://www.iskibris.com/companies/${detail.company_id ?? detail.company?.id ?? ""}`,
    logoUrl: resolveEmployerLogoUrl(
      detail.company?.logo ?? detail.company_logo,
      "https://www.iskibris.com",
    ),
  };

  return {
    source: "iskibris",
    sourceJobId: String(detail.id),
    title,
    slug: buildSourceJobSlug("iskibris", title, companyName, new Set()),
    summary: buildIskibrisSummary(detail, bodyText),
    description,
    requirements: "",
    responsibilities: "",
    jobType,
    workplaceMode: normalizeSourceWorkplaceMode(
      detail.is_good_for_remote,
      detail.place_name_tr ?? detail.place_name,
    ),
    district: normalizeSourceDistrict(detail.place_name ?? detail.city_name),
    publishedAt: record.publishedAt,
    expiresAt: record.expiresAt,
    employer,
  };
}

function buildIsbulkibrisSummary(
  detail: IsbulkibrisDetail,
  description: string,
): string {
  const summary = summarizeSourceText(description, 400);
  if (summary.length >= 20) return summary;
  const company = detail.company?.name ?? "İşveren";
  const district = normalizeSourceDistrict(detail.locationName);
  return summarizeSourceText(
    `${company} ${district ? `${district} bölgesinde` : "Kuzey Kıbrıs'ta"} çalışacak takım arkadaşı arıyor. Başvuru koşulları kaynak ilanda listelenmektedir.`,
    400,
  );
}

function toIsbulkibrisRecord(
  detail: IsbulkibrisDetail,
  now: number,
): SourceJobRecord | null {
  const publishedAtRaw = detail.publishedAt ?? null;
  const expiresAtRaw = detail.expiresAt ?? null;
  if (!publishedAtRaw || !expiresAtRaw) return null;

  const title = detail.title?.trim() ?? "";
  const companyName = (detail.company?.name ?? "").trim();
  const companyId = detail.company?.id ?? "";
  const companySlug = detail.company?.slug ?? "";
  if (!title || !companyName || !companyId) return null;

  if (!isWithinSourceWindow(publishedAtRaw, expiresAtRaw, now)) return null;

  const bodyText = htmlToPlainText(detail.description ?? "");
  const description = ensureMinimumText(
    bodyText,
    50,
    `${companyName} tarafından verilen "${title}" ilanının ayrıntıları kaynak ilanda listelenmektedir. Başvuru koşulları ve çalışma düzeni için kaynak ilanı inceleyebilirsiniz.`,
  );

  const employer: SourceEmployerRecord = {
    name: companyName,
    slug: buildSourceCompanySlug("isbulkibris", companyName),
    profileDescription: summarizeSourceText(
      (detail.company?.about ?? "").replace(/\s+/g, " ").trim(),
      2000,
    ),
    categories: [detail.professionGroupName, detail.professionName].filter(
      (value): value is string => Boolean(value && value.trim()),
    ),
    website: normalizeHttpsUrl(detail.company?.website),
    municipality: normalizeSourceDistrict(detail.locationName),
    sourceProfileUrl: companySlug
      ? `https://isbulkibris.com/firmalar/${companySlug}`
      : null,
    logoUrl: resolveEmployerLogoUrl(
      detail.company?.logoUrl,
      "https://api.isbulkibris.com",
    ),
  };

  return {
    source: "isbulkibris",
    sourceJobId: detail.id,
    title,
    slug: buildSourceJobSlug("isbulkibris", title, companyName, new Set()),
    summary: buildIsbulkibrisSummary(detail, bodyText),
    description,
    requirements: "",
    responsibilities: "",
    jobType: normalizeSourceJobType(detail.employmentType) ?? "full_time",
    workplaceMode: normalizeSourceWorkplaceMode(detail.remote, null),
    district: normalizeSourceDistrict(detail.locationName),
    publishedAt: new Date(publishedAtRaw).toISOString(),
    expiresAt: new Date(expiresAtRaw).toISOString(),
    employer,
  };
}

export async function fetchIskibrisJobs(
  options: FetchSourceJobsOptions = {},
): Promise<SourceJobRecord[]> {
  const now = options.now ?? Date.now();
  const concurrency = options.concurrency ?? 4;
  const listItems: IskibrisListItem[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const payload = await fetchJson<{
      data?: IskibrisListItem[];
      next_page_url?: string | null;
    }>(`https://api.iskibris.com/api/v2/jobs/paginated?page=${page}&per_page=100`);
    if (payload === null) {
      // A failed first page means the source is unreachable; abort rather than
      // report zero listings, which would otherwise purge live data.
      if (page === 1) {
        throw new Error("iskibris ilan listesi alınamadı (kaynak yanıt vermiyor).");
      }
      break;
    }
    if (!payload.data || payload.data.length === 0) break;
    listItems.push(...payload.data);
    if (!payload.next_page_url) break;
  }

  options.onProgress?.(`iskibris: ${listItems.length} ilan listelendi`);

  const details = await fetchDetailsWithRetry<IskibrisListItem, IskibrisDetail>(
    listItems,
    concurrency,
    (item) => `https://api.iskibris.com/api/jobs/${item.id}`,
  );

  const records: SourceJobRecord[] = [];
  let detailFailures = 0;
  for (const detail of details) {
    if (!detail) {
      detailFailures += 1;
      continue;
    }
    const record = toIskibrisRecord(detail, now);
    if (record) records.push(record);
  }

  if (detailFailures > 0) {
    options.onProgress?.(
      `iskibris: ${detailFailures} ilan detayı alınamadı (kaynak hız sınırı).`,
    );
  }
  options.onProgress?.(`iskibris: ${records.length} ilan yayında`);
  return records;
}

export async function fetchIsbulkibrisJobs(
  options: FetchSourceJobsOptions = {},
): Promise<SourceJobRecord[]> {
  const now = options.now ?? Date.now();
  const concurrency = options.concurrency ?? 4;
  const listIds: string[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const payload = await fetchJson<{ items?: IsbulkibrisListItem[] }>(
      `https://api.isbulkibris.com/api/jobs?page=${page}&pageSize=100`,
    );
    if (payload === null) {
      if (page === 1) {
        throw new Error("isbulkibris ilan listesi alınamadı (kaynak yanıt vermiyor).");
      }
      break;
    }
    if (!payload.items || payload.items.length === 0) break;
    listIds.push(...payload.items.map((item) => item.id));
    if (payload.items.length < 100) break;
  }

  options.onProgress?.(`isbulkibris: ${listIds.length} ilan listelendi`);

  const details = await fetchDetailsWithRetry<string, IsbulkibrisDetail>(
    listIds,
    concurrency,
    (id) => `https://api.isbulkibris.com/api/jobs/${id}`,
  );

  const records: SourceJobRecord[] = [];
  let detailFailures = 0;
  for (const detail of details) {
    if (!detail) {
      detailFailures += 1;
      continue;
    }
    const record = toIsbulkibrisRecord(detail, now);
    if (record) records.push(record);
  }

  if (detailFailures > 0) {
    options.onProgress?.(
      `isbulkibris: ${detailFailures} ilan detayı alınamadı (kaynak hız sınırı).`,
    );
  }
  options.onProgress?.(`isbulkibris: ${records.length} ilan yayında`);
  return records;
}
