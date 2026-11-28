import "server-only";

import { z } from "zod";

import {
  createResumeSchema,
  resumeRowSchema,
  type CreateResumeInput,
} from "@/features/candidates/resume-schemas";
import { requireAuthenticatedUser } from "@/server/dal/user";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/server/db/supabase-server";

const applicationIdSchema = z.string().uuid();

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

export async function getApplicationResume(applicationId: string) {
  if (!applicationIdSchema.safeParse(applicationId).success) return null;
  // Authorization for the resume is established by the caller (the company
  // application detail page verifies company membership, and the download
  // route performs its own candidate/company-member check). The service client
  // is used here so an authorized employer can read the attached resume.
  const supabase = await createSupabaseServiceClient();
  if (!supabase) {
    throw new Error("The resume could not be loaded.");
  }
  const { data: application, error } = await supabase
    .from("applications")
    .select("resume_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) {
    throw new Error("The application resume could not be loaded.", {
      cause: error,
    });
  }
  if (!application?.resume_id) return null;

  const { data: resume, error: resumeError } = await supabase
    .from("resumes")
    .select("id, original_filename, storage_path")
    .eq("id", application.resume_id)
    .maybeSingle();
  if (resumeError) {
    throw new Error("The resume could not be loaded.", { cause: resumeError });
  }
  return resume;
}
