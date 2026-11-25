import "server-only";

import {
  createResumeSchema,
  resumeRowSchema,
  type CreateResumeInput,
} from "@/features/candidates/resume-schemas";
import { requireAuthenticatedUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export async function registerResume(input: CreateResumeInput): Promise<string> {
  const parsed = createResumeSchema.parse(input);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to register a resume.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_resume", {
    _candidate_id: user.id,
    _storage_path: parsed.storagePath,
    _original_filename: parsed.originalFilename,
    _file_size_bytes: parsed.fileSizeBytes,
    _mime_type: parsed.mimeType,
    _page_count: parsed.pageCount,
  });
  if (error || !data) {
    throw new Error("The resume could not be registered.", { cause: error });
  }
  return data;
}

export async function listMyResumes() {
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to load resumes.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("resumes")
    .select(
      "id, candidate_id, storage_path, original_filename, file_size_bytes, mime_type, page_count, status, retention_until, parsed_data, created_at, updated_at",
    )
    .eq("candidate_id", user.id)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("The candidate resumes could not be loaded.", {
      cause: error,
    });
  }
  return resumeRowSchema.array().parse(data);
}
