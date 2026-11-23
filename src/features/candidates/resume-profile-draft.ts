import type { CandidateProfileValues } from "./schemas";
import type { CandidateResumeDraft } from "./resume-parser";
import {
  resolveNorthernCyprusDistrict,
  type NorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";
import { trLowercase } from "@/lib/tr-lowercase";

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

function normalize(value: unknown): string {
  if (typeof value !== "string") return "";
  return trLowercase(value)
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ");
}

function mergeEntries<T extends Record<string, unknown>>(
  current: T[] | undefined,
  imported: T[] | undefined,
): { entries: T[]; skipped: number } {
  const entries = [...(current ?? [])];
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
    if (!Object.values(entry).some((value) => (value as string)?.trim())) continue;

    const key = Object.values(entry)
      .map((value) => normalize(value as string))
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
  const internships = mergeEntries(current.internships, draft.internships);
  const education = mergeEntries(current.education, draft.education);
  const languages = mergeEntries(current.languages, draft.languages);
  const certifications = mergeEntries(current.certifications, draft.certifications);
  const courses = mergeEntries(current.courses, draft.courses);
  const projects = mergeEntries(current.projects, draft.projects);
  const publications = mergeEntries(current.publications, draft.publications);
  const awards = mergeEntries(current.awards, draft.awards);
  const volunteer = mergeEntries(current.volunteer, draft.volunteer);
  const references = mergeEntries(current.references, draft.references);
  const headline = current.headline.trim() ? current.headline : draft.headline ?? "";
  const location =
    resolveFirstDistrict(current.location) ??
    resolveFirstDistrict(draft.location) ??
    "";
  const summary = (current.summary.trim() || draft.summary) ?? "";
  const links = mergeEntries(current.links, draft.links);

  // Preserve the full CV text from the imported draft (latest CV import)
  const cvFullText = draft.cvFullText ?? current.cvFullText ?? "";

  return {
    profile: {
      firstName: current.firstName,
      middleName: current.middleName,
      lastName: current.lastName,
      dateOfBirth: current.dateOfBirth,
      gender: current.gender,
      nationality: current.nationality,
      tcNo: current.tcNo,
      passportNo: current.passportNo,
      maritalStatus: current.maritalStatus,
      drivingLicense: current.drivingLicense,
      addressLine: current.addressLine,
      district: current.district,
      municipality: current.municipality,
      postalCode: current.postalCode,
      phone: current.phone,
      email: current.email,
      linkedIn: current.linkedIn,
      github: current.github,
      portfolio: current.portfolio,
      headline,
      location,
      skillsText: current.skillsText,
      experience: experience.entries,
      internships: internships.entries,
      education: education.entries,
      skills,
      languages: languages.entries,
      certifications: certifications.entries,
      courses: courses.entries,
      projects: projects.entries,
      publications: publications.entries,
      awards: awards.entries,
      volunteer: volunteer.entries,
      references: references.entries,
      summary,
      cvFullText,
      links: links.entries,
    },
    added:
      Number(Boolean(!current.headline.trim() && headline.trim())) +
      Number(Boolean(!current.location.trim() && location.trim())) +
      Number(Boolean(!current.summary.trim() && summary.trim())) +
      (skills.length - current.skills.length) +
      (experience.entries.length - current.experience.length) +
      (education.entries.length - current.education.length) +
      (languages.entries.length - current.languages.length) +
      (certifications.entries.length - current.certifications.length) +
      (links.entries.length - current.links.length),
    skipped:
      skipped +
      experience.skipped +
      education.skipped +
      languages.skipped +
      certifications.skipped +
      links.skipped,
  };
}
