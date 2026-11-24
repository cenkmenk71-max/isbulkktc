import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { ProficiencyCodeSchema } from "@/features/candidates/language-extraction";

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