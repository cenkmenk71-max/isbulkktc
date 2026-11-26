import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { ProficiencyCodeSchema } from "@/features/candidates/language-extraction";
import { mapProficiencyToCEFR } from "@/features/candidates/cefr-alignment";

const text = (max: number) =>
  z.string().max(max).nullish().transform((v) => v ?? "").catch("");

const date = z
  .string()
  .max(7)
  .regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/)
  .nullish()
  .transform((v) => v ?? "")
  .catch("");

const experienceSchema = z
  .object({
    role: text(140),
    organization: text(160),
    location: text(120),
    startDate: date,
    endDate: date,
    description: text(1_800),
  })
  .catchall(z.unknown())
  .transform((obj) => ({
    role: obj.role ?? "",
    organization: obj.organization ?? "",
    location: obj.location ?? "",
    startDate: obj.startDate ?? "",
    endDate: obj.endDate ?? "",
    description: obj.description ?? "",
  }));

const educationSchema = z
  .object({
    institution: text(160),
    qualification: text(140),
    field: text(140),
    startDate: date,
    endDate: date,
    description: text(1_200),
  })
  .catchall(z.unknown())
  .transform((obj) => ({
    institution: obj.institution ?? "",
    qualification: obj.qualification ?? "",
    field: obj.field ?? "",
    startDate: obj.startDate ?? "",
    endDate: obj.endDate ?? "",
    description: obj.description ?? "",
  }));

const languageSchema = z
  .object({
    name: z.string().min(1).max(80).nullish().transform((v) => v ?? "").catch(""),
    proficiency: ProficiencyCodeSchema.nullish().transform((v) => v ?? "B1").catch("B1"),
  })
  .catchall(z.unknown())
  .transform((obj) => ({
    name: obj.name ?? "",
    proficiency: obj.proficiency ?? "B1",
  }));

const certificationSchema = z
  .object({
    name: text(160),
    issuer: text(160),
    issueDate: date,
    expiryDate: date,
  })
  .catchall(z.unknown())
  .transform((obj) => ({
    name: obj.name ?? "",
    issuer: obj.issuer ?? "",
    issueDate: obj.issueDate ?? "",
    expiryDate: obj.expiryDate ?? "",
  }));

const linkSchema = z
  .object({
    label: text(120),
    url: text(600),
  })
  .catchall(z.unknown())
  .transform((obj) => ({
    label: obj.label ?? "",
    url: obj.url ?? "",
  }));

const baseParserOutputSchema = z.object({
  headline: z.string().max(140).nullish().transform((v) => v ?? null).catch(null),
  location: z.enum(northernCyprusDistrictValues).nullish().transform((v) => v ?? null).catch(null),
  skills: z.array(z.string().max(60)).max(40).catch([]),
  experience: z.array(experienceSchema).max(12).catch([]),
  education: z.array(educationSchema).max(12).catch([]),
  languages: z.array(languageSchema).max(12).catch([]),
  certifications: z.array(certificationSchema).max(12).catch([]),
  summary: z.string().max(2_000).nullish().transform((v) => v ?? null).catch(null),
  links: z.array(linkSchema).max(12).catch([]),
}).catchall(z.unknown());

export const cvParserOutputSchema = baseParserOutputSchema.transform((obj) => ({
  headline: obj.headline ?? null,
  location: obj.location ?? null,
  skills: obj.skills ?? [],
  experience: obj.experience ?? [],
  education: obj.education ?? [],
  languages: obj.languages ?? [],
  certifications: obj.certifications ?? [],
  summary: obj.summary ?? null,
  links: obj.links ?? [],
}));

const baseResumeDraftSchema = baseParserOutputSchema.extend({
  cvFullText: z.string().max(100_000).nullish().transform((v) => v ?? null).catch(null),
});

export const cvResumeDraftSchema = baseResumeDraftSchema.transform((obj) => ({
  headline: obj.headline ?? null,
  location: obj.location ?? null,
  skills: obj.skills ?? [],
  experience: obj.experience ?? [],
  education: obj.education ?? [],
  languages: obj.languages ?? [],
  certifications: obj.certifications ?? [],
  summary: obj.summary ?? null,
  links: obj.links ?? [],
  cvFullText: obj.cvFullText ?? null,
}));

// JSON schema for Gemini API - use the base schema without transforms
const jsonSchemaBase = z.object({
  headline: z.string().max(140).nullable(),
  location: z.enum(northernCyprusDistrictValues).nullable(),
  skills: z.array(z.string().max(60)).max(40),
  experience: z.array(
    z.object({
      role: z.string().max(140),
      organization: z.string().max(160),
      location: z.string().max(120),
      startDate: z.string().max(7).regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/),
      endDate: z.string().max(7).regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/),
      description: z.string().max(1_800),
    })
  ).max(12),
  education: z.array(
    z.object({
      institution: z.string().max(160),
      qualification: z.string().max(140),
      field: z.string().max(140),
      startDate: z.string().max(7).regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/),
      endDate: z.string().max(7).regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/),
      description: z.string().max(1_200),
    })
  ).max(12),
  languages: z.array(
    z.object({
      name: z.string().min(1).max(80),
      proficiency: ProficiencyCodeSchema,
    })
  ).max(12),
  certifications: z.array(
    z.object({
      name: z.string().max(160),
      issuer: z.string().max(160),
      issueDate: z.string().max(7).regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/),
      expiryDate: z.string().max(7).regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/),
    })
  ).max(12),
  summary: z.string().max(2_000).nullable(),
  links: z.array(
    z.object({
      label: z.string().max(120),
      url: z.string().max(600),
    })
  ).max(12),
});

