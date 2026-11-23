import assert from "node:assert/strict";
import test from "node:test";
import {
  hasResumeDraftContent,
  parseResumeText,
} from "../../src/features/candidates/resume-parser";

test("resume parser extracts supported English headings without guessing personal data", () => {
  const draft = parseResumeText(
    [
      "Alex Example",
      "Professional Title: Product Designer",
      "Location: Kyrenia",
      "Skills",
      "Figma, user research; Prototyping",
      "Experience",
      "Product Designer | Example Studio",
      "Designed accessible digital products.",
      "Education",
      "Example University",
      "Bachelor of Design",
      "Languages",
      "English, Turkish",
      "Certifications",
      "Accessibility Foundations | Example Academy",
    ].join("\n"),
  );

  assert.equal(draft.headline, "Product Designer");
  assert.equal(draft.location, "Kyrenia");
  assert.deepEqual(draft.skills, ["Figma", "user research", "Prototyping"]);
  assert.deepEqual(draft.experience, [
    {
      company: "Example Studio",
      role: "Product Designer",
      district: "",
      startDate: null,
      endDate: null,
      isCurrent: false,
      description: "Designed accessible digital products.",
      achievements: [],
      sector: undefined,
    },
  ]);
  assert.deepEqual(draft.education?.[0], {
    institution: "Example University",
    department: "",
    degree: "Bachelor of Design",
    startYear: null,
    endYear: null,
    gpa: undefined,
    isOngoing: false,
    location: null,
    level: "other",
  });
  assert.deepEqual(draft.languages, [
    { language: "en", proficiency: "B1", language_name_localized: undefined },
    { language: "tr", proficiency: "B1", language_name_localized: undefined },
  ]);
  assert.deepEqual(draft.certifications, [
    {
      name: "Accessibility Foundations",
      issuer: "Example Academy",
      issueDate: "",
      expiryDate: "",
    },
  ]);
  assert.equal(hasResumeDraftContent(draft), true);
});

test("resume parser recognizes Turkish headings and trims duplicate skills", () => {
  const draft = parseResumeText(
    [
      "Mesleki Başlık: Yazılım Geliştirici",
      "Beceriler",
      "TypeScript, React, typescript",
      "İş Deneyimi",
      "Ürün geliştirme ve ekip çalışması",
      "Eğitim",
      "Örnek Üniversitesi",
    ].join("\n"),
  );

  assert.equal(draft.headline, "Yazılım Geliştirici");
  assert.deepEqual(draft.skills, ["TypeScript", "React"]);
  assert.equal(draft.experience?.[0]?.description, "Ürün geliştirme ve ekip çalışması");
  assert.equal(draft.education?.[0]?.institution, "Örnek Üniversitesi");
});

test("resume parser supports Persian section labels and leaves unknown text untouched", () => {
  const draft = parseResumeText(
    [
      "عنوان حرفه‌ای: طراح محصول",
      "مهارت‌ها",
      "طراحی محصول، پژوهش کاربر",
      "تجربه کاری",
      "توسعه محصولات دیجیتال",
    ].join("\n"),
  );

  assert.equal(draft.headline, "طراح محصول");
  assert.deepEqual(draft.skills, ["طراحی محصول", "پژوهش کاربر"]);
  assert.equal(draft.experience?.[0]?.description, "توسعه محصولات دیجیتال");
  
  const emptyDraft = parseResumeText("Alex Example\nalex@example.test");
  assert.equal(emptyDraft.cvFullText?.includes("Alex Example"), true);
  assert.equal(emptyDraft.cvFullText?.includes("alex@example.test"), true);
  assert.equal(hasResumeDraftContent({}), false);
});

