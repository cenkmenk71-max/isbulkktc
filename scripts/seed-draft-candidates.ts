import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

function loadLocalEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (existsSync(path)) {
      loadEnvFile(path);
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function deterministicUuid(namespace: string, key: string): string {
  const hash = createHash("sha256").update(`${namespace}:${key}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function slugify(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clampSlug(slug: string, maxLength: number): string {
  const cleaned = slug.replace(/-+$/g, "").replace(/^-+/, "");
  if (cleaned.length <= maxLength) return cleaned;
  const trimmed = cleaned.slice(0, maxLength);
  const lastDash = trimmed.lastIndexOf("-");
  return (lastDash > 1 ? trimmed.slice(0, lastDash) : trimmed).replace(/-+$/g, "");
}

function buildCompanySlug(name: string): string {
  const body = slugify(name) || "company";
  return clampSlug(body, 80);
}

function buildJobSlug(title: string, companyName: string): string {
  const base = clampSlug(`${slugify(title) || "ilan"}`, 100);
  const company = slugify(companyName);
  const withCompany = company ? clampSlug(`${base}-${company}`, 100) : base;
  return withCompany;
}

function clampText(value: string, minimum: number, maximum: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > maximum) {
    const slice = trimmed.slice(0, maximum);
    const lastSpace = slice.lastIndexOf(" ");
    return (lastSpace > minimum ? slice.slice(0, lastSpace) : slice).trim();
  }
  if (trimmed.length < minimum) {
    return " ".repeat(minimum - trimmed.length) + trimmed;
  }
  return trimmed;
}

type DraftCompany = {
  recordKey: string;
  name: string;
  legalName: string | null;
  slug: string;
  website: string | null;
  publicEmail: string | null;
  phone: string | null;
  profileDescription: string;
  categories: string[];
  municipality: string | null;
  address: string | null;
  logoUrl: string | null;
  sourceProfileUrl: string | null;
  approvalStatus: string;
};

type DraftJob = {
  recordKey: string;
  companyRecordKey: string;
  title: string;
  slug: string;
  summary: string;
  description: string;
  requirements: string;
  responsibilities: string;
  jobType: string;
  workplaceMode: string;
  district: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  applicationEmail: string | null;
  applicationPhone: string | null;
  sourceScreenshotHash: string;
  sourceUrls: string[];
  prePublishChecks: string[];
};

const DRAFT_COMPANIES: DraftCompany[] = [
  {
    recordKey: "shancerli-tic-ltd",
    name: "Şevket Hançerli Tic. Ltd.",
    legalName: "Şevket Hançerli Ticaret Limited Şirketi",
    slug: buildCompanySlug("Şevket Hançerli Tic. Ltd."),
    website: "https://www.sevkethancerli.com/",
    publicEmail: "info@shancerli.com",
    phone: "+90 392 225 26 36",
    profileDescription:
      "Şevket Hançerli Tic. Ltd., Kuzey Kıbrıs'ta gıda ve hızlı tüketim ürünleri alanında toptan dağıtım ve tedarik faaliyetleri yürütür. Resmî web sitesinde ithalat, paketleme, dağıtım ve depolama faaliyetlerini; şirket geçmişini ve marka/iş ortaklarını tanıtır.",
    categories: ["Toptan Gıda", "İthalat", "Lojistik", "Depolama"],
    municipality: "Lefkoşa",
    address: "Lefkoşa Sanayi Sitesi, Toprak Ürünleri Kurumu Siloları Arkası, 8. Sokak No:8, Taşkınköy",
    logoUrl: null,
    sourceProfileUrl: null,
    approvalStatus: "draft_pending_internal_and_employer_approval",
  },
  {
    recordKey: "mandella-extra",
    name: "Mandella Extra",
    legalName: null,
    slug: buildCompanySlug("Mandella Extra"),
    website: "https://kibrismandella.com/",
    publicEmail: "destek@kibrismandella.com",
    phone: "+90 542 879 12 12",
    profileDescription:
      "Mandella Extra, resmî web sitesinde ev, bahçe, beyaz eşya, elektrikli ev aletleri ve ev tekstili kategorilerinde perakende satış yapan marka olarak tanıtılır.",
    categories: ["Perakende", "Ev Eşyaları", "Beyaz Eşya", "Ev Tekstili"],
    municipality: "Lefkoşa",
    address: "Mandella Sanayi Sitesi, Alayköy",
    logoUrl: null,
    sourceProfileUrl: null,
    approvalStatus: "draft_pending_legal_name_and_employer_approval",
  },
];

const DRAFT_JOBS: DraftJob[] = [
  {
    recordKey: "job-13062-shancerli-import-operations",
    companyRecordKey: "shancerli-tic-ltd",
    title: "İthalat Operasyon Sorumlusu",
    slug: buildJobSlug("İthalat Operasyon Sorumlusu", "Şevket Hançerli Tic. Ltd."),
    summary:
      "Şevket Hançerli Tic. Ltd., Lefkoşa'daki ithalat operasyonlarında görev alacak bir İthalat Operasyon Sorumlusu arıyor. Pozisyon; sipariş ve sevkiyat koordinasyonu, ithalat izinleri ve gümrük belgelerinin takibi, nakliye ve gümrük paydaşlarıyla iletişim, ithalat maliyet raporlaması ve ürünlerin depoya teslimine kadar operasyonun izlenmesini kapsıyor.",
    description:
      "Şevket Hançerli Tic. Ltd., Lefkoşa'daki ithalat operasyonlarında görev alacak bir İthalat Operasyon Sorumlusu arıyor. Pozisyon; sipariş ve sevkiyat koordinasyonu, ithalat izinleri ve gümrük belgelerinin takibi, nakliye ve gümrük paydaşlarıyla iletişim, ithalat maliyet raporlaması ve ürünlerin depoya teslimine kadar operasyonun izlenmesini kapsıyor. İlgili üniversite bölümlerinden mezuniyet, ithalat/dış ticaret deneyimi, iyi seviyede İngilizce ve Excel/ERP bilgisi bekleniyor; en az üç yıl deneyim tercih sebebi olarak belirtiliyor.",
    requirements: [
      "İlgili üniversite bölümü mezunu (Dış Ticaret, Uluslararası Ticaret, Lojistik, İşletme veya ilgili alan)",
      "İthalat ve dış ticaret operasyonları deneyimi; en az 3 yıl tercih edilir",
      "KKTC ithalat ve gümrük uygulamaları bilgisi",
      "Uluslararası taşımacılık, gümrük müşavirliği ve ithalat belgeleri",
      "İthalat maliyeti ve lojistik gider hesaplamaları",
      "İyi yazılı ve sözlü İngilizce",
      "MS Office, özellikle Excel",
      "ERP, sipariş ve stok takip sistemleri",
      "Planlama, organizasyon, takip ve problem çözme becerisi",
    ].join("\n"),
    responsibilities: [
      "Yerli ve yurtdışı tedarikçilerle sipariş ve sevkiyat koordinasyonu",
      "İthalat operasyonlarını siparişten depo teslimine kadar takip",
      "İthalat izinleri, gümrük prosedürleri ve belgelerle koordinasyon",
      "Nakliye firmaları, gümrük müşavirleri ve ilgili kurumlarla iletişim",
      "Sevkiyat ve teslimat tarihlerini takip",
      "İthalat maliyet hesaplamaları ve raporları hazırlama",
      "Tedarik ve stok planlamasını destekleme",
      "Gerekli gıda ithalat izinleri, sertifikaları ve uyum belgelerini takip",
      "Operasyonel sorunları çözme ve yönetime bildirme",
    ].join("\n"),
    jobType: "full_time",
    workplaceMode: "on_site",
    district: "Lefkoşa",
    publishedAt: null,
    expiresAt: null,
    applicationEmail: "info@shancerli.com",
    applicationPhone: "+90 392 225 26 36",
    sourceScreenshotHash: "3fef0b8ade8cd0cb45b56ac29f6c54abd1829e908e23598c0bf5d138c60aa27e",
    sourceUrls: [
      "https://www.iskibris.com/jobs/26414",
      "https://www.sevkethancerli.com/",
      "https://www.sevkethancerli.com/iletisim/",
      "https://www.sevkethancerli.com/hakkimizda/",
    ],
    prePublishChecks: [
      "Employer must confirm the vacancy is still open on 2026-11-25 or provide a new close date.",
      "Get explicit permission to republish the role and receive applications through İşBul KKTC.",
      "Complete İşBul KKTC's own company verification and publication approval; external job-board verification does not transfer.",
      "Confirm application route and phone/email are current.",
      "Use only official company-provided logo asset after permission.",
    ],
  },
  {
    recordKey: "job-13060-mandella-experienced-sales-advisor",
    companyRecordKey: "mandella-extra",
    title: "Deneyimli Satış Danışmanı",
    slug: buildJobSlug("Deneyimli Satış Danışmanı", "Mandella Extra"),
    summary:
      "Mandella Extra, Lefkoşa ve Gazimağusa mağazalarında görevlendirilmek üzere deneyimli satış danışmanları arıyor. Mağazacılık ve aktif satış deneyimi, müşteri odaklı yaklaşım, güçlü iletişim ve ekip çalışmasına uyum bekleniyor.",
    description:
      "Mandella Extra, Lefkoşa ve Gazimağusa mağazalarında görevlendirilmek üzere deneyimli satış danışmanları arıyor. Mağazacılık ve aktif satış deneyimi, müşteri odaklı yaklaşım, güçlü iletişim ve ekip çalışmasına uyum bekleniyor. İlanda KKTC vatandaşlığı ve İngilizce bilgisi tercih sebebi olarak belirtiliyor. Mağazacılık ve aktif satış deneyimi, müşteri odaklı, enerjik ve proaktif yaklaşım, güçlü iletişim becerileri ve net diksi, takım çalışması ve uyumluluk isteniyor.",
    requirements: [
      "Mağazacılık ve aktif satış deneyimi",
      "Müşteri odaklı, enerjik ve proaktif yaklaşım",
      "Güçlü iletişim becerileri ve net diksi",
      "Takım çalışması ve uyumluluk",
      "KKTC vatandaşlığı tercih sebebi",
      "İngilizce bilgisi tercih sebebi",
      "Lefkoşa ve Gazimağusa ikamet edenler tercih edilir",
    ].join("\n"),
    responsibilities: [
      "Perakende mağaza satışları ve müşteri yardımı; detaylı görevler ekran görüntüsünde sağlanmamış",
    ].join("\n"),
    jobType: "full_time",
    workplaceMode: "on_site",
    district: "Lefkoşa",
    publishedAt: null,
    expiresAt: null,
    applicationEmail: "info@kibrismandella.com",
    applicationPhone: "+90 546 995 19 18",
    sourceScreenshotHash: "0304d47a5f018f882984d41fa20ad7b64b216fdac58b46944ad74c070c1f00e9",
    sourceUrls: [
      "https://www.iskibris.com/jobs/26447",
      "https://www.iskibris.com/jobs/26128?slug=retail-jobs",
      "https://kibrismandella.com/",
      "https://kibrismandella.com/iletisim/",
    ],
    prePublishChecks: [
      "Do not merge this post with İş Kıbrıs job ID 26128; it is a separate listing. Screenshot-visible ID 26447 was inaccessible during this review.",
      "Confirm that the two cities are current job locations and request exact branch/workplace addresses separately.",
      "Confirm whether employment is full-time; the screenshot itself does not say so.",
      "Confirm application phone +90 546 995 19 18 and info@kibrismandella.com because the official website publishes different general contact details.",
      "Get registered legal company name and permission to publish this vacancy and company profile.",
      "Complete İşBul KKTC's own employer verification and obtain original logo asset.",
    ],
  },
];

type ReviewManifestCompany = {
  recordKey: string;
  action: string;
  existingId?: string;
  existingName?: string;
  existingSlug?: string;
  id?: string;
  name?: string;
  slug?: string;
  verificationStatus?: string;
  approvalStatus?: string;
  inputData?: DraftCompany;
};

type ReviewManifestJob = {
  recordKey: string;
  action: string;
  existingId?: string;
  existingTitle?: string;
  existingSlug?: string;
  companyId?: string;
  id?: string;
  title?: string;
  slug?: string;
  status?: string;
  publicationSource?: string;
  sourceScreenshotHash?: string;
  sourceUrls?: string[];
  prePublishChecks?: string[];
  approvalStatus?: string;
  inputData?: DraftJob;
};

type ReviewManifest = {
  generatedAt: string;
  companies: ReviewManifestCompany[];
  jobs: ReviewManifestJob[];
  notes: string;
};

async function checkExistingCompany(
  client: SupabaseClient,
  company: DraftCompany,
): Promise<{ id: string; name: string; slug: string } | null> {
  const { data: bySlug } = await client
    .from("companies")
    .select("id, name, slug")
    .eq("slug", company.slug)
    .maybeSingle();
  if (bySlug) return bySlug;

  if (company.website) {
    const { data: byWebsite } = await client
      .from("companies")
      .select("id, name, slug")
      .eq("website", company.website)
      .maybeSingle();
    if (byWebsite) return byWebsite;
  }

  if (company.publicEmail) {
    const { data: byEmail } = await client
      .from("companies")
      .select("id, name, slug")
      .eq("public_email", company.publicEmail)
      .maybeSingle();
    if (byEmail) return byEmail;
  }

  if (company.phone) {
    const { data: byPhone } = await client
      .from("companies")
      .select("id, name, slug")
      .eq("phone", company.phone)
      .maybeSingle();
    if (byPhone) return byPhone;
  }

  const { data: byName } = await client
    .from("companies")
    .select("id, name, slug")
    .ilike("name", company.name)
    .maybeSingle();
  if (byName) return byName;

  return null;
}

async function checkExistingJob(
  client: SupabaseClient,
  job: DraftJob,
  companyId: string,
): Promise<{ id: string; title: string; slug: string } | null> {
  const { data: bySlug } = await client
    .from("jobs")
    .select("id, title, slug")
    .eq("company_id", companyId)
    .eq("slug", job.slug)
    .maybeSingle();
  if (bySlug) return bySlug;

  const { data: byTitle } = await client
    .from("jobs")
    .select("id, title, slug")
    .eq("company_id", companyId)
    .ilike("title", job.title)
    .maybeSingle();
  if (byTitle) return byTitle;

  return null;
}

async function simulateCheckExistingCompany(
  company: DraftCompany,
): Promise<{ id: string; name: string; slug: string } | null> {
  console.info(`  → [DRY RUN] Would check for existing company by slug: ${company.slug}`);
  console.info(`  → [DRY RUN] Would check for existing company by website: ${company.website}`);
  console.info(`  → [DRY RUN] Would check for existing company by email: ${company.publicEmail}`);
  console.info(`  → [DRY RUN] Would check for existing company by phone: ${company.phone}`);
  console.info(`  → [DRY RUN] Would check for existing company by name: ${company.name}`);
  return null;
}

async function simulateCheckExistingJob(
  job: DraftJob,
  companyId: string,
): Promise<{ id: string; title: string; slug: string } | null> {
  console.info(`  → [DRY RUN] Would check for existing job by slug in company ${companyId}: ${job.slug}`);
  console.info(`  → [DRY RUN] Would check for existing job by title in company ${companyId}: ${job.title}`);
  return null;
}

const reviewManifest: ReviewManifest = {
  generatedAt: new Date().toISOString(),
  companies: [],
  jobs: [],
  notes: "Private draft candidates for internal review only. Not for public publication.",
};

async function processCompanies(
  client: SupabaseClient | null,
  dryRun: boolean,
): Promise<Map<string, string>> {
  const companyIdMap = new Map<string, string>();

  for (const company of DRAFT_COMPANIES) {
    console.info(`\nProcessing company: ${company.name} (${company.recordKey})`);

    let existing: { id: string; name: string; slug: string } | null = null;
    if (!dryRun && client) {
      existing = await checkExistingCompany(client, company);
    } else {
      existing = await simulateCheckExistingCompany(company);
    }

    let companyId: string;

    if (existing) {
      console.info(`  → Existing company found: ${existing.name} (${existing.id})`);
      console.info(`  → SLUG: ${existing.slug}`);
      companyId = existing.id;
      reviewManifest.companies.push({
        recordKey: company.recordKey,
        action: "duplicate_found",
        existingId: existing.id,
        existingName: existing.name,
        existingSlug: existing.slug,
        inputData: company,
      });
    } else {
      companyId = deterministicUuid("draft-company", company.recordKey);
      console.info(`  → Creating new draft company with ID: ${companyId}`);
      console.info(`  → SLUG: ${company.slug}`);

      if (!dryRun && client) {
        const { error } = await client.from("companies").insert({
          id: companyId,
          name: clampText(company.name, 2, 120),
          slug: company.slug,
          verification_status: "pending",
          profile_description: clampText(company.profileDescription, 0, 2000),
          categories: company.categories,
          website: company.website,
          phone: company.phone,
          public_email: company.publicEmail,
          address: company.address,
          municipality: company.municipality,
          source_profile_url: company.sourceProfileUrl,
          logo_url: company.logoUrl,
        });

        if (error) {
          if (error.code === "23505") {
            console.warn(`  → Duplicate key error, fetching existing...`);
            const { data: existingAfterError } = await client
              .from("companies")
              .select("id, name, slug")
              .eq("slug", company.slug)
              .maybeSingle();
            if (existingAfterError) {
              companyId = existingAfterError.id;
              reviewManifest.companies.push({
                recordKey: company.recordKey,
                action: "duplicate_on_insert",
                existingId: existingAfterError.id,
                existingName: existingAfterError.name,
                existingSlug: existingAfterError.slug,
              });
            } else {
              throw new Error(`Company insert failed: ${error.message}`);
            }
          } else {
            throw new Error(`Company insert failed: ${error.message}`);
          }
        } else {
          console.info(`  → Company created successfully`);
          reviewManifest.companies.push({
            recordKey: company.recordKey,
            action: "created",
            id: companyId,
            name: company.name,
            slug: company.slug,
            verificationStatus: "pending",
            approvalStatus: company.approvalStatus,
          });
        }
      } else {
        console.info(`  → [DRY RUN] Would insert company with verification_status = 'pending'`);
        reviewManifest.companies.push({
          recordKey: company.recordKey,
          action: "would_create",
          id: companyId,
          name: company.name,
          slug: company.slug,
          verificationStatus: "pending",
          approvalStatus: company.approvalStatus,
        });
      }
    }

    companyIdMap.set(company.recordKey, companyId);
  }

  return companyIdMap;
}

async function processJobs(
  client: SupabaseClient | null,
  dryRun: boolean,
  companyIdMap: Map<string, string>,
): Promise<void> {
  for (const job of DRAFT_JOBS) {
    console.info(`\nProcessing job: ${job.title} (${job.recordKey})`);

    const companyId = companyIdMap.get(job.companyRecordKey);
    if (!companyId) {
      console.error(`  → Company not found for ${job.companyRecordKey}`);
      continue;
    }

    let existing: { id: string; title: string; slug: string } | null = null;
    if (!dryRun && client) {
      existing = await checkExistingJob(client, job, companyId);
    } else {
      existing = await simulateCheckExistingJob(job, companyId);
    }

    let jobId: string;

    if (existing) {
      console.info(`  → Existing job found: ${existing.title} (${existing.id})`);
      jobId = existing.id;
      reviewManifest.jobs.push({
        recordKey: job.recordKey,
        action: "duplicate_found",
        existingId: existing.id,
        existingTitle: existing.title,
        existingSlug: existing.slug,
        companyId,
        inputData: job,
      });
    } else {
      jobId = deterministicUuid("draft-job", job.recordKey);
      console.info(`  → Creating new draft job with ID: ${jobId}`);
      console.info(`  → SLUG: ${job.slug}`);

      if (!dryRun && client) {
        const { error } = await client.from("jobs").insert({
          id: jobId,
          company_id: companyId,
          created_by: null,
          title: clampText(job.title, 5, 140),
          slug: job.slug,
          summary: clampText(job.summary, 20, 500),
          description: clampText(job.description, 50, 20000),
          requirements: clampText(job.requirements, 0, 10000),
          responsibilities: clampText(job.responsibilities, 0, 10000),
          job_type: job.jobType,
          workplace_mode: job.workplaceMode,
          district: job.district,
          status: "draft",
          moderation_note: null,
          reviewed_by: null,
          reviewed_at: null,
          published_at: job.publishedAt,
          expires_at: job.expiresAt,
          publication_source: "platform",
        });

        if (error) {
          if (error.code === "23505") {
            console.warn(`  → Duplicate key error, fetching existing...`);
            const { data: existingAfterError } = await client
              .from("jobs")
              .select("id, title, slug")
              .eq("company_id", companyId)
              .eq("slug", job.slug)
              .maybeSingle();
            if (existingAfterError) {
              jobId = existingAfterError.id;
              reviewManifest.jobs.push({
                recordKey: job.recordKey,
                action: "duplicate_on_insert",
                existingId: existingAfterError.id,
                existingTitle: existingAfterError.title,
                existingSlug: existingAfterError.slug,
                companyId,
              });
            } else {
              throw new Error(`Job insert failed: ${error.message}`);
            }
          } else {
            throw new Error(`Job insert failed: ${error.message}`);
          }
        } else {
          console.info(`  → Job created successfully`);
          reviewManifest.jobs.push({
            recordKey: job.recordKey,
            action: "created",
            id: jobId,
            title: job.title,
            slug: job.slug,
            companyId,
            status: "draft",
            publicationSource: "platform",
            sourceScreenshotHash: job.sourceScreenshotHash,
            sourceUrls: job.sourceUrls,
            prePublishChecks: job.prePublishChecks,
            approvalStatus: "draft_pending_review",
          });
        }
      } else {
        console.info(`  → [DRY RUN] Would insert job with status = 'draft', publication_source = 'platform'`);
        reviewManifest.jobs.push({
          recordKey: job.recordKey,
          action: "would_create",
          id: jobId,
          title: job.title,
          slug: job.slug,
          companyId,
          status: "draft",
          publicationSource: "platform",
          sourceScreenshotHash: job.sourceScreenshotHash,
          sourceUrls: job.sourceUrls,
          prePublishChecks: job.prePublishChecks,
          approvalStatus: "draft_pending_review",
        });
      }
    }
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");

  if (!dryRun) {
    loadLocalEnv();
  }

  const client = dryRun
    ? null
    : createClient(
        requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false, autoRefreshToken: false } },
      );

  console.info("Checking for existing companies and jobs...");

  if (dryRun) {
    console.info("DRY RUN MODE - No database connection, showing planned actions only");
  }

  const companyIdMap = await processCompanies(client, dryRun);
  await processJobs(client, dryRun, companyIdMap);

  // Write review manifest
  const manifestPath = resolve(
    process.cwd(),
    "scripts/draft-candidates-review-manifest.json",
  );
  const { writeFileSync } = await import("node:fs");
  writeFileSync(manifestPath, JSON.stringify(reviewManifest, null, 2), "utf8");
  console.info(`\nReview manifest written to: ${manifestPath}`);

  console.info("\n=== SUMMARY ===");
  console.info(
    `Companies: ${reviewManifest.companies.filter((c) => c.action === "created").length} created, ${reviewManifest.companies.filter((c) => c.action !== "created").length} duplicates/skipped`,
  );
  console.info(
    `Jobs: ${reviewManifest.jobs.filter((j) => j.action === "created").length} created, ${reviewManifest.jobs.filter((j) => j.action !== "created").length} duplicates/skipped`,
  );
  console.info("\nAll records created with:");
  console.info("  - Companies: verification_status = 'pending'");
  console.info("  - Jobs: status = 'draft', publication_source = 'platform'");
  console.info("  - No verified/approved/published/active/public flags set");
  console.info("  - Logos: null (neutral placeholder until employer provides approved asset)");
  console.info("  - Private review manifest saved for audit trail");
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});