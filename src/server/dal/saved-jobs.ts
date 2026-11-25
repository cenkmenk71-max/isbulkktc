import "server-only";

import { z } from "zod";
import { requireAuthenticatedUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

const savedJobInputSchema = z.string().uuid();

export async function saveJob(jobId: string): Promise<void> {
  const parsedJobId = savedJobInputSchema.parse(jobId);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to save a job.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("saved_jobs").insert({
    user_id: user.id,
    job_id: parsedJobId,
  });
  if (error) {
    throw new Error("The job could not be saved.", { cause: error });
  }
}

export async function unsaveJob(jobId: string): Promise<void> {
  const parsedJobId = savedJobInputSchema.parse(jobId);
  const user = await requireAuthenticatedUser();
  if (user.status !== "active") {
    throw new Error("An active account is required to remove a saved job.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("saved_jobs")
    .delete()
    .eq("user_id", user.id)
    .eq("job_id", parsedJobId);
  if (error) {
    throw new Error("The saved job could not be removed.", { cause: error });
  }
}
