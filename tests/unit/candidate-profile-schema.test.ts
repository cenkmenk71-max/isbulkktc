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
      headline: "Senior product designer",
      location: "Lefkoşa",
      skillsText: ["figma", "user research", "prototyping"],
      experience: [],
      internships: [],
      education: [],
      languages: [],
      certifications: [],
      courses: [],
      projects: [],
      publications: [],
      awards: [],
      volunteer: [],
      references: [],
      skills: [],
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
    internships: [],
    education: [],
    languages: [],
    certifications: [],
    courses: [],
    projects: [],
    publications: [],
    awards: [],
    volunteer: [],
    references: [],
    skills: [],
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
      headline: "",
      location: "",
      skillsText: " \n, ; ",
      summary: "",
      links: [],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      courses: [],
      projects: [],
      publications: [],
      awards: [],
      volunteer: [],
      references: [],
      skills: [],
    }),
    {
      headline: null,
      location: null,
      skillsText: [],
      experience: [],
      internships: [],
      education: [],
      languages: [],
      certifications: [],
      courses: [],
      projects: [],
      publications: [],
      awards: [],
      volunteer: [],
      references: [],
      skills: [],
      summary: null,
      cvFullText: null,
      links: [],
    },
  );
});

test("candidate profile trims structured sections and drops blank entries", () => {
  assert.deepEqual(
    candidateProfileSchema.parse({
      headline: "  Senior product designer  ",
      location: "  Lefkoşa ",
      skillsText: "Figma\nUser research, figma; Prototyping",
      summary: "",
      links: [],
      experience: [
        {
          role: " Senior designer ",
          company: " Example Studio ",
          district: "",
          startDate: "2022",
          endDate: null,
          description: " Built accessible products ",
        },
        {
          role: "",
          company: "",
          district: "",
          startDate: "",
          endDate: null,
          description: "",
        },
      ],
      education: [],
      languages: [{ language: "tr", proficiency: "native" }],
      certifications: [],
      courses: [],
      projects: [],
      publications: [],
      awards: [],
      volunteer: [],
      references: [],
      skills: [],
    }),
    {
      headline: "Senior product designer",
      location: "Lefkoşa",
      skillsText: ["figma", "user research", "prototyping"],
      experience: [
        {
          role: "Senior designer",
          company: "Example Studio",
          district: "",
          startDate: "2022",
          endDate: null,
          description: "Built accessible products",
        },
        {
          role: "",
          company: "",
          district: "",
          startDate: null,
          endDate: null,
          description: "",
        },
      ],
      education: [],
      languages: [{ language: "tr", proficiency: "native" }],
      certifications: [],
      courses: [],
      projects: [],
      publications: [],
      awards: [],
      volunteer: [],
      references: [],
      skills: [],
      summary: null,
      cvFullText: null,
      links: [],
    },
  );
});

test("candidate profile rejects oversized or malformed structured sections", () => {
  const tooManyEntries = Array.from({ length: 13 }, () => ({
    role: "Engineer",
    company: "Example",
    district: "",
    startDate: null,
    endDate: null,
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
      experience: [{ role: "Engineer", company: "Example", district: "", startDate: null, endDate: null, description: "" }],
    }).success,
    false,
  );
});

test("candidate profile location accepts only a Northern Cyprus district", () => {
  const profile = {
    headline: "",
    location: "Mağusa",
    skillsText: "",
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    courses: [],
    projects: [],
    publications: [],
    awards: [],
    volunteer: [],
    references: [],
    skills: [],
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