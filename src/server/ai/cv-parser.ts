import "server-only";

import {
  DocumentImportError,
  extractResumeDocument,
} from "./cv-text-extractor";
import { parseResumeWithFallback } from "./cv-parser-core";

export { DocumentImportError };

export async function parseResumeFile(file: File) {
  const text = await extractResumeDocument(file);
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const draft = await parseResumeWithFallback(file, text, {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_CV_MODEL,
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_CV_MODEL,
  });

  if (!draft) {
    if (!text.trim() && !hasGeminiKey) {
      throw new DocumentImportError("unreadable");
    }
    return null;
  }

  return draft;
}
