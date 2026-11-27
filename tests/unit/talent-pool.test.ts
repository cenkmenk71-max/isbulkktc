import assert from "node:assert/strict";
import test from "node:test";
import {
  EMAIL_LOCALES,
} from "../../supabase/functions/_shared/email-copy.ts";
import {
  getJobMatchAlertCopy,
  type JobMatchAlertCopy,
} from "../../src/server/email/job-match-alert-copy.ts";
import { renderJobMatchAlert } from "../../src/server/email/job-match-alert-render.ts";

const SITE = "https://isbulkktc.com/";

function assertWellFormed(email: { subject: string; html: string; text: string }, label: string) {
  assert.ok(email.subject.length > 0, `${label}: subject is empty`);
  assert.ok(email.html.startsWith("<!DOCTYPE html>"), `${label}: not an html document`);
  assert.ok(email.text.length > 0, `${label}: text alternative empty`);
  const opens = (email.html.match(/<table/g) ?? []).length;
  const closes = (email.html.match(/<\/table>/g) ?? []).length;
  assert.equal(opens, closes, `${label}: unbalanced <table> (${opens}/${closes})`);
}

test("job match alert copy exists for all six locales", () => {
  for (const locale of EMAIL_LOCALES) {
    const copy: JobMatchAlertCopy = getJobMatchAlertCopy(locale);
    assert.ok(copy.subject.length > 0, `${locale}: subject empty`);
    assert.ok(copy.heading.length > 0, `${locale}: heading empty`);
    assert.ok(copy.lead.length > 0, `${locale}: lead empty`);
    assert.ok(copy.jobsHeading.length > 0, `${locale}: jobsHeading empty`);
    assert.ok(copy.jobRow.length > 0, `${locale}: jobRow empty`);
    assert.ok(copy.cta.length > 0, `${locale}: cta empty`);
    assert.ok(copy.unsubscribeLabel.length > 0, `${locale}: unsubscribeLabel empty`);
    assert.ok(copy.footerReason.length > 0, `${locale}: footerReason empty`);
  }
});

test("job match alert render is well-formed and escapes hostile content", () => {
  for (const locale of EMAIL_LOCALES) {
    const email = renderJobMatchAlert({
      locale,
      name: "Ayşe",
      jobs: [
        { title: "Ürün Yöneticisi", company: "Acme", url: `${SITE}jobs/pm` },
        { title: "Tasarımcı", company: "Beta", url: `${SITE}jobs/designer` },
      ],
      jobsUrl: `${SITE}jobs`,
      siteUrl: SITE,
      unsubscribeUrl: `${SITE}unsubscribe?token=abc`,
    });
    assertWellFormed(email, `job-match-alert/${locale}`);
    assert.ok(email.html.includes(`${SITE}unsubscribe?token=abc`));
    assert.ok(email.html.includes("Ürün Yöneticisi · Acme"));
    assert.ok(email.html.includes("Tasarımcı · Beta"));
    assert.equal(email.subject, getJobMatchAlertCopy(locale).subject);
  }
});

test("job match alert escapes hostile job titles", () => {
  const email = renderJobMatchAlert({
    locale: "tr",
    siteUrl: SITE,
    jobs: [{ title: '<img src=x onerror="alert(1)">', company: "X & Y", url: `${SITE}jobs/x` }],
    jobsUrl: `${SITE}jobs`,
    unsubscribeUrl: `${SITE}unsubscribe`,
  });
  assert.ok(!email.html.includes("onerror=\"alert(1)\""));
  assert.ok(email.html.includes("&lt;img"));
  assert.ok(email.html.includes("&amp;"));
});
