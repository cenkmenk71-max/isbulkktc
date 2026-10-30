import { z } from "zod";

/**
 * Validation for the managed-content console. The shapes mirror the database
 * guards in `20261024000000_v4_managed_content.sql` so an invalid value is
 * rejected here with a field-level message instead of round-tripping to
 * Postgres and surfacing a generic `22023`.
 */

export const adminContentLocales = [
  "tr",
  "en",
  "ru",
  "el",
  "fa",
  "de",
] as const;

export const adminLegalKeys = ["privacy", "cookies", "terms"] as const;

export type AdminContentActionState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "saveFailed"
    | "deleteFailed"
    | "saved"
    | "deleted";
};

const legalSectionSchema = z.object({
  title: z.string().trim().min(1).max(300),
  paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(40),
});

const legalDocumentSchema = z.object({
  title: z.string().trim().min(1).max(300),
  intro: z.string().trim().min(1).max(2000),
  updated: z.string().trim().min(1).max(120),
  sections: z.array(legalSectionSchema).min(1).max(40),
});

export const legalDocumentFormSchema = z.object({
  contentKey: z.enum(adminLegalKeys),
  locale: z.enum(adminContentLocales),
  document: legalDocumentSchema,
});

export const faqEntryFormSchema = z.object({
  faqId: z.string().uuid().nullable(),
  locale: z.enum(adminContentLocales),
  question: z.string().trim().min(2).max(400),
  answer: z.string().trim().min(2).max(4000),
  sortOrder: z.coerce.number().int().min(0).max(10000),
  isPublished: z.boolean(),
});

export const faqDeleteFormSchema = z.object({
  faqId: z.string().uuid(),
});

export const listingPlanFormSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .min(2)
    .max(80),
  audience: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(80),
  blurb: z.string().trim().max(400),
  features: z.array(z.string().trim().min(1).max(200)).max(12),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/),
  listingCount: z.coerce.number().int().min(1).max(1000).nullable(),
  price1: z.coerce.number().int().min(0).max(100000000),
  price7: z.coerce.number().int().min(0).max(100000000),
  price30: z.coerce.number().int().min(0).max(100000000),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(10000),
});

/** Parses the section list a form submits as JSON, or reports it invalid. */
export function parseLegalSections(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

/** Splits a newline/comma separated feature list into trimmed entries. */
export function parseFeatureList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
