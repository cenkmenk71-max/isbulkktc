import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPdfTextFallback,
} from "../../src/features/documents/text-document-extractor";
import {
  parseCompanyDocumentAI,
} from "../../src/features/companies/company-document-ai";
import {
  applyCompanyDocumentAutofill,
} from "../../src/features/companies/company-document-autofill";
import {
  parseCompanyDocumentText,
} from "../../src/features/companies/company-document-parser";
import type { CompanyProfileFields } from "../../src/features/companies/company-directory-autofill";
const emptyFields: CompanyProfileFields = {
  companyName: "",
  profileDescription: "",
  categoriesText: "",
  website: "",
  phone: "",
  publicEmail: "",
  address: "",
  municipality: "",
};

test("extracts only explicitly labeled company fields from a Turkish document", () => {
  const suggestions = parseCompanyDocumentText(
    [
      "Ticaret Ünvanı: Ada Teknoloji Ltd.",
      "Kayıtlı Şirket Adresi: 12 Liman Sokak",
      "Belediye: Girne",
      "Şirket Telefonu: +90 392 123 4567",
      "Şirket E-posta: info@ada.example",
      "Şirket Web Sitesi: https://ada.example",
    ].join("\n"),
  );

  assert.deepEqual(suggestions, {
    companyName: "Ada Teknoloji Ltd.",
    address: "12 Liman Sokak",
    municipality: "Girne",
    phone: "+90 392 123 4567",
    publicEmail: "info@ada.example",
    website: "https://ada.example",
  });
});

test("supports label-on-one-line documents and ignores ambiguous personal fields", () => {
  const suggestions = parseCompanyDocumentText(
    [
      "Registered Company Name",
      "Northstar Limited",
      "Registered Address",
      "22 Harbour Road",
      "Email: director@northstar.example",
      "Phone: +90 392 111 1111",
      "Director: Alex Example",
    ].join("\n"),
  );

  assert.deepEqual(suggestions, {
    companyName: "Northstar Limited",
    address: "22 Harbour Road",
  });
});

test("fills blank company fields without replacing existing values", () => {
  const result = applyCompanyDocumentAutofill(
    {
      ...emptyFields,
      companyName: "Existing Company Ltd.",
      phone: "Manually confirmed phone",
    },
    {
      companyName: "Registered Name Ltd.",
      phone: "+90 392 123 4567",
      address: "12 Liman Sokak",
    },
  );

  assert.equal(result.fields.companyName, "Existing Company Ltd.");
  assert.equal(result.fields.phone, "Manually confirmed phone");
  assert.equal(result.fields.address, "12 Liman Sokak");
  assert.equal(result.filled, 1);
  assert.deepEqual(result.conflicts, [
    { field: "companyName", value: "Registered Name Ltd." },
    { field: "phone", value: "+90 392 123 4567" },
  ]);
});

test("ignores invalid or unsupported document values", () => {
  const suggestions = parseCompanyDocumentText(
    [
      "Company Name: " + "x".repeat(121),
      "Company Website: not-a-url",
      "Company Email: not-an-email",
      "Company Phone: 12",
      "Random text: do not use",
    ].join("\n"),
  );

  assert.deepEqual(suggestions, {});
});

test("extracts all eight company fields from a Turkish KKTC Tescil Beyanı", () => {
  const suggestions = parseCompanyDocumentText(
    [
      "Şirket Tam Unvanı: Ada Teknoloji Limited Şirketi",
      "Kayıtlı İlçe / Belediye: Lefkoşa",
      "Açık Merkez Adresi: 12 Liman Sokak, Merkez, Lefkoşa",
      "Kurumsal E-Posta: info@ada.example",
      "Telefon Numarası: +90 392 123 4567",
      "Resmi Web Sitesi: https://ada.example",
      "Ana Faaliyet Alanı: Yazılım geliştirme ve danışmanlık hizmetleri",
      "Hukuki Statü: Limited Şirketi",
    ].join("\n"),
  );

  assert.deepEqual(suggestions, {
    companyName: "Ada Teknoloji Limited Şirketi",
    municipality: "Lefkoşa",
    address: "12 Liman Sokak, Merkez, Lefkoşa",
    publicEmail: "info@ada.example",
    phone: "+90 392 123 4567",
    website: "https://ada.example",
    profileDescription: "Yazılım geliştirme ve danışmanlık hizmetleri",
    categoriesText: "Limited Şirketi",
  });
});

