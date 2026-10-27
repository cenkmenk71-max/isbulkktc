"use client";

import {
  DocumentImportError,
  extractTextDocument,
} from "@/features/documents/text-document-extractor";
import {
  hasResumeDraftContent,
  parseResumeText,
  type CandidateResumeDraft,
} from "./resume-parser";

export { DocumentImportError as ResumeImportError };

export async function extractResumeFile(file: File): Promise<CandidateResumeDraft> {
  const text = await extractTextDocument(file);
  const draft = parseResumeText(text);
  if (!hasResumeDraftContent(draft)) throw new DocumentImportError("empty");

  return draft;
}
