import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { PlatformRole } from "@/types/database";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { getLocalePrefix, isAppLocale, type AppLocale } from "@/i18n/routing";
import { isCorruptedSupabaseAuthError } from "@/server/auth/supabase-guards";
import {
  candidateProfileSchema,
  type CandidateProfileValues,
} from "@/features/candidates/schemas";

export type CurrentUserDTO = {
  id: string;
  email: string | null;
  displayName: string;
  locale: AppLocale;
  status: "active" | "suspended" | "closed";
};

function isMissingOrUnauthenticatedAuthError(error: unknown): boolean {
  if (!error) return false;
  if (isCorruptedSupabaseAuthError(error)) return true;
  if (typeof error === "object" && error !== null) {
    const err = error as { name?: unknown; message?: unknown; cause?: unknown };
    if (err.name === "AuthSessionMissingError") return true;
    if (typeof err.message === "string") {
      const msg = err.message.toLowerCase();
      if (
        msg.includes("auth session missing") ||
        msg.includes("session missing") ||
        msg.includes("jwt") ||
        msg.includes("token") ||
        msg.includes("fetch failed") ||
        msg.includes("enotfound") ||
        msg.includes("network")
      ) {
        return true;
      }
    }
    if (err.cause && isMissingOrUnauthenticatedAuthError(err.cause)) {
      return true;
    }
  }
  return false;
}

export const getCurrentUser = cache(
  async (): Promise<CurrentUserDTO | null> => {
    const supabase = await createSupabaseServerClient();
    let user:
      | Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"]
      | null = null;
    let authError:
      | Awaited<ReturnType<typeof supabase.auth.getUser>>["error"]
      | null = null;

    try {
      const result = await supabase.auth.getUser();
      user = result.data.user;
      authError = result.error;
    } catch (error) {
      if (isMissingOrUnauthenticatedAuthError(error)) {
        return null;
      }

      console.warn("Supabase auth session check failed; treating as unauthenticated.", error);
      return null;
    }

    if (authError) {
      if (isMissingOrUnauthenticatedAuthError(authError)) {
        return null;
      }

      console.warn("The session could not be verified; treating as unauthenticated.", authError);
      return null;
    }

    if (!user) return null;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, display_name, locale, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error("The signed-in profile could not be loaded.", {
        cause: profileError,
      });
    }

    if (!profile) {
      throw new Error(
        "A signed-in user is missing the required profile record.",
      );
    }

    if (
      profile.status !== "active" &&
      profile.status !== "suspended" &&
      profile.status !== "closed"
    ) {
      throw new Error(
        "The signed-in profile has an unsupported account status.",
      );
    }
    if (!isAppLocale(profile.locale)) {
      throw new Error("The signed-in profile has an unsupported locale.");
    }

    return {
      id: profile.id,
      email: user.email ?? null,
      displayName: profile.display_name,
      locale: profile.locale,
      status: profile.status,
    };
  },
);

export const requireAuthenticatedUser = cache(
  async (): Promise<CurrentUserDTO> => {
    const user = await getCurrentUser();

    if (!user) redirect("/login");
    if (user.status !== "active") redirect("/login?error=account");

    return user;
  },
);

export async function getCandidateWorkspace(): Promise<{
  user: CurrentUserDTO;
  profile: CandidateProfileValues;
}> {
  const user = await requireAuthenticatedUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("candidate_profiles")
    .select(
      "headline, location, skills, experience, education, languages, certifications",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("The candidate profile could not be loaded.", {
      cause: error,
    });
  }

  const profile = candidateProfileSchema.safeParse({
    headline: data?.headline ?? "",
    location: data?.location ?? "",
    skillsText: (data?.skills ?? []).join("\n"),
    experience: data?.experience ?? [],
    education: data?.education ?? [],
    languages: data?.languages ?? [],
    certifications: data?.certifications ?? [],
  });

  if (!profile.success) {
    throw new Error("The candidate profile contains invalid stored data.", {
      cause: profile.error,
    });
  }

  return {
    user,
    profile: {
      headline: profile.data.headline,
      location: profile.data.location,
      skills: profile.data.skillsText,
      experience: profile.data.experience,
      education: profile.data.education,
      languages: profile.data.languages,
      certifications: profile.data.certifications,
    },
  };
}

export async function requirePlatformRole(
  role: PlatformRole,
): Promise<CurrentUserDTO> {
  const user = await requireAuthenticatedUser();
  if (!(await hasAssignedPlatformRole(role))) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data: hasRole, error } = await supabase.rpc("has_platform_role", {
    _role: role,
  });

  if (error) {
    throw new Error("The required platform permission could not be verified.", {
      cause: error,
    });
  }

  if (!hasRole) {
    redirect(`${getLocalePrefix(user.locale)}/admin/packages?mfa=required`);
  }

  return user;
}

export async function hasAssignedPlatformRole(
  role: PlatformRole,
): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") return false;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", role)
    .maybeSingle();

  if (error) {
    throw new Error("The assigned platform role could not be verified.", {
      cause: error,
    });
  }
  return data !== null;
}

export async function getPlatformAdminMfaStatus(): Promise<{
  user: CurrentUserDTO;
  aal2: boolean;
  verifiedTotpFactorId: string | null;
}> {
  const user = await requireAuthenticatedUser();
  if (!(await hasAssignedPlatformRole("platform_admin"))) redirect("/");

  const supabase = await createSupabaseServerClient();
  const [
    { data: assurance, error: assuranceError },
    { data: factors, error: factorsError },
  ] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);

  if (assuranceError) {
    throw new Error(
      "The administrator assurance level could not be verified.",
      {
        cause: assuranceError,
      },
    );
  }
  if (factorsError) {
    throw new Error("The administrator MFA factors could not be loaded.", {
      cause: factorsError,
    });
  }

  return {
    user,
    aal2: assurance.currentLevel === "aal2",
    verifiedTotpFactorId:
      factors.totp.find((factor) => factor.status === "verified")?.id ?? null,
  };
}
