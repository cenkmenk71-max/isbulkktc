import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCompanyDocumentAutofill,
} from "../../src/features/companies/company-document-autofill";
import {
  parseCompanyDocumentText,
} from "../../src/features/companies/company-document-parser";
import type { CompanyProfileFields } from "../../src/features/companies/company-directory-autofill";

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

const emptyFields: CompanyProfileFields = {
  ...completeEmptyFields,
  tradeName: "",
  email: "",
  registeredAddress: "",
  registeredMunicipality: "",
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
    tradeName: "Ada Teknoloji Ltd.",
    registeredAddress: "12 Liman Sokak",
    registeredMunicipality: "Girne",
    phone: "+90 392 123 4567",
    email: "info@ada.example",
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
    tradeName: "Northstar Limited",
    registeredAddress: "22 Harbour Road",
    email: "director@northstar.example",
    phone: "+90 392 111 1111",
  });
});

test("fills blank company fields without replacing existing values", () => {
  const result = applyCompanyDocumentAutofill(
    {
      ...emptyFields,
      tradeName: "Existing Company Ltd.",
      phone: "Manually confirmed phone",
    },
    {
      tradeName: "Registered Name Ltd.",
      phone: "+90 392 123 4567",
      registeredAddress: "12 Liman Sokak",
    },
  );

  assert.equal(result.fields.tradeName, "Existing Company Ltd.");
  assert.equal(result.fields.phone, "Manually confirmed phone");
  assert.equal(result.fields.registeredAddress, "12 Liman Sokak");
  assert.equal(result.filled, 1);
  assert.deepEqual(result.conflicts, [
    { field: "tradeName", value: "Registered Name Ltd." },
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
