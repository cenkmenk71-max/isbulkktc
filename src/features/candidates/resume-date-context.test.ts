import assert from "node:assert/strict";
import test from "node:test";

import { parseResumeText } from "./resume-parser";

/**
 * The date token accepts a bare year, so without a context filter a CV's birth
 * date, address or phone line contributed a year to work experience (#208):
 * "1995-2000 doğumlu" became a job period. These cases pin the filter.
 */

test("a birth year is not read as a work-experience period", () => {
  const draft = parseResumeText(
    [
      "AYŞE YILMAZ",
      "Kıdemli Yazılım Geliştirici",
      "",
      "Doğum: 1995-2000",
      "1995 doğumlu",
      "",
      "DENEYİM",
      "Acme Yazılım - Geliştirici - 2019 - 2023",
    ].join("\n"),
  );

  assert.equal(draft.experience?.length, 1);
  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
});

test("an address year is not read as a period", () => {
  const draft = parseResumeText(
    [
      "DENEYİM",
      "Acme Yazılım - Geliştirici - 2019 - 2023",
      "Adres: Lefkoşa - 2019",
    ].join("\n"),
  );

  assert.equal(draft.experience?.length, 1);
  assert.equal(draft.experience?.[0]?.organization, "Acme Yazılım");
});

test("an English birth line is filtered too", () => {
  const draft = parseResumeText(
    [
      "EXPERIENCE",
      "Acme Corp - Engineer - 2019 - 2023",
      "Date of birth: 1990",
    ].join("\n"),
  );

  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
});

test("a backwards or implausible year range is rejected", () => {
  const draft = parseResumeText(
    [
      "DENEYİM",
      "Acme Yazılım - Geliştirici - 2023 - 2019",
      "Beta Ltd - Mühendis - 1900 - 1999",
    ].join("\n"),
  );

  // Neither line is a valid period; the parser must not invent dates from them.
  for (const entry of draft.experience ?? []) {
    assert.equal(entry.startDate, "");
    assert.equal(entry.endDate, "");
  }
});

test("a legitimate period still parses (no regression)", () => {
  const draft = parseResumeText(
    ["DENEYİM", "Acme Yazılım - Geliştirici - 2019 - 2023"].join("\n"),
  );

  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
  assert.equal(draft.experience?.[0]?.organization, "Acme Yazılım");
});

test("a university named 'Doğu Akdeniz' is not filtered as a birth line", () => {
  // "doğu" (east) must not be read as the "doğum" (birth) stem.
  const draft = parseResumeText(
    ["EĞİTİM", "Doğu Akdeniz Üniversitesi - Bilgisayar Mühendisliği - 2012 - 2016"].join("\n"),
  );

  assert.equal(draft.education?.[0]?.institution, "Doğu Akdeniz Üniversitesi");
  assert.equal(draft.education?.[0]?.startDate, "2012");
  assert.equal(draft.education?.[0]?.endDate, "2016");
});

// A job title can contain a personal-data word. Before #367's fix the whole
// line was read as personal data, `extractDateRange` bailed, and the entry
// silently lost its dates — the candidate's period disappeared from the very
// roles that prove the word is a title, not a detail.
test("a real title containing a personal-data word keeps its dates", () => {
  const cases: Array<[string, string]> = [
    ["Adres Doğrulama Uzmanı", "Acme"],
    ["Telefon Satış Temsilcisi", "Beta"],
    ["Doğum Kliniği Hemşiresi", "Gamma"],
    ["Nüfus Müdürlüğü Memuru", "Delta"],
    ["Kimlik Kartı Uzmanı", "Epsilon"],
    ["Pasaport İşlemleri Görevlisi", "Zeta"],
  ];

  for (const [title, employer] of cases) {
    const draft = parseResumeText(
      ["DENEYİM", `${employer} - ${title} - 2019 - 2022`].join("\n"),
    );
    assert.equal(draft.experience?.[0]?.organization, title, `${title} must survive`);
    assert.equal(draft.experience?.[0]?.startDate, "2019", `${title} must keep its start`);
    assert.equal(draft.experience?.[0]?.endDate, "2022", `${title} must keep its end`);
  }
});

test("a role-first record whose title carries the word keeps its dates too", () => {
  const draft = parseResumeText(
    ["DENEYİM", "Adres Doğrulama Uzmanı - Acme - 2019 - 2022"].join("\n"),
  );
  assert.equal(draft.experience?.[0]?.role, "Adres Doğrulama Uzmanı");
  assert.equal(draft.experience?.[0]?.organization, "Acme");
  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2022");
});

test("a personal detail still reaches no field (the fix must not widen the leak)", () => {
  // The positive half of the filter must keep holding: a detail names itself in
  // the line's first field, so the title exception cannot readmit it. Asserted
  // on the loose path, which the filter already covers (#367 is the open
  // section-heading residue, tracked by LANE-QA).
  const lines = [
    "1995-2000 doğumlu",
    "Doğum: 1995-2000",
    "Yaş: 29 (1995)",
    "TC: 2019",
    "Telefon: 0533 123 45 67",
    "Adres: Lefkoşa - 2019",
    "Date of birth: 1990",
  ];

  for (const line of lines) {
    assert.deepEqual(
      parseResumeText(["AHMET YILMAZ", line].join("\n")),
      {},
      `${line} must not become any profile field`,
    );
  }
});

/**
 * A year-month date is written both ways round. Only `month.year` ("03.2019")
 * was matched, so `year.month` ("2019.03") fell back to the bare years and the
 * month fragments leaked into `location`/`description` (#208).
 */