test("infers every section from a Turkish CV that has no headings", () => {
  const draft = parseResumeText(
    [
      "AHMET YILMAZ",
      "Kıdemli Yazılım Geliştirici",
      "Lefkoşa",
      "ahmet@example.com",
      "0533 000 0000",
      "",
      "ABC Yazılım - Kıdemli Geliştirici - 2020-2024",
      "XYZ Ltd - Geliştirici - 2017-2020",
      "",
      "Doğu Akdeniz Üniversitesi - Bilgisayar Mühendisliği - 2016",
      "",
      "React, Node.js, PostgreSQL, Docker",
    ].join("\n"),
  );

  assert.equal(draft.headline, "Kıdemli Yazılım Geliştirici");
  assert.equal(draft.location, "Lefkoşa");
  assert.deepEqual(draft.skills, ["React", "Node.js", "PostgreSQL", "Docker"]);
  assert.deepEqual(draft.experience, [
    {
      company: "ABC Yazılım",
      role: "Kıdemli Geliştirici",
      district: "",
      startDate: "2020",
      endDate: "2024",
      isCurrent: false,
      description: "",
      achievements: [],
      sector: undefined,
    },
    {
      company: "XYZ Ltd",
      role: "Geliştirici",
      district: "",
      startDate: "2017",
      endDate: "2020",
      isCurrent: false,
      description: "",
      achievements: [],
      sector: undefined,
    },
  ]);
  assert.equal(draft.education?.[0]?.institution, "Doğu Akdeniz Üniversitesi");
  assert.equal(draft.education?.[0]?.degree, "Bilgisayar Mühendisliği");
});

test("infers sections from an English CV that has no headings", () => {
  const draft = parseResumeText(
    [
      "JOHN SMITH",
      "Senior Software Engineer",
      "London, UK | john@example.com",
      "",
      "Acme Corp - Senior Engineer - 2019 - Present",
      "Beta Ltd - Engineer - 2016 - 2019",
      "",
      "University of Cyprus - BSc Computer Science - 2016",
      "",
      "Python, Django, AWS",
    ].join("\n"),
  );

  assert.equal(draft.headline, "Senior Software Engineer");
  assert.deepEqual(draft.skills, ["Python", "Django", "AWS"]);
  assert.deepEqual(draft.experience, [
    {
      company: "Acme Corp",
      role: "Senior Engineer",
      district: "",
      startDate: "2019",
      endDate: "Present",
      isCurrent: false,
      description: "",
      achievements: [],
      sector: undefined,
    },
    {
      company: "Beta Ltd",
      role: "Engineer",
      district: "",
      startDate: "2016",
      endDate: "2019",
      isCurrent: false,
      description: "",
      achievements: [],
      sector: undefined,
    },
  ]);
  assert.equal(draft.education?.[0]?.institution, "University of Cyprus");
});

test("splits a multi-job experience section into one entry per job", () => {
  const draft = parseResumeText(
    [
      "MEHMET DEMİR",
      "Muhasebeci",
      "Girne",
      "",
      "İŞ TECRÜBESİ",
      "ABC Ltd - Muhasebeci - 2021 - Halen",
      "DEF A.Ş. - Muhasebe Asistanı - 2018 - 2021",
      "GHI Şti. - Stajyer - 2017 - 2018",
    ].join("\n"),
  );

  assert.equal(draft.experience?.length, 3);
  assert.deepEqual(
    draft.experience?.map((entry) => [
      entry.role,
      entry.company,
      entry.startDate,
      entry.endDate,
    ]),
    [
      ["Muhasebeci", "ABC Ltd", "2021", "Halen"],
      ["Muhasebe Asistanı", "DEF A.Ş.", "2018", "2021"],
      ["Stajyer", "GHI Şti.", "2017", "2018"],
    ],
  );
});

test("does not treat a date range as a phone number", () => {
  const draft = parseResumeText(
    [
      "AYŞE KAYA",
      "Tasarımcı",
      "",
      "DENEYİM",
      "ABC Yazılım - Tasarımcı - 2019-2023",
    ].join("\n"),
  );

  assert.equal(draft.experience?.length, 1);
  assert.equal(draft.experience?.[0]?.role, "Tasarımcı");
  assert.equal(draft.experience?.[0]?.company, "ABC Yazılım");
  assert.equal(draft.experience?.[0]?.startDate, "2019");
  assert.equal(draft.experience?.[0]?.endDate, "2023");
});

test("keeps an unmatched free-text CV from inventing categories", () => {
  const draft = parseResumeText("Just a single short line");
  assert.equal(draft.cvFullText, "Just a single short line");
  assert.equal(Object.keys(draft).filter(k => k !== "cvFullText").length, 0);
  assert.equal(hasResumeDraftContent(draft), false);
});
