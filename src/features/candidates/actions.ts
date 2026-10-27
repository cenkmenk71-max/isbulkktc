"use server";

import { candidateProfileSchema, type CandidateProfileFormState } from "./schemas";
import { getCurrentUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export async function saveCandidateProfile(
  _previousState: CandidateProfileFormState,
  formData: FormData,
): Promise<CandidateProfileFormState> {
  const user = await getCurrentUser();

  if (!user) {
    return { status: "error", message: "unauthorized" };
  }

  if (user.status !== "active") {
    return { status: "error", message: "inactive" };
  }

  const parseSection = (name: string): unknown => {
    const value = formData.get(name);
    if (typeof value !== "string" || value.length > 50_000) return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const result = candidateProfileSchema.safeParse({
    headline: formData.get("headline"),
    location: formData.get("location"),
    skillsText: formData.get("skillsText"),
    experience: parseSection("experience"),
    education: parseSection("education"),
    languages: parseSection("languages"),
    certifications: parseSection("certifications"),
  });

  if (!result.success) {
    return { status: "error", message: "invalid" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("candidate_profiles").upsert(
    {
      user_id: user.id,
      headline: result.data.headline,
      location: result.data.location,
      skills: result.data.skillsText,
      experience: result.data.experience,
      education: result.data.education,
      languages: result.data.languages,
      certifications: result.data.certifications,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Candidate profile save failed.", { code: error.code });
    return { status: "error", message: "saveFailed" };
  }

  return { status: "success", message: "saved" };
}
