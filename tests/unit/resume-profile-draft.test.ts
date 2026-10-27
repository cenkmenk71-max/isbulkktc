import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeResumeDraft,
  type CandidateProfileDraft,
} from "../../src/features/candidates/resume-profile-draft";

const emptyProfile: CandidateProfileDraft = {
  headline: "",
  location: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
  certifications: [],
};

test("adds CV details without replacing existing profile values", () => {
  const currentProfile: CandidateProfileDraft = {
    ...emptyProfile,
    headline: "Existing headline",
    location: "Girne",
    skills: ["TypeScript"],
    experience: [
      {
        role: "Product designer",
        organization: "Current Studio",
        location: "",
        startDate: "2023",
        endDate: "",
        description: "",
      },
    ],
  };
  const originalProfile = structuredClone(currentProfile);
  const experience = {
    role: "Product designer",
    organization: "Current Studio",
    location: "",
    startDate: "2023",
    endDate: "",
    description: "",
  };
  const result = mergeResumeDraft(
    currentProfile,
    {
      headline: "Imported headline",
      location: "Lefkoşa",
      skills: ["typescript", "Research"],
      experience: [
        experience,
        {
          role: "Designer",
          organization: "New Studio",
          location: "",
          startDate: "2021",
          endDate: "2022",
          description: "",
        },
      ],
      languages: [{ name: "Turkish", proficiency: "Native" }],
    },
  );

  assert.equal(result.profile.headline, "Existing headline");
  assert.equal(result.profile.location, "Girne");
  assert.deepEqual(result.profile.skills, ["TypeScript", "Research"]);
  assert.deepEqual(result.profile.experience, [
    experience,
    {
      role: "Designer",
      organization: "New Studio",
      location: "",
      startDate: "2021",
      endDate: "2022",
      description: "",
    },
  ]);
  assert.deepEqual(result.profile.languages, [
    { name: "Turkish", proficiency: "Native" },
  ]);
  assert.equal(result.added, 3);
  assert.equal(result.skipped, 0);
  assert.deepEqual(currentProfile, originalProfile);
});

test("fills blank fields and recognizes Turkish skill duplicates", () => {
  const result = mergeResumeDraft(
    {
      ...emptyProfile,
      skills: ["İletişim"],
    },
    {
      headline: "UX Designer",
      location: "Kyrenia",
      skills: ["iletisim", "Araştırma"],
    },
  );

  assert.equal(result.profile.headline, "UX Designer");
  assert.equal(result.profile.location, "Girne");
  assert.deepEqual(result.profile.skills, ["İletişim", "Araştırma"]);
  assert.equal(result.added, 3);
});

test("imports a CV location only when it maps to a supported district", () => {
  const result = mergeResumeDraft(emptyProfile, {
    location: "Alsancak",
  });

  assert.equal(result.profile.location, "Girne");
  assert.equal(result.added, 1);

  const unknownLocation = mergeResumeDraft(emptyProfile, {
    location: "Somewhere outside the district list",
  });
  assert.equal(unknownLocation.profile.location, "");
  assert.equal(unknownLocation.added, 0);
});

test("deduplicates imported entries and reports entries beyond profile limits", () => {
  const currentExperience = Array.from({ length: 12 }, (_, index) => ({
    role: `Role ${index}`,
    organization: `Company ${index}`,
    location: "",
    startDate: "",
    endDate: "",
    description: "",
  }));
  const currentSkills = Array.from({ length: 40 }, (_, index) => `Skill ${index}`);
  const duplicateExperience = currentExperience[0];
  assert.ok(duplicateExperience);

  const result = mergeResumeDraft(
    {
      ...emptyProfile,
      experience: currentExperience,
      skills: currentSkills,
    },
    {
      experience: [
        duplicateExperience,
        {
          role: "New role",
          organization: "New company",
          location: "",
          startDate: "",
          endDate: "",
          description: "",
        },
      ],
      skills: ["New skill"],
    },
  );

  assert.equal(result.profile.experience.length, 12);
  assert.equal(result.profile.skills.length, 40);
  assert.equal(result.added, 0);
  assert.equal(result.skipped, 2);
});