export type CVParserOutput = z.infer<typeof cvParserOutputSchema>;
export type CVResumeDraft = z.infer<typeof cvResumeDraftSchema>;

export const cvParserJsonSchema = z.toJSONSchema(jsonSchemaBase);

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(record: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
}

// Splits "2019 - 2023", "2019/2023", "2019 to 2023" into start/end. A lone
// year becomes the start date only.
function splitPeriod(value: string): { start: string; end: string } {
  const parts = value.split(/[-–—/]| to /i).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { start: "", end: "" };
  if (parts.length === 1) return { start: parts[0], end: "" };
  return { start: parts[0], end: parts[1] };
}

// Splits "Türkçe (Anadil)" / "İngilizce - İleri" into { name, level }.
function splitLanguageNameLevel(value: string): { name: string; level: string } {
  const match = value.match(/^\s*(.*?)\s*[\(\[\-–—/]\s*([^\]\)]+?)\s*[\]\)]?\s*$/);
  if (!match) return { name: value.trim(), level: "" };
  return { name: match[1].trim(), level: match[2].trim() };
}

/**
 * Tolerant field normalization for AI CV JSON before Zod validation.
 *
 * AI models often return synonym keys instead of the canonical schema keys
 * (`position` instead of `role`, `university` instead of `institution`,
 * `language` instead of `name`, plain string arrays for languages/certifications,
 * a single `period` string instead of `startDate`/`endDate`, or a multi-line
 * `highlights` string instead of `description`). This normalizes every known
 * synonym into the canonical shape so Zod accepts payloads the strict schema
 * would otherwise reject. Unknown keys pass through unchanged; arrays that are
 * not arrays pass through unchanged so Zod's `.catch([])` handles them.
 */
export function normalizeRawAiCvPayload(raw: unknown): unknown {
  if (!isJsonRecord(raw)) return raw;

  const result: JsonRecord = { ...raw };

  if (Array.isArray(raw.experience)) {
    result.experience = raw.experience.map((entry) => {
      if (!isJsonRecord(entry)) return entry;
      const period = pickString(entry, ["period", "dates", "duration"]);
      const { start, end } = period
        ? splitPeriod(period)
        : {
            start: pickString(entry, ["startDate"]),
            end: pickString(entry, ["endDate"]),
          };
      const highlights = entry.highlights ?? entry.description ?? entry.summary;
      const description =
        typeof highlights === "string"
          ? highlights.split(/\n/).filter(Boolean).join("\n")
          : String(highlights ?? "");
      return {
        role: pickString(entry, ["role", "title", "position", "job_title"]),
        organization: pickString(entry, ["company", "organization", "employer"]),
        location: pickString(entry, ["location"]),
        startDate: start,
        endDate: end,
        description,
      };
    });
  }

  if (Array.isArray(raw.education)) {
    result.education = raw.education.map((entry) => {
      if (!isJsonRecord(entry)) return entry;
      const year = pickString(entry, ["year", "period", "dates", "graduationYear"]);
      const { start, end } = year
        ? splitPeriod(year)
        : {
            start: pickString(entry, ["startDate"]),
            end: pickString(entry, ["endDate"]),
          };
      return {
        institution: pickString(entry, ["school", "institution", "university"]),
        qualification: pickString(entry, ["qualification", "degree", "title", "department", "program"]),
        field: pickString(entry, ["field"]),
        startDate: start,
        endDate: end,
        description: pickString(entry, ["description"]),
      };
    });
  }

  if (Array.isArray(raw.languages)) {
    result.languages = raw.languages.map((entry) => {
      if (typeof entry === "string") {
        const { name, level } = splitLanguageNameLevel(entry);
        return { name, proficiency: mapProficiencyToCEFR(level || name) };
      }
      if (!isJsonRecord(entry)) return entry;
      return {
        name: pickString(entry, ["name", "language", "title"]),
        proficiency: mapProficiencyToCEFR(
          pickString(entry, ["proficiency", "level", "fluency"]),
        ),
      };
    });
  }

  if (Array.isArray(raw.certifications)) {
    result.certifications = raw.certifications.map((entry) => {
      if (typeof entry === "string")
        return { name: entry, issuer: "", issueDate: "", expiryDate: "" };
      if (!isJsonRecord(entry)) return entry;
      return {
        name: pickString(entry, ["name", "title", "certificate"]),
        issuer: pickString(entry, ["issuer", "organization", "provider"]),
        issueDate: pickString(entry, ["issueDate", "year", "date"]),
        expiryDate: pickString(entry, ["expiryDate"]),
      };
    });
  }

  return result;
}