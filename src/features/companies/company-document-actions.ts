"use server";

import { getCurrentUser } from "@/server/dal/user";
import { DocumentImportError, extractTextDocument } from "@/features/documents/text-document-extractor";
import type { DocumentImportErrorCode } from "@/features/documents/text-document-extractor";
import {
  parseCompanyDocumentText,
  mergeCompanySuggestions,
} from "./company-document-parser";
import { parseCompanyDocumentAI } from "./company-document-ai";
import type { CompanyDocumentSuggestions } from "./company-document-parser";

export type ImportCompanyDocumentCode =
  | "unauthorized"
  | "inactive"
  | "unsupported"
  | "empty"
  | "unreadable"
  | "tooLarge"
  | "tooManyPages"
  | "parseFailed";

export type ImportCompanyDocumentResult =
  | { ok: true; suggestions: CompanyDocumentSuggestions }
  | { ok: false; code: ImportCompanyDocumentCode };

export async function importCompanyDocument(
  formData: FormData,
): Promise<ImportCompanyDocumentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthorized" };
  if (user.status !== "active") return { ok: false, code: "inactive" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, code: "unsupported" };

  // Extract text layer when possible, but never short-circuit on empty text:
  // the raw PDF bytes are always handed to the AI layer (Gemini can read
  // application/pdf inlineData directly), so a scanned or pdfjs-broken PDF
  // can still yield all 8 fields.
  let text = "";
  let pdfExtractionFailed = false;
  try {
    text = await extractTextDocument(file);
  } catch (error) {
    if (error instanceof DocumentImportError) {
      return { ok: false, code: mapDocumentErrorCode(error.code) };
    }
    pdfExtractionFailed = true;
    text = "";
    console.error("[company-doc] PDF text extraction failed", {
      error: error instanceof Error ? error.message : String(error),
      fileName: file.name,
      fileType: file.type,
    });
  }

  console.info("[company-doc] Text extraction complete", {
    textLength: text.length,
    pdfExtractionFailed,
    fileName: file.name,
  });

  const localSuggestions = parseCompanyDocumentText(text);

  let aiSuggestions: CompanyDocumentSuggestions = {};
  try {
    aiSuggestions = await parseCompanyDocumentAI(file, text);
    console.info("[company-doc] AI extraction complete", {
      fieldsFilled: Object.keys(aiSuggestions).length,
      fields: Object.keys(aiSuggestions),
    });
  } catch (error) {
    aiSuggestions = {};
    console.error("[company-doc] AI extraction threw", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Merge: local rule-based parser is authoritative for clearly labeled text;
  // AI fills any fields the local parser missed (tables, scanned layouts).
  const suggestions = mergeCompanySuggestions(localSuggestions, aiSuggestions);

  console.info("[company-doc] Document parsed", {
    totalFieldsFilled: Object.keys(suggestions).length,
    fields: Object.keys(suggestions),
    pdfExtractionFailed,
  });

  if (!hasContent(suggestions)) {
    if (pdfExtractionFailed || !text.trim()) return { ok: false, code: "unreadable" };
    return { ok: false, code: "empty" };
  }

  return { ok: true, suggestions };
}

function hasContent(suggestions: CompanyDocumentSuggestions): boolean {
  return Boolean(
    suggestions.companyName ||
      suggestions.website ||
      suggestions.phone ||
      suggestions.publicEmail ||
      suggestions.address ||
      suggestions.municipality ||
      suggestions.profileDescription ||
      suggestions.categoriesText,
  );
}

function mapDocumentErrorCode(code: DocumentImportErrorCode): ImportCompanyDocumentCode {
  switch (code) {
    case "legacyDoc":
      return "unreadable";
    default:
      return code;
  }
}
