import assert from "node:assert/strict";
import test from "node:test";
import { candidateProfileSchema } from "../../src/features/candidates/schemas";

test("candidate profile trims text and normalizes a unique skills list", () => {
  assert.deepEqual(
    candidateProfileSchema.parse({
      headline: "  Senior product designer  ",
      location: "  Lefkoşa ",
      skillsText: "Figma\nUser research, figma; Prototyping",
    }),
    {
      headline: "Senior product designer",
      location: "Lefkoşa",
      skillsText: ["Figma", "User research", "Prototyping"],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
    },
  );
});

test("candidate district input uses Mağusa as the only saved name", () => {
  const profile = {
    headline: "",
    location: "Mağusa",
    skillsText: "",
  };

  assert.equal(candidateProfileSchema.safeParse(profile).success, true);
  assert.equal(
    candidateProfileSchema.safeParse({
      ...profile,
      location: "Gazimağusa",
    }).success,
    false,
  );
});

test("candidate profile accepts blank optional fields without storing whitespace", () => {
  assert.deepEqual(
    candidateProfileSchema.parse({
      headline: "  ",
      location: "",
      skillsText: " \n, ; ",
    }),
    {
      headline: null,
      location: null,
      skillsText: [],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
    },
  );
});

test("candidate profile trims structured sections and drops blank entries", () => {
  assert.deepEqual(
    candidateProfileSchema.parse({
      headline: "",
      location: "",
      skillsText: "",
      experience: [
        {
          role: " Senior designer ",
          organization: " Example Studio ",
          location: "",
          startDate: "2022",
          endDate: "",
          description: " Built accessible products ",
        },
        {
          role: "",
          organization: "",
          location: "",
          startDate: "",
          endDate: "",
          description: "",
        },
      ],
      education: [],
      languages: [{ name: " Turkish ", proficiency: " Native " }],
      certifications: [],
    }),
    {
      headline: null,
      location: null,
      skillsText: [],
      experience: [
        {
          role: "Senior designer",
          organization: "Example Studio",
          location: "",
          startDate: "2022",
          endDate: "",
          description: "Built accessible products",
        },
      ],
      education: [],
      languages: [{ name: "Turkish", proficiency: "Native" }],
      certifications: [],
    },
  );
});

test("candidate profile rejects oversized or malformed structured sections", () => {
  const tooManyEntries = Array.from({ length: 13 }, () => ({
    role: "Engineer",
    organization: "Example",
    location: "",
    startDate: "",
    endDate: "",
    description: "",
  }));

  assert.equal(
    candidateProfileSchema.safeParse({
      headline: "",
      location: "",
      skillsText: "",
      experience: tooManyEntries,
    }).success,
    false,
  );
  assert.equal(
    candidateProfileSchema.safeParse({
      headline: "",
      location: "",
      skillsText: "",
      experience: [{ role: "Engineer", unexpected: "value" }],
    }).success,
    false,
  );
});

test("candidate profile location accepts only a Northern Cyprus district", () => {
  const profile = {
    headline: "",
    location: "Alsancak",
    skillsText: "",
  };

  assert.equal(candidateProfileSchema.safeParse(profile).success, false);
  assert.equal(
    candidateProfileSchema.safeParse({ ...profile, location: "Girne" }).success,
    true,
  );
});

test("candidate profile rejects database-overflowing values and excessive skills", () => {
  const tooManySkills = Array.from({ length: 41 }, (_, index) => `Skill ${index}`).join(
    ",",
  );
  const invalidProfiles = [
    { headline: "x".repeat(141), location: "", skillsText: "" },
    { headline: "", location: "x".repeat(121), skillsText: "" },
    { headline: "", location: "", skillsText: "x".repeat(61) },
    { headline: "", location: "", skillsText: tooManySkills },
  ];

  for (const profile of invalidProfiles) {
    assert.equal(candidateProfileSchema.safeParse(profile).success, false);
  }
});
