import { z } from "zod";
import { routing } from "@/i18n/routing";

export const salesLeadSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  contactName: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  // Required: the receipt is addressed to this address, and the team replies to it.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  // Optional, but a value that is present must clear the column's floor:
  // `sales_leads.phone` requires 4–32 characters, so the RPC drops anything
  // shorter. Rejecting it here tells the visitor why instead of silently
  // discarding the number they typed.
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((value) => value.length === 0 || value.length >= 4, {
      message: "A phone number must be at least 4 characters.",
    })
    .optional(),
  plan: z.string().trim().max(80).optional().or(z.literal("")),
  durationDays: z
    .union([z.literal("1"), z.literal("7"), z.literal("30"), z.literal("")])
    .optional(),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  locale: z.enum(routing.locales),
  marketingConsent: z.boolean().default(false),
});

export type SalesLeadFormState = {
  status: "idle" | "success" | "error";
  message: "idle" | "invalid" | "submitted" | "failed" | "consentUnavailable";
};
