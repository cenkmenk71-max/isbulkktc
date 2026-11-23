import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";
import { trLowercase } from "@/lib/tr-lowercase";

const COMPANY_TYPES = [
  "LTD",
  "ANONIM",
  "KOLLEKTIF",
  "KOMANDIT",
  "SAHIS",
] as const;

const NAICS_SECTORS = [
  "11", "21", "22", "23", "31", "32", "33", "42", "44", "45", "48", "49",
  "51", "52", "53", "54", "55", "56", "61", "62", "71", "72", "81", "92",
] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => v || null);

const optionalTextRequired = (max: number) =>
  z.string().trim().min(1).max(max);

const urlSchema = z
  .string()
  .url()
  .max(2048)
  .transform((v) => v || null);

const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{1,14}$/)
  .transform((v) => v || null);

const tcNoSchema = z
  .string()
  .regex(/^[1-9]\d{10}$/)
  .transform((v) => v || null);

const ibanTrSchema = z
  .string()
  .regex(/^TR\d{2}\s?[A-Z0-9]{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2}$/i)
  .transform((v) => v?.replace(/\s/g, "") || null);

const mersisSchema = z
  .string()
  .regex(/^\d{16}$/)
  .transform((v) => v || null);

const removeBlankEntries = <T extends Record<string, unknown>>(entries: T[]): T[] =>
  entries.filter((e) => Object.values(e).some((v) => v !== null && v !== ""));

const removeBlankStrings = (entries: string[]): string[] =>
  entries.filter((v) => v !== null && v !== "");

const companyCategoriesSchema = z
  .string()
  .max(1_000)
  .transform((value) => {
    const categories = new Map<string, string>();
    for (const category of value
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      const key = trLowercase(category);
      if (!categories.has(key)) categories.set(key, category);
    }
    return [...categories.values()];
  })
  .pipe(z.array(z.string().min(1).max(80)).max(12));

const authorizedSignatorySchema = z
  .object({
    fullName: optionalTextRequired(120),
    title: optionalTextRequired(120),
    authorityScope: optionalText(500).optional(),
    tcNo: tcNoSchema.optional(),
    appointmentDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .transform((v) => v || null)
      .optional(),
  })
  .strict();

export const createCompanySchema = z.object({
  tradeName: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .refine((slug) => !/[^a-z0-9-]/.test(slug)),
});

export const companyProfileSchema = z.object({
  companyId: z.string().uuid(),

  // Temel Ticari Kimlik
  tradeName: z.string().trim().min(2).max(120),
  tradeTitle: optionalText(120).optional(),
  companyType: z.enum(COMPANY_TYPES).optional(),
  taxNumber: z
    .string()
    .regex(/^\d{10}$/)
    .transform((v) => v || null)
    .optional(),
  tradeRegistryNumber: optionalText(60).optional(),
  mersisNo: mersisSchema.optional(),
  establishmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .transform((v) => v || null)
    .optional(),
  capital: z.number().nonnegative().optional(),
  currency: z.string().length(3).default("TRY").optional(),

  // Adres Bilgileri
  registeredAddress: optionalText(500).optional(),
  registeredDistrict: z.enum(northernCyprusDistrictValues).optional(),
  registeredMunicipality: optionalText(120).optional(),
  registeredPostalCode: z.string().regex(/^\d{5}$/).optional(),
  workplaceAddress: optionalText(500).optional(),
  workplaceDistrict: z.enum(northernCyprusDistrictValues).optional(),
  workplaceMunicipality: optionalText(120).optional(),
  workplacePostalCode: z.string().regex(/^\d{5}$/).optional(),

  // İletişim
  phone: e164Phone.optional(),
  fax: e164Phone.optional(),
  email: z.email().optional(),
  website: urlSchema.optional(),

  // Yetkililer
  authorizedSignatories: z
    .array(authorizedSignatorySchema)
    .max(10)
    .default([])
    .transform(removeBlankEntries),

  // Sektör / Faaliyet
  naceCode: z.enum(NAICS_SECTORS).optional(),
  sector: optionalText(80).optional(),
  subSector: optionalText(80).optional(),
  keywords: z
    .array(optionalTextRequired(60))
    .max(20)
    .default([])
    .transform(removeBlankStrings),

  // Finans / Diğer
  bankName: optionalText(120).optional(),
  iban: ibanTrSchema.optional(),
  insuranceNumber: optionalText(60).optional(),
  employeeCount: z.number().int().nonnegative().optional(),
  annualTurnoverRange: z
    .enum(["0-500K", "500K-1M", "1M-5M", "5M-10M", "10M-50M", "50M+"])
    .optional(),

  // Sosyal Medya
  linkedIn: urlSchema.optional(),
  instagram: urlSchema.optional(),
  facebook: urlSchema.optional(),
  twitter: urlSchema.optional(),
  youtube: urlSchema.optional(),

  // Profil Açıklaması ve Kategoriler
  profileDescription: optionalText(2_000).optional(),
  categoriesText: companyCategoriesSchema,

  // Dizin Hedefi (rehber eşleştirme için)
  directoryTarget: z.string().max(160).optional(),
});

