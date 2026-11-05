import assert from "node:assert/strict";
import test from "node:test";

import { parseResumeText } from "../../src/features/candidates/resume-parser";
import { mergeResumeDraft } from "../../src/features/candidates/resume-profile-draft";

/**
 * Date-context and field-mapping coverage for CV import (issue #208).
 *
 * A CV carries dates that are not employment dates — a birth date, an address,
 * an ID number — and a parser that accepts a bare year anywhere turns them into
 * work history. The first half pins the contracts that hold, including the
 * negative invariant "personal data never becomes a profile field".
 *
 * The second half records the defects that are still open in
 * `resume-parser.ts` (LANE-URUN's file) as `todo` tests: each asserts the
 * behaviour #208 asks for, so the day the parser is fixed the `todo` turns into
 * a real failure and the marker can be dropped. They are `todo`, not skipped,
 * because `node:test` reports a `todo` that starts passing — a skipped test
 * never would.
 *
 * That is the trap this file was in once. LANE-URUN's #217 landed a partial fix
 * (the personal-data context filter and a forwards-and-≤60-years rule), and
 * three of the markers here went on asserting a bug that no longer existed —
 * a dead `todo` that could never turn green. Worse, one marker asserted the
 * opposite of the shipped contract: it demanded a 54-year range be rejected
 * while #217 deliberately accepts up to 60. A stale guard is not neutral: it
 * misleads the next reader about what the code does. So this file is kept
 * reconciled with the parser after every source fix — the contracts that now
 * hold are asserted directly, and the markers left are re-measured against the
 * current build, not the build they were written on.
 *
 * Owner of the source: LANE-URUN. Owner of this test: LANE-QA. Every "observed"
 * value below was produced by running the parser, not read off the source.
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
// Contracts shipped by LANE-URUN's #217 (a regression in any of these must go
// red). These were `todo` markers until #217 landed; they are asserted directly
// now, because a marker that keeps asserting a fixed bug is a lie about the code.
// ---------------------------------------------------------------------------

test("a personal-data line contributes no date to work experience", () => {
  // #217's context filter. Before it, "1995-2000 doğumlu" was a job period.
  for (const line of ["1995-2000 doğumlu", "Yaş: 29 (1995)", "TC: 2019"]) {
    const dates = experienceOf(line).map((entry) => [entry.startDate, entry.endDate]);
    assert.deepEqual(dates, [["", ""]], `${line} must not carry a date`);
  }
});

test("a range whose start is after its end is rejected", () => {
  assert.deepEqual(experienceOf("Acme - Dev - 2022 - 2019"), [
    { role: "Acme", organization: "Dev", location: "", startDate: "", endDate: "", description: "" },
  ]);
});

test("a year-only span up to sixty years is accepted, beyond it is rejected", () => {
  // #217's rule: a year-only range must run forwards and span <= 60 years.
  const atLimit = experienceOf("Acme - Dev - 1965 - 2025")[0];
  assert.equal(atLimit?.startDate, "1965");
  assert.equal(atLimit?.endDate, "2025");

  const overLimit = experienceOf("Acme - Dev - 1965 - 2026")[0];
  assert.equal(overLimit?.startDate, "", "a 61-year span must be rejected");
  assert.equal(overLimit?.endDate, "");
});

test("a university named 'Doğu Akdeniz' is not filtered as a birth line", () => {
  // "doğu" (east) must not read as the "doğum" (birth) stem; #217 is explicit
  // about this, and a naive stem match would break the commonest local CV line.
  const draft = parseResumeText(
    ["EĞİTİM", "Doğu Akdeniz Üniversitesi - Bilgisayar Mühendisliği - 2012 - 2016"].join("\n"),
  );
  assert.equal(draft.education?.[0]?.institution, "Doğu Akdeniz Üniversitesi");
  assert.equal(draft.education?.[0]?.startDate, "2012");
  assert.equal(draft.education?.[0]?.endDate, "2016");
});

// ---------------------------------------------------------------------------
// Open defects from #208 (source: LANE-URUN). Each fails today; when the parser
// is fixed the assertion starts holding and `node:test` reports the todo. Each
// was re-measured against the current build after #217, so none of them is the
// already-fixed bug.
// ---------------------------------------------------------------------------

test(
  "an address line does not become the profile location",
  { todo: "the personal section is still inferred as headline/location (#208, LANE-URUN)" },
  () => {
    // Measured: headline "1995-2000 doğumlu", location "Lefkoşa - 2019"; the
    // merge then keeps "Lefkoşa". #217 filtered the *date* on the line but the
    // line itself is still read as a location.
    const draft = parseResumeText(["AHMET YILMAZ", "Adres: Lefkoşa - 2019"].join("\n"));
    assert.equal(draft.headline, "AHMET YILMAZ");
    assert.equal(draft.location, "");
  },
);

test(
  "a future date is rejected",
  { todo: "resume-parser.ts has no future-date check (#208, LANE-URUN)" },
  () => {
    // Measured: 2030 - 2035 is kept. #217 added the span rule but not a
    // future-date rule, so a date that has not happened yet still parses.
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
