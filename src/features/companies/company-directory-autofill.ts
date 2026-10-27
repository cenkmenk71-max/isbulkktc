import { getNorthernCyprusDistrictForLocation } from "@/features/locations/northern-cyprus-districts";

export type CompanyProfileFields = {
  companyName: string;
  profileDescription: string;
  categoriesText: string;
  website: string;
  phone: string;
  publicEmail: string;
  address: string;
  municipality: string;
};

export type CompanyDirectoryAutofillSource = {
  categories: string[];
  website: string | null;
  phone: string | null;
  publicEmail: string | null;
  address: string | null;
  municipality: string | null;
};

export type CompanyDirectoryAutofill = Partial<
  Pick<
    CompanyProfileFields,
    | "categoriesText"
    | "website"
    | "phone"
    | "publicEmail"
    | "address"
    | "municipality"
  >
>;

const autofillableFields = [
  "categoriesText",
  "website",
  "phone",
  "publicEmail",
  "address",
  "municipality",
] as const satisfies readonly (keyof CompanyDirectoryAutofill)[];

export function getCompanyDirectoryAutofill(
  source: CompanyDirectoryAutofillSource,
): CompanyDirectoryAutofill {
  return {
    categoriesText: source.categories.join(", "),
    website: source.website ?? "",
    phone: source.phone ?? "",
    publicEmail: source.publicEmail ?? "",
    address: source.address ?? "",
    municipality:
      getNorthernCyprusDistrictForLocation(source) ?? "",
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