test("a year-month range is read whole, in either order", () => {
  const cases: Array<[string, string, string]> = [
    ["2019.03 - 2021.05", "2019.03", "2021.05"],
    ["2019-03 - 2021-05", "2019-03", "2021-05"],
    ["2019/03 - 2021/05", "2019/03", "2021/05"],
    ["03.2019 - 05.2021", "03.2019", "05.2021"],
  ];

  for (const [range, start, end] of cases) {
    const entry = parseResumeText(["DENEYİM", `Acme - Dev - ${range}`].join("\n"))
      .experience?.[0];
    assert.equal(entry?.startDate, start, `${range} start`);
    assert.equal(entry?.endDate, end, `${range} end`);
    assert.equal(entry?.location, "", `${range} must not leak a month into location`);
    assert.equal(entry?.description, "", `${range} must not leak a month into description`);
  }
});

test("a bare year range is not split into year plus month", () => {
  // "1999-2000" must stay a two-year range, not become "1999-2" + "000".
  const entry = parseResumeText("DENEYİM\nAcme - Dev - 1999-2000").experience?.[0];
  assert.equal(entry?.startDate, "1999");
  assert.equal(entry?.endDate, "2000");
  assert.equal(entry?.location, "");
});

test("a certification issue date keeps its month", () => {
  const certification = parseResumeText(
    "CERTIFICATIONS\nAWS | Amazon | 2021.06",
  ).certifications?.[0];
  assert.equal(certification?.issueDate, "2021.06");
});

/**
 * A description line that sits directly above the *next* job's one-line header
 * ("Role | Employer | 2019 - 2023") is prose, not that job's role (#208).
 *
 * `nextEntryStartsAt` looked ahead for any dated line, so it saw the next entry's
 * own date and promoted the prose above it to a header — the role and employer
 * boxes then held the description and the job title ("React ve Node.js ile ürün
 * geliştirme" / "Yazılım Geliştirici - Beta Teknoloji").
 */
test("a description line above a self-contained entry is not read as its role", () => {
  const draft = parseResumeText(
    [
      "İŞ DENEYİMİ",
      "Kıdemli Yazılım Geliştirici | Acme Yazılım | 03/2019 - 07/2022",
      "- React ve Node.js ile ürün geliştirme",
      "Yazılım Geliştirici | Beta Teknoloji | Ocak 2016 - Şubat 2019",
      "- Ödeme sistemleri",
    ].join("\n"),
  );

  assert.deepEqual(
    draft.experience?.map((entry) => [
      entry.role,
      entry.organization,
      entry.startDate,
      entry.endDate,
      entry.description,
    ]),
    [
      [
        "Kıdemli Yazılım Geliştirici",
        "Acme Yazılım",
        "03/2019",
        "07/2022",
        "React ve Node.js ile ürün geliştirme",
      ],
      [
        "Yazılım Geliştirici",
        "Beta Teknoloji",
        "Ocak 2016",
        "Şubat 2019",
        "Ödeme sistemleri",
      ],
    ],
  );
});

test("a bare prose line above a self-contained entry is attached to the previous one", () => {
  // The bullet is only one spelling of the same line; the parser must not depend
  // on the bullet character to tell prose from a header.
  const draft = parseResumeText(
    [
      "EXPERIENCE",
      "Acme Corp | Senior Engineer | 2019 - 2023",
      "Shipped the design system",
      "Beta Ltd | Engineer | 2016 - 2019",
    ].join("\n"),
  );

  assert.deepEqual(
    draft.experience?.map((entry) => [entry.role, entry.organization, entry.description]),
    [
      ["Senior Engineer", "Acme Corp", "Shipped the design system"],
      ["Engineer", "Beta Ltd", ""],
    ],
  );
});

/**
 * A CV lists education either institution-first ("Doğu Akdeniz Üniversitesi |
 * Bilgisayar Mühendisliği") or degree-first ("Bilgisayar Mühendisliği | Doğu
 * Akdeniz Üniversitesi"). The parser wrote `parts[0]` to the institution box
 * unconditionally, so a degree-first entry put the field of study in the
 * institution box and the university in the qualification box — the "wrong box"
 * half of #208. Experience already handled both orders; education did not.
 */
test("a degree-first education entry still puts the institution in its own box", () => {
  const draft = parseResumeText(
    [
      "EĞİTİM",
      "Bilgisayar Mühendisliği | Doğu Akdeniz Üniversitesi | 2012 - 2016",
    ].join("\n"),
  );

  assert.equal(draft.education?.[0]?.institution, "Doğu Akdeniz Üniversitesi");
  assert.equal(draft.education?.[0]?.qualification, "Bilgisayar Mühendisliği");
  assert.equal(draft.education?.[0]?.startDate, "2012");
  assert.equal(draft.education?.[0]?.endDate, "2016");
});

test("an English degree-first education entry is ordered too", () => {
  const draft = parseResumeText(
    ["EDUCATION", "BSc Computer Science | University of Cyprus | 2012 - 2016"].join("\n"),
  );

  assert.equal(draft.education?.[0]?.institution, "University of Cyprus");
  assert.equal(draft.education?.[0]?.qualification, "BSc Computer Science");
});

test("the institution-first order is unchanged (no regression)", () => {
  const draft = parseResumeText(
    [
      "EĞİTİM",
      "Doğu Akdeniz Üniversitesi | Bilgisayar Mühendisliği | 2012 - 2016",
    ].join("\n"),
  );

  assert.equal(draft.education?.[0]?.institution, "Doğu Akdeniz Üniversitesi");
  assert.equal(draft.education?.[0]?.qualification, "Bilgisayar Mühendisliği");
});
