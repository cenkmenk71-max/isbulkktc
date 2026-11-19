import { z } from "zod";

export const LanguageCodeSchema = z.enum([
  "tr",
  "en",
  "ru",
  "de",
  "el",
  "fa",
  "ar",
  "fr",
  "es",
  "it",
  "nl",
  "pl",
  "uk",
  "ro",
  "bg",
  "cs",
  "hu",
  "sr",
  "hr",
  "sk",
  "sl",
  "et",
  "lv",
  "lt",
  "mt",
  "ga",
  "cy",
  "is",
  "mk",
  "sq",
  "bs",
  "me",
  "other",
]);

export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const ProficiencyCodeSchema = z.enum([
  "Native",
  "C2",
  "C1",
  "B2",
  "B1",
  "A2",
  "A1",
]);

export type ProficiencyCode = z.infer<typeof ProficiencyCodeSchema>;

export const ExtractedLanguageSchema = z.object({
  language_code: LanguageCodeSchema,
  language_name_localized: z.string().min(1).max(80),
  language_name_standard: z.string().min(1).max(80),
  proficiency_code: ProficiencyCodeSchema,
}).strict();

export type ExtractedLanguage = z.infer<typeof ExtractedLanguageSchema>;

export const LanguageExtractionResultSchema = z.object({
  languages: z.array(ExtractedLanguageSchema).max(20),
  source_text: z.string().max(5000).optional(),
}).strict();

export type LanguageExtractionResult = z.infer<typeof LanguageExtractionResultSchema>;

export const CandidateLanguageSchema = z.object({
  name: z.string().min(1).max(80),
  proficiency: z.string().min(1).max(80),
}).strict();

export type CandidateLanguage = z.infer<typeof CandidateLanguageSchema>;