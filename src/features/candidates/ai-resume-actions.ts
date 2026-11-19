"use server";

import { extractLanguagesFromCV } from "@/server/ai/language-extraction";
import { synthesizeCVNarrative, type CVSynthesisResult } from "@/server/ai/cv-synthesis";
import { convertToCandidateLanguages } from "./language-utils";
import type { CandidateLanguage } from "./schemas";
import type { CandidateResumeDraft } from "./resume-parser";

type CandidateResumeDraftWithSynthesis = CandidateResumeDraft & {
  cvSynthesis?: CVSynthesisResult;
};

export async function parseLanguagesWithAI(
  cvText: string,
  locale: string = "tr"
): Promise<CandidateLanguage[]> {
  try {
    const extracted = await extractLanguagesFromCV(cvText, locale);
    return convertToCandidateLanguages(extracted);
  } catch {
    return [];
  }
}

export async function parseResumeTextWithAI(
  text: string,
  locale: string = "tr"
): Promise<CandidateResumeDraftWithSynthesis> {
  const { parseResumeText } = await import("./resume-parser");
  const draft = parseResumeText(text);

  try {
    const synthesis = await synthesizeCVNarrative(draft.cvFullText ?? text, locale);
    return {
      ...draft,
      cvSynthesis: synthesis,
      ...(!draft.summary && synthesis.professionalSummary ? { summary: synthesis.professionalSummary } : {}),
    };
  } catch {
    return draft;
  }
}