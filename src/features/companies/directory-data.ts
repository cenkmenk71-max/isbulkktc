import { z } from "zod";
import importedCompanyDirectory from "./data/company-directory.json";

const companyDirectoryEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  categories: z.array(z.string()),
  locations: z.array(
    z.object({
      address: z.string().nullable(),
      municipality: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().email().nullable().optional(),
      website: z
        .string()
        .url()
        .nullable()
        .refine((website) => {
          if (!website) return true;
          const protocol = new URL(website).protocol;
          return protocol === "https:" || protocol === "http:";
        }),
    }),
  ),
});

export const companyDirectory = z
  .array(companyDirectoryEntrySchema)
  .parse(importedCompanyDirectory);