test("extracts company fields from label-then-value table layout", () => {
  const suggestions = parseCompanyDocumentText(
    [
      "Ticari Unvan",
      "Northstar Limited",
      "Kayıtlı İlçe / Belediye",
      "Mağusa",
      "Açık Merkez Adresi",
      "45 Liman Caddesi, Mağusa",
      "Kurumsal E-Posta",
      "contact@northstar.example",
      "Telefon Numarası",
      "+90 392 222 3333",
      "Resmi Web Sitesi",
      "https://northstar.example",
      "Ana Faaliyet Alanı",
      "İthalat ihracat ve müşavirlik",
      "Hukuki Statü",
      "Anonim Şirket",
    ].join("\n"),
  );

  assert.equal(suggestions.companyName, "Northstar Limited");
  assert.equal(suggestions.municipality, "Mağusa");
  assert.equal(suggestions.address, "45 Liman Caddesi, Mağusa");
  assert.equal(suggestions.publicEmail, "contact@northstar.example");
  assert.equal(suggestions.phone, "+90 392 222 3333");
  assert.equal(suggestions.website, "https://northstar.example");
  assert.equal(suggestions.profileDescription, "İthalat ihracat ve müşavirlik");
  assert.equal(suggestions.categoriesText, "Anonim Şirket");
});

test("normalizes municipality from the KKTC district synonyms via autofill", () => {
  const suggestions = parseCompanyDocumentText(
    ["Kayıtlı İlçe / Belediye: Gazimağusa"].join("\n"),
  );
  assert.equal(suggestions.municipality, "Gazimağusa");

  const result = applyCompanyDocumentAutofill(
    emptyFields,
    suggestions,
  );
  assert.equal(result.fields.municipality, "Mağusa");
});

function makePdfBuffer(textContent: string): ArrayBuffer {
  const contentStream = `BT /F1 12 Tf 50 700 Td (${textContent}) Tj ET`;
  const pdf = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${contentStream.length} >> stream`,
    contentStream,
    "endstream",
    "endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000204 00000 n ",
    "0000000300 00000 n ",
    "trailer << /Size 6 /Root 1 0 R >>",
    "startxref",
    "400",
    "%%EOF",
  ].join("\n");
  return new TextEncoder().encode(pdf).buffer as unknown as ArrayBuffer;
}

test("pure JS PDF fallback extracts text from PDF bytes without pdfjs-dist", () => {
  const pdf = makePdfBuffer("Akdeniz Teknoloji ve Ticaret Limited Sirketi");
  const text = extractPdfTextFallback(new Uint8Array(pdf));
  assert.ok(text.includes("Akdeniz Teknoloji"));
  assert.ok(text.includes("Limited Sirketi"));
});

test("pure JS PDF fallback extracts multiple text operators from PDF bytes", () => {
  const pdf = makePdfBuffer(
    "Ticaret Unvani: Akdeniz Teknoloji\nKayitli Ilce: Girne\nMerkez Adres: 12 Liman Sokak",
  );
  const text = extractPdfTextFallback(new Uint8Array(pdf));
  assert.ok(text.includes("Akdeniz Teknoloji"));
  assert.ok(text.includes("Girne"));
  assert.ok(text.includes("12 Liman Sokak"));
});

test("parseCompanyDocumentAI Gemini fills all 8 company fields from raw PDF bytes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      companyName: "Akdeniz Teknoloji ve Ticaret Limited Sirketi",
                      municipality: "Girne",
                      address: "12 Liman Sokak, Merkez, Girne",
                      publicEmail: "info@akdeniz.example",
                      phone: "+90 392 123 4567",
                      website: "https://akdeniz.example",
                      profileDescription: "Yazilim gelistirme ve danismanlik hizmetleri",
                      categories: ["Yazilim", "Danismanlik", "Teknoloji"],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response("{}", { status: 404 });
  };

  const originalEnv = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";

  try {
    const file = new File(
      [makePdfBuffer("Akdeniz Teknoloji ve Ticaret Limited Sirketi")],
      "tescil-beyani.pdf",
      { type: "application/pdf" },
    );

    const suggestions = await parseCompanyDocumentAI(file, "");

    assert.equal(
      suggestions.companyName,
      "Akdeniz Teknoloji ve Ticaret Limited Sirketi",
    );
    assert.equal(suggestions.municipality, "Girne");
    assert.equal(suggestions.address, "12 Liman Sokak, Merkez, Girne");
    assert.equal(suggestions.publicEmail, "info@akdeniz.example");
    assert.equal(suggestions.phone, "+90 392 123 4567");
    assert.equal(suggestions.website, "https://akdeniz.example");
    assert.equal(
      suggestions.profileDescription,
      "Yazilim gelistirme ve danismanlik hizmetleri",
    );
    assert.equal(suggestions.categoriesText, "Yazilim, Danismanlik, Teknoloji");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalEnv;
    }
  }
});

test("parseCompanyDocumentAI returns empty when no AI keys configured", async () => {
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGroq = process.env.GROQ_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GROQ_API_KEY;

  try {
    const file = new File(
      [makePdfBuffer("Some text")],
      "test.pdf",
      { type: "application/pdf" },
    );
    const suggestions = await parseCompanyDocumentAI(file, "");
    assert.deepEqual(suggestions, {});
  } finally {
    if (originalGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGemini;
    if (originalGroq === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalGroq;
  }
});
