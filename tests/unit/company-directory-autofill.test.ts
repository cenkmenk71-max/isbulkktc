import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCompanyDirectoryAutofill,
  getCompanyDirectoryAutofill,
  type CompanyProfileFields,
} from "../../src/features/companies/company-directory-autofill";

const completeEmptyFields: CompanyProfileFields = {
  tradeName: "",
  tradeTitle: "",
  companyType: "",
  taxNumber: "",
  tradeRegistryNumber: "",
  mersisNo: "",
  establishmentDate: "",
  capital: "",
  currency: "",
  registeredAddress: "",
  registeredDistrict: "",
  registeredMunicipality: "",
  registeredPostalCode: "",
  workplaceAddress: "",
  workplaceDistrict: "",
  workplaceMunicipality: "",
  workplacePostalCode: "",
  phone: "",
  fax: "",
  email: "",
  website: "",
  authorizedSignatories: "",
  naceCode: "",
  sector: "",
  subSector: "",
  keywords: "",
  bankName: "",
  iban: "",
  insuranceNumber: "",
  employeeCount: "",
  annualTurnoverRange: "",
  linkedIn: "",
  instagram: "",
  facebook: "",
  twitter: "",
  youtube: "",
  profileDescription: "",
  categoriesText: "",
  directoryTarget: "",
};

const initialFields: CompanyProfileFields = {
  ...completeEmptyFields,
  tradeName: "Northstar Studio",
};

test("fills only blank profile fields from a selected directory listing", () => {
  const suggestions = getCompanyDirectoryAutofill({
    categoriesText: "Design",
    website: "https://northstar.example",
    phone: "+90 392 123 4567",
    email: null,
    registeredAddress: "Girne",
    registeredMunicipality: null,
  });
  const result = applyCompanyDirectoryAutofill(
    {
      ...initialFields,
      phone: "Manually confirmed phone",
    },
    initialFields,
    {},
    suggestions,
  );

  assert.equal(result.fields.tradeName, "Northstar Studio");
  assert.equal(result.fields.categoriesText, "Design");
  assert.equal(result.fields.website, "https://northstar.example");
  assert.equal(result.fields.phone, "Manually confirmed phone");
  assert.equal(result.fields.email, "");
  assert.equal(result.fields.registeredAddress, "Girne");
  assert.equal(result.fields.registeredMunicipality, "");
  assert.equal(result.fields.profileDescription, "");
  assert.equal(result.autofilled.phone, undefined);
});

test("updates untouched suggestions when a different directory branch is selected", () => {
  const first = applyCompanyDirectoryAutofill(
    initialFields,
    initialFields,
    {},
    getCompanyDirectoryAutofill({
      categoriesText: "Retail",
      website: null,
      phone: "+90 392 111 1111",
      email: null,
      registeredAddress: "First branch",
      registeredMunicipality: "Girne",
    }),
  );
  const second = applyCompanyDirectoryAutofill(
    {
      ...first.fields,
      phone: "Manually corrected phone",
    },
    initialFields,
    first.autofilled,
    getCompanyDirectoryAutofill({
      categoriesText: "Design",
      website: null,
      phone: "+90 392 222 2222",
      email: null,
      registeredAddress: "Second branch",
      registeredMunicipality: "Lefkoşa",
    }),
  );

  assert.equal(second.fields.categoriesText, "Design");
  assert.equal(second.fields.phone, "Manually corrected phone");
  assert.equal(second.fields.registeredAddress, "Second branch");
  assert.equal(second.fields.registeredMunicipality, "Lefkoşa");
});

test("does not invent values when the selected directory listing lacks them", () => {
  const result = applyCompanyDirectoryAutofill(
    initialFields,
    initialFields,
    {},
    getCompanyDirectoryAutofill({
      categoriesText: "",
      website: null,
      phone: null,
      email: null,
      registeredAddress: null,
      registeredMunicipality: null,
    }),
  );

  assert.deepEqual(result.fields, initialFields);
  assert.deepEqual(result.autofilled, {});
});
