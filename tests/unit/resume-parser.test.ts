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
      role: "",
      organization: "",
      location: "",
      startDate: "",
      endDate: "",
      description: "Product Designer | Example Studio\nDesigned accessible digital products.",
    },
  ]);
  assert.deepEqual(draft.education?.[0], {
    institution: "Example University",
    qualification: "Bachelor of Design",
    field: "",
    startDate: "",
    endDate: "",
    description: "",
  });
  assert.deepEqual(draft.languages, [
    { name: "English", proficiency: "" },
    { name: "Turkish", proficiency: "" },
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
  assert.deepEqual(parseResumeText("Alex Example\nalex@example.test"), {});
  assert.equal(hasResumeDraftContent({}), false);
});
