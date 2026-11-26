"use server";

import { getCurrentUser } from "@/server/dal/user";
import { DocumentImportError, extractTextDocument } from "@/features/documents/text-document-extractor";
import type { DocumentImportErrorCode } from "@/features/documents/text-document-extractor";
import { parseCompanyDocumentText } from "./company-document-parser";
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

const validImage = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

function parsePageImages(raw: unknown): string[] | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 2 ||
      !parsed.every((image): image is string => typeof image === "string" && validImage.test(image))
    ) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function importCompanyDocument(
  formData: FormData,
): Promise<ImportCompanyDocumentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthorized" };
  if (user.status !== "active") return { ok: false, code: "inactive" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, code: "unsupported" };

  const pageImages = parsePageImages(formData.get("pageImages"));

  let text: string;
  try {
    text = await extractTextDocument(file);
  } catch (error) {
    if (error instanceof DocumentImportError) {
      return { ok: false, code: mapDocumentErrorCode(error.code) };
    }
    return { ok: false, code: "unreadable" };
  }

  if (!text.trim()) return { ok: false, code: "empty" };

  const localSuggestions = parseCompanyDocumentText(text);

  let aiSuggestions: CompanyDocumentSuggestions = {};
  try {
    aiSuggestions = await parseCompanyDocumentAI(file, text, pageImages);
  } catch {
    aiSuggestions = {};
  }

  // Merge: local rule-based parser is authoritative for clearly labeled text;
  // AI fills any fields the local parser missed (tables, scanned layouts).
  const suggestions: CompanyDocumentSuggestions = { ...localSuggestions };
  for (const field of Object.keys(aiSuggestions) as (keyof CompanyDocumentSuggestions)[]) {
    const value = aiSuggestions[field];
    if (value && !suggestions[field]) {
      suggestions[field] = value;
    }
  }

  if (!hasContent(suggestions)) return { ok: false, code: "empty" };

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

// Exported for tests that want to run the merge without a File.
export function mergeCompanySuggestions(
  local: CompanyDocumentSuggestions,
  ai: CompanyDocumentSuggestions,
): CompanyDocumentSuggestions {
  const suggestions: CompanyDocumentSuggestions = { ...local };
  for (const field of Object.keys(ai) as (keyof CompanyDocumentSuggestions)[]) {
    const value = ai[field];
    if (value && !suggestions[field]) suggestions[field] = value;
  }
  return suggestions;
}
