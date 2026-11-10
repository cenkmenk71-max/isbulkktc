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
 * Defects still open in `resume-parser.ts` (the product layer's file) were once recorded
 * here as `todo` tests: each asserted the behaviour #208 asks for, so the day the
 * parser was fixed the `todo` would turn into a real failure and the marker could
 * be dropped. They were `todo`, not skipped, because `node:test` reports a `todo`
 * that starts passing — a skipped test never would. No `todo` markers remain: the
 * last two (#367) became real contracts once the product layer's fix landed.
 *
 * That is the trap this file was in once. The product layer's #217 landed a partial fix
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
 * Re-reconciled after the product layer's #331 (four more defects: address→location, the
 * tabular `|` date, "Devam ediyor", and a future-date rule) and #343 (the
 * residue of #339: an *unlabelled* personal line, plus a district list read as a
 * headline). Those markers all became contracts.
 *
 * Re-reconciled again for #367: a personal-data line *under an explicit section
 * heading* reached a profile field (`sectionLines` pushed it into the active
 * section without the `isPersonalDataLine` filter). The product layer's #411 fixed the
 * source; the two markers that pinned it have been converted to real contracts
 * here, so nothing in this file is left as a dead `todo` (#413).
 *
 * Owner of the source: the product layer. Owner of this test: the QA layer. Every "observed"
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
// Contracts shipped by the product layer's #217 (a regression in any of these must go
// red). These were `todo` markers until #217 landed; they are asserted directly
// now, because a marker that keeps asserting a fixed bug is a lie about the code.
// ---------------------------------------------------------------------------

test("a personal-data line contributes no date to work experience", () => {
  // #217's context filter. Before it, "1995-2000 doğumlu" was a job period.
  //
  // Deliberately narrow: *no date* may come from such a line. The stronger §B6
  // contract — the line reaches no field at all — is asserted directly below.
  for (const line of ["1995-2000 doğumlu", "Yaş: 29 (1995)", "TC: 2019"]) {
    const dated = experienceOf(line).filter((entry) => entry.startDate || entry.endDate);
    assert.deepEqual(dated, [], `${line} must not carry a date`);
  }
});

// ---------------------------------------------------------------------------
// #367 — shipped in `resume-parser.ts` (the product layer). The unlabelled path was
// filtered by #343, but a personal-data line *under an explicit section heading*
// bypassed the filter and the field parsers wrote it straight into the draft, so
// a phone number reached the profile. §B6 asks the line to reach no field at
// all; the fix is one line in `sectionLines`' `activeSection` branch. These were
// `todo` markers until the fix landed; they are asserted directly now, because a
// marker that keeps asserting a fixed bug is a lie about the code.
// ---------------------------------------------------------------------------

test("a personal-data line reaches no field, labelled or not", () => {
  // Unlabelled, the line must not become an entry; under a heading it must not
  // be written into the section's own field (experience.description /
  // education.institution / certifications.name / languages.name / skills).
  for (const line of ["1995-2000 doğumlu", "Yaş: 29 (1995)", "TC: 2019"]) {
    assert.deepEqual(experienceOf(line), [], `${line} must not become an experience entry`);
  }

  for (const heading of ["DENEYİM", "EĞİTİM", "SERTİFİKALAR", "DİLLER", "BECERİLER"]) {
    const draft = parseResumeText([heading, "Telefon: 0533 123 45 67"].join("\n"));
    assert.deepEqual(draft, {}, `${heading}: a phone line must reach no field`);
  }
});

test("a personal-data line is dropped without disturbing its neighbours", () => {
  const draft = parseResumeText(
    [
      "DENEYİM",
      "Acme - Dev - 2019 - 2022",
      "Telefon: 0533 123 45 67",
      "Beta - QA - 2020 - 2022",
    ].join("\n"),
  );

  assert.deepEqual(draft.experience, [
    { role: "Acme", organization: "Dev", location: "", startDate: "2019", endDate: "2022", description: "" },
    { role: "Beta", organization: "QA", location: "", startDate: "2020", endDate: "2022", description: "" },
  ]);
});

test("a real role whose title carries a personal-data word is kept", () => {
  // The boundary #367 draws, and the guard against a naive "drop any line with a
  // personal-data word" fix: these are ordinary job titles, so the fix must keep
  // them. This contract already holds — it exists to go red if the #367 fix
  // over-reaches.
  const titles: Array<[string, string, string]> = [
    ["Acme - Adres Doğrulama Uzmanı - 2019 - 2022", "2019", "2022"],
    ["Beta - Telefon Satış Temsilcisi - 2018 - 2020", "2018", "2020"],
    ["Gamma - Doğum Kliniği Hemşiresi - 2015 - 2017", "2015", "2017"],
    ["Delta - Nüfus Müdürlüğü Memuru - 2010 - 2014", "2010", "2014"],
  ];

  for (const [line, startDate, endDate] of titles) {
    const [entry] = experienceOf(line);
    assert.ok(entry, `${line} must still produce an experience entry`);
    assert.equal(entry?.startDate, startDate, `${line} must keep its start year`);
    assert.equal(entry?.endDate, endDate, `${line} must keep its end year`);
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
// Contracts shipped by the product layer's #331. Each was a `todo` marker until #331
// landed; a regression in any of them must go red. Measured on main after the
// merge, not read off the source.
// ---------------------------------------------------------------------------

test("a labelled address line is dropped, not read as a location", () => {
  // #331 moved "adres"/"address"/"ikametgah" into `ignoredSectionLabels`, so the
  // whole line is consumed and neither the year nor "Lefkoşa - 2019" survives.
  const draft = parseResumeText(["AHMET YILMAZ", "Adres: Lefkoşa - 2019"].join("\n"));
  assert.deepEqual(draft, {});
});

test("a future date range is rejected", () => {
  // #331 added the future-date rule on top of #217's forwards-and-≤60-years one.
  assert.deepEqual(experienceOf("Acme - Dev - 2030 - 2035"), []);
});

test("an ongoing marker keeps its full phrase and no stray location", () => {
  // #331 ordered the `ongoingPattern` alternatives longest-first, so "devam
  // ediyor" no longer stops at "devam" and leaves "ediyor" as the location.
  const [entry] = experienceOf("Acme - Dev - 2019 - Devam ediyor");
  assert.equal(entry?.endDate, "Devam ediyor");
  assert.equal(entry?.location, "");
});

test("a tabular pipe layout keeps the trailing date on the entry", () => {
  // #331 made `|` a date-range separator, so the fourth field is the end year.
  const [entry] = experienceOf("Acme Corp | Senior Engineer | 2019 | 2023");
  assert.equal(entry?.organization, "Acme Corp");
  assert.equal(entry?.role, "Senior Engineer");
  assert.equal(entry?.startDate, "2019");
  assert.equal(entry?.endDate, "2023");
  assert.equal(entry?.location, "");
});

// ---------------------------------------------------------------------------
// The date shapes the round-trip test above does not already pin — the ongoing
// markers and the year-only hyphen form — plus the location dimension. The
// issue asks for the date shapes to be pinned (#208 §B5); each was measured.
// ---------------------------------------------------------------------------

test("ongoing markers and year-only hyphens keep both dates and no stray location", () => {
  const shapes: Array<[string, string, string]> = [
    ["2019 - Present", "2019", "Present"],
    ["2019-2022", "2019", "2022"],
    ["2019 - Devam ediyor", "2019", "Devam ediyor"],
  ];

  for (const [span, startDate, endDate] of shapes) {
    const [entry] = experienceOf(`Acme - Dev - ${span}`);
    assert.deepEqual(
      [entry?.startDate, entry?.endDate, entry?.location],
      [startDate, endDate, ""],
      `${span} must keep both dates and no location`,
    );
  }
});

// ---------------------------------------------------------------------------
// Personal data must reach no profile field — the negative half of #208 §B6,
// asserted field by field rather than only as "no date appeared".
// ---------------------------------------------------------------------------

test("personal lines reach no profile field", () => {
  const personal = [
    ["phone", "Telefon: 0533 123 45 67"],
    ["mobile", "Cep: 0533-1234567"],
    ["gsm", "GSM: 05331112233"],
    ["id", "TC: 12345678901"],
    ["address", "Adres: Lefkoşa - 2019"],
    ["birth", "Doğum Tarihi: 03/1995"],
  ] as const;

  for (const [label, line] of personal) {
    const draft = parseResumeText(["AHMET YILMAZ", line].join("\n"));
    assert.deepEqual(draft, {}, `${label} line must not become any profile field`);
  }
});

// ---------------------------------------------------------------------------
// Contracts shipped by the product layer's #343 (the residue of #339). Both were `todo`
// markers / open defects until it landed; a regression in either must go red.
// ---------------------------------------------------------------------------

test("an unlabelled birth line does not become the headline", () => {
  // #343 dropped the label requirement: `isPersonalDataLine` now also guards the
  // `index === bodyStart` headline branch, so a bare birth line is skipped.
  const draft = parseResumeText(["AHMET YILMAZ", "1995-2000 doğumlu"].join("\n"));
  assert.deepEqual(draft, {});
});

test("a birth line after the real headline is skipped, not appended", () => {
  const draft = parseResumeText(["AHMET YILMAZ", "Yazılım Geliştirici", "1995 doğumlu"].join("\n"));
  assert.equal(draft.headline, "Yazılım Geliştirici");
});

test("a comma-separated district list is a location, not a headline", () => {
  // #343's `looksLikeDistrictList`: a multi-district list resolves to `null` as
  // a whole through `resolveNorthernCyprusDistrict`, so it needs its own rule.
  const draft = parseResumeText(["AHMET YILMAZ", "Girne, Lefkoşa, Mağusa"].join("\n"));
  assert.equal(draft.location, "Girne, Lefkoşa, Mağusa");
  assert.equal(draft.headline, undefined);
});
