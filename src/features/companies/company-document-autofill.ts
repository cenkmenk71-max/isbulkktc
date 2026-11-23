import type { CompanyProfileFields } from "./company-directory-autofill";
import type { CompanyDocumentSuggestions } from "./company-document-parser";
import { getNorthernCyprusDistrictForLocation } from "@/features/locations/northern-cyprus-districts";

export type CompanyDocumentConflict = {
  field: keyof CompanyDocumentSuggestions;
  value: string;
};

/** Belge çıkarıcısıyla doldurulabilen firma alanları (KKTC yapısına uygun). */
const documentFields = [
  "tradeName",
  "tradeTitle",
  "taxNumber",
  "tradeRegistryNumber",
  "mersisNo",
  "establishmentDate",
  "capital",
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
] as const satisfies readonly (keyof CompanyDocumentSuggestions)[];

function parseKeywords(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function applyCompanyDocumentAutofill(
  current: CompanyProfileFields,
  suggestions: CompanyDocumentSuggestions,
): {
  fields: CompanyProfileFields;
  filled: number;
  conflicts: CompanyDocumentConflict[];
} {
  const fields = { ...current };
  const conflicts: CompanyDocumentConflict[] = [];
  let filled = 0;

  for (const field of documentFields) {
    const rawSuggestion = suggestions[field];
    let suggestion: string;

    if (
      field === "registeredDistrict" ||
      field === "workplaceDistrict" ||
      field === "registeredMunicipality" ||
      field === "workplaceMunicipality"
    ) {
      const computed = getNorthernCyprusDistrictForLocation({
        address: suggestions.registeredAddress ?? "",
        municipality: suggestions.registeredMunicipality ?? "",
      });
      suggestion = computed ?? (rawSuggestion ?? "").trim();
    } else if (field === "keywords" || field === "categoriesText") {
      suggestion = parseKeywords(rawSuggestion ?? "").join(", ");
    } else {
      suggestion = (rawSuggestion ?? "").trim();
    }

    if (!suggestion) continue;

    const currentValue = fields[field];
    const currentStr =
      typeof currentValue === "string" ? currentValue : JSON.stringify(currentValue);

    if (!currentStr.trim()) {
      fields[field] = suggestion;
      filled += 1;
    } else if (
      currentStr.normalize("NFKC").toLocaleLowerCase() !==
      suggestion.normalize("NFKC").toLocaleLowerCase()
    ) {
      conflicts.push({ field, value: suggestion });
    }
  }

  return { fields, filled, conflicts };
}
