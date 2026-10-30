import { z } from "zod";
import { routing } from "@/i18n/routing";

export const feedbackCategorySchema = z.enum([
  "general",
  "bug",
  "feature",
  "employer",
  "candidate",
  "other",
]);

export const feedbackSchema = z.object({
  name: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email())
    .optional()
    .or(z.literal("")),
  category: feedbackCategorySchema,
  rating: z.coerce.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(3).max(4000),
  locale: z.enum(routing.locales),
});

export type FeedbackFormState = {
  status: "idle" | "success" | "error";
  message: "idle" | "invalid" | "submitted" | "failed";
};
