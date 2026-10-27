import type { CandidateProfileValues } from "./schemas";
import type { CandidateResumeDraft } from "./resume-parser";
import { resolveNorthernCyprusDistrict } from "@/features/locations/northern-cyprus-districts";

export type CandidateProfileDraft = Omit<CandidateProfileValues, "skills"> & {
  headline: string;
  location: string;
  skills: string[];
};

export type ResumeDraftMergeResult = {
  profile: CandidateProfileDraft;
  added: number;
  skipped: number;
};

const sectionLimit = 12;
const skillsLimit = 40;

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

function mergeEntries<T extends Record<string, string>>(
  current: T[],
  imported: T[] | undefined,
): { entries: T[]; skipped: number } {
  const entries = [...current];
  const seen = new Set(
    entries.map((entry) =>
      Object.values(entry)
        .map(normalize)
        .filter(Boolean)
        .join("|"),
    ),
  );
  let skipped = 0;

  for (const entry of imported ?? []) {
    if (!Object.values(entry).some((value) => value.trim())) continue;

    const key = Object.values(entry)
      .map(normalize)
      .filter(Boolean)
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    if (entries.length >= sectionLimit) {
      skipped += 1;
      continue;
    }

    entries.push(entry);
  }

  return { entries, skipped };
}

export function mergeResumeDraft(
  current: CandidateProfileDraft,
  draft: CandidateResumeDraft,
): ResumeDraftMergeResult {
  const skills = [...current.skills];
  const knownSkills = new Set(skills.map(normalize));
  let skipped = 0;

  for (const skill of draft.skills ?? []) {
    const normalized = normalize(skill);
    if (!normalized || knownSkills.has(normalized)) continue;
    knownSkills.add(normalized);

    if (skills.length >= skillsLimit) {
      skipped += 1;
      continue;
    }
    skills.push(skill);
  }

  const experience = mergeEntries(current.experience, draft.experience);
  const education = mergeEntries(current.education, draft.education);
  const languages = mergeEntries(current.languages, draft.languages);
  const certifications = mergeEntries(current.certifications, draft.certifications);
  const headline = current.headline.trim() ? current.headline : draft.headline ?? "";
  const location =
    resolveNorthernCyprusDistrict(current.location) ??
    resolveNorthernCyprusDistrict(draft.location) ??
    "";

  return {
    profile: {
      headline,
      location,
      skills,
      experience: experience.entries,
      education: education.entries,
      languages: languages.entries,
      certifications: certifications.entries,
    },
    added:
      Number(Boolean(!current.headline.trim() && headline.trim())) +
      Number(Boolean(!current.location.trim() && location.trim())) +
      (skills.length - current.skills.length) +
      (experience.entries.length - current.experience.length) +
      (education.entries.length - current.education.length) +
      (languages.entries.length - current.languages.length) +
      (certifications.entries.length - current.certifications.length),
    skipped:
      skipped +
      experience.skipped +
      education.skipped +
      languages.skipped +
      certifications.skipped,
  };
}
