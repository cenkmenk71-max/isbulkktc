"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getLocalePrefix } from "@/i18n/routing";
import { hasAssignedPlatformRole, getCurrentUser } from "@/server/dal/user";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type AdminMfaState = {
  status: "idle" | "error";
  message: "idle" | "unauthorized" | "setupFailed" | "invalidCode" | "verifyFailed";
  mode?: "enroll" | "challenge";
  factorId?: string;
  challengeId?: string;
  qrCode?: string;
  secret?: string;
};

const initialAdminMfaState: AdminMfaState = {
  status: "idle",
  message: "idle",
};

const verifyAdminMfaSchema = z.object({
  mode: z.enum(["enroll", "challenge"]),
  factorId: z.string().uuid(),
  challengeId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/),
});

async function isActivePlatformAdmin() {
  const user = await getCurrentUser();
  return user?.status === "active" &&
    (await hasAssignedPlatformRole("platform_admin"))
    ? user
    : null;
}

export async function beginAdminMfa(
  _previousState: AdminMfaState,
): Promise<AdminMfaState> {
  void _previousState;
  const user = await isActivePlatformAdmin();
  if (!user) {
    return { ...initialAdminMfaState, status: "error", message: "unauthorized" };
  }

  const supabase = await createSupabaseServerClient({ allowCookieWrites: true });
  const { data: factorList, error: factorListError } =
    await supabase.auth.mfa.listFactors();
  if (factorListError) {
    console.error("Admin MFA factor listing failed.", {
      code: factorListError.code,
    });
    return { ...initialAdminMfaState, status: "error", message: "setupFailed" };
  }

  const verifiedFactor = factorList.totp.find(
    (factor) => factor.status === "verified",
  );
  if (verifiedFactor) {
    const { data: challenge, error } = await supabase.auth.mfa.challenge({
      factorId: verifiedFactor.id,
    });
    if (error) {
      console.error("Admin MFA challenge failed.", { code: error.code });
      return { ...initialAdminMfaState, status: "error", message: "setupFailed" };
    }
    return {
      ...initialAdminMfaState,
      mode: "challenge",
      factorId: verifiedFactor.id,
      challengeId: challenge.id,
    };
  }

  const { data: enrollment, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "isbulkktc.com",
    friendlyName: `İşBul KKTC admin · ${user.email ?? user.displayName}`,
  });
  if (error) {
    console.error("Admin MFA enrollment failed.", { code: error.code });
    return { ...initialAdminMfaState, status: "error", message: "setupFailed" };
  }

  const { data: challenge, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId: enrollment.id });
  if (challengeError) {
    console.error("New admin MFA factor challenge failed.", {
      code: challengeError.code,
    });
    return { ...initialAdminMfaState, status: "error", message: "setupFailed" };
  }

  return {
    ...initialAdminMfaState,
    mode: "enroll",
    factorId: enrollment.id,
    challengeId: challenge.id,
    qrCode: enrollment.totp.qr_code,
    secret: enrollment.totp.secret,
  };
}

export async function verifyAdminMfa(
  _previousState: AdminMfaState,
  formData: FormData,
): Promise<AdminMfaState> {
  const user = await isActivePlatformAdmin();
  if (!user) {
    return { ...initialAdminMfaState, status: "error", message: "unauthorized" };
  }

  const input = verifyAdminMfaSchema.safeParse({
    mode: formData.get("mode"),
    factorId: formData.get("factorId"),
    challengeId: formData.get("challengeId"),
    code: formData.get("code"),
  });
  if (!input.success) {
    return { ...initialAdminMfaState, status: "error", message: "invalidCode" };
  }

  const supabase = await createSupabaseServerClient({ allowCookieWrites: true });
  const { data: factorList, error: factorListError } =
    await supabase.auth.mfa.listFactors();
  if (factorListError) {
    console.error("Admin MFA factor verification lookup failed.", {
      code: factorListError.code,
    });
    return { ...initialAdminMfaState, status: "error", message: "verifyFailed" };
  }

  const isVerifiedFactor = factorList.totp.some(
    (factor) => factor.id === input.data.factorId,
  );
  if (input.data.mode === "challenge" && !isVerifiedFactor) {
    return { ...initialAdminMfaState, status: "error", message: "unauthorized" };
  }
  if (input.data.mode === "enroll" && isVerifiedFactor) {
    return { ...initialAdminMfaState, status: "error", message: "unauthorized" };
  }

  const { error } = await supabase.auth.mfa.verify({
    factorId: input.data.factorId,
    challengeId: input.data.challengeId,
    code: input.data.code,
  });
  if (error) {
    console.error("Admin MFA verification failed.", { code: error.code });
    return { ...initialAdminMfaState, status: "error", message: "invalidCode" };
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError) {
    throw new Error("The verified admin assurance level could not be checked.", {
      cause: assuranceError,
    });
  }
  if (assurance.currentLevel !== "aal2") {
    return { ...initialAdminMfaState, status: "error", message: "verifyFailed" };
  }

  redirect(`${getLocalePrefix(user.locale)}/admin/packages`);
}
