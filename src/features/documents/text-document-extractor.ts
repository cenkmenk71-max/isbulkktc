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
  | "unreadable"
  | "legacyDoc";

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
    //
    // The WHATWG `utf-16` label is little-endian only, so a big-endian BOM
    // (`FE FF`) decoded with it yields mojibake (`\uFFFE\u4100…`). Pick the
    // byte-order-specific label; both are mandatory labels Node supports even
    // without full ICU, and each strips its own BOM. A file with no BOM keeps
    // the existing UTF-8 path.
    const bytes = new Uint8Array(data);
    const isUtf16Le = bytes[0] === 0xff && bytes[1] === 0xfe;
    const isUtf16Be = bytes[0] === 0xfe && bytes[1] === 0xff;
    const encoding = isUtf16Be ? "utf-16be" : isUtf16Le ? "utf-16le" : "utf-8";
    text = new TextDecoder(encoding).decode(data);
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

async function extractRtfText(file: File): Promise<string> {
  try {
    const data = await file.arrayBuffer();
    const text = new TextDecoder("utf-8").decode(data);

    // Check for legacy .doc format (OLE compound document)
    if (text.startsWith("\u00D0\u00CF\u0011\u00E0")) {
      throw new DocumentImportError("legacyDoc");
    }

    // Detect charset from \ansicpg{N}
    let encoding = "cp1252";
    const ansicpgMatch = text.match(/\\ansicpg(\d+)/i);
    if (ansicpgMatch) {
      const codePage = parseInt(ansicpgMatch[1], 10);
      // Common code pages: 1252 (Western European), 1254 (Turkish), 1251 (Russian)
      if (codePage === 1252) encoding = "cp1252";
      else if (codePage === 1254) encoding = "cp1254";
      else if (codePage === 1251) encoding = "cp1251";
    }

    // Decode \uN? sequences with \uc override for Unicode offsets
    // \uc count not used in simplified implementation
    let result = "";
    const tokens = text.split(/(\\{[^}]*}|\\\w+|\\\d+|\\'[0-9a-fA-F]{2}|[^{}\\]+)/);

    for (const token of tokens) {
      if (!token) continue;

      if (token.startsWith("\\uc")) {
        const ucMatch = token.match(/\\uc(\d+)/);
        if (ucMatch) { /* uc count parsed but not used in simplified implementation */ }
      } else if (token.startsWith("\\u")) {
        const uMatch = token.match(/\\u(-?\d+)\??/);
        if (uMatch) {
          const code = parseInt(uMatch[1], 10);
          result += String.fromCharCode(code < 0 ? code + 65536 : code);
        }
      } else if (token === "\\par" || token === "\\line") {
        result += "\n";
      } else if (token === "\\tab") {
        result += " ";
      } else if (token.startsWith("\\'")) {
        // Hex encoded character
        const hex = token.slice(2, 4);
        const charCode = parseInt(hex, 16);
        result += String.fromCharCode(charCode);
      } else if (token.startsWith("\\")) {
        // Skip control words (font, size, color, etc.)
        continue;
      } else if (token.startsWith("{") && token.endsWith("}")) {
        // Skip groups
        continue;
      } else {
        result += token;
      }
    }

    // Re-decode using detected encoding if needed
    if (encoding !== "utf-8") {
      try {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(result);
        result = new TextDecoder(encoding).decode(bytes);
      } catch {
        // Fallback to result as-is
      }
    }

    if (result.length > maxExtractedCharacters) {
      throw new DocumentImportError("tooLarge");
    }
    if (!result.trim()) throw new DocumentImportError("empty");
    return result;
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    throw new DocumentImportError("unreadable");
  }
}

async function extractOdtText(file: File): Promise<string> {
  try {
    const data = await file.arrayBuffer();
    const fflate = await import("fflate");
    const zip = fflate.unzipSync(new Uint8Array(data));
    const contentXml = zip["content.xml"];
    if (!contentXml) throw new DocumentImportError("unreadable");

    const xmlText = new TextDecoder("utf-8").decode(contentXml);

    // Extract text from content.xml
    // Remove XML tags and insert newlines on paragraph/heading/table-row boundaries
    const result = xmlText
      .replace(/<text:p[^>]*>/g, "\n")
      .replace(/<\/text:p>/g, "")
      .replace(/<text:h[^>]*>/g, "\n")
      .replace(/<\/text:h>/g, "")
      .replace(/<draw:text[^>]*>/g, "")
      .replace(/<\/draw:text>/g, "")
      .replace(/<table:table-cell[^>]*>/g, "")
      .replace(/<\/table:table-cell>/g, " | ")
      .replace(/<table:table-row[^>]*>/g, "")
      .replace(/<\/table:table-row>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (result.length > maxExtractedCharacters) {
      throw new DocumentImportError("tooLarge");
    }
    if (!result.trim()) throw new DocumentImportError("empty");
    return result;
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    throw new DocumentImportError("unreadable");
  }
}

export async function extractTextDocument(file: File): Promise<string> {
  if (file.size > maxFileBytes) throw new DocumentImportError("tooLarge");

  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "pdf") return extractPdfText(file);
  if (extension === "docx") return extractDocxText(file);
  if (extension === "doc") throw new DocumentImportError("legacyDoc");
  if (extension === "rtf") return extractRtfText(file);
  if (extension === "odt") return extractOdtText(file);
  if (extension && textExtensions.has(extension)) return extractPlainText(file);

  throw new DocumentImportError("unsupported");
}
