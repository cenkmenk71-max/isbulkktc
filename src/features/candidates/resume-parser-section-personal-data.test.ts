import assert from "node:assert/strict";
import test from "node:test";
import { parseResumeText } from "./resume-parser";

// #367 / #208 §B6: a personal-data line must reach no profile field, whether it
// sits under an explicit section heading or in the unlabelled body. The section
// path (`sectionLines`) once bypassed the filter entirely, so a phone number
// under "DENEYİM" was written into `experience[].description` and copied into
// the profile by `mergeResumeDraft`.
//
// This file lives next to the source it tests (`src/features/candidates/**`);
// the `tests/unit/resume-date-context.test.ts` file pins the same contract as
// `todo` markers that turn green with this fix.

const experienceOf = (...lines: string[]) =>
  parseResumeText(["EXPERIENCE", ...lines].join("\n")).experience ?? [];

test("a labelled personal-data line under any explicit section reaches no field", () => {
  for (const heading of ["DENEYİM", "EĞİTİM", "SERTİFİKALAR", "DİLLER", "BECERİLER"]) {
    for (const line of [
      "Telefon: 0533 123 45 67",
      "Cep: 0533 123 45 67",
      "Adres: Lefkoşa - 2019",
      "Doğum Tarihi: 03/1995",
      "TC: 2019",
      "IBAN: TR12 3456",
    ]) {
      const draft = parseResumeText([heading, line].join("\n"));
      const { cvFullText: _cvFullText, ...draftWithoutFullText } = draft;
      assert.deepEqual(
        draftWithoutFullText,
        {},
        `${heading} + "${line}" must reach no field`,
      );
    }
  }
});

test("a heading's inline remainder is filtered like a body line", () => {
  let draft = parseResumeText("EĞİTİM: Doğum Tarihi: 1995");
  let { cvFullText: _cvFullText, ...draftWithoutFullText } = draft;
  assert.deepEqual(draftWithoutFullText, {});

  draft = parseResumeText("DENEYİM: Telefon: 0533 123 45 67");
  ({ cvFullText: _cvFullText, ...draftWithoutFullText } = draft);
  assert.deepEqual(draftWithoutFullText, {});

  // A real inline entry must still survive.
  const realEntry = parseResumeText("EĞİTİM: Acme Üniversitesi - Bilgisayar - 2012 - 2016");
  const { cvFullText: __cvFullText, ...realEntryWithoutFullText } = realEntry;
  assert.deepEqual(realEntryWithoutFullText, {
    education: [
      {
        institution: "Acme Üniversitesi",
        qualification: "Bilgisayar",
        field: "",
        startDate: "2012",
        endDate: "2016",
        description: "",
      },
    ],
  });
});

test("an unlabelled personal-data line becomes no experience entry", () => {
  for (const line of ["1995-2000 doğumlu", "Yaş: 29 (1995)", "TC: 2019"]) {
    assert.deepEqual(experienceOf(line), [], `"${line}" must not become an entry`);
  }
});

test("the filter removes only the offending line, not its neighbours", () => {
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
  // The boundary the fix must not cross: these are ordinary job titles, so a
  // naive "drop any line with a personal-data word" filter would delete them.
  const titles: Array<[string, string, string]> = [
    ["Acme - Adres Doğrulama Uzmanı - 2019 - 2022", "2019", "2022"],
    ["Beta - Telefon Satış Temsilcisi - 2018 - 2020", "2018", "2020"],
    ["Gamma - Doğum Kliniği Hemşiresi - 2015 - 2017", "2015", "2017"],
    ["Delta - Nüfus Müdürlüğü Memuru - 2010 - 2014", "2010", "2014"],
  ];

  for (const [line, startDate, endDate] of titles) {
    const [entry] = experienceOf(line);
    assert.ok(entry, `"${line}" must still produce an experience entry`);
    assert.equal(entry?.startDate, startDate);
    assert.equal(entry?.endDate, endDate);
  }
});

test("a dateless multi-line entry extracts role and organization from separate lines", () => {
  // The role sits on its own line and contains a personal-data word; the
  // lookahead must not mistake it for a detail and shift the employer up.
  // The improved parser now correctly extracts role and organization.
  const draft = parseResumeText("DENEYİM\nDoğum Kliniği Hemşiresi\nGamma Hastanesi");

  assert.deepEqual(draft.experience, [
    {
      role: "Doğum Kliniği Hemşiresi",
      organization: "Gamma Hastanesi",
      location: "",
      startDate: "",
      endDate: "",
      description: "Gamma Hastanesi",
    },
  ]);
});
