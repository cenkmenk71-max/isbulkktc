import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeResumeDraft,
  type CandidateProfileDraft,
} from "../../src/features/candidates/resume-profile-draft";
import { mergeResumeDraftForForm } from "../../src/features/candidates/resume-profile-import";
import { parseResumeWithFallback } from "../../src/server/ai/cv-parser-core";

const emptyProfile: CandidateProfileDraft = {
  phone: null,
  jobTypePreference: "",
  workplaceModePreference: "",
  availability: null,
  headline: "",
  location: "",
  skills: [],
  experience: [],
  education: [],
  languages: [],
  certifications: [],
  summary: "",
  cvFullText: "",
  links: [],
};

test("adds CV details without replacing existing profile values", () => {
  const currentProfile: CandidateProfileDraft = {
    ...emptyProfile,
    headline: "Existing headline",
    location: "Girne",
    skills: ["TypeScript"],
    summary: "",
    links: [],
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
      summary: "",
      links: [],
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
      summary: "",
      links: [],
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

test("AI CV output fills all nine fields and opens every populated section", async () => {
  const cvText = [
    "Alex Example",
    "Senior Product Designer | Example Studio | Lefkoşa | 2021-2025",
    "Accessible product design and user research.",
  ].join("\n");
  const file = new File([cvText], "alex-example.txt", { type: "text/plain" });
  const providerOutput = {
    headline: "Senior Product Designer",
    location: "Lefkoşa",
    summary: "Product designer experienced in accessible digital products.",
    skills: ["Figma", "User Research", "Prototyping"],
    experience: [{
      role: "Senior Product Designer",
      organization: "Example Studio",
      location: "Lefkoşa",
      startDate: "2021",
      endDate: "2025",
      description: "Led product design for accessible web applications.",
    }],
    education: [{
      institution: "Doğu Akdeniz Üniversitesi",
      qualification: "Bachelor of Design",
      field: "Product Design",
      startDate: "2017",
      endDate: "2021",
      description: "",
    }],
    languages: [
      { name: "Turkish", proficiency: "Native" },
      { name: "English", proficiency: "C1" },
    ],
    certifications: [{
      name: "Accessibility Foundations",
      issuer: "Example Academy",
      issueDate: "2024",
      expiryDate: "",
    }],
    links: [{
      label: "LinkedIn",
      url: "https://linkedin.com/in/alex-example",
    }],
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        candidates: [{
          content: { parts: [{ text: JSON.stringify(providerOutput) }] },
        }],
      }),
      { status: 200 },
    );

  try {
    const { draft } = await parseResumeWithFallback(
      file,
      cvText,
      { geminiApiKey: "test-key" },
    );
    assert.ok(draft);

    const result = mergeResumeDraftForForm(emptyProfile, draft);
    assert.equal(result.profile.headline, providerOutput.headline);
    assert.equal(result.profile.location, providerOutput.location);
    assert.equal(result.profile.summary, providerOutput.summary);
    assert.deepEqual(result.profile.skills, providerOutput.skills);
    assert.deepEqual(result.profile.experience, providerOutput.experience);
    assert.deepEqual(result.profile.education, providerOutput.education);
    assert.deepEqual(result.profile.languages, providerOutput.languages);
    assert.deepEqual(result.profile.certifications, providerOutput.certifications);
    assert.deepEqual(result.profile.links, providerOutput.links);
    assert.deepEqual([...result.openSections], [
      "essentials",
      "experience",
      "education",
      "languagesCerts",
      "linksSkills",
    ]);

    const duplicateImport = mergeResumeDraftForForm(result.profile, draft);
    assert.equal(duplicateImport.added, 0);
    assert.deepEqual([...duplicateImport.openSections], [
      "essentials",
      "experience",
      "education",
      "languagesCerts",
      "linksSkills",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});