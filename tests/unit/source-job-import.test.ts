import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSourceCompanySlug,
  buildSourceJobSlug,
  htmlToPlainText,
  isWithinSourceWindow,
  normalizeHttpsUrl,
  normalizeSourceDistrict,
  normalizeSourceJobType,
  normalizeSourceWorkplaceMode,
  resolveEmployerLogoUrl,
  selectDiverseSourceJobs,
  slugifySourceText,
  summarizeSourceText,
  type SourceJobRecord,
} from "../../src/features/jobs/source-job-import";

test("slugifySourceText transliterates Turkish characters", () => {
  assert.equal(slugifySourceText("Muhasebe ve Denetim Personeli"), "muhasebe-denetim-personeli");
  assert.equal(slugifySourceText("Garson"), "garson");
  assert.equal(slugifySourceText("İnşaat Mühendisi / Teknikeri"), "insaat-muhendisi-teknikeri");
  assert.equal(slugifySourceText("Şöför & Depo Görevlisi"), "sofor-depo-gorevlisi");
});

test("buildSourceCompanySlug prefixes and clamps the source namespace", () => {
  assert.equal(
    buildSourceCompanySlug("isbulkibris", "Fikri & Co Chartered Accountants"),
    "source-isbulkibris-fikri-co-chartered-accountants",
  );
  const long = buildSourceCompanySlug("iskibris", "A".repeat(200));
  assert.ok(long.length <= 80);
  assert.match(long, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("buildSourceJobSlug produces the slugs the E2E suite links to", () => {
  assert.equal(
    buildSourceJobSlug("iskibris", "Garson", "Parvistamare Development", new Set()),
    "source-iskibris-garson",
  );
  assert.equal(
    buildSourceJobSlug(
      "isbulkibris",
      "Muhasebe ve Denetim Personeli",
      "Fikri & Co Chartered Accountants",
      new Set(),
    ),
    "source-isbulkibris-muhasebe-denetim-personeli",
  );
});

test("buildSourceJobSlug disambiguates collisions deterministically", () => {
  const taken = new Set(["source-iskibris-garson"]);
  const unique = buildSourceJobSlug("iskibris", "Garson", "Zephyr Cafe", taken);
  assert.equal(unique, "source-iskibris-garson-zephyr-cafe");
  taken.add(unique);
  const third = buildSourceJobSlug("iskibris", "Garson", "Zephyr Cafe", taken);
  assert.equal(third, "source-iskibris-garson-zephyr-cafe-2");
});

test("every generated slug satisfies the database slug constraint", () => {
  const samples = ["Garson", "Aşçı Başı (Gece)", "Ön Muhasebe", "Satış Danışmanı - Türkiye"];
  for (const title of samples) {
    const slug = buildSourceJobSlug("isbulkibris", title, "Örnek Şirket", new Set());
    assert.ok(slug.length >= 2 && slug.length <= 100, `length ok for ${title}`);
    assert.match(slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, `pattern ok for ${title}`);
  }
});

test("normalizeSourceDistrict maps aliases to canonical districts", () => {
  assert.equal(normalizeSourceDistrict("Iskele"), "İskele");
  assert.equal(normalizeSourceDistrict("Gazimağusa"), "Mağusa");
  assert.equal(normalizeSourceDistrict("Lefkoşa"), "Lefkoşa");
  assert.equal(normalizeSourceDistrict("Kyrenia"), "Girne");
  assert.equal(normalizeSourceDistrict("Diğer"), null);
  assert.equal(normalizeSourceDistrict(null), null);
});

test("htmlToPlainText flattens markup without leaving entities behind", () => {
  const text = htmlToPlainText(
    "<p>Aranan Nitelikler</p><ul><li>KKTC&#39;de ikamet</li><li>Lise &amp; üzeri</li></ul>",
  );
  assert.ok(text.includes("Aranan Nitelikler"));
  assert.ok(text.includes("KKTC'de ikamet"));
  assert.ok(text.includes("Lise & üzeri"));
  assert.ok(!text.includes("<"));
  assert.ok(!text.includes("&#39;"));
});

test("normalizeSourceJobType recognizes Turkish and English labels", () => {
  assert.equal(normalizeSourceJobType("Tam-Zamanlı"), "full_time");
  assert.equal(normalizeSourceJobType("Yarım-Zamanlı"), "part_time");
  assert.equal(normalizeSourceJobType(["FULL_TIME"]), "full_time");
  assert.equal(normalizeSourceJobType("Serbest"), "freelance");
  assert.equal(normalizeSourceJobType("bilinmeyen"), null);
});

test("normalizeSourceWorkplaceMode prefers explicit remote signals", () => {
  assert.equal(normalizeSourceWorkplaceMode(true, null), "remote");
  assert.equal(normalizeSourceWorkplaceMode(0, "Uzaktan"), "remote");
  assert.equal(normalizeSourceWorkplaceMode(0, "Hibrit"), "hybrid");
  assert.equal(normalizeSourceWorkplaceMode(0, "Iskele"), "on_site");
});

test("summarizeSourceText keeps summaries within the schema bound", () => {
  const summary = summarizeSourceText("kelime ".repeat(200), 260);
  assert.ok(summary.length <= 261);
  assert.ok(summary.endsWith("…"));
});

test("resolveEmployerLogoUrl only allows approved hosts", () => {
  assert.equal(
    resolveEmployerLogoUrl("/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3", "https://api.isbulkibris.com"),
    "https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3",
  );
  assert.equal(
    resolveEmployerLogoUrl(
      "https://innovia-iskibris.s3.eu-west-2.amazonaws.com/49419_635fd4d64828e.png",
      "https://www.iskibris.com",
    ),
    "https://innovia-iskibris.s3.eu-west-2.amazonaws.com/49419_635fd4d64828e.png",
  );
  assert.equal(resolveEmployerLogoUrl("https://evil.example.com/logo.png", "https://www.iskibris.com"), null);
  assert.equal(resolveEmployerLogoUrl(null, "https://www.iskibris.com"), null);
});

test("normalizeHttpsUrl rejects masked and insecure URLs", () => {
  assert.equal(normalizeHttpsUrl("https://www.fikrico.com"), "https://www.fikrico.com/");
  assert.equal(normalizeHttpsUrl("ww*******************om"), null);
  assert.equal(normalizeHttpsUrl("http://example.com"), null);
  assert.equal(normalizeHttpsUrl(""), null);
});

test("isWithinSourceWindow enforces the live visibility window", () => {
  const now = Date.parse("2026-10-28T08:00:00.000Z");
  assert.ok(
    isWithinSourceWindow("2026-10-01T07:53:41.947Z", "2026-10-31T07:53:41.947Z", now),
  );
  assert.ok(
    !isWithinSourceWindow("2026-10-01T07:53:41.947Z", "2026-10-20T07:53:41.947Z", now),
  );
  assert.ok(
    !isWithinSourceWindow("2026-12-01T07:53:41.947Z", "2026-12-31T07:53:41.947Z", now),
  );
});

function sourceJob(overrides: {
  title: string;
  publishedAt: string;
  company: string;
  sector: string | null;
  jobType?: string;
}): SourceJobRecord {
  return {
    source: "iskibris",
    sourceJobId: overrides.title,
    title: overrides.title,
    slug: overrides.title,
    summary: "",
    description: "",
    requirements: "",
    responsibilities: "",
    jobType: (overrides.jobType ?? "full_time") as SourceJobRecord["jobType"],
    workplaceMode: "on_site",
    district: null,
    publishedAt: overrides.publishedAt,
    expiresAt: "2026-12-31T00:00:00.000Z",
    employer: {
      name: overrides.company,
      slug: overrides.company,
      profileDescription: "",
      categories: overrides.sector ? [overrides.sector] : [],
      website: null,
      municipality: null,
      sourceProfileUrl: null,
      logoUrl: null,
    },
  };
}

test("selectDiverseSourceJobs keeps the newest listings up to the limit", () => {
  const jobs = [
    sourceJob({ title: "A", publishedAt: "2026-10-01T00:00:00.000Z", company: "c1", sector: "s1" }),
    sourceJob({ title: "B", publishedAt: "2026-10-03T00:00:00.000Z", company: "c2", sector: "s2" }),
    sourceJob({ title: "C", publishedAt: "2026-10-02T00:00:00.000Z", company: "c3", sector: "s3" }),
  ];
  const picked = selectDiverseSourceJobs(jobs, 2);
  assert.deepEqual(
    picked.map((job) => job.title),
    ["B", "C"],
  );
});

test("selectDiverseSourceJobs spreads listings across employers, sectors and types", () => {
  const jobs = [
    // Newest, but all the same employer/sector/type — only one should win.
    sourceJob({ title: "n1", publishedAt: "2026-10-05T00:00:00.000Z", company: "big", sector: "perakende" }),
    sourceJob({ title: "n2", publishedAt: "2026-10-04T00:00:00.000Z", company: "big", sector: "perakende" }),
    sourceJob({ title: "n3", publishedAt: "2026-10-03T00:00:00.000Z", company: "big", sector: "perakende" }),
    sourceJob({ title: "d1", publishedAt: "2026-10-02T00:00:00.000Z", company: "other", sector: "bilişim", jobType: "part_time" }),
    sourceJob({ title: "d2", publishedAt: "2026-10-01T00:00:00.000Z", company: "third", sector: "sağlık", jobType: "internship" }),
  ];
  const picked = selectDiverseSourceJobs(jobs, 3);
  const companies = picked.map((job) => job.employer.slug);
  assert.equal(new Set(companies).size, 3, "each listing should come from a distinct employer");
  assert.ok(picked.some((job) => job.title === "n1"), "the newest listing must be kept");
  assert.equal(picked.length, 3);
});

test("selectDiverseSourceJobs returns everything when the limit exceeds the catalogue", () => {
  const jobs = [
    sourceJob({ title: "A", publishedAt: "2026-10-01T00:00:00.000Z", company: "c1", sector: "s1" }),
    sourceJob({ title: "B", publishedAt: "2026-10-02T00:00:00.000Z", company: "c2", sector: "s2" }),
  ];
  assert.equal(selectDiverseSourceJobs(jobs, 21).length, 2);
  assert.equal(selectDiverseSourceJobs(jobs, 0).length, 0);
});
