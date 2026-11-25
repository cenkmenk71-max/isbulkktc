import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { jobTypeKeys, type JobTypeKey } from "@/features/jobs/job-type-slugs";

const workplaceModeValues = ["on_site", "hybrid", "remote"] as const;
const jobTypePreferenceSchema = z.union([
  z.literal(""),
  z.custom<JobTypeKey>(
    (value): value is JobTypeKey =>
      typeof value === "string" &&
      jobTypeKeys.some((jobType) => jobType === value),
    { message: "invalid job type" },
  ),
]);

const optionalProfileText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value);

const experienceEntrySchema = z
  .object({
    role: optionalProfileText(140),
    organization: optionalProfileText(160),
    location: optionalProfileText(120),
    startDate: optionalProfileText(32),
    endDate: optionalProfileText(32),
    description: optionalProfileText(1_800),
  })
  .strict();

const educationEntrySchema = z
  .object({
    institution: optionalProfileText(160),
    qualification: optionalProfileText(140),
    field: optionalProfileText(140),
    startDate: optionalProfileText(32),
    endDate: optionalProfileText(32),
    description: optionalProfileText(1_200),
  })
  .strict();

import { LanguageCodeSchema, ProficiencyCodeSchema } from "./language-extraction";

const optionalProficiencyText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value)
    .pipe(ProficiencyCodeSchema);

const languageEntrySchema = z
  .object({
    name: optionalProfileText(80),
    proficiency: optionalProficiencyText(80),
    language_code: LanguageCodeSchema.optional(),
    language_name_localized: optionalProfileText(80).optional(),
  })
  .strict();

const certificationEntrySchema = z
  .object({
    name: optionalProfileText(160),
    issuer: optionalProfileText(160),
    issueDate: optionalProfileText(32),
    expiryDate: optionalProfileText(32),
  })
  .strict();

const linksEntrySchema = z
  .object({
    label: optionalProfileText(120),
    url: optionalProfileText(600),
  })
  .strict();

function removeBlankEntries<T extends Record<string, string>>(entries: T[]): T[] {
  return entries.filter((entry) => Object.values(entry).some(Boolean));
}

const skillsSchema = z
  .string()
  .max(2_600)
  .transform((value) => {
    const unique = new Map<string, string>();

    for (const skill of value
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      const normalized = skill.toLocaleLowerCase("tr-TR");
      if (!unique.has(normalized)) unique.set(normalized, skill);
    }

    return [...unique.values()];
  })
  .pipe(z.array(z.string().min(1).max(60)).max(40));

export const candidateProfileSchema = z.object({
  phone: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullish()
    .transform((value) => value || null),
  jobTypePreference: jobTypePreferenceSchema.default(""),
  workplaceModePreference: z
    .union([z.literal(""), z.enum(workplaceModeValues)])
    .default(""),
  availability: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullish()
    .transform((value) => value || null),
  headline: z
    .string()
    .trim()
    .max(140)
    .transform((value) => value || null),
  location: z
    .string()
    .trim()
    .max(120)
    .transform((value) => value || null)
    .pipe(z.enum(northernCyprusDistrictValues).nullable()),
  skillsText: skillsSchema,
  experience: z
    .array(experienceEntrySchema)
    .max(12)
    .default([])
    .transform(removeBlankEntries),
  education: z
    .array(educationEntrySchema)
    .max(12)
    .default([])
    .transform(removeBlankEntries),
  languages: z
    .array(languageEntrySchema)
    .max(12)
    .default([])
    .transform(removeBlankEntries),
  certifications: z
    .array(certificationEntrySchema)
    .max(12)
    .default([])
    .transform(removeBlankEntries),
  summary: z
    .string()
    .trim()
    .max(2000)
    .transform((value) => value || null),
  cvFullText: z
    .string()
    .max(100_000)
    .nullish()
    .transform((value) => value?.trim() || null),
  links: z
    .array(linksEntrySchema)
    .max(12)
    .default([])
    .transform(removeBlankEntries),
});

export type CandidateExperience = z.infer<typeof experienceEntrySchema>;
export type CandidateEducation = z.infer<typeof educationEntrySchema>;
export type CandidateLanguage = z.infer<typeof languageEntrySchema>;
export type CandidateCertification = z.infer<typeof certificationEntrySchema>;

export type CandidateProfileValues = {
  phone: string | null;
  jobTypePreference: JobTypeKey | "";
  workplaceModePreference: (typeof workplaceModeValues)[number] | "";
  availability: string | null;
  headline: string | null;
  location: string | null;
  skills: string[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  languages: CandidateLanguage[];
  certifications: CandidateCertification[];
  summary: string | null;
  cvFullText: string | null;
  links: { label: string; url: string }[];
};

/**
 * The write shape for the profile form. `fullName` is not part of
 * `candidateProfileSchema` because the name belongs to
 * `public.profiles.display_name`, not `candidate_profiles`.
 *
 * Raw CV text is accepted only by the client-side parsing schema: it may be
 * used transiently for extraction/AI assistance, but it is not part of a
 * profile-save request or the persisted profile. The strict write schema makes
 * that data boundary explicit.
 *
 * The bounds mirror the `display_name` CHECK (`char_length between 2 and 80`
 * and `display_name = btrim(display_name)`).
 */
export const candidateProfileUpdateSchema = candidateProfileSchema
  .omit({ cvFullText: true })
  .extend({
    fullName: z.string().trim().min(2).max(80),
  })
  .strict();

export type CandidateProfileUpdate = z.infer<
  typeof candidateProfileUpdateSchema
>;

export type CandidateProfileFormState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "inactive"
    | "saveFailed"
    | "saved";
};