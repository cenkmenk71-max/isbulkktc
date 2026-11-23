import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { trLowercase } from "@/lib/tr-lowercase";
import { LanguageCodeSchema, ProficiencyCodeSchema } from "./language-extraction";

const KKTC_DRIVING_LICENSE_CLASSES = [
  "A1",
  "A2",
  "A",
  "B1",
  "B",
  "BE",
  "C1",
  "C1E",
  "C",
  "CE",
  "D1",
  "D1E",
  "D",
  "DE",
  "F",
  "G",
  "M",
  "T",
] as const;

const EDUCATION_LEVELS = [
  "high_school",
  "associate",
  "bachelor",
  "master",
  "phd",
  "other",
] as const;

const EXPERIENCE_SECTORS = [
  "technology",
  "finance",
  "healthcare",
  "education",
  "construction",
  "manufacturing",
  "retail",
  "hospitality",
  "transportation",
  "real_estate",
  "legal",
  "marketing",
  "human_resources",
  "administration",
  "engineering",
  "science",
  "arts",
  "non_profit",
  "government",
  "agriculture",
  "energy",
  "telecommunications",
  "media",
  "consulting",
  "other",
] as const;

const SKILL_CATEGORIES = [
  "technical",
  "software",
  "tools",
  "language",
  "management",
  "design",
  "marketing",
  "sales",
  "finance",
  "legal",
  "engineering",
  "science",
  "medical",
  "education",
  "creative",
  "other",
] as const;

const CEFR_LEVELS = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
  "native",
] as const;

const MARITAL_STATUSES = [
  "single",
  "married",
  "divorced",
  "widowed",
  "prefer_not_to_say",
] as const;

const GENDERS = [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
] as const;

const COMPANY_TYPES = [
  "LTD",
  "ANONIM",
  "KOLLEKTIF",
  "KOMANDIT",
  "SAHIS",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null);

const optionalTextRequired = (max: number) =>
  z.string().trim().min(1).max(max);

const isoDateString = z
  .string()
  .refine(
    (val) =>
      val === "" ||
      /^\d{4}(-\d{2}(-\d{2})?)?$/.test(val),
    {
      message: "Invalid date format. Expected YYYY-MM-DD.",
    }
  )
  .transform((v) => v || null);

const yearString = z
  .string()
  .regex(/^\d{4}$/)
  .transform((v) => v || null);

const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/)
  .transform((v) => v || null);

const tcNoSchema = z
  .string()
  .regex(/^[1-9]\d{10}$/)
  .transform((v) => v || null);

const passportSchema = z
  .string()
  .regex(/^[A-Z0-9]{6,9}$/)
  .transform((v) => v || null);

const urlSchema = z
  .string()
  .url()
  .max(2048)
  .transform((v) => v || null);

const removeBlankEntries = <T extends Record<string, unknown>>(entries: T[]): T[] =>
  entries.filter((e) => Object.values(e).some((v) => v !== null && v !== ""));

const experienceEntrySchema = z
  .object({
    company: z.string().max(160).optional(),
    role: z.string().trim().max(140).optional(),
    sector: z.enum(EXPERIENCE_SECTORS).optional(),
    district: z.enum(northernCyprusDistrictValues).or(z.literal("")).optional(),
    startDate: isoDateString.nullable(),
    endDate: isoDateString.nullable().optional().or(z.literal("")),
    isCurrent: z.boolean().default(false),
    description: optionalText(1800),
    achievements: z.array(optionalTextRequired(500)).max(10).default([]),
  })
  .strict()
  .refine(
    (data) => true,
    { message: "endDate required when not current", path: ["endDate"] }
  );

const internshipEntrySchema = z
  .object({
    company: z.string().max(160).optional(),
    role: z.string().trim().max(140).optional(),
    startDate: isoDateString.nullable(),
    endDate: isoDateString.nullable().optional().or(z.literal("")),
    isCurrent: z.boolean().default(false),
    description: optionalText(1200),
  })
  .strict()
  .refine(
    (data) => true,
    { message: "endDate required when not current", path: ["endDate"] }
  );

