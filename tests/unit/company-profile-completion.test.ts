import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getCompanyProfileCompletion,
  type CompanyProfileCompletionInput,
} from "../../src/features/companies/profile-completion";

const completeProfile: CompanyProfileCompletionInput = {
  companyName: "Ada Yazılım",
  profileDescription: "Yazılım hizmetleri.",
  categories: ["Yazılım"],
  website: "https://ada.example",
  phone: null,
  publicEmail: "info@ada.example",
  address: null,
  municipality: "Lefkoşa",
};

test("company profile completion counts meaningful contact and location alternatives", () => {
  assert.deepEqual(getCompanyProfileCompletion(completeProfile), {
    completed: 6,
    total: 6,
    percentage: 100,
  });
});

test("company profile completion treats whitespace and missing details as incomplete", () => {
  assert.deepEqual(
    getCompanyProfileCompletion({
      ...completeProfile,
      companyName: " Ada Yazılım ",
      profileDescription: "  ",
      categories: [],
      website: " ",
      phone: null,
      publicEmail: null,
      address: null,
      municipality: null,
    }),
    {
      completed: 1,
      total: 6,
      percentage: 17,
    },
  );
});

test("a public phone or email and one location field are sufficient", () => {
  assert.deepEqual(
    getCompanyProfileCompletion({
      ...completeProfile,
      publicEmail: null,
      phone: "+90 392 000 0000",
      address: "Lefkoşa",
      municipality: null,
    }),
    {
      completed: 6,
      total: 6,
      percentage: 100,
    },
  );
});

test("an unrecognized historical municipality does not count as a district", () => {
  assert.deepEqual(
    getCompanyProfileCompletion({
      ...completeProfile,
      address: null,
      municipality: "Unknown neighborhood",
    }),
    {
      completed: 5,
      total: 6,
      percentage: 83,
    },
  );
});
