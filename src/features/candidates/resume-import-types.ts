import type { CandidateResumeDraft } from "./resume-parser";
import type { DocumentImportErrorCode } from "@/features/documents/text-document-extractor";

export type ResumeImportErrorCode =
  | DocumentImportErrorCode
  | "parseFailed"
  | "unauthorized"
  | "inactive";

export type ImportResumeFileResult =
  | {
      ok: true;
      draft: Omit<CandidateResumeDraft, "cvFullText">;
      added: number;
      skipped: number;
      filledFields: string[];
    }
  | { ok: false; code: ResumeImportErrorCode };
