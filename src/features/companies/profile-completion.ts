import { resolveNorthernCyprusDistrict } from "@/features/locations/northern-cyprus-districts";

export type CompanyProfileCompletionInput = {
  companyName: string;
  profileDescription: string;
  categories: readonly string[];
  website: string | null;
  phone: string | null;
  publicEmail: string | null;
  address: string | null;
  municipality: string | null;
};

export function getCompanyProfileCompletion(
  profile: CompanyProfileCompletionInput,
) {
  const checks = [
    profile.companyName.trim().length > 0,
    profile.profileDescription.trim().length > 0,
    profile.categories.length > 0,
    Boolean(profile.website?.trim()),
    Boolean(profile.phone?.trim() || profile.publicEmail?.trim()),
    Boolean(
      profile.address?.trim() ||
        resolveNorthernCyprusDistrict(profile.municipality),
    ),
  ];
  const completed = checks.filter(Boolean).length;

  return {
    completed,
    total: checks.length,
    percentage: Math.round((completed / checks.length) * 100),
  };
}
