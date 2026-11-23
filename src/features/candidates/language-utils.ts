import type { LanguageExtractionResult, ProficiencyCode } from "./language-extraction";
import type { CandidateLanguage } from "./schemas";

const proficiencyToCEFR: Record<string, CandidateLanguage["proficiency"]> = {
  A1: "A1",
  A2: "A2",
  B1: "B1",
  B2: "B2",
  C1: "C1",
  C2: "C2",
  Native: "native",
  native: "native",
};

export function convertToCandidateLanguages(
  extracted: LanguageExtractionResult
): CandidateLanguage[] {
  return extracted.languages.map((lang) => ({
    language: (lang.language_name_standard as CandidateLanguage["language"]) ?? "other",
    proficiency: proficiencyToCEFR[lang.proficiency_code] ?? "native",
    language_name_localized: lang.language_name_localized ?? undefined,
  }));
}