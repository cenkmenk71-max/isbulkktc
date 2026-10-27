import type { CompanyProfileFields } from "./company-directory-autofill";

export type CompanyDocumentSuggestions = Partial<
  Pick<
    CompanyProfileFields,
    | "companyName"
    | "website"
    | "phone"
    | "publicEmail"
    | "address"
    | "municipality"
  >
>;

type CompanyDocumentField = keyof CompanyDocumentSuggestions;

const fieldLabels: Record<CompanyDocumentField, string[]> = {
  companyName: [
    "company name",
    "registered company name",
    "legal company name",
    "registered name",
    "legal name",
    "firm name",
    "ticaret unvani",
    "sirket unvani",
    "sirket adi",
    "isletme unvani",
    "isletme adi",
    "наименование компании",
    "юридическое наименование",
    "επωνυμία εταιρείας",
    "νομική επωνυμία",
    "نام شرکت",
    "نام رسمی شرکت",
    "firmenname",
    "unternehmensname",
  ],
  address: [
    "registered address",
    "registered office address",
    "company address",
    "business address",
    "registered office",
    "sirket adresi",
    "kayitli sirket adresi",
    "merkez adresi",
    "юридический адрес",
    "адрес компании",
    "διεύθυνση εταιρείας",
    "διεύθυνση έδρας",
    "نشانی شرکت",
    "آدرس شرکت",
    "geschäftsanschrift",
    "unternehmensadresse",
  ],
  municipality: [
    "municipality",
    "city",
    "town",
    "district",
    "belediye",
    "ilce",
    "sehir",
    "город",
    "муниципалитет",
    "δήμος",
    "πόλη",
    "شهر",
    "شهرداری",
    "gemeinde",
    "stadt",
  ],
  website: [
    "company website",
    "business website",
    "company web address",
    "sirket web sitesi",
    "isletme web sitesi",
    "ιστοσελίδα εταιρείας",
    "وب‌سایت شرکت",
    "unternehmenswebsite",
  ],
  phone: [
    "company phone",
    "business phone",
    "office phone",
    "company telephone",
    "business telephone",
    "sirket telefonu",
    "isletme telefonu",
    "ofis telefonu",
    "τηλέφωνο εταιρείας",
    "تلفن شرکت",
    "unternehmenstelefon",
    "geschäftstelefon",
  ],
  publicEmail: [
    "company email",
    "business email",
    "company e-mail",
    "business e-mail",
    "sirket e-posta",
    "isletme e-posta",
    "ηλεκτρονικό ταχυδρομείο εταιρείας",
    "ایمیل شرکت",
    "unternehmens-e-mail",
  ],
};

function normalizeLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[ıİ]/g, "i")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const labels = new Map<string, CompanyDocumentField>();
for (const [field, fieldNames] of Object.entries(fieldLabels) as [
  CompanyDocumentField,
  string[],
][]) {
  for (const label of fieldNames) labels.set(normalizeLabel(label), field);
}

function normalizeValue(field: CompanyDocumentField, value: string): string {
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const maximumLength = {
    companyName: 120,
    website: 2_048,
    phone: 80,
    publicEmail: 254,
    address: 240,
    municipality: 120,
  }[field];

  if (!cleaned || cleaned.length > maximumLength) return "";
  if (field === "website" && !/^https?:\/\/\S+$/i.test(cleaned)) return "";
  if (
    field === "publicEmail" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)
  ) {
    return "";
  }
  if (field === "phone" && cleaned.replace(/\D/g, "").length < 5) return "";
  return cleaned;
}

function parseDelimitedLine(line: string): {
  field: CompanyDocumentField;
  value: string;
} | null {
  const match = line.match(/^(.{1,80}?)(?:\s*[:：=]\s*|\t+|\s{2,})(.+)$/u);
  if (!match?.[1] || !match[2]) return null;

  const field = labels.get(normalizeLabel(match[1]));
  if (!field) return null;

  const value = normalizeValue(field, match[2]);
  return value ? { field, value } : null;
}

export function parseCompanyDocumentText(
  text: string,
): CompanyDocumentSuggestions {
  const suggestions: CompanyDocumentSuggestions = {};
  const lines = text
    .split(/\r\n?|\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;

    const delimited = parseDelimitedLine(line);
    if (delimited && !suggestions[delimited.field]) {
      suggestions[delimited.field] = delimited.value;
      continue;
    }

    const field = labels.get(normalizeLabel(line));
    const followingLine = lines[index + 1];
    if (
      field &&
      followingLine &&
      !labels.has(normalizeLabel(followingLine)) &&
      !suggestions[field]
    ) {
      const value = normalizeValue(field, followingLine);
      if (value) {
        suggestions[field] = value;
        index += 1;
      }
    }
  }

  return suggestions;
}
