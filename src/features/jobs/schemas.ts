import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { isSupportedEmployerLogoUrl } from "@/features/jobs/logo-url";

export const jobDraftSchema = z.object({
  jobId: z.string().uuid().nullable(),
  companyId: z.string().uuid(),
  title: z.string().trim().min(5).max(140),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().trim().min(20).max(500),
  description: z.string().trim().min(50).max(20_000),
  requirements: z.string().trim().max(10_000),
  responsibilities: z.string().trim().max(10_000),
  jobType: z.enum([
    "full_time",
    "part_time",
    "contract",
    "temporary",
    "internship",
    "freelance",
  ]),
  workplaceMode: z.enum(["on_site", "hybrid", "remote"]),
  district: z.enum(northernCyprusDistrictValues).nullable(),
});

export const jobIdSchema = z.object({ jobId: z.string().uuid() });
export const applicationIdSchema = z.object({ applicationId: z.string().uuid() });
export const publicJobSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const jobPackageSchema = z.object({
  packageId: z.string().uuid().nullable(),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1000),
  maxActiveJobs: z.coerce.number().int().min(1).max(1000),
  jobDurationDays: z.coerce.number().int().min(1).max(365),
  isActive: z.boolean(),
});

export const companyJobPackageAssignmentSchema = z.object({
  companyId: z.string().uuid(),
  packageId: z.string().uuid(),
  durationDays: z.coerce.number().int().min(1).max(3650).nullable(),
});

export const applyToJobSchema = z.object({
  jobId: z.string().uuid(),
  coverLetter: z.string().trim().max(5000),
  shareContactEmail: z.boolean().default(false),
});

export const applicationTransitionSchema = z.object({
  applicationId: z.string().uuid(),
  nextStatus: z.enum([
    "reviewing",
    "shortlisted",
    "rejected",
    "hired",
    "withdrawn",
  ]),
});

export const jobReviewSchema = z
  .object({
    jobId: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reviewNote: z.string().trim().max(1000),
  })
  .refine(
    ({ decision, reviewNote }) => decision !== "rejected" || reviewNote.length > 0,
    { path: ["reviewNote"], message: "A rejection reason is required." },
  );

export const publicJobSearchSchema = z.object({
  query: z.string().trim().max(160).default(""),
  district: z.enum(northernCyprusDistrictValues).nullable().default(null),
  jobType: z
    .enum([
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "internship",
      "freelance",
    ])
    .nullable()
    .default(null),
  workplaceMode: z.enum(["on_site", "hybrid", "remote"]).nullable().default(null),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const publicHttpsUrlSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => new URL(value).protocol === "https:");

const sourceProfileUrlSchema = z
  .string()
  .max(2048)
  .regex(
    /^https:\/\/(?:isbulkibris\.com\/firmalar\/[a-z0-9]+(?:-[a-z0-9]+)*|www\.iskibris\.com\/companies\/\d+)$/,
  );

const sourceLogoUrlSchema = z
  .string()
  .max(2048)
  .refine(isSupportedEmployerLogoUrl);

const sourceListingUrlSchema = z
  .string()
  .max(2048)
  .regex(
    /^https:\/\/(?:isbulkibris\.com\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|www\.iskibris\.com\/jobs\/\d{1,18})$/i,
  );

const nullableSourceProfileUrlSchema = sourceProfileUrlSchema.nullable();
const nullableSourceLogoUrlSchema = z.preprocess(
  (value) =>
    typeof value === "string" && !isSupportedEmployerLogoUrl(value)
      ? null
      : value,
  sourceLogoUrlSchema.nullable(),
);
const nullableSourceListingUrlSchema = sourceListingUrlSchema.nullable();

export const publicJobCompanySchema = z.object({
  company_name: z.string().min(1),
  company_slug: z.string().min(1),
  active_job_count: z.number().int().positive(),
  profile_description: z.string().max(2000).nullable(),
  categories: z.array(z.string().min(1).max(80)).max(12),
  website: publicHttpsUrlSchema.nullable(),
  municipality: z.string().max(120).nullable(),
  source_profile_url: nullableSourceProfileUrlSchema,
  logo_url: nullableSourceLogoUrlSchema,
  source_sites: z.array(z.enum(["iskibris", "isbulkibris"])).min(1),
  source_listing_url: nullableSourceListingUrlSchema,
});

export const publicJobListingSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  title: z.string().min(1),
  slug: publicJobSlugSchema,
  summary: z.string(),
  description: z.string(),
  requirements: z.string(),
  responsibilities: z.string(),
  job_type: z.enum([
    "full_time",
    "part_time",
    "contract",
    "temporary",
    "internship",
    "freelance",
  ]),
  workplace_mode: z.enum(["on_site", "hybrid", "remote"]).nullable(),
  district: z.enum(northernCyprusDistrictValues).nullable(),
  published_at: z.string().min(1),
  expires_at: z.string().min(1),
  publication_source: z.enum(["platform", "source_site"]),
  source_site: z.enum(["iskibris", "isbulkibris"]).nullable(),
  source_listing_url: nullableSourceListingUrlSchema,
  company: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    profile_description: z.string().max(2000).nullable(),
    categories: z.array(z.string().min(1).max(80)).max(12),
    website: publicHttpsUrlSchema.nullable(),
    municipality: z.string().max(120).nullable(),
    source_profile_url: nullableSourceProfileUrlSchema,
    logo_url: nullableSourceLogoUrlSchema,
  }),
});

export const publicJobSearchResultsSchema = z.object({
  jobs: z.array(publicJobListingSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.literal(20),
});

export type PublicJobSearch = z.input<typeof publicJobSearchSchema>;
export type PublicJobSearchFilters = z.output<typeof publicJobSearchSchema>;

export type JobFormState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "saveFailed"
    | "saved"
    | "submitted"
    | "submitFailed"
    | "published"
    | "packageRequired"
    | "packageLimit"
    | "publishFailed";
  jobId?: string;
};

export type JobPackageActionState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "saveFailed"
    | "saved"
    | "assignFailed"
    | "assigned";
};

export type ApplicationFormState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "applyFailed"
    | "applied"
    | "duplicate"
    | "transitionFailed"
    | "updated";
};

export type JobReviewFormState = {
  status: "idle" | "error" | "success";
  message: "idle" | "invalid" | "unauthorized" | "reviewFailed" | "reviewed";
};
