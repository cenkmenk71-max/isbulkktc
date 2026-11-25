import { z } from "zod";

export const createResumeSchema = z
  .object({
    storagePath: z.string().min(1).max(512),
    originalFilename: z.string().trim().min(1).max(255),
    fileSizeBytes: z.number().int().positive().max(25_000_000),
    mimeType: z.literal("application/pdf"),
    pageCount: z.number().int().min(1).max(25).nullable().default(null),
  })
  .strict();

export const resumeRowSchema = z
  .object({
    id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    storage_path: z.string().min(1).max(512),
    original_filename: z.string().min(1).max(255),
    file_size_bytes: z.number().int().positive(),
    mime_type: z.literal("application/pdf"),
    page_count: z.number().int().min(1).max(25).nullable(),
    status: z.enum(["uploaded", "processing", "parsed", "failed", "deleted"]),
    retention_until: z.iso.datetime(),
    parsed_data: z.record(z.string(), z.json()).nullable(),
    created_at: z.iso.datetime(),
    updated_at: z.iso.datetime(),
  })
  .strict();

export type CreateResumeInput = z.infer<typeof createResumeSchema>;
export type ResumeRow = z.infer<typeof resumeRowSchema>;
