import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";

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

const languageEntrySchema = z
  .object({
    name: optionalProfileText(80),
    proficiency: optionalProfileText(80),
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
});

export type CandidateExperience = z.infer<typeof experienceEntrySchema>;
export type CandidateEducation = z.infer<typeof educationEntrySchema>;
export type CandidateLanguage = z.infer<typeof languageEntrySchema>;
export type CandidateCertification = z.infer<typeof certificationEntrySchema>;

export type CandidateProfileValues = {
  headline: string | null;
  location: string | null;
  skills: string[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  languages: CandidateLanguage[];
  certifications: CandidateCertification[];
};

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
