"use server";

import { extractLanguagesFromCV } from "@/server/ai/language-extraction";
import { synthesizeCVNarrative, type CVSynthesisResult } from "@/server/ai/cv-synthesis";
import { convertToCandidateLanguages } from "./language-utils";
import { getCurrentUser } from "@/server/dal/user";
import { DocumentImportError, parseResumeFile } from "@/server/ai/cv-parser";
import type { CandidateLanguage } from "./schemas";
import type { CandidateResumeDraft } from "./resume-parser";
import { canImportResume } from "./resume-import-authorization";
import type { ImportResumeFileResult } from "./resume-import-types";

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

export async function importResumeFile(
  formData: FormData,
): Promise<ImportResumeFileResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthorized" };
  if (!canImportResume(user)) return { ok: false, code: "inactive" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, code: "unsupported" };

  const pageImagesRaw = formData.get("pageImages");
  const pageImages = pageImagesRaw ? JSON.parse(pageImagesRaw as string) : undefined;

  try {
    const draft = await parseResumeFile(file, pageImages);
    if (!draft) return { ok: false, code: "empty" };
    const { cvFullText: _cvFullText, ...preview } = draft;
    return { ok: true, draft: preview };
  } catch (error) {
    if (error instanceof DocumentImportError) {
      return { ok: false, code: error.code };
    }
    return { ok: false, code: "parseFailed" };
  }
}
