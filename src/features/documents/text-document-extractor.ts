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
  const isValidPdf = header.includes("%PDF-");

  const pdfjs =
    typeof window === "undefined"
      ? await import("pdfjs-dist/legacy/build/pdf.mjs")
      : await import("pdfjs-dist");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  const task = pdfjs.getDocument({
    data,
    enableXfa: false,
    stopAtErrors: true,
    useSystemFonts: true,
    disableFontFace: true,
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

    const extractedText = pages.join("\n").slice(0, maxExtractedCharacters);
    return extractedText;
  } catch (error) {
    if (error instanceof DocumentImportError) throw error;
    if (isValidPdf) {
      const fallback = extractPdfTextFallback(data);
      if (fallback.trim()) return fallback;
      return "";
    }
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

/* ── Pure-JS PDF text extractor fallback (zero dependencies) ──────────────

  Used when `pdfjs-dist` cannot run (e.g. Vercel serverless without
  `@napi-rs/canvas`). It scans the PDF byte buffer for text-showing
  operators (`Tj`, `TJ`) and decodes string literals `(...)`, hex literals
  `<hex>` using WinAnsi (cp1252) with UTF-16BE BOM detection.

  This is a best-effort fallback: it recovers visible text from digitally
  encoded PDFs but does not handle embedded fonts, encoding diffs, or
  scanned/image-only pages.
─────────────────────────────────────────────────────────────────────────── */

// Windows-1252 (WinAnsi) code points 0x80–0x9F that differ from ISO-8859-1.
const winAnsiMap: Record<number, string> = {
  0x80: "\u20AC",
  0x82: "\u201A",
  0x83: "\u0192",
  0x84: "\u201E",
  0x85: "\u2026",
  0x86: "\u2020",
  0x87: "\u2021",
  0x88: "\u02C6",
  0x89: "\u2030",
  0x8A: "\u0160",
  0x8B: "\u2039",
  0x8C: "\u0152",
  0x8E: "\u017D",
  0x91: "\u2018",
  0x92: "\u2019",
  0x93: "\u201C",
  0x94: "\u201D",
  0x95: "\u2022",
  0x96: "\u2013",
  0x97: "\u2014",
  0x98: "\u02DC",
  0x99: "\u2122",
  0x9A: "\u0161",
  0x9B: "\u203A",
  0x9C: "\u0153",
  0x9E: "\u017E",
  0x9F: "\u0178",
};

function decodeBytes(bytes: Uint8Array): string {
  // UTF-16BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    let decoded = "";
    for (let i = 0; i < bytes.length; i += 1) {
      const b = bytes[i];
      if (b >= 0x80 && b <= 0x9f && winAnsiMap[b]) {
        decoded += winAnsiMap[b];
      } else {
        decoded += String.fromCharCode(b);
      }
    }
    return decoded;
  }
}

function decodePdfString(raw: string): string {
  const bytes = new Uint8Array(raw.length);
  let j = 0;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === "n") { bytes[j] = 0x0a; i += 2; j += 1; continue; }
      if (next === "r") { bytes[j] = 0x0d; i += 2; j += 1; continue; }
      if (next === "t") { bytes[j] = 0x09; i += 2; j += 1; continue; }
      if (next === "b") { bytes[j] = 0x08; i += 2; j += 1; continue; }
      if (next === "f") { bytes[j] = 0x0c; i += 2; j += 1; continue; }
      if (next === "(" || next === ")" || next === "\\") {
        bytes[j] = next.charCodeAt(0);
        i += 2;
        j += 1;
        continue;
      }
      if (/[0-7]/.test(next)) {
        let octal = "";
        let k = i + 1;
        while (k < raw.length && k - i - 1 < 3 && /[0-7]/.test(raw[k])) {
          octal += raw[k];
          k += 1;
        }
        bytes[j] = parseInt(octal, 8);
        i = k;
        j += 1;
        continue;
      }
      bytes[j] = next.charCodeAt(0);
      i += 2;
      j += 1;
      continue;
    }
    bytes[j] = ch.charCodeAt(0);
    i += 1;
    j += 1;
  }
  return decodeBytes(bytes.subarray(0, j));
}

function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s/g, "");
  if (clean.length % 2 !== 0) return "";
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return decodeBytes(bytes);
}

function findPdfStringEnd(s: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
      i += 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

function extractArrayItems(content: string): string[] {
  const items: string[] = [];
  let i = 0;
  while (i < content.length) {
    if (/\s/.test(content[i])) {
      i += 1;
      continue;
    }
    if (content[i] === "(") {
      const end = findPdfStringEnd(content, i);
      if (end === -1) {
        i += 1;
        continue;
      }
      items.push(decodePdfString(content.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    if (content[i] === "<") {
      const end = content.indexOf(">", i);
      if (end === -1) {
        i += 1;
        continue;
      }
      items.push(decodeHexString(content.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    // Skip numbers, brackets, and other non-string tokens.
    i += 1;
  }
  return items;
}

function extractTextFromContentStream(stream: string): string {
  const parts: string[] = [];

  // Handle [ ... ] TJ arrays.
  const tjArrayRegex = /\[\s*([\s\S]*?)\]\s*TJ/g;
  let arrayMatch: RegExpExecArray | null;
  while ((arrayMatch = tjArrayRegex.exec(stream)) !== null) {
    const items = extractArrayItems(arrayMatch[1]);
    parts.push(...items);
  }

  // Remove processed TJ arrays so their strings are not double-counted.
  const cleaned = stream.replace(/\[\s*[\s\S]*?\]\s*TJ/g, " ");

  // Handle (...) Tj and <hex> Tj.
  let i = 0;
  while (i < cleaned.length) {
    if (/\s/.test(cleaned[i])) {
      i += 1;
      continue;
    }

    if (cleaned[i] === "(") {
      const end = findPdfStringEnd(cleaned, i);
      if (end === -1) {
        i += 1;
        continue;
      }
      const raw = cleaned.slice(i + 1, end);
      i = end + 1;
      while (i < cleaned.length && /\s/.test(cleaned[i])) i += 1;
      if (cleaned.startsWith("Tj", i)) {
        parts.push(decodePdfString(raw));
        i += 2;
      }
      continue;
    }

    if (cleaned[i] === "<") {
      const end = cleaned.indexOf(">", i);
      if (end === -1) {
        i += 1;
        continue;
      }
      const raw = cleaned.slice(i + 1, end);
      i = end + 1;
      while (i < cleaned.length && /\s/.test(cleaned[i])) i += 1;
      if (cleaned.startsWith("Tj", i)) {
        parts.push(decodeHexString(raw));
        i += 2;
      }
      continue;
    }

    // Skip operator names and other tokens.
    if (/[a-zA-Z]/.test(cleaned[i])) {
      let j = i;
      while (j < cleaned.length && /[a-zA-Z]/.test(cleaned[j])) j += 1;
      i = j;
      continue;
    }

    i += 1;
  }

  return parts.join(" ");
}

export function extractPdfTextFallback(data: Uint8Array): string {
  let str = "";
  for (let i = 0; i < data.length; i += 1) {
    str += String.fromCharCode(data[i]);
  }

  const texts: string[] = [];
  const textObjRegex = /BT([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = textObjRegex.exec(str)) !== null) {
    const pageText = extractTextFromContentStream(match[1]);
    if (pageText.trim()) texts.push(pageText);
  }

  return texts.join("\n");
}