const educationEntrySchema = z
  .object({
    level: z.enum(EDUCATION_LEVELS),
    institution: optionalTextRequired(160),
    department: optionalTextRequired(140),
    degree: optionalText(140),
    startYear: yearString.nullable(),
    endYear: yearString.nullable().optional(),
    gpa: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/).optional(),
    isOngoing: z.boolean().default(false),
    location: optionalText(120),
  })
  .strict()
  .refine(
    (data) => data.isOngoing || data.endYear !== null,
    { message: "endYear required when not ongoing", path: ["endYear"] }
  );

const skillEntrySchema = z
  .object({
    name: optionalTextRequired(60),
    category: z.enum(SKILL_CATEGORIES).optional(),
    proficiency: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  })
  .strict();

const languageEntrySchema = z
  .object({
    language: z.enum([
      "tr",
      "en",
      "de",
      "fr",
      "ru",
      "el",
      "fa",
      "ar",
      "es",
      "it",
      "zh",
      "other",
    ]),
    proficiency: z.enum(CEFR_LEVELS),
    language_name_localized: optionalText(80).optional(),
  })
  .strict();

const certificationEntrySchema = z
  .object({
    name: optionalTextRequired(160),
    issuer: optionalTextRequired(160),
    issueDate: isoDateString,
    expiryDate: isoDateString.optional(),
    credentialId: optionalText(120).optional(),
    credentialUrl: urlSchema.optional(),
  })
  .strict();

const courseEntrySchema = z
  .object({
    name: optionalTextRequired(160),
    provider: optionalTextRequired(160),
    startDate: isoDateString.nullable(),
    endDate: isoDateString.nullable().optional().or(z.literal("")),
    hours: z.number().int().positive().max(5000).optional(),
    certificateUrl: urlSchema.optional(),
  })
  .strict();

const projectEntrySchema = z
  .object({
    name: optionalTextRequired(160),
    role: z.string().trim().max(140).optional(),
    startDate: isoDateString.nullable(),
    endDate: isoDateString.nullable().optional().or(z.literal("")),
    isCurrent: z.boolean().default(false),
    description: optionalText(1800),
    url: urlSchema.optional(),
    technologies: z.array(optionalTextRequired(60)).max(20).default([]),
  })
  .strict();

const publicationEntrySchema = z
  .object({
    title: optionalTextRequired(200),
    type: z.enum(["article", "book", "patent", "conference", "thesis", "other"]),
    date: isoDateString,
    url: urlSchema.optional(),
    coAuthors: z.array(optionalTextRequired(120)).max(20).default([]),
  })
  .strict();

const awardEntrySchema = z
  .object({
    name: optionalTextRequired(160),
    issuer: optionalTextRequired(160),
    date: isoDateString,
    description: optionalText(1000),
  })
  .strict();

const volunteerEntrySchema = z
  .object({
    organization: optionalTextRequired(160),
    role: z.string().trim().max(140).optional(),
    startDate: isoDateString.nullable(),
    endDate: isoDateString.nullable().optional().or(z.literal("")),
    isCurrent: z.boolean().default(false),
    description: optionalText(1200),
  })
  .strict();

const referenceEntrySchema = z
  .object({
    name: optionalTextRequired(120),
    title: optionalTextRequired(120),
    company: z.string().max(160).optional(),
    phone: e164Phone.optional(),
    email: z.email().optional(),
    relation: optionalTextRequired(120),
  })
  .strict();

const linksEntrySchema = z
  .object({
    label: optionalTextRequired(120),
    url: urlSchema,
  })
  .strict();

const skillsTextSchema = z
  .string()
  .max(2600)
  .transform((value) => {
    const unique = new Map<string, string>();
    for (const skill of value
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      const normalized = trLowercase(skill);
      if (!unique.has(normalized)) unique.set(normalized, skill);
    }
    return [...unique.values()];
  })
  .pipe(z.array(z.string().min(1).max(60)).max(40));

