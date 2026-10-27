import type { CompanyProfileFields } from "./company-directory-autofill";
import type { CompanyDocumentSuggestions } from "./company-document-parser";
import { getNorthernCyprusDistrictForLocation } from "@/features/locations/northern-cyprus-districts";

export type CompanyDocumentConflict = {
  field: keyof CompanyDocumentSuggestions;
  value: string;
};

const documentFields = [
  "companyName",
  "website",
  "phone",
  "publicEmail",
  "address",
  "municipality",
] as const satisfies readonly (keyof CompanyDocumentSuggestions)[];

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
    const suggestion =
      field === "municipality"
        ? getNorthernCyprusDistrictForLocation({
            address: suggestions.address,
            municipality: suggestions.municipality,
          }) ?? ""
        : suggestions[field]?.trim();
    if (!suggestion) continue;

    const currentValue = fields[field].trim();
    if (!currentValue) {
      fields[field] = suggestion;
      filled += 1;
    } else if (
      currentValue.normalize("NFKC").toLocaleLowerCase() !==
      suggestion.normalize("NFKC").toLocaleLowerCase()
    ) {
      conflicts.push({ field, value: suggestion });
    }
  }

  return { fields, filled, conflicts };
}
