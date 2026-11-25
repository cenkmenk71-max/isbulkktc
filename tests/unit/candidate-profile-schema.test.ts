import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateProfileSchema,
  candidateProfileUpdateSchema,
} from "../../src/features/candidates/schemas";

test("candidate profile trims text and normalizes a unique skills list", () => {
  assert.deepEqual(
    candidateProfileSchema.parse({
      headline: "  Senior product designer  ",
      location: "  Lefkoşa ",
      skillsText: "Figma\nUser research, figma; Prototyping",
      summary: "",
      links: [],
    }),
    {
      phone: null,
      jobTypePreference: [],
      workplaceModePreference: [],
      salaryExpectation: null,
      availability: null,
      headline: "Senior product designer",
      location: "Lefkoşa",
      skillsText: ["Figma", "User research", "Prototyping"],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      summary: null,
      cvFullText: null,
      links: [],
    },
  );
});

test("candidate district input uses Mağusa as the only saved name", () => {
  const profile = {
    headline: "",
    location: "Mağusa",
    skillsText: "",
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    summary: "",
    links: [],
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
      summary: "",
      links: [],
    }),
    {
      phone: null,
      jobTypePreference: [],
      workplaceModePreference: [],
      salaryExpectation: null,
      availability: null,
      headline: null,
      location: null,
      skillsText: [],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      summary: null,
      cvFullText: null,
      links: [],
    },
  );
});

test("candidate profile trims structured sections and drops blank entries", () => {
  assert.deepEqual(
    candidateProfileSchema.parse({
      headline: "",
      location: "",
      skillsText: "",
      summary: "",
      links: [],
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
      phone: null,
      jobTypePreference: [],
      workplaceModePreference: [],
      salaryExpectation: null,
      availability: null,
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
      summary: null,
      cvFullText: null,
      links: [],
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

test("candidate profile text and links match database length limits", () => {
  const maximumLinks = Array.from({ length: 12 }, () => ({
    label: "l".repeat(120),
    url: "u".repeat(600),
  }));
  const validProfile = {
    headline: "",
    location: "",
    skillsText: "",
    summary: "s".repeat(2000),
    cvFullText: "c".repeat(100_000),
    links: maximumLinks,
  };

  assert.equal(candidateProfileSchema.safeParse(validProfile).success, true);
  assert.equal(
    candidateProfileSchema.safeParse({
      ...validProfile,
      summary: "s".repeat(2001),
    }).success,
    false,
  );
  assert.equal(
    candidateProfileSchema.safeParse({
      ...validProfile,
      cvFullText: "c".repeat(100_001),
    }).success,
    false,
  );
  assert.equal(
    candidateProfileSchema.safeParse({
      ...validProfile,
      links: [{ label: "site", url: "u".repeat(601) }],
    }).success,
    false,
  );
  assert.equal(
    candidateProfileSchema.safeParse({
      ...validProfile,
      links: [...maximumLinks, { label: "site", url: "u" }],
    }).success,
    false,
  );
});

test("candidate profile location accepts only a Northern Cyprus district", () => {
  const profile = {
    headline: "",
    location: "Alsancak",
    skillsText: "",
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    summary: "",
    links: [],
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

test("candidate preferences are bounded, deduplicated and stored using canonical values", () => {
  const parsed = candidateProfileSchema.parse({
    phone: " +90 555 123 4567 ",
    jobTypePreference: ["full_time", "freelance", "full_time"],
    workplaceModePreference: ["remote", "hybrid", "remote"],
    salaryExpectation: "  40,000 TRY  ",
    availability: "  Immediate  ",
    headline: "",
    location: "",
    skillsText: "",
    summary: "",
  });

  assert.deepEqual(parsed.jobTypePreference, ["full_time", "freelance"]);
  assert.deepEqual(parsed.workplaceModePreference, ["remote", "hybrid"]);
  assert.equal(parsed.phone, "+90 555 123 4567");
  assert.equal(parsed.salaryExpectation, "40,000 TRY");
  assert.equal(parsed.availability, "Immediate");

  assert.equal(
    candidateProfileSchema.safeParse({
      headline: "",
      location: "",
      skillsText: "",
      jobTypePreference: ["not-a-job-type"],
    }).success,
    false,
  );
  assert.equal(
    candidateProfileSchema.safeParse({
      headline: "",
      location: "",
      skillsText: "",
      workplaceModePreference: ["onsite"],
    }).success,
    false,
  );
});


test("raw CV text stays available to transient parsing but is rejected by the profile write schema", () => {
  const profile = {
    headline: "",
    location: "",
    skillsText: "",
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    summary: "",
    links: [],
  };

  const localDraft = candidateProfileSchema.safeParse({
    ...profile,
    cvFullText: "PRIVATE RAW CV CONTENT",
  });
  assert.equal(localDraft.success, true);
  if (localDraft.success) {
    assert.equal(localDraft.data.cvFullText, "PRIVATE RAW CV CONTENT");
  }

  const writeInput = {
    ...profile,
    fullName: "Ada Lovelace",
    cvFullText: "PRIVATE RAW CV CONTENT",
  };
  assert.equal(
    candidateProfileUpdateSchema.safeParse(writeInput).success,
    false,
    "the server-action schema must not accept raw CV text",
  );
});
