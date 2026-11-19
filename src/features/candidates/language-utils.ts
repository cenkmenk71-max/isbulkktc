import type { LanguageExtractionResult, ProficiencyCode } from "./language-extraction";

export function convertToCandidateLanguages(
  extracted: LanguageExtractionResult
): Array<{ name: string; proficiency: ProficiencyCode }> {
  return extracted.languages.map((lang) => ({
    name: lang.language_name_standard,
    proficiency: lang.proficiency_code as ProficiencyCode,
  }));
}