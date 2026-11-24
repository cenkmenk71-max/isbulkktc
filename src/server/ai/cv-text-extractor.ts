import "server-only";

import {
  extractTextDocument,
  type DocumentImportErrorCode,
} from "@/features/documents/text-document-extractor";

export { DocumentImportError } from "@/features/documents/text-document-extractor";
export type { DocumentImportErrorCode };

export async function extractResumeDocument(file: File): Promise<string> {
  return extractTextDocument(file);
}
