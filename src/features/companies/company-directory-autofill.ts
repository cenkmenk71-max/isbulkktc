import { getNorthernCyprusDistrictForLocation } from "@/features/locations/northern-cyprus-districts";

export type CompanyProfileFields = {
  // Temel Ticari Kimlik
  tradeName: string;
  tradeTitle: string;
  companyType: string;
  taxNumber: string;
  tradeRegistryNumber: string;
  mersisNo: string;
  establishmentDate: string;
  capital: string;
  currency: string;

  // Adres Bilgileri
  registeredAddress: string;
  registeredDistrict: string;
  registeredMunicipality: string;
  registeredPostalCode: string;
  workplaceAddress: string;
  workplaceDistrict: string;
  workplaceMunicipality: string;
  workplacePostalCode: string;

  // İletişim
  phone: string;
  fax: string;
  email: string;
  website: string;

  // Yetkililer
  authorizedSignatories: string;

  // Sektör / Faaliyet
  naceCode: string;
  sector: string;
  subSector: string;
  keywords: string;

  // Finans / Diğer
  bankName: string;
  iban: string;
  insuranceNumber: string;
  employeeCount: string;
  annualTurnoverRange: string;

  // Sosyal Medya
  linkedIn: string;
  instagram: string;
  facebook: string;
  twitter: string;
  youtube: string;

  // Profil
  profileDescription: string;
  categoriesText: string;

  // Dizin Hedefi
  directoryTarget: string;
};

export type CompanyDirectoryAutofillSource = Partial<{
  tradeName: string | null;
  tradeTitle: string | null;
  companyType: string | null;
  taxNumber: string | null;
  tradeRegistryNumber: string | null;
  mersisNo: string | null;
  establishmentDate: string | null;
  capital: string | null;
  currency: string | null;
  registeredAddress: string | null;
  registeredDistrict: string | null;
  registeredMunicipality: string | null;
  registeredPostalCode: string | null;
  workplaceAddress: string | null;
  workplaceDistrict: string | null;
  workplaceMunicipality: string | null;
  workplacePostalCode: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  authorizedSignatories: string | null;
  naceCode: string | null;
  sector: string | null;
  subSector: string | null;
  keywords: string | null;
  bankName: string | null;
  iban: string | null;
  insuranceNumber: string | null;
  employeeCount: string | null;
  annualTurnoverRange: string | null;
  linkedIn: string | null;
  instagram: string | null;
  facebook: string | null;
  twitter: string | null;
  youtube: string | null;
  profileDescription: string | null;
  categoriesText: string | null;
  directoryTarget: string | null;
}>;

export type CompanyDirectoryAutofill = Partial<
  Pick<
    CompanyProfileFields,
    | "tradeName"
    | "tradeTitle"
    | "companyType"
    | "taxNumber"
    | "tradeRegistryNumber"
    | "mersisNo"
    | "establishmentDate"
    | "capital"
    | "currency"
    | "registeredAddress"
    | "registeredDistrict"
    | "registeredMunicipality"
    | "registeredPostalCode"
    | "workplaceAddress"
    | "workplaceDistrict"
    | "workplaceMunicipality"
    | "workplacePostalCode"
    | "phone"
    | "fax"
    | "email"
    | "website"
    | "authorizedSignatories"
    | "naceCode"
    | "sector"
    | "subSector"
    | "keywords"
    | "bankName"
    | "iban"
    | "insuranceNumber"
    | "employeeCount"
    | "annualTurnoverRange"
    | "linkedIn"
    | "instagram"
    | "facebook"
    | "twitter"
    | "youtube"
    | "profileDescription"
    | "categoriesText"
    | "directoryTarget"
  >
>;

const autofillableFields = [
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
] as const satisfies readonly (keyof CompanyDirectoryAutofill)[];

export function getCompanyDirectoryAutofill(
  source: CompanyDirectoryAutofillSource,
): CompanyDirectoryAutofill {
  return {
    tradeName: source.tradeName ?? "",
    tradeTitle: source.tradeTitle ?? "",
    companyType: source.companyType ?? "",
    taxNumber: source.taxNumber ?? "",
    tradeRegistryNumber: source.tradeRegistryNumber ?? "",
    mersisNo: source.mersisNo ?? "",
    establishmentDate: source.establishmentDate ?? "",
    capital: source.capital ?? "",
    currency: source.currency ?? "",
    registeredAddress: source.registeredAddress ?? "",
    registeredDistrict: source.registeredDistrict ?? "",
    registeredMunicipality: source.registeredMunicipality ?? "",
    registeredPostalCode: source.registeredPostalCode ?? "",
    workplaceAddress: source.workplaceAddress ?? "",
    workplaceDistrict: source.workplaceDistrict ?? "",
    workplaceMunicipality: source.workplaceMunicipality ?? "",
    workplacePostalCode: source.workplacePostalCode ?? "",
    phone: source.phone ?? "",
    fax: source.fax ?? "",
    email: source.email ?? "",
    website: source.website ?? "",
    authorizedSignatories: source.authorizedSignatories ?? "",
    naceCode: source.naceCode ?? "",
    sector: source.sector ?? "",
    subSector: source.subSector ?? "",
    keywords: source.keywords ?? "",
    bankName: source.bankName ?? "",
    iban: source.iban ?? "",
    insuranceNumber: source.insuranceNumber ?? "",
    employeeCount: source.employeeCount ?? "",
    annualTurnoverRange: source.annualTurnoverRange ?? "",
    linkedIn: source.linkedIn ?? "",
    instagram: source.instagram ?? "",
    facebook: source.facebook ?? "",
    twitter: source.twitter ?? "",
    youtube: source.youtube ?? "",
    profileDescription: source.profileDescription ?? "",
    categoriesText: source.categoriesText ?? "",
    directoryTarget:
      getNorthernCyprusDistrictForLocation({
        address: source.registeredAddress ?? null,
        municipality: source.registeredMunicipality ?? null,
      }) ?? "",
  };
}

export function applyCompanyDirectoryAutofill(
  current: CompanyProfileFields,
  initial: CompanyProfileFields,
  previousAutofill: CompanyDirectoryAutofill,
  suggestions: CompanyDirectoryAutofill,
): { fields: CompanyProfileFields; autofilled: CompanyDirectoryAutofill } {
  const fields = { ...current };
  const autofilled: CompanyDirectoryAutofill = {};

  for (const field of autofillableFields) {
    const previousSuggestion = previousAutofill[field];
    if (previousSuggestion !== undefined && current[field] === previousSuggestion) {
      fields[field] = initial[field];
    }

    const suggestion = suggestions[field]?.trim();
    if (!fields[field].trim() && suggestion) {
      fields[field] = suggestion;
      autofilled[field] = suggestion;
    }
  }

  return { fields, autofilled };
}