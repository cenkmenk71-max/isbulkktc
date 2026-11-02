"use client";

const maxFileBytes = 5 * 1024 * 1024;
const maxPdfPages = 25;
const maxExtractedCharacters = 80_000;

const textExtensions = new Set(["txt", "md", "markdown", "text"]);

export type DocumentImportErrorCode =
  | "unsupported"
  | "tooLarge"
  | "tooManyPages"
  | "empty"
  | "unreadable";

export class DocumentImportError extends Error {
  constructor(readonly code: DocumentImportErrorCode) {
    super(code);
    this.name = "DocumentImportError";
  }
}

async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder().decode(data.subarray(0, 1_024));
  if (!header.includes("%PDF-")) throw new DocumentImportError("unreadable");

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const task = pdfjs.getDocument({
    data,
    enableXfa: false,
    stopAtErrors: true,
  });

  try {
    const document = await task.promise;
    if (document.numPages > maxPdfPages) {
      throw new DocumentImportError("tooManyPages");
    }

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";

      for (const item of content.items) {
        if (!("str" in item) || typeof item.str !== "string") continue;
        pageText += `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
        if (pageText.length > maxExtractedCharacters) {
          throw new DocumentImportError("tooLarge");
        }
      }

      pages.push(pageText);
      await page.cleanup();
    }

    return pages.join("\n").slice(0, maxExtractedCharacters);
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    throw new DocumentImportError("unreadable");
  } finally {
    await task.destroy();
  }
}

async function extractDocxText(file: File): Promise<string> {
  try {
    const data = await file.arrayBuffer();
    const signature = new Uint8Array(data.slice(0, 4));
    if (
      signature[0] !== 0x50 ||
      signature[1] !== 0x4b ||
      signature[2] !== 0x03 ||
      signature[3] !== 0x04
    ) {
      throw new DocumentImportError("unreadable");
    }

    const mammoth = await import("mammoth");
    const result = await mammoth.default.extractRawText({ arrayBuffer: data });
    if (result.value.length > maxExtractedCharacters) {
      throw new DocumentImportError("tooLarge");
    }
    return result.value;
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    throw new DocumentImportError("unreadable");
  }
}

async function extractPlainText(file: File): Promise<string> {
  let text: string;
  try {
    const data = await file.arrayBuffer();
    // CVs exported from macOS/Windows editors are frequently UTF-16 or carry a
    // BOM; decoding those as UTF-8 turns every character into a replacement
    // glyph, which the parser then reads as one unbroken token.
    const bytes = new Uint8Array(data);
    const isUtf16 =
      (bytes[0] === 0xff && bytes[1] === 0xfe) ||
      (bytes[0] === 0xfe && bytes[1] === 0xff);
    text = new TextDecoder(isUtf16 ? "utf-16" : "utf-8").decode(data);
  } catch {
    throw new DocumentImportError("unreadable");
  }

  text = text.replace(/^\uFEFF/, "").replace(/\u0000/g, "");
  if (text.length > maxExtractedCharacters) {
    throw new DocumentImportError("tooLarge");
  }
  if (!text.trim()) throw new DocumentImportError("empty");
  return text;
}

export async function extractTextDocument(file: File): Promise<string> {
  if (file.size > maxFileBytes) throw new DocumentImportError("tooLarge");

  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "pdf") return extractPdfText(file);
  if (extension === "docx") return extractDocxText(file);
  if (extension && textExtensions.has(extension)) return extractPlainText(file);

  throw new DocumentImportError("unsupported");
}
