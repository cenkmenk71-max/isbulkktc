import { z } from "zod";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .refine((slug) => !/[^a-z0-9-]/.test(slug)),
});

const optionalCompanyText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => value || null);

const companyCategoriesSchema = z
  .string()
  .max(1_000)
  .transform((value) => {
    const categories = new Map<string, string>();
    for (const category of value
      .split(/[,\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean)) {
      const key = category.toLocaleLowerCase("tr-TR");
      if (!categories.has(key)) categories.set(key, category);
    }
    return [...categories.values()];
  })
  .pipe(z.array(z.string().min(1).max(80)).max(12));

export const companyProfileSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string().trim().min(2).max(120),
  profileDescription: z.string().trim().max(2_000),
  categoriesText: companyCategoriesSchema,
  website: optionalCompanyText(2_048).refine((value) => {
    if (!value) return true;
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }),
  phone: optionalCompanyText(80),
  publicEmail: optionalCompanyText(254).refine((value) => {
    if (!value) return true;
    return z.email().safeParse(value).success;
  }),
  address: optionalCompanyText(240),
  municipality: optionalCompanyText(120).pipe(
    z.enum(northernCyprusDistrictValues).nullable(),
  ),
  directoryTarget: z.string().max(160),
});

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
