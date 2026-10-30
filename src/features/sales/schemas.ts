import { z } from "zod";
import { routing } from "@/i18n/routing";

export const salesLeadSchema = z.object({
  companyName: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  contactName: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  // Required: the receipt is addressed to this address, and the team replies to it.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  plan: z.string().trim().max(80).optional().or(z.literal("")),
  durationDays: z
    .union([z.literal("1"), z.literal("7"), z.literal("30"), z.literal("")])
    .optional(),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
  locale: z.enum(routing.locales),
});

export type SalesLeadFormState = {
  status: "idle" | "success" | "error";
  message: "idle" | "invalid" | "submitted" | "failed";
};
