import assert from "node:assert/strict";
import test from "node:test";
import { parseResumeText } from "../../src/features/candidates/resume-parser";

/**
 * Regression coverage for the layout that broke real CVs: role, employer and
 * dates each on their own line. The line-oriented parser read every line as a
 * finished entry, so the role and employer were swallowed into the description
 * and each date range landed on whichever line carried it.
 */
test("keeps role, employer and dates together when each sits on its own line", () => {
  const draft = parseResumeText(
    [
      "JOHN SMITH",
      "Senior Software Engineer",
      "London, UK | john@example.com",
      "",
      "EXPERIENCE",
      "Senior Software Engineer",
      "Acme Corp",
      "2019 - 2023",
      "Led the platform team.",
      "Software Engineer",
      "Beta Ltd",
      "2016 - 2019",
    ].join("\n"),
  );

  assert.deepEqual(draft.experience, [
    {
      role: "Senior Software Engineer",
      organization: "Acme Corp",
      location: "",
      startDate: "2019",
      endDate: "2023",
      description: "Led the platform team.",
    },
    {
      role: "Software Engineer",
      organization: "Beta Ltd",
      location: "",
      startDate: "2016",
      endDate: "2019",
      description: "",
    },
  ]);
});

test("groups a multi-line education entry and keeps its dates with it", () => {
  const draft = parseResumeText(
    [
      "EDUCATION",
      "University of Cyprus",
      "BSc Computer Science",
      "2012 - 2016",
    ].join("\n"),
  );

  assert.deepEqual(draft.education, [
    {
      institution: "University of Cyprus",
      qualification: "BSc Computer Science",
      field: "",
      startDate: "2012",
      endDate: "2016",
      description: "",
    },
  ]);
});

test("does not repeat the location inside the experience description", () => {
  const draft = parseResumeText(
    [
      "EXPERIENCE",
      "Product Designer | Example Studio | Berlin | 2020 - 2022",
      "Shipped the design system.",
    ].join("\n"),
  );

  assert.deepEqual(draft.experience, [
    {
      role: "Product Designer",
      organization: "Example Studio",
      location: "Berlin",
      startDate: "2020",
      endDate: "2022",
      description: "Shipped the design system.",
    },
  ]);
});

test("reads certification issue and expiry dates instead of dropping them", () => {
  const draft = parseResumeText(
    [
      "CERTIFICATIONS",
      "AWS Solutions Architect | Amazon | 2021",
      "PMP | PMI | 2019 | 2024",
    ].join("\n"),
  );

  assert.deepEqual(draft.certifications, [
    {
      name: "AWS Solutions Architect",
      issuer: "Amazon",
      issueDate: "2021",
      expiryDate: "",
    },
    {
      name: "PMP",
      issuer: "PMI",
      issueDate: "2019",
      expiryDate: "2024",
    },
  ]);
});

test("attaches a trailing date to the entry above it, not the one below", () => {
  const draft = parseResumeText(
    [
      "EXPERIENCE",
      "Acme Corp",
      "Senior Engineer",
      "2019 - 2023",
      "Beta Ltd",
      "Engineer",
      "2016 - 2019",
    ].join("\n"),
  );

  assert.deepEqual(
    draft.experience?.map((entry) => [
      entry.role,
      entry.organization,
      entry.startDate,
      entry.endDate,
    ]),
    [
      ["Senior Engineer", "Acme Corp", "2019", "2023"],
      ["Engineer", "Beta Ltd", "2016", "2019"],
    ],
  );
});