export const candidateProfileSchema = z.object({
  headline: optionalText(140),
  location: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null)
    .pipe(z.enum(northernCyprusDistrictValues).nullable()),
  skillsText: skillsTextSchema,
    experience: z
      .array(experienceEntrySchema)
      .max(10)
      .default([])
    .transform(removeBlankEntries),
  internships: z
    .array(internshipEntrySchema)
    .max(10)
    .default([])
    .transform(removeBlankEntries),
  education: z
    .array(educationEntrySchema)
    .max(15)
    .default([])
    .transform(removeBlankEntries),
  skills: z
    .array(skillEntrySchema)
    .max(60)
    .default([])
    .transform(removeBlankEntries),
  languages: z
    .array(languageEntrySchema)
    .max(15)
    .default([])
    .transform(removeBlankEntries),
  certifications: z
    .array(certificationEntrySchema)
    .max(20)
    .default([])
    .transform(removeBlankEntries),
  courses: z
    .array(courseEntrySchema)
    .max(20)
    .default([])
    .transform(removeBlankEntries),
  projects: z
    .array(projectEntrySchema)
    .max(20)
    .default([])
    .transform(removeBlankEntries),
  publications: z
    .array(publicationEntrySchema)
    .max(15)
    .default([])
    .transform(removeBlankEntries),
  awards: z
    .array(awardEntrySchema)
    .max(15)
    .default([])
    .transform(removeBlankEntries),
  volunteer: z
    .array(volunteerEntrySchema)
    .max(10)
    .default([])
    .transform(removeBlankEntries),
  references: z
    .array(referenceEntrySchema)
    .max(5)
    .default([])
    .transform(removeBlankEntries),
    summary: optionalText(2000),
  cvFullText: z.string().max(100_000).nullish().transform((v) => v?.trim() || null),
  links: z
    .array(linksEntrySchema)
    .max(15)
    .default([])
    .transform(removeBlankEntries),
});

export type CandidateExperience = z.infer<typeof experienceEntrySchema>;
export type CandidateInternship = z.infer<typeof internshipEntrySchema>;
export type CandidateEducation = z.infer<typeof educationEntrySchema>;
export type CandidateSkill = z.infer<typeof skillEntrySchema>;
export type CandidateLanguage = z.infer<typeof languageEntrySchema>;
export type CandidateCertification = z.infer<typeof certificationEntrySchema>;
export type CandidateCourse = z.infer<typeof courseEntrySchema>;
export type CandidateProject = z.infer<typeof projectEntrySchema>;
export type CandidatePublication = z.infer<typeof publicationEntrySchema>;
export type CandidateAward = z.infer<typeof awardEntrySchema>;
export type CandidateVolunteer = z.infer<typeof volunteerEntrySchema>;
export type CandidateReference = z.infer<typeof referenceEntrySchema>;

export type CandidateProfileValues = {
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  tcNo: string | null;
  passportNo: string | null;
  maritalStatus: string | null;
  drivingLicense: string | null;
  addressLine: string | null;
  district: string | null;
  municipality: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  linkedIn: string | null;
  github: string | null;
  portfolio: string | null;
  headline: string | null;
  location: string | null;
  skillsText: string[];
  experience: CandidateExperience[];
  internships: CandidateInternship[];
  education: CandidateEducation[];
  skills: CandidateSkill[];
  languages: CandidateLanguage[];
  certifications: CandidateCertification[];
  courses: CandidateCourse[];
  projects: CandidateProject[];
  publications: CandidatePublication[];
  awards: CandidateAward[];
  volunteer: CandidateVolunteer[];
  references: CandidateReference[];
  summary: string | null;
  cvFullText: string | null;
  links: { label: string; url: string }[];
};

export const candidateProfileUpdateSchema = candidateProfileSchema
  .omit({ cvFullText: true })
  .extend({
    firstName: z.string().trim().min(1).max(40),
    middleName: z.string().trim().max(40).optional(),
    lastName: z.string().trim().min(1).max(40),
    dateOfBirth: isoDateString.optional(),
    gender: z.enum(GENDERS).optional(),
    nationality: z.string().length(2).optional(),
    tcNo: tcNoSchema.optional(),
    passportNo: passportSchema.optional(),
    maritalStatus: z.enum(MARITAL_STATUSES).optional(),
    drivingLicense: z.enum(KKTC_DRIVING_LICENSE_CLASSES).optional(),
    addressLine: z.string().trim().max(240).optional(),
    district: z.enum(northernCyprusDistrictValues).or(z.literal("")).optional(),
    municipality: z.string().trim().max(120).optional(),
    postalCode: z.string().regex(/^\d{5}$/).optional(),
    phone: e164Phone.optional(),
    email: z.email().optional(),
    linkedIn: urlSchema.optional(),
    github: urlSchema.optional(),
    portfolio: urlSchema.optional(),
  })
  .strict();

export type CandidateProfileUpdate = z.infer<typeof candidateProfileUpdateSchema>;

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