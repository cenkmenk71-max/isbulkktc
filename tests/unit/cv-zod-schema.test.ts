import assert from "node:assert/strict";
import test from "node:test";
import { candidateProfileSchema } from "../../src/features/candidates/schemas";
import {
  cvParserOutputSchema,
  cvResumeDraftSchema,
} from "../../src/server/ai/cv-zod-schema";

const validOutput = {
  headline: "Senior engineer",
  location: "Girne",
  skills: ["TypeScript", "PostgreSQL"],
  experience: [
    {
      role: "Engineer",
      organization: "Example Ltd",
      location: "Girne",
      startDate: "2021-06",
      endDate: "",
      description: "Built software.",
    },
  ],
  education: [
    {
      institution: "Example University",
      qualification: "BSc",
      field: "Computer science",
      startDate: "2017",
      endDate: "2021",
      description: "",
    },
  ],
  languages: [{ name: "English", proficiency: "C1" }],
  certifications: [
    {
      name: "Cloud certification",
      issuer: "Example",
      issueDate: "2023-02",
      expiryDate: "",
    },
  ],
  summary: "Experienced software engineer.",
  links: [{ label: "Portfolio", url: "https://example.test" }],
};

test("CV output matches the candidate profile fields and database bounds", () => {
  const parsed = cvParserOutputSchema.parse(validOutput);
  const profile = candidateProfileSchema.safeParse({
    headline: parsed.headline,
    location: parsed.location,
    skillsText: parsed.skills.join("\n"),
    experience: parsed.experience,
    education: parsed.education,
    languages: parsed.languages,
    certifications: parsed.certifications,
    summary: parsed.summary,
    links: parsed.links,
  });

  assert.equal(profile.success, true);
});

test("CV output accepts multilingual content without translating it", () => {
  const result = cvParserOutputSchema.parse({
    ...validOutput,
    headline: "Ведущий инженер",
    location: "Mağusa",
    experience: [
      {
        ...validOutput.experience[0],
        role: "Инженер-программист",
        description: "Разработка и поддержка приложений.",
      },
    ],
    summary: null,
  });

  assert.equal(result.headline, "Ведущий инженер");
  assert.equal(result.experience[0]?.description, "Разработка и поддержка приложений.");
  assert.equal(result.summary, null);
});

test("CV schema tolerates invalid locations, dates, enum values, and extra fields by coercing", () => {
  const cases = [
    { ...validOutput, location: "Istanbul" },
    {
      ...validOutput,
      experience: [{ ...validOutput.experience[0], startDate: "2021-13" }],
    },
    {
      ...validOutput,
      languages: [{ name: "English", proficiency: "Fluent" }],
    },
    { ...validOutput, unexpected: "not allowed" },
  ];

  for (const input of cases) {
    const result = cvParserOutputSchema.safeParse(input);
    assert.equal(result.success, true);
    // Invalid enum values become null, invalid dates become empty strings
    if (input.location === "Istanbul") {
      assert.equal(result.data.location, null);
    }
  }
});

test("CV schema enforces section limits but tolerates oversized arrays by truncating", () => {
  const skillsResult = cvParserOutputSchema.safeParse({
    ...validOutput,
    skills: Array.from({ length: 41 }, (_, index) => `Skill ${index}`),
  });
  assert.equal(skillsResult.success, true);
  // Array should be truncated to max 40
  assert.equal(skillsResult.data.skills.length <= 40, true);

  const cvFullTextResult = cvResumeDraftSchema.safeParse({
    ...validOutput,
    cvFullText: "x".repeat(100_001),
  });
  assert.equal(cvFullTextResult.success, true);
  // cvFullText should be truncated or become null
  assert.ok(cvFullTextResult.data.cvFullText === null || cvFullTextResult.data.cvFullText!.length <= 100_000);

  assert.equal(
    cvResumeDraftSchema.safeParse({
      ...validOutput,
      cvFullText: "CV text is transient.",
    }).success,
    true,
  );
});
