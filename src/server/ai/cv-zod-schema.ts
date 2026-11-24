import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { ProficiencyCodeSchema } from "@/features/candidates/language-extraction";

const text = (max: number) => z.string().max(max);
const date = z
  .string()
  .max(7)
  .regex(/^(?:\d{4}(?:-(?:0[1-9]|1[0-2]))?)?$/);

const experienceSchema = z
  .object({
    role: text(140),
    organization: text(160),
    location: text(120),
    startDate: date,
    endDate: date,
    description: text(1_800),
  })
  .strict();

const educationSchema = z
  .object({
    institution: text(160),
    qualification: text(140),
    field: text(140),
    startDate: date,
    endDate: date,
    description: text(1_200),
  })
  .strict();

const languageSchema = z
  .object({
    name: z.string().min(1).max(80),
    proficiency: ProficiencyCodeSchema,
  })
  .strict();

const certificationSchema = z
  .object({
    name: text(160),
    issuer: text(160),
    issueDate: date,
    expiryDate: date,
  })
  .strict();

const linkSchema = z
  .object({
    label: text(120),
    url: text(600),
  })
  .strict();

export const cvParserOutputSchema = z
  .object({
    headline: z.string().max(140).nullable(),
    location: z.enum(northernCyprusDistrictValues).nullable(),
    skills: z.array(z.string().min(1).max(60)).max(40),
    experience: z.array(experienceSchema).max(12),
    education: z.array(educationSchema).max(12),
    languages: z.array(languageSchema).max(12),
    certifications: z.array(certificationSchema).max(12),
    summary: z.string().max(2_000).nullable(),
    links: z.array(linkSchema).max(12),
  })
  .strict();

export const cvResumeDraftSchema = cvParserOutputSchema
  .extend({
    cvFullText: z.string().max(100_000).nullable(),
  })
  .strict();

export type CVParserOutput = z.infer<typeof cvParserOutputSchema>;
export type CVResumeDraft = z.infer<typeof cvResumeDraftSchema>;

export const cvParserJsonSchema = z.toJSONSchema(cvParserOutputSchema);
