import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationTransitionSchema,
  applyToJobSchema,
  companyJobPackageAssignmentSchema,
  jobDraftSchema,
  jobPackageSchema,
  jobReviewSchema,
  publicJobCompanySchema,
  publicJobListingSchema,
  publicJobSlugSchema,
  publicJobSearchSchema,
  publicJobSearchResultsSchema,
} from "../../src/features/jobs/schemas";
import {
  parseIskibrisJobDetail,
  parseIskibrisListingCards,
} from "../../src/features/jobs/iskibris-source-parser";
import {
  getDistrictMessageKey,
  getJobTypeMessageKey,
  getWorkplaceModeMessageKey,
} from "../../src/features/jobs/presentation";

const validJob = {
  jobId: null,
  companyId: "10000000-0000-4000-8000-000000000001",
  title: "Senior Product Designer",
  slug: "senior-product-designer",
  summary: "Design useful and accessible digital products for our community.",
  description:
    "Work with our product and engineering teams to plan, design and improve accessible digital services.",
  requirements: "Experience with product design.",
  responsibilities: "Create and test product experiences.",
  jobType: "full_time",
  workplaceMode: "hybrid",
  district: "Girne",
};

test("job drafts trim fields and accept canonical job and district values", () => {
  const result = jobDraftSchema.parse({
    ...validJob,
    title: " Senior Product Designer ",
    slug: " SENIOR-PRODUCT-DESIGNER ",
  });

  assert.equal(result.title, "Senior Product Designer");
  assert.equal(result.slug, "senior-product-designer");
  assert.equal(result.district, "Girne");
});

test("job drafts reject invalid districts, modes, and undersized descriptions", () => {
  assert.equal(
    jobDraftSchema.safeParse({ ...validJob, district: "Alsancak" }).success,
    false,
  );
  assert.equal(
    jobDraftSchema.safeParse({ ...validJob, workplaceMode: "anywhere" }).success,
    false,
  );
  assert.equal(
    jobDraftSchema.safeParse({ ...validJob, description: "Too short" }).success,
    false,
  );
});

test("job reviews require a reason for rejection", () => {
  const jobId = "30000000-0000-4000-8000-000000000001";

  assert.equal(
    jobReviewSchema.safeParse({
      jobId,
      decision: "rejected",
      reviewNote: " ",
    }).success,
    false,
  );
  assert.equal(
    jobReviewSchema.safeParse({
      jobId,
      decision: "approved",
      reviewNote: "",
    }).success,
    true,
  );
});

test("application input rejects malformed ids and overlong cover letters", () => {
  assert.equal(
    applyToJobSchema.safeParse({
      jobId: "not-a-uuid",
      coverLetter: "",
    }).success,
    false,
  );
  assert.equal(
    applyToJobSchema.safeParse({
      jobId: "30000000-0000-4000-8000-000000000001",
      coverLetter: "x".repeat(5001),
    }).success,
    false,
  );
});

test("application transitions accept only named workflow states", () => {
  const applicationId = "40000000-0000-4000-8000-000000000001";

  assert.equal(
    applicationTransitionSchema.safeParse({
      applicationId,
      nextStatus: "shortlisted",
    }).success,
    true,
  );
  assert.equal(
    applicationTransitionSchema.safeParse({
      applicationId,
      nextStatus: "paid",
    }).success,
    false,
  );
});

test("live source job cards preserve real employer logo URLs", () => {
  const cards = parseIskibrisListingCards(`
    <a class="job-card" href="/jobs/25842?&amp;slug=jobs-in-nicosia">
      <img
        src="https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8-thumb@40.png"
        srcSet="https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8-thumb@40.png 40w, https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8-thumb.png 600w"
        alt="WTE logo"
      />
      <p class="job-card__title">Atık Su Operatörü</p>
      <span class="job-card__subtitle"><span>WTE WASSERTECHNIK GMBH</span></span>
    </a>
  `);

  assert.deepEqual(cards, [
    {
      id: "25842",
      title: "Atık Su Operatörü",
      companyName: "WTE WASSERTECHNIK GMBH",
      logoUrl:
        "https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8.png",
    },
  ]);
});

test("source job detail uses real content, publication dates, expiry and full-resolution logo", () => {
  const detail = {
    id: 25842,
    title: "Atık Su Operatörü",
    body: "<tr><p>Arıtma tesisinde operatör olarak görev yapacak aday aranıyor.</p><p>Teknik okul mezunu olmak.</p></tr>",
    active: 1,
    archived: 0,
    deleted_at: null,
    status: "active",
    published_at: "2026-10-20T09:00:00.000Z",
    endDate: "2026-11-20T09:00:00.000Z",
    employment_name: "Tam-Zamanlı",
    place_name_tr: "Lefkoşa",
    company_logo:
      "https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8.png",
    company: {
      name: "WTE WASSERTECHNIK GMBH",
      logo: "https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8.png",
    },
    is_published: 1,
    metadata: JSON.stringify({ expires_at: "2026-11-20T09:00:00.000Z" }),
  };
  const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { job: detail } },
  })}</script>`;

  assert.deepEqual(
    parseIskibrisJobDetail(html, "25842", Date.parse("2026-10-26T12:00:00.000Z")),
    {
      id: 25842,
      title: "Atık Su Operatörü",
      companyName: "WTE WASSERTECHNIK GMBH",
      companyLogoUrl:
        "https://innovia-iskibris.s3.eu-west-2.amazonaws.com/12431_6aa9126ead0b8.png",
      description:
        "Arıtma tesisinde operatör olarak görev yapacak aday aranıyor. Teknik okul mezunu olmak.",
      jobType: "full_time",
      district: "Lefkoşa",
      publishedAt: "2026-10-20T09:00:00.000Z",
      expiresAt: "2026-11-20T09:00:00.000Z",
      workplaceMode: null,
    },
  );
});

test("source job detail rejects expired, unpublished, malformed and unclassified listings", () => {
  const baseJob = {
    id: 101,
    title: "Muhasebe Uzmanı",
    body: "<tr><p>Gerçek ilan açıklaması.</p></tr>",
    active: 1,
    archived: 0,
    deleted_at: null,
    status: "active",
    published_at: "2026-10-20T09:00:00.000Z",
    endDate: "2026-11-20T09:00:00.000Z",
    employment_name: "Tam-Zamanlı",
    place_name_tr: "Girne",
    company: { name: "Örnek Ltd.", logo: null },
    is_published: 1,
  };
  const makeHtml = (job: Record<string, unknown>) =>
    `<script id="__NEXT_DATA__">${JSON.stringify({
      props: { pageProps: { job } },
    })}</script>`;
  const now = Date.parse("2026-10-26T12:00:00.000Z");

  assert.equal(
    parseIskibrisJobDetail(
      makeHtml({ ...baseJob, endDate: "2026-10-25T09:00:00.000Z" }),
      "101",
      now,
    ),
    null,
  );
  assert.equal(
    parseIskibrisJobDetail(makeHtml({ ...baseJob, is_published: 0 }), "101", now),
    null,
  );
  assert.equal(
    parseIskibrisJobDetail(
      makeHtml({ ...baseJob, employment_name: "Bilinmeyen" }),
      "101",
      now,
    ),
    null,
  );
  assert.equal(
    parseIskibrisJobDetail(makeHtml(baseJob), "999", now),
    null,
  );
});

test("public job search applies safe defaults and bounds pagination", () => {
  assert.deepEqual(
    publicJobSearchSchema.parse({}),
    {
      query: "",
      district: null,
      jobType: null,
      workplaceMode: null,
      page: 1,
    },
  );
  assert.equal(publicJobSearchSchema.safeParse({ page: 0 }).success, false);
  assert.equal(
    publicJobSearchSchema.safeParse({ query: "x".repeat(161) }).success,
    false,
  );
  assert.equal(
    publicJobSearchSchema.safeParse({
      query: "designer",
      district: "Girne",
      jobType: "full_time",
      workplaceMode: "hybrid",
      page: "2",
    }).success,
    true,
  );
  assert.equal(
    publicJobSearchSchema.safeParse({ district: "Alsancak" }).success,
    false,
  );
  assert.equal(
    publicJobSearchSchema.safeParse({ jobType: "any" }).success,
    false,
  );
});

test("public job slugs are normalized and reject invalid path values", () => {
  assert.equal(
    publicJobSlugSchema.parse("  SENIOR-DESIGNER  "),
    "senior-designer",
  );
  assert.equal(publicJobSlugSchema.safeParse("../admin").success, false);
  assert.equal(publicJobSlugSchema.safeParse("a").success, false);
});

test("public job RPC results are validated as narrow listing DTOs", () => {
  const listing = {
    id: "30000000-0000-4000-8000-000000000001",
    company_id: "20000000-0000-4000-8000-000000000001",
    title: "Product Designer",
    slug: "product-designer",
    summary: "Design accessible digital products for people across North Cyprus.",
    description:
      "We are looking for a product designer to work with our multidisciplinary team on accessible digital products.",
    requirements: "",
    responsibilities: "",
    job_type: "full_time",
    workplace_mode: "hybrid",
    district: "Lefkoşa",
    published_at: "2026-10-20T12:00:00+00:00",
    expires_at: "2026-11-20T12:00:00+00:00",
    modified_at: "2026-10-22T09:30:00+00:00",
    publication_source: "platform",
    source_site: null,
    source_listing_url: null,
    company: {
      id: "20000000-0000-4000-8000-000000000001",
      name: "Verified Company A",
      slug: "verified-company-a",
      profile_description: null,
      categories: [],
      website: null,
      municipality: null,
      source_profile_url: null,
      logo_url: null,
    },
  };

  assert.equal(publicJobListingSchema.safeParse(listing).success, true);
  assert.equal(
    publicJobListingSchema.safeParse({
      ...listing,
      publication_source: "source_site",
      source_site: "isbulkibris",
    }).success,
    true,
  );
  assert.equal(
    publicJobListingSchema.safeParse({ ...listing, district: "Alsancak" }).success,
    false,
  );
  assert.equal(
    publicJobListingSchema.safeParse({
      ...listing,
      publication_source: "source_site",
      source_site: "unknown",
    }).success,
    false,
  );
  const sourceListing = {
    ...listing,
    publication_source: "source_site" as const,
    source_site: "isbulkibris" as const,
    source_listing_url:
      "https://isbulkibris.com/jobs/c00a43be-59a3-49ba-b4de-eab4268f8256",
    company: {
      ...listing.company,
      profile_description: "A public source employer profile.",
      categories: ["Muhasebe & Denetim"],
      website: "https://example.test/",
      municipality: "Lefkoşa",
      source_profile_url:
        "https://isbulkibris.com/firmalar/fikri-co-chartered-accountants",
      logo_url:
        "https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3",
    },
  };
  assert.equal(publicJobListingSchema.safeParse(sourceListing).success, true);
  assert.equal(
    publicJobListingSchema.parse({
      ...sourceListing,
      company: {
        ...sourceListing.company,
        logo_url: "https://attacker.example/logo.png",
      },
    }).company.logo_url,
    null,
  );
  assert.equal(
    publicJobListingSchema.parse({
      ...sourceListing,
      company: {
        ...sourceListing.company,
        logo_url: "https://example.com/assets/images/placeholder-company.png",
      },
    }).company.logo_url,
    null,
  );
  assert.equal(
    publicJobListingSchema.safeParse({
      ...sourceListing,
      company: {
        ...sourceListing.company,
        source_profile_url: "https://attacker.example/company",
      },
    }).success,
    false,
  );
  assert.equal(
    publicJobListingSchema.safeParse({
      ...sourceListing,
      source_listing_url: "https://isbulkibris.com/jobs",
    }).success,
    false,
  );
  assert.equal(
    publicJobCompanySchema.safeParse({
      company_name: "Fikri & Co Chartered Accountants",
      company_slug: "source-isbulkibris-fikri-co",
      active_job_count: 1,
      profile_description: "A public source employer profile.",
      categories: ["Muhasebe & Denetim"],
      website: "https://example.test/",
      municipality: "Lefkoşa",
      source_profile_url: sourceListing.company.source_profile_url,
      logo_url: sourceListing.company.logo_url,
      source_sites: ["isbulkibris"],
      source_listing_url: sourceListing.source_listing_url,
    }).success,
    true,
  );
  assert.equal(
    publicJobCompanySchema.safeParse({
      company_name: "Invalid source",
      company_slug: "invalid-source",
      active_job_count: 1,
      profile_description: null,
      categories: [],
      website: "http://insecure.example",
      municipality: null,
      source_profile_url: null,
      logo_url: null,
      source_sites: ["isbulkibris"],
      source_listing_url: null,
    }).success,
    false,
  );
  assert.equal(
    publicJobSearchResultsSchema.safeParse({
      jobs: [listing],
      total: 1,
      page: 1,
      pageSize: 20,
    }).success,
    true,
  );
  assert.equal(
    publicJobSearchResultsSchema.safeParse({
      jobs: [listing],
      total: -1,
      page: 1,
      pageSize: 20,
    }).success,
    false,
  );
});

test("published job presentation values map only supported search filters", () => {
  assert.equal(getJobTypeMessageKey("full_time"), "jobTypes.full_time");
  assert.equal(getWorkplaceModeMessageKey("hybrid"), "workplaceModes.hybrid");
  assert.equal(getDistrictMessageKey("Mağusa"), "districts.magusa");
  assert.throws(() => getJobTypeMessageKey("unlisted"));
  assert.throws(() => getWorkplaceModeMessageKey("anywhere"));
  assert.throws(() => getDistrictMessageKey("Alsancak"));
});

test("job packages validate server-enforced posting limits", () => {
  const parsed = jobPackageSchema.parse({
    packageId: null,
    code: " Starter-Plan ",
    displayName: " Starter ",
    description: "A configurable package.",
    maxActiveJobs: "3",
    jobDurationDays: "30",
    isActive: true,
  });

  assert.equal(parsed.code, "starter-plan");
  assert.equal(parsed.displayName, "Starter");
  assert.equal(parsed.maxActiveJobs, 3);
  assert.equal(parsed.jobDurationDays, 30);
  assert.equal(
    jobPackageSchema.safeParse({
      ...parsed,
      maxActiveJobs: 0,
    }).success,
    false,
  );
});

test("company package assignments accept explicit finite or indefinite terms", () => {
  const base = {
    companyId: "10000000-0000-4000-8000-000000000001",
    packageId: "20000000-0000-4000-8000-000000000001",
  };

  assert.equal(
    companyJobPackageAssignmentSchema.safeParse({
      ...base,
      durationDays: null,
    }).success,
    true,
  );
  assert.equal(
    companyJobPackageAssignmentSchema.safeParse({
      ...base,
      durationDays: "3650",
    }).success,
    true,
  );
  assert.equal(
    companyJobPackageAssignmentSchema.safeParse({
      ...base,
      durationDays: "0",
    }).success,
    false,
  );
});
