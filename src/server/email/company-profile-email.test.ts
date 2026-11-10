import assert from "node:assert/strict";
import test from "node:test";

import { getCompanyProfileCopy } from "./company-profile-copy";
import {
  renderCompanyProfileAcknowledgement,
  renderCompanyProfileTeamEmail,
} from "./company-profile-render";

/**
 * #465: a company-profile submission reached `company_profile_submissions` and
 * nobody was told — no acknowledgement to the employer, no alert to the review
 * inbox. These pin the two renderers and the six-locale copy so a missing
 * translation or a dropped field is a failure, not a silent fallback.
 */

const SITE = { siteUrl: "https://isbulkktc.com/" };
const LOCALES = ["tr", "en", "de", "ru", "el", "fa"] as const;

test("the acknowledgement renders the company name, steps and a dashboard CTA", () => {
  const email = renderCompanyProfileAcknowledgement({
    ...SITE,
    locale: "tr",
    companyName: "Kıbet",
    actionUrl: "https://isbulkktc.com/company/dashboard",
  });

  assert.equal(email.subject, getCompanyProfileCopy("tr").ackSubject);
  assert.match(email.html, /Kıbet/);
  assert.match(email.html, /https:\/\/isbulkktc\.com\/company\/dashboard/);
  for (const step of getCompanyProfileCopy("tr").ackSteps) {
    assert.ok(email.html.includes(step), `step missing: ${step}`);
  }
  // The plain-text alternative must carry the link, not just the HTML part.
  assert.match(email.text, /company\/dashboard/);
});

test("the team alert lists the submitted fields", () => {
  const email = renderCompanyProfileTeamEmail({
    ...SITE,
    locale: "tr",
    companyName: "Kıbet",
    categories: "Kafe, Restoran",
    website: "https://kibet.example",
    publicEmail: "info@kibet.example",
    address: "Lefkoşa",
    submittedBy: "owner@kibet.example",
    actionUrl: "https://isbulkktc.com/admin/company-profiles",
  });

  assert.equal(email.subject, "Yeni şirket profili gönderimi: Kıbet");
  for (const value of [
    "Kıbet",
    "Kafe, Restoran",
    "https://kibet.example",
    "info@kibet.example",
    "Lefkoşa",
    "owner@kibet.example",
  ]) {
    assert.ok(email.html.includes(value), `missing value: ${value}`);
  }
  assert.match(email.html, /admin\/company-profiles/);
});

test("blank optional fields collapse instead of rendering empty rows", () => {
  const email = renderCompanyProfileTeamEmail({
    ...SITE,
    locale: "en",
    companyName: "Acme",
    categories: null,
    website: "",
    phone: null,
    publicEmail: null,
    address: null,
    submittedBy: null,
    actionUrl: "https://isbulkktc.com/admin/company-profiles",
  });

  const copy = getCompanyProfileCopy("en");
  for (const label of [
    copy.categoriesLabel,
    copy.websiteLabel,
    copy.contactLabel,
    copy.addressLabel,
    copy.submittedByLabel,
  ]) {
    assert.ok(!email.html.includes(label), `empty row rendered: ${label}`);
  }
  assert.ok(email.html.includes(copy.companyLabel));
});

test("phone stands in for contact when no public email was given", () => {
  const email = renderCompanyProfileTeamEmail({
    ...SITE,
    locale: "en",
    companyName: "Acme",
    phone: "+90 533 000 00 00",
    actionUrl: "https://isbulkktc.com/admin/company-profiles",
  });
  assert.ok(email.html.includes("+90 533 000 00 00"));
});

test("every locale implements the copy and escapes hostile input", () => {
  for (const locale of LOCALES) {
    const copy = getCompanyProfileCopy(locale);
    assert.ok(copy.ackSubject.length > 0, `${locale} ackSubject`);
    assert.ok(copy.teamHeading.length > 0, `${locale} teamHeading`);
    assert.ok(copy.ackSteps.length >= 1, `${locale} ackSteps`);
    assert.ok(copy.ackStepsHeading.length > 0, `${locale} ackStepsHeading`);
    assert.ok(copy.teamDetailsHeading.length > 0, `${locale} teamDetailsHeading`);

    const email = renderCompanyProfileTeamEmail({
      ...SITE,
      locale,
      companyName: "<script>alert(1)</script>",
      actionUrl: "https://isbulkktc.com/admin/company-profiles",
    });
    assert.ok(!email.html.includes("<script>"), `${locale} leaked markup`);
    assert.match(email.html, /&lt;script&gt;/);
  }
});

test("an unknown locale falls back to Turkish rather than crashing", () => {
  assert.equal(getCompanyProfileCopy("zz"), getCompanyProfileCopy("tr"));
  assert.equal(getCompanyProfileCopy(null), getCompanyProfileCopy("tr"));
  assert.equal(getCompanyProfileCopy("tr-TR"), getCompanyProfileCopy("tr"));
});
