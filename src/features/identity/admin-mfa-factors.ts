/**
 * Pure factor rules for the admin MFA gate.
 *
 * Kept free of `"use server"` so the unit suite can import the selector directly:
 * a server-action module may only export async functions.
 */

export type MfaFactorLike = {
  id: string;
  factor_type: string;
  status: string;
};

/**
 * The TOTP factors an admin left mid-enrollment.
 *
 * `auth.mfa.listFactors()` buckets a factor into `totp` only once it is
 * `verified`; an enrollment that was started but never confirmed lands in `all`
 * with `status: "unverified"`. Such a factor is invisible to the verified-factor
 * lookup yet still occupies a row, and GoTrue refuses a second enrollment with
 * the same friendly name (`mfa_factor_name_conflict`) and counts it toward
 * `MaxEnrolledFactors`. Clearing these before a fresh enroll is what lets an
 * admin who abandoned the setup screen try again.
 */
export function staleUnverifiedTotpFactorIds(
  factors: readonly MfaFactorLike[],
): string[] {
  return factors
    .filter(
      (factor) => factor.factor_type === "totp" && factor.status !== "verified",
    )
    .map((factor) => factor.id);
}
