import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateProfileSectionKeys,
  computeOpenSections,
} from "./candidate-profile-sections";
import type { CandidateProfileValues } from "./schemas";

function makeProfile(
  overrides: Partial<CandidateProfileValues> = {},
): CandidateProfileValues {
  return {
    phone: null,
    jobTypePreference: "",
    workplaceModePreference: "",
    availability: null,
    headline: null,
    location: null,
    skills: [],
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    summary: null,
    cvFullText: null,
    links: [],
    ...overrides,
  };
}

test("empty profile sections start collapsed", () => {
  assert.deepEqual(
    [...computeOpenSections(makeProfile())],
    [],
  );
});

test("only populated sections start expanded", () => {
  const cases: {
    section: (typeof candidateProfileSectionKeys)[number];
    profile: Partial<CandidateProfileValues>;
  }[] = [
    { section: "essentials", profile: { summary: "Experienced designer" } },
    { section: "preferences", profile: { jobTypePreference: "full_time" } },
    {
      section: "experience",
      profile: {
        experience: [{
          role: "Designer",
          organization: "",
          location: "",
          startDate: "",
          endDate: "",
          description: "",
        }],
      },
    },
    {
      section: "education",
      profile: {
        education: [{
          institution: "University",
          qualification: "",
          field: "",
          startDate: "",
          endDate: "",
          description: "",
        }],
      },
    },
    {
      section: "languagesCerts",
      profile: { languages: [{ name: "Turkish", proficiency: "Native" }] },
    },
    { section: "linksSkills", profile: { skills: ["TypeScript"] } },
  ];

  for (const { section, profile } of cases) {
    assert.deepEqual(
      [...computeOpenSections(makeProfile(profile))],
      [section],
      `${section} should open when it has profile data`,
    );
  }
});
