import type { CandidateProfileValues } from "./schemas";
import type { CandidateResumeDraft } from "./resume-parser";
import {
  resolveNorthernCyprusDistrict,
  type NorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";

export type CandidateProfileDraft = Omit<CandidateProfileValues, "skills"> & {
  headline: string;
  location: string;
  skills: string[];
  summary: string;
  cvFullText: string;
  links: { label: string; url: string }[];
};

export type ResumeDraftMergeResult = {
  profile: CandidateProfileDraft;
  added: number;
  skipped: number;
  filledFields: string[];
};

const sectionLimit = 12;
const skillsLimit = 40;

/**
 * The single district to store for a CV location.
 *
 * `resolveNorthernCyprusDistrict` returns `null` when a value names several
 * districts, so that a *company* address is never guessed at. A candidate's own
 * location line is different — the parser only emits it as a location, so the
 * first district listed is the primary one. Reading it strictly dropped the
 * location the CV stated ("too little is extracted", #208).
 */
function resolveFirstDistrict(
  value: string | null | undefined,
): NorthernCyprusDistrict | null {
  if (!value) return null;

  const direct = resolveNorthernCyprusDistrict(value);
  if (direct) return direct;

  for (const segment of value.split(/[,;/|]+/)) {
    const resolved = resolveNorthernCyprusDistrict(segment);
    if (resolved) return resolved;
  }
  return null;
}

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
  let skillsSkipped = 0;

  for (const skill of draft.skills ?? []) {
    const normalized = normalize(skill);
    if (!normalized || knownSkills.has(normalized)) continue;
    knownSkills.add(normalized);

    if (skills.length >= skillsLimit) {
      skillsSkipped += 1;
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
    resolveFirstDistrict(current.location) ??
    resolveFirstDistrict(draft.location) ??
    "";
  const summary = (current.summary.trim() || draft.summary) ?? "";
  const links = mergeEntries(current.links, draft.links);

  // Preserve the full CV text from the imported draft (latest CV import)
  const cvFullText = draft.cvFullText ?? current.cvFullText ?? "";

  const mergedProfile: CandidateProfileDraft = {
    phone: current.phone,
    jobTypePreference: current.jobTypePreference,
    workplaceModePreference: current.workplaceModePreference,
    availability: current.availability,
    headline,
    location,
    skills,
    experience: experience.entries,
    education: education.entries,
    languages: languages.entries,
    certifications: certifications.entries,
    summary,
    cvFullText,
    links: links.entries,
  };

  // Filled fields: profile fields that were empty before the import and now
  // carry extracted CV content. Single fields count when previously blank and
  // now non-empty; array sections count when previously empty and now non-empty.
  const filledFields: string[] = [];
  if (!current.headline.trim() && headline.trim()) filledFields.push("headline");
  if (!current.location.trim() && location.trim()) filledFields.push("location");
  if (current.skills.length === 0 && skills.length > 0)
    filledFields.push("skills");
  if (current.experience.length === 0 && experience.entries.length > 0)
    filledFields.push("experience");
  if (current.education.length === 0 && education.entries.length > 0)
    filledFields.push("education");
  if (current.languages.length === 0 && languages.entries.length > 0)
    filledFields.push("languages");
  if (
    current.certifications.length === 0 &&
    certifications.entries.length > 0
  )
    filledFields.push("certifications");
  if (!current.summary.trim() && summary.trim()) filledFields.push("summary");
  if (current.links.length === 0 && links.entries.length > 0)
    filledFields.push("links");

  const added =
    Number(Boolean(!current.headline.trim() && headline.trim())) +
    Number(Boolean(!current.location.trim() && location.trim())) +
    Number(Boolean(!current.summary.trim() && summary.trim())) +
    (skills.length - current.skills.length) +
    (experience.entries.length - current.experience.length) +
    (education.entries.length - current.education.length) +
    (languages.entries.length - current.languages.length) +
    (certifications.entries.length - current.certifications.length) +
    (links.entries.length - current.links.length);
  const totalSkipped =
    skillsSkipped +
    experience.skipped +
    education.skipped +
    languages.skipped +
    certifications.skipped +
    links.skipped;

  return { profile: mergedProfile, added, skipped: totalSkipped, filledFields };
}
