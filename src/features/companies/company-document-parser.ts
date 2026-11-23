import type { CompanyProfileFields } from "./company-directory-autofill";

const companyDocumentFields = [
  "tradeName",
  "tradeTitle",
  "companyType",
  "taxNumber",
  "tradeRegistryNumber",
  "mersisNo",
  "establishmentDate",
  "capital",
  "currency",
  "registeredAddress",
  "registeredDistrict",
  "registeredMunicipality",
  "registeredPostalCode",
  "workplaceAddress",
  "workplaceDistrict",
  "workplaceMunicipality",
  "workplacePostalCode",
  "phone",
  "fax",
  "email",
  "website",
  "authorizedSignatories",
  "naceCode",
  "sector",
  "subSector",
  "keywords",
  "bankName",
  "iban",
  "insuranceNumber",
  "employeeCount",
  "annualTurnoverRange",
  "linkedIn",
  "instagram",
  "facebook",
  "twitter",
  "youtube",
  "profileDescription",
  "categoriesText",
  "directoryTarget",
] as const;

type CompanyDocumentField = (typeof companyDocumentFields)[number];

export type CompanyDocumentSuggestions = Partial<Record<CompanyDocumentField, string>>;

const fieldLabels: Record<CompanyDocumentField, string[]> = {
  tradeName: [
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
  tradeTitle: [
    "trade title",
    "commercial title",
    "ticaret adi",
    "ticaret adı",
    "ticari unvan",
    "ticari ünvan",
  ],
  companyType: [
    "company type",
    "legal form",
    "sirket turu",
    "şirket türü",
    "ltd",
    "anonim",
    "kollektif",
    "komandit",
    "sahis",
    "sahıs",
  ],
  taxNumber: [
    "tax number",
    "tax id",
    "vat number",
    "vergi no",
    "vergi numarası",
    "vergı no",
    "vergı numarası",
  ],
  tradeRegistryNumber: [
    "trade registry number",
    "commercial registry number",
    "registry number",
    "ticaret sicil no",
    "ticaret sicil numarası",
    "sicil no",
    "sicil numarası",
  ],
  mersisNo: [
    "mersis",
    "mersis no",
    "mersis numarası",
    "mersis no.",
  ],
  establishmentDate: [
    "establishment date",
    "foundation date",
    "incorporation date",
    "kurulus tarihi",
    "kuruluş tarihi",
    "kuruldugu tarih",
    "kurulduğu tarih",
  ],
  capital: [
    "capital",
    "share capital",
    "registered capital",
    "sermaye",
    "kayitli sermaye",
    "kaydedilmiş sermaye",
  ],
  currency: [
    "currency",
    "para birimi",
    "currency code",
  ],
  registeredAddress: [
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
  registeredDistrict: [
    "registered district",
    "registered ilce",
    "kayitli ilce",
    "kayıtlı ilçe",
    "belediye",
    "ilce",
    "sehir",
    "şehir",
    "город",
    "муниципалитет",
    "δήμος",
    "πόλη",
    "شهر",
    "شهرداری",
    "gemeinde",
    "stadt",
  ],
  registeredMunicipality: [
    "municipality",
    "belediye",
    "city",
    "town",
    "district",
    "sehir",
    "şehir",
  ],
  registeredPostalCode: [
    "postal code",
    "zip code",
    "posta kodu",
    "posta kodu",
    "zip",
    "postcode",
  ],
  workplaceAddress: [
    "workplace address",
    "business address",
    "office address",
    "is yeri adresi",
    "işyeri adresi",
    "calisma yeri adresi",
    "çalışma yeri adresi",
  ],
  workplaceDistrict: [
    "workplace district",
    "workplace ilce",
    "is yeri ilcesi",
    "işyeri ilçesi",
    "is ilcesi",
    "iş ilçesi",
  ],
  workplaceMunicipality: [
    "workplace municipality",
    "workplace belediye",
    "is yeri belediyesi",
    "işyeri belediyesi",
  ],
  workplacePostalCode: [
    "workplace postal code",
    "workplace zip code",
    "is yeri posta kodu",
    "işyeri posta kodu",
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
    "işletme telefonu",
    "ofis telefonu",
    "cep telefonu",
    "telefon",
    "phone",
    "tel",
    "tlf",
    "τηλέφωνο εταιρείας",
    "تلفن شرکت",
    "unternehmenstelefon",
    "geschäftstelefon",
  ],
  fax: [
    "fax",
    "faks",
    "faks numarası",
    "fakstelefon",
  ],
  email: [
    "company email",
    "business email",
    "company e-mail",
    "business e-mail",
    "sirket e-posta",
    "isletme e-posta",
    "e-posta",
    "eposta",
    "email",
    "e-mail",
    "ηλεκτρονικό ταχυδρομείο εταιρείας",
    "ایمیل شرکت",
    "unternehmens-e-mail",
  ],
  website: [
    "company website",
    "business website",
    "company web address",
    "sirket web sitesi",
    "isletme web sitesi",
    "web sitesi",
    "web site",
    "site",
    "http",
    "https",
    "www",
    "ιστοσελίδα εταιρείας",
    "وب‌سایت شرکت",
    "unternehmenswebsite",
  ],
  authorizedSignatories: [
    "authorized signatory",
    "authorized signatories",
    "signatory",
    "imza yetkilisi",
    "imza yetkilileri",
    "yetkili kisi",
    "yetkili kişi",
    "yetkili temsilci",
  ],
  naceCode: [
    "nace code",
    "nace",
    "nace kodu",
    "nace code",
    "activity code",
    "faaliyet kodu",
  ],
  sector: [
    "sector",
    "industry",
    "sektor",
    "sirket sektoru",
    "faaliyet alani",
    "faaliyet alanı",
  ],
  subSector: [
    "sub sector",
    "subsector",
    "alt sektör",
    "alt sektor",
    "sub-sector",
  ],
  keywords: [
    "keywords",
    "anahtar kelime",
    "anahtar kelimeler",
    "tags",
    "etiketler",
  ],
  bankName: [
    "bank name",
    "banka adi",
    "banka adı",
    "bank",
  ],
  iban: [
    "iban",
    "iban no",
    "iban numarası",
    "bank account",
    "hesap numarası",
  ],
  insuranceNumber: [
    "insurance number",
    "insurance no",
    "sigorta no",
    "sigorta numarası",
    "sgk",
  ],
  employeeCount: [
    "employee count",
    "number of employees",
    "staff count",
    "calisan sayisi",
    "çalışan sayısı",
    "personel sayısı",
    "employee",
    "staff",
  ],
  annualTurnoverRange: [
    "annual turnover",
    "turnover",
    "revenue",
    "ciro",
    "yıllık ciro",
    "yıllık ciro araligi",
    "yıllık ciro aralığı",
  ],
  linkedIn: [
    "linkedin",
    "linkedin url",
    "linkedin link",
  ],
  instagram: [
    "instagram",
    "instagram url",
    "instagram link",
  ],
  facebook: [
    "facebook",
    "facebook url",
    "facebook link",
  ],
  twitter: [
    "twitter",
    "x",
    "twitter url",
    "twitter link",
  ],
  youtube: [
    "youtube",
    "youtube url",
    "youtube link",
    "kanal",
  ],
  profileDescription: [
    "profile description",
    "company description",
    "about company",
    "hakkinda",
    "hakkımızda",
    "sirket hakkında",
    "firma hakkında",
    "description",
    "aciklama",
    "açıklama",
  ],
  categoriesText: [
    "categories",
    "category",
    "kategori",
    "kategoriler",
    "sektor kategorisi",
    "business category",
  ],
  directoryTarget: [
    "directory target",
    "dizin hedefi",
    "rehber hedefi",
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

  const maximumLength: Record<CompanyDocumentField, number> = {
    tradeName: 120,
    tradeTitle: 120,
    companyType: 20,
    taxNumber: 10,
    tradeRegistryNumber: 60,
    mersisNo: 16,
    establishmentDate: 10,
    capital: 50,
    currency: 3,
    registeredAddress: 500,
    registeredDistrict: 120,
    registeredMunicipality: 120,
    registeredPostalCode: 5,
    workplaceAddress: 500,
    workplaceDistrict: 120,
    workplaceMunicipality: 120,
    workplacePostalCode: 5,
    phone: 80,
    fax: 80,
    email: 254,
    website: 2_048,
    authorizedSignatories: 1_000,
    naceCode: 4,
    sector: 80,
    subSector: 80,
    keywords: 1_000,
    bankName: 120,
    iban: 30,
    insuranceNumber: 60,
    employeeCount: 20,
    annualTurnoverRange: 20,
    linkedIn: 2_048,
    instagram: 2_048,
    facebook: 2_048,
    twitter: 2_048,
    youtube: 2_048,
    profileDescription: 2_000,
    categoriesText: 1_000,
    directoryTarget: 160,
  };

  if (!cleaned || cleaned.length > maximumLength[field]) return "";
  if (field === "website" && !/^https?:\/\/\S+$/i.test(cleaned)) return "";
  if (
    field === "email" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)
  ) {
    return "";
  }
  if (field === "phone" && cleaned.replace(/\D/g, "").length < 5) return "";
  if (
    field === "taxNumber" &&
    !/^\d{10}$/.test(cleaned.replace(/\D/g, ""))
  ) {
    return "";
  }
  if (field === "mersisNo" && !/^\d{16}$/.test(cleaned.replace(/\D/g, ""))) {
    return "";
  }
  if (field === "registeredPostalCode" && !/^\d{5}$/.test(cleaned)) return "";
  if (field === "workplacePostalCode" && !/^\d{5}$/.test(cleaned)) return "";
  if (field === "capital" && !/^\d[\d.,]*$/.test(cleaned)) return "";
  if (
    field === "establishmentDate" &&
    !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)
  ) {
    return "";
  }
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