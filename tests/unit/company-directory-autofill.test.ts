import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCompanyDirectoryAutofill,
  getCompanyDirectoryAutofill,
  type CompanyProfileFields,
} from "../../src/features/companies/company-directory-autofill";

const initialFields: CompanyProfileFields = {
  companyName: "Northstar Studio",
  profileDescription: "",
  categoriesText: "",
  website: "",
  phone: "",
  publicEmail: "",
  address: "",
  municipality: "",
};

test("fills only blank profile fields from a selected directory listing", () => {
  const suggestions = getCompanyDirectoryAutofill({
    categories: ["Design"],
    website: "https://northstar.example",
    phone: "+90 392 123 4567",
    publicEmail: null,
    address: "Girne",
    municipality: null,
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

  assert.equal(result.fields.companyName, "Northstar Studio");
  assert.equal(result.fields.categoriesText, "Design");
  assert.equal(result.fields.website, "https://northstar.example");
  assert.equal(result.fields.phone, "Manually confirmed phone");
  assert.equal(result.fields.publicEmail, "");
  assert.equal(result.fields.address, "Girne");
  assert.equal(result.fields.municipality, "Girne");
  assert.equal(result.fields.profileDescription, "");
  assert.equal(result.autofilled.phone, undefined);
});

test("updates untouched suggestions when a different directory branch is selected", () => {
  const first = applyCompanyDirectoryAutofill(
    initialFields,
    initialFields,
    {},
    getCompanyDirectoryAutofill({
      categories: ["Retail"],
      website: null,
      phone: "+90 392 111 1111",
      publicEmail: null,
      address: "First branch",
      municipality: "Girne",
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
      categories: ["Design"],
      website: null,
      phone: "+90 392 222 2222",
      publicEmail: null,
      address: "Second branch",
      municipality: "Lefkoşa",
    }),
  );

  assert.equal(second.fields.categoriesText, "Design");
  assert.equal(second.fields.phone, "Manually corrected phone");
  assert.equal(second.fields.address, "Second branch");
  assert.equal(second.fields.municipality, "Lefkoşa");
});

test("does not invent values when the selected directory listing lacks them", () => {
  const result = applyCompanyDirectoryAutofill(
    initialFields,
    initialFields,
    {},
    getCompanyDirectoryAutofill({
      categories: [],
      website: null,
      phone: null,
      publicEmail: null,
      address: null,
      municipality: null,
    }),
  );

  assert.deepEqual(result.fields, initialFields);
  assert.deepEqual(result.autofilled, {});
});
