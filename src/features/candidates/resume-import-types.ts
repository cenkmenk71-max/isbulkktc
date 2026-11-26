import type { CandidateResumeDraft } from "./resume-parser";
import type { DocumentImportErrorCode } from "@/features/documents/text-document-extractor";
import type { ParseDiagnostics } from "@/server/ai/cv-parser";

export type ResumeImportErrorCode =
  | DocumentImportErrorCode
  | "parseFailed"
  | "unauthorized"
  | "inactive";

export type ImportResumeFileResult =
  | { ok: true; draft: Omit<CandidateResumeDraft, "cvFullText">; diagnostics?: ParseDiagnostics }
  | { ok: false; code: ResumeImportErrorCode };