export type CompanyProfileFields = z.infer<typeof companyProfileSchema>;

export const companyVerificationReviewSchema = z.object({
  companyId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().trim().max(1_000).optional(),
});

export const companySubmissionSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  tradeName: optionalText(120).optional(),
  companyType: z.enum(COMPANY_TYPES).optional(),
  taxNumber: z
    .string()
    .regex(/^\d{10}$/)
    .transform((v) => v || null)
    .optional(),
  tradeRegistryNumber: optionalText(60).optional(),
  mersisNo: mersisSchema.optional(),
  establishmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .transform((v) => v || null)
    .optional(),
  registeredAddress: optionalText(500).optional(),
  registeredDistrict: z.enum(northernCyprusDistrictValues).optional(),
  registeredMunicipality: optionalText(120).optional(),
  registeredPostalCode: z.string().regex(/^\d{5}$/).optional(),
  workplaceAddress: optionalText(500).optional(),
  workplaceDistrict: z.enum(northernCyprusDistrictValues).optional(),
  workplaceMunicipality: optionalText(120).optional(),
  workplacePostalCode: z.string().regex(/^\d{5}$/).optional(),
  phone: e164Phone.optional(),
  fax: e164Phone.optional(),
  email: z.email().optional(),
  website: urlSchema.optional(),
  authorizedSignatories: z
    .array(authorizedSignatorySchema)
    .max(10)
    .default([])
    .transform(removeBlankEntries),
  naceCode: z.enum(NAICS_SECTORS).optional(),
  sector: optionalText(80).optional(),
  subSector: optionalText(80).optional(),
  keywords: z
    .array(optionalTextRequired(60))
    .max(20)
    .default([])
    .transform(removeBlankStrings),
  bankName: optionalText(120).optional(),
  iban: ibanTrSchema.optional(),
  insuranceNumber: optionalText(60).optional(),
  employeeCount: z.number().int().nonnegative().optional(),
  annualTurnoverRange: z
    .enum(["0-500K", "500K-1M", "1M-5M", "5M-10M", "10M-50M", "50M+"])
    .optional(),
  linkedIn: urlSchema.optional(),
  instagram: urlSchema.optional(),
  facebook: urlSchema.optional(),
  twitter: urlSchema.optional(),
  youtube: urlSchema.optional(),
  profileDescription: optionalText(2_000).optional(),
  categoriesText: companyCategoriesSchema,
}).strict();

export type CreateCompanyFormState = {
  message: "idle" | "invalid" | "duplicate" | "unauthorized" | "failed" | "saved";
  status: "idle" | "error" | "success";
};

export type CompanyProfileFormState = {
  status: "idle" | "error" | "success";
  message:
    | "idle"
    | "invalid"
    | "unauthorized"
    | "inactive"
    | "saveFailed"
    | "submitted"
    | "pending";
};

export type CompanyProfileSubmissionReviewState = {
  status: "idle" | "error" | "success";
  message: "idle" | "unauthorized" | "failed" | "branchUnavailable" | "approved" | "rejected";
};

export type CompanyVerificationReviewState = {
  status: "idle" | "error" | "success";
  message: "idle" | "unauthorized" | "failed" | "verified" | "rejected";
};