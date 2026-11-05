import assert from "node:assert/strict";
import test from "node:test";

import { parseResumeText } from "../../src/features/candidates/resume-parser";
import { mergeResumeDraft } from "../../src/features/candidates/resume-profile-draft";

/**
 * Date-context and field-mapping coverage for CV import (issue #208).
 *
 * A CV carries dates that are not employment dates — a birth date, an address,
 * an ID number — and a parser that accepts a bare year anywhere turns them into
 * work history. The first half of this file pins the contracts that already
 * hold, including the negative invariant "personal data never becomes a
 * profile field". The second half records the defects that are still open in
 * `resume-parser.ts` (LANE-URUN's file) as `todo` tests: each asserts the
 * behaviour #208 asks for, so the day the parser is fixed the `todo` turns into
 * a real failure and the marker can be dropped. They are `todo`, not skipped,
 * because `node:test` reports a `todo` that starts passing — a skipped test
 * never would.
 *
 * Owner of the source: LANE-URUN. Owner of this test: LANE-QA. Measured on
 * `main` at the time of writing; every "observed" value below was produced by
 * running the parser, not read off the source.
 */

const emptyProfile = {
  headline: "",
  location: "",
  skills: [] as string[],
  experience: [] as never[],
  education: [] as never[],
  languages: [] as never[],
  certifications: [] as never[],
};

function experienceOf(...lines: string[]) {
  return parseResumeText(["EXPERIENCE", ...lines].join("\n")).experience ?? [];
}

// ---------------------------------------------------------------------------
// Contracts that hold today (a regression in any of these must go red).
// ---------------------------------------------------------------------------

test("a dated experience line keeps its start and end date on the entry", () => {
  // The formats a real CV mixes. Each was confirmed to round-trip on main.
  assert.deepEqual(experienceOf("A - Dev - 03/2019 - 07/2022"), [
    { role: "A", organization: "Dev", location: "", startDate: "03/2019", endDate: "07/2022", description: "" },
  ]);
  assert.deepEqual(experienceOf("B - Dev - Mart 2019 - Halen"), [
    { role: "B", organization: "Dev", location: "", startDate: "Mart 2019", endDate: "Halen", description: "" },
  ]);
  assert.deepEqual(experienceOf("C - Dev - Ocak 2019 - Aralık 2020"), [
    { role: "C", organization: "Dev", location: "", startDate: "Ocak 2019", endDate: "Aralık 2020", description: "" },
  ]);
  // En dash, the character Word substitutes for a hyphen.
  assert.deepEqual(experienceOf("D - Dev - 2019\u20132022"), [
    { role: "D", organization: "Dev", location: "", startDate: "2019", endDate: "2022", description: "" },
  ]);
});

test("a phone number is never captured as a profile value", () => {
  const draft = parseResumeText(
    ["AHMET YILMAZ", "Telefon: 0533 123 45 67", "Cep: 0533-1234567"].join("\n"),
  );

  assert.equal(draft.experience, undefined, "a phone line must not create an experience entry");
  assert.equal(draft.education, undefined, "a phone line must not create an education entry");
  // No field anywhere may carry a phone-shaped digit run.
  assert.equal(
    /\d{7,}/.test(JSON.stringify(draft)),
    false,
    `a phone number leaked into the draft: ${JSON.stringify(draft)}`,
  );
});

test("a CV with only personal details invents no experience or education", () => {
  const draft = parseResumeText(
    [
      "AHMET YILMAZ",
      "1995-2000 doğumlu",
      "Adres: Lefkoşa - 2019",
      "Telefon: 0533-1234567",
    ].join("\n"),
  );

  assert.equal(draft.experience, undefined, "personal details are not work history");
  assert.equal(draft.education, undefined, "personal details are not education");
});

test("parse then merge puts each extracted field in its own profile box", () => {
  const draft = parseResumeText(
    [
      "JOHN SMITH",
      "Senior Software Engineer",
      "London, UK | john@example.com",
      "",
      "EXPERIENCE",
      "Acme Corp - Senior Engineer - 2019 - Present",
      "",
      "EDUCATION",
      "University of Cyprus - BSc Computer Science - 2016",
      "",
      "SKILLS",
      "Python, Django",
    ].join("\n"),
  );

  const merged = mergeResumeDraft(emptyProfile as never, draft);

  // name -> headline, employer -> organization, dates -> startDate/endDate,
  // institution -> institution. The end-to-end mapping the issue asks to prove.
  assert.equal(merged.profile.headline, "Senior Software Engineer");
  assert.deepEqual(merged.profile.experience, [
    {
      role: "Senior Engineer",
      organization: "Acme Corp",
      location: "",
      startDate: "2019",
      endDate: "Present",
      description: "",
    },
  ]);
  assert.deepEqual(merged.profile.education, [
    {
      institution: "University of Cyprus",
      qualification: "BSc Computer Science",
      field: "",
      startDate: "2016",
      endDate: "",
      description: "",
    },
  ]);
  assert.deepEqual(merged.profile.skills, ["Python", "Django"]);
  assert.equal(merged.added, 5);
});

// ---------------------------------------------------------------------------
// Open defects from #208 (source: LANE-URUN). Each fails today; when the parser
// is fixed the assertion starts holding and `node:test` reports the todo.
// ---------------------------------------------------------------------------

test(
  "a birth date is not read as an employment date",
  { todo: "resume-parser.ts accepts a bare year as a date anywhere (#208, LANE-URUN)" },
  () => {
    // Measured: role "doğumlu", startDate "1995", endDate "2000".
    assert.deepEqual(experienceOf("1995-2000 doğumlu"), []);
  },
);

test(
  "an age or ID line is not read as a date",
  { todo: "resume-parser.ts accepts a bare year as a date anywhere (#208, LANE-URUN)" },
  () => {
    // Measured: role "Yaş: 29" startDate "1995"; role "TC:" startDate "2019".
    assert.deepEqual(experienceOf("Yaş: 29 (1995)"), []);
    assert.deepEqual(experienceOf("TC: 2019"), []);
  },
);

test(
  "an address line does not become the headline or location",
  { todo: "the personal section is inferred as a headline/location (#208, LANE-URUN)" },
  () => {
    const draft = parseResumeText(["AHMET YILMAZ", "Adres: Lefkoşa - 2019"].join("\n"));
    // Measured: headline "1995-2000 doğumlu", location "Lefkoşa - 2019".
    assert.equal(draft.headline, "AHMET YILMAZ");
    assert.equal(draft.location, "");
  },
);

test(
  "a range whose start is after its end is rejected",
  { todo: "resume-parser.ts has no start>end sanity check (#208, LANE-URUN)" },
  () => {
    // Measured: 2022 - 2019 is kept as-is.
    assert.deepEqual(experienceOf("Acme - Dev - 2022 - 2019"), []);
  },
);

test(
  "a range longer than fifty years is rejected",
  { todo: "resume-parser.ts has no span sanity check (#208, LANE-URUN)" },
  () => {
    // Measured: 1970 - 2024 (54 years) is kept.
    assert.deepEqual(experienceOf("Acme - Dev - 1970 - 2024"), []);
  },
);

test(
  "a future date is rejected",
  { todo: "resume-parser.ts has no future-date check (#208, LANE-URUN)" },
  () => {
    // Measured: 2030 - 2035 is kept.
    assert.deepEqual(experienceOf("Acme - Dev - 2030 - 2035"), []);
  },
);

test(
  "an ongoing marker keeps its full phrase",
  { todo: "dateToken matches the 'devam' prefix and leaves 'ediyor' as a location (#208, LANE-URUN)" },
  () => {
    const [entry] = experienceOf("Acme - Dev - 2019 - Devam ediyor");
    // Measured: endDate "Devam", location "ediyor".
    assert.equal(entry?.endDate, "Devam ediyor");
    assert.equal(entry?.location, "");
  },
);

test(
  "a tabular pipe layout keeps the trailing date on the entry",
  { todo: "the trailing pipe field is dropped into location, so the date is lost (#208, LANE-URUN)" },
  () => {
    const [entry] = experienceOf("Acme Corp | Senior Engineer | 2019 | 2023");
    // Measured: location "| 2023", endDate "".
    assert.equal(entry?.organization, "Acme Corp");
    assert.equal(entry?.role, "Senior Engineer");
    assert.equal(entry?.startDate, "2019");
    assert.equal(entry?.endDate, "2023");
    assert.equal(entry?.location, "");
  },
);
