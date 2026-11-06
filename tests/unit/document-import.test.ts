import assert from "node:assert/strict";
import test from "node:test";

import {
  DocumentImportError,
  extractTextDocument,
} from "@/features/documents/text-document-extractor";

/**
 * The CV/document import path is the front door of the résumé feature: whatever
 * the visitor uploads is decoded here, then fed to the résumé parser. It had no
 * direct test — the unit layer covered the *parser* but not the *decoder*, and
 * the e2e layer only exercises a UTF-8 fixture. So a decoding regression would
 * ship silently and surface as "the parser read my CV wrong".
 *
 * These assertions pin the observable contract, not the implementation: which
 * inputs are rejected and with which code, and what bytes come back for the
 * encodings a real CV arrives in. `File` is a Node 20+ global, so the real
 * `extractTextDocument` runs end to end — nothing here is mocked.
 */

const textFile = (content: string | Uint8Array, name: string) =>
  new File([content as BlobPart], name);

async function expectCode(
  file: File,
  code: DocumentImportError["code"],
): Promise<void> {
  await assert.rejects(
    () => extractTextDocument(file),
    (error: unknown) =>
      error instanceof DocumentImportError && error.code === code,
    `expected DocumentImportError(${code})`,
  );
}

test("an unsupported extension is rejected", async () => {
  await expectCode(textFile("plain", "notes.rtf"), "unsupported");
});

test("a file with no extension is rejected", async () => {
  await expectCode(textFile("plain", "cv"), "unsupported");
});

test("an empty text file is rejected as empty", async () => {
  await expectCode(textFile("", "cv.txt"), "empty");
});

test("a whitespace-only text file is rejected as empty", async () => {
  await expectCode(textFile("   \n\t  ", "cv.txt"), "empty");
});

test("a file over the 5 MB ceiling is rejected before any decoding", async () => {
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
  await expectCode(new File([oversized], "cv.txt"), "tooLarge");
});

test("a text file over the 80k-character ceiling is rejected", async () => {
  await expectCode(textFile("a".repeat(80_001), "cv.txt"), "tooLarge");
});

test("the extension check is case-insensitive", async () => {
  assert.equal(await extractTextDocument(textFile("hello", "CV.TXT")), "hello");
  assert.equal(await extractTextDocument(textFile("# hi", "CV.MD")), "# hi");
});

test("a UTF-8 BOM is stripped and NUL bytes are removed", async () => {
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x00, 0x42]);
  assert.equal(await extractTextDocument(textFile(withBom, "cv.txt")), "AB");
});

test("a UTF-16 little-endian file (BOM) decodes to its characters", async () => {
  // FF FE + "AB" in UTF-16LE
  const le = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
  assert.equal(await extractTextDocument(textFile(le, "cv.txt")), "AB");
});

test("a UTF-16 big-endian file (BOM) decodes to its characters", async () => {
  // FE FF + "AB" in UTF-16BE. `extractPlainText` reads the BOM and picks the
  // label: the WHATWG `utf-16` label is little-endian only, so a big-endian file
  // needs `utf-16be`. Before #321 the code always used "utf-16", turning this
  // input into "\uFFFE\u4100" mojibake.
  const be = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
  assert.equal(await extractTextDocument(textFile(be, "cv.txt")), "AB");
});

test("a .pdf without a %PDF- header is unreadable, not empty", async () => {
  await expectCode(textFile("this is not a pdf", "cv.pdf"), "unreadable");
});

test("a .docx without the ZIP signature is unreadable", async () => {
  await expectCode(textFile("this is not a docx", "cv.docx"), "unreadable");
});
