"use server";

import { candidateProfileUpdateSchema, type CandidateProfileFormState } from "./schemas";
import { getCurrentUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { sendResumeReceivedEmail } from "@/server/email/mailer";

function parseSection(formData: FormData, name: string): unknown {
  const value = formData.get(name);
  if (value === null) return undefined;
  if (typeof value !== "string" || value.length > 50_000) return null;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

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

  const result = candidateProfileUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone") ?? "",
    jobTypePreference: formData.get("jobTypePreference") ?? "",
    workplaceModePreference: formData.get("workplaceModePreference") ?? "",
    availability: formData.get("availability") ?? "",
    headline: formData.get("headline"),
    location: formData.get("location"),
    skillsText: formData.get("skillsText"),
    experience: parseSection(formData, "experience"),
    education: parseSection(formData, "education"),
    languages: parseSection(formData, "languages"),
    certifications: parseSection(formData, "certifications"),
    summary: formData.get("summary") ?? "",
    links: parseSection(formData, "links"),
  });

  if (!result.success) {
    return { status: "error", message: "invalid" };
  }

  // Parsed fields are persisted on explicit save; the raw CV text remains
  // transient and is never sent to or stored by this profile write.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("candidate_profiles").upsert(
    {
      user_id: user.id,
      phone: result.data.phone,
      job_type_preference: result.data.jobTypePreference
        ? [result.data.jobTypePreference]
        : [],
      workplace_mode_preference: result.data.workplaceModePreference
        ? [result.data.workplaceModePreference]
        : [],
      availability: result.data.availability,
      headline: result.data.headline,
      location: result.data.location,
      skills: result.data.skillsText,
      experience: result.data.experience,
      education: result.data.education,
      languages: result.data.languages,
      certifications: result.data.certifications,
      summary: result.data.summary,
      links: result.data.links,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Candidate profile save failed.", { code: error.code });
    return { status: "error", message: "saveFailed" };
  }

  // The name lives on `public.profiles.display_name` (it is the column the auth
  // trigger auto-fills from the provider), not on `candidate_profiles`, so it is
  // written separately. Only `display_name` and `locale` are in the
  // `authenticated` UPDATE grant, which is exactly this column.
  if (result.data.fullName !== user.displayName) {
    const { error: nameError } = await supabase
      .from("profiles")
      .update({ display_name: result.data.fullName })
      .eq("id", user.id);

    if (nameError) {
      console.error("Candidate display name save failed.", {
        code: nameError.code,
      });
      return { status: "error", message: "saveFailed" };
    }
  }

  // Send the receipt only after the candidate confirms the imported draft by saving.
  if (formData.get("resumeImported") === "1" && user.email) {
    try {
      await sendResumeReceivedEmail({
        to: user.email,
        locale: user.locale,
        name: user.displayName,
        userId: user.id,
      });
    } catch (mailError) {
      console.error("Resume received email could not be sent.", {
        error: mailError instanceof Error ? mailError.message : "unknown_error",
      });
    }
  }

  return { status: "success", message: "saved" };
}