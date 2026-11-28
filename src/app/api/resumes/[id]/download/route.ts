import { createSupabaseServerClient, createSupabaseServiceClient } from "@/server/db/supabase-server";
import { jsonNoStore } from "@/server/http/no-store-response";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RESUME_BUCKET = "private-resumes";

type ResumeRow = {
  id: string;
  original_filename: string;
  storage_path: string;
  mime_type: string;
  candidate_id: string;
  status: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return jsonNoStore({ message: "Not found" }, { status: 404 });
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  const service = createSupabaseServiceClient();
  if (!service) {
    return jsonNoStore({ message: "Resume delivery is not configured" }, { status: 503 });
  }

  const { data: resume, error: resumeError } = await service
    .from("resumes")
    .select("id, original_filename, storage_path, mime_type, candidate_id, status")
    .eq("id", id)
    .maybeSingle();

  if (resumeError || !resume) {
    return jsonNoStore({ message: "Not found" }, { status: 404 });
  }

  const row = resume as unknown as ResumeRow;
  if (row.status === "deleted") {
    return jsonNoStore({ message: "Not found" }, { status: 404 });
  }

  let authorized = false;
  if (user && row.candidate_id === user.id) {
    authorized = true;
  } else if (user) {
    const { data: member, error: memberError } = await service
      .from("applications")
      .select("job_id")
      .eq("resume_id", id)
      .maybeSingle();
    if (!memberError && member) {
      const { data: job } = await service
        .from("jobs")
        .select("company_id")
        .eq("id", member.job_id)
        .maybeSingle();
      if (job) {
        const { data: membership } = await service
          .from("company_members")
          .select("user_id")
          .eq("company_id", job.company_id)
          .eq("user_id", user.id)
          .eq("status", "active")
          .in("membership_role", ["owner", "recruiter"])
          .maybeSingle();
        if (membership) authorized = true;
      }
    }
  }

  if (!authorized) {
    return jsonNoStore({ message: "Forbidden" }, { status: 403 });
  }

  const { data: file, error: downloadError } = await service.storage
    .from(RESUME_BUCKET)
    .download(row.storage_path);

  if (downloadError || !file) {
    return jsonNoStore({ message: "Not found" }, { status: 404 });
  }

  return new Response(file as BodyInit, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": row.mime_type || "application/pdf",
      "Content-Disposition": `attachment; filename="${row.original_filename}"`,
    },
  });
}
