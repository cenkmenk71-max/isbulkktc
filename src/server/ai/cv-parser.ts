import "server-only";

import {
  DocumentImportError,
  extractResumeDocument,
} from "./cv-text-extractor";
import { parseResumeWithFallback, type ParseDiagnostics } from "./cv-parser-core";

export { DocumentImportError };
export type { ParseDiagnostics };

export async function parseResumeFile(file: File, pageImages?: string[]) {
  const text = await extractResumeDocument(file);
  const hasGeminiKey = !!process.env.GEMINI_API_KEY;
  const { draft, diagnostics } = await parseResumeWithFallback(file, text, {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_CV_MODEL,
    geminiFallbackModel: process.env.GEMINI_CV_FALLBACK_MODEL,
    groqApiKey: process.env.GROQ_API_KEY,
    groqModel: process.env.GROQ_CV_MODEL,
    groqVisionModel: process.env.GROQ_CV_VISION_MODEL,
  }, pageImages);

  if (!draft) {
    if (!text.trim() && !hasGeminiKey) {
      throw new DocumentImportError("unreadable");
    }
    // Log diagnostics for debugging
    console.warn("[cv-parser] Parse failed or produced no draft", {
      providerUsed: diagnostics.providerUsed,
      fallbackReason: diagnostics.fallbackReason,
      warnings: diagnostics.warnings,
      textQuality: diagnostics.textQuality,
    });
    return null;
  }

  // Log successful parse with diagnostics
  console.info("[cv-parser] Parse successful", {
    providerUsed: diagnostics.providerUsed,
    fallbackReason: diagnostics.fallbackReason,
    warnings: diagnostics.warnings,
    hasExperience: draft.experience?.length ?? 0,
    hasEducation: draft.education?.length ?? 0,
    hasLanguages: draft.languages?.length ?? 0,
    hasCertifications: draft.certifications?.length ?? 0,
  });

  return draft;
}
