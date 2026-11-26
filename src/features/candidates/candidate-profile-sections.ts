import type { CandidateProfileValues } from "./schemas";

export const candidateProfileSectionKeys = [
  "essentials",
  "preferences",
  "experience",
  "education",
  "languagesCerts",
  "linksSkills",
] as const;

export type CandidateProfileSectionKey =
  (typeof candidateProfileSectionKeys)[number];

export function hasEntryContent(entries: object[]): boolean {
  return entries.some((entry) =>
    Object.values(entry).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    ),
  );
}

export function computeOpenSections(
  profile: CandidateProfileValues,
): Set<CandidateProfileSectionKey> {
  const sections = new Set<CandidateProfileSectionKey>();

  if (
    profile.headline?.trim() ||
    profile.location?.trim() ||
    profile.phone?.trim() ||
    profile.summary?.trim()
  ) {
    sections.add("essentials");
  }

  if (
    profile.jobTypePreference ||
    profile.workplaceModePreference ||
    profile.availability?.trim()
  ) {
    sections.add("preferences");
  }

  if (hasEntryContent(profile.experience)) sections.add("experience");
  if (hasEntryContent(profile.education)) sections.add("education");
  if (
    profile.languages.some((entry) => entry.name.trim()) ||
    hasEntryContent(profile.certifications)
  ) {
    sections.add("languagesCerts");
  }
  if (profile.links.length > 0 || profile.skills.length > 0) {
    sections.add("linksSkills");
  }

  return sections;
}
