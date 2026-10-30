import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAND,
  LOGO_URL,
  escapeHtml,
  renderEmailLayout,
  renderEmailText,
} from "../../supabase/functions/_shared/email-layout";
import {
  EMAIL_LOCALES,
  getEmailCopy,
  resolveEmailLocale,
} from "../../supabase/functions/_shared/email-copy";
import {
  renderAuthConfirmation,
  renderAuthPasswordChanged,
  renderAuthReauthentication,
  renderAuthRecovery,
  renderEngagementEmail,
  renderFeedbackAcknowledgement,
  renderFeedbackTeamEmail,
  renderJobPublishedEmail,
  renderNotificationEmail,
  renderResumeReceivedEmail,
  renderSalesAcknowledgement,
  renderSalesTeamEmail,
  renderWelcomeEmail,
  type RenderedEmail,
} from "../../supabase/functions/_shared/email-render";
import { EMAIL_COPY_EXTRAS } from "../../supabase/functions/_shared/email-copy-extras";

const SITE = "https://isbulkktc.com/";

function assertWellFormed(email: RenderedEmail, label: string) {
  assert.ok(email.subject.length > 0, `${label}: subject is empty`);
  assert.ok(email.html.startsWith("<!DOCTYPE html>"), `${label}: not an html document`);
  assert.ok(email.html.includes(BRAND.name), `${label}: brand name missing`);
  assert.ok(email.html.includes(LOGO_URL), `${label}: hosted logo missing`);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(email.html), `${label}: control chars`);
  const opens = (email.html.match(/<table/g) ?? []).length;
  const closes = (email.html.match(/<\/table>/g) ?? []).length;
  assert.equal(opens, closes, `${label}: unbalanced <table> (${opens}/${closes})`);
  const tdOpens = (email.html.match(/<td/g) ?? []).length;
  const tdCloses = (email.html.match(/<\/td>/g) ?? []).length;
  assert.equal(tdOpens, tdCloses, `${label}: unbalanced <td> (${tdOpens}/${tdCloses})`);
  assert.ok(email.text.length > 0, `${label}: text alternative empty`);
  assert.ok(!email.text.includes("<"), `${label}: text alternative contains tags`);
}

test("escapeHtml neutralises markup from untrusted copy", () => {
  assert.equal(escapeHtml("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal(escapeHtml(`"'&`), "&quot;&#39;&amp;");
});

test("resolveEmailLocale falls back to Turkish for unknown locales", () => {
  assert.equal(resolveEmailLocale("de"), "de");
  assert.equal(resolveEmailLocale("fr"), "tr");
  assert.equal(resolveEmailLocale(null), "tr");
  assert.equal(resolveEmailLocale(undefined), "tr");
});

test("every locale has a complete, non-empty catalog", () => {
  for (const locale of EMAIL_LOCALES) {
    const copy = getEmailCopy(locale);
    assert.ok(copy.auth.confirmationSubject.length > 0, `${locale}: confirmation subject`);
    assert.ok(copy.auth.confirmationLead.includes("{") === false, `${locale}: stray template token`);
    assert.ok(copy.welcome.candidateSteps.length >= 3, `${locale}: candidate steps`);
    assert.ok(copy.welcome.employerSteps.length >= 3, `${locale}: employer steps`);
    assert.ok(copy.notification.statusChanged.includes("{status}"), `${locale}: status placeholder`);
    assert.equal(Object.keys(copy.statuses).length, 6, `${locale}: status labels`);
  }
});

test("renderEmailLayout builds a branded, responsive shell", () => {
  const html = renderEmailLayout({
    preheader: "Başvurunuz işverene iletildi",
    heading: "Başvurunuz işverene iletildi",
    introHtml: "<p>Kaydedildi.</p>",
    button: { label: "Panelden takip edin", url: "https://isbulkktc.com/profile/dashboard" },
    footerNote: "İşBul KKTC bildirimi",
    siteUrl: SITE,
  });
  assert.ok(html.includes("İşBul KKTC"));
  assert.ok(html.includes("Kuzey Kıbrıs"));
  assert.ok(html.includes("prefers-color-scheme:dark"));
  assert.ok(html.includes("Başvurunuz işverene iletildi"));
  assert.ok(html.includes("https://isbulkktc.com/profile/dashboard"));
});

test("renderEmailLayout drops a javascript: call-to-action", () => {
  const html = renderEmailLayout({
    preheader: "x",
    heading: "y",
    button: { label: "Tıkla", url: "javascript:alert(1)" },
    footerNote: "f",
    siteUrl: SITE,
  });
  assert.ok(!html.includes("javascript:alert(1)"));
});

test("all auth templates render in all six locales", () => {
  for (const locale of EMAIL_LOCALES) {
    const ctx = { locale, siteUrl: SITE };
    assertWellFormed(
      renderAuthConfirmation({ ...ctx, email: "a@b.com", confirmationUrl: "https://isbulkktc.com/auth/callback?token=x" }),
      `${locale}/confirmation`,
    );
    assertWellFormed(
      renderAuthRecovery({ ...ctx, email: "a@b.com", confirmationUrl: "https://isbulkktc.com/auth/callback?token=x" }),
      `${locale}/recovery`,
    );
    assertWellFormed(renderAuthReauthentication({ ...ctx, token: "123456" }), `${locale}/reauth`);
    assertWellFormed(renderAuthPasswordChanged({ ...ctx, email: "a@b.com" }), `${locale}/password-changed`);
  }
});

test("welcome templates render for both audiences in all locales", () => {
  for (const locale of EMAIL_LOCALES) {
    for (const audience of ["candidate", "employer"] as const) {
      const email = renderWelcomeEmail({
        locale,
        siteUrl: SITE,
        audience,
        name: "Ayşe Yılmaz",
        actionUrl: "https://isbulkktc.com/profile/dashboard",
      });
      assertWellFormed(email, `${locale}/welcome/${audience}`);
      assert.ok(email.html.includes("Ayşe Yılmaz"), `${locale}/welcome/${audience}: name`);
    }
  }
});

test("notification templates cover every event and status", () => {
  const events = [
    { eventType: "submitted" as const, isCandidate: true },
    { eventType: "submitted" as const, isCandidate: false },
    { eventType: "viewed" as const, isCandidate: true },
  ];
  for (const locale of EMAIL_LOCALES) {
    for (const event of events) {
      const email = renderNotificationEmail({
        locale,
        siteUrl: SITE,
        jobTitle: "Kıdemli Yazılım Geliştirici",
        dashboardUrl: "https://isbulkktc.com/profile/dashboard#my-applications",
        ...event,
      });
      assertWellFormed(email, `${locale}/notification/${event.eventType}/${event.isCandidate}`);
    }
    for (const status of Object.keys(getEmailCopy(locale).statuses)) {
      const email = renderNotificationEmail({
        locale,
        siteUrl: SITE,
        eventType: "status_changed",
        isCandidate: true,
        jobTitle: "Aşçı",
        status,
        dashboardUrl: "https://isbulkktc.com/profile/dashboard#my-applications",
      });
      assertWellFormed(email, `${locale}/status/${status}`);
      assert.ok(
        email.html.includes(getEmailCopy(locale).statuses[status]),
        `${locale}/status/${status}: label missing`,
      );
    }
  }
});

test("notification renderer rejects an unknown event", () => {
  assert.throws(() =>
    renderNotificationEmail({
      locale: "tr",
      siteUrl: SITE,
      eventType: "bogus" as unknown as "submitted",
      isCandidate: true,
      jobTitle: "x",
      dashboardUrl: SITE,
    }),
  );
});

test("feedback acknowledgement and team email carry the message safely", () => {
  const payload = {
    locale: "tr",
    name: "Mehmet <b>K</b>",
    email: "mehmet@example.com",
    category: "Öneri",
    rating: 5,
    message: "Harika bir platform <script>alert(1)</script>",
    actionUrl: "https://isbulkktc.com/jobs",
    siteUrl: SITE,
  };
  // The acknowledgement thanks the sender without echoing the message back.
  const ack = renderFeedbackAcknowledgement(payload);
  assertWellFormed(ack, "feedback/ack");
  assert.ok(!ack.html.includes("alert(1)"));

  const team = renderFeedbackTeamEmail(payload);
  assertWellFormed(team, "feedback/team");
  assert.ok(team.subject.includes("Öneri"));
  assert.ok(team.html.includes("mehmet@example.com"));
  assert.ok(team.html.includes("5/5"));
  assert.ok(!team.html.includes("<script>alert(1)</script>"));
  assert.ok(team.html.includes("&lt;script&gt;"));
  assert.ok(team.html.includes("&lt;b&gt;K&lt;/b&gt;"));
});

test("renderEmailText produces a tag-free plain-text alternative", () => {
  const text = renderEmailText({
    preheader: "p",
    heading: "Başvuru durumu",
    introHtml: "<p>Merhaba <strong>Ayşe</strong></p>",
    button: { label: "Paneli aç", url: "https://isbulkktc.com/x" },
    footerNote: "not",
    siteUrl: SITE,
  });
  assert.ok(text.includes("Başvuru durumu"));
  assert.ok(text.includes("Paneli aç: https://isbulkktc.com/x"));
  assert.ok(!text.includes("<"));
});

test("every locale has a complete, non-empty extras catalog", () => {
  for (const locale of EMAIL_LOCALES) {
    const extras = EMAIL_COPY_EXTRAS[locale];
    assert.ok(extras.jobPublished.subject.length > 0, `${locale}: jobPublished subject`);
    assert.ok(extras.jobPublished.steps.length >= 3, `${locale}: jobPublished steps`);
    assert.ok(extras.resume.subject.length > 0, `${locale}: resume subject`);
    assert.ok(extras.resume.updateSubject.length > 0, `${locale}: resume updateSubject`);
    assert.ok(extras.sales.ackSubject.length > 0, `${locale}: sales ackSubject`);
    assert.ok(extras.sales.teamSubject.length > 0, `${locale}: sales teamSubject`);
    assert.ok(extras.engagement.subject.length > 0, `${locale}: engagement subject`);
    assert.ok(
      extras.engagement.jobRow.includes("{title}") &&
        extras.engagement.jobRow.includes("{company}"),
      `${locale}: engagement jobRow must keep both placeholders`,
    );
  }
});

test("job published email renders in every locale", () => {
  for (const locale of EMAIL_LOCALES) {
    const email = renderJobPublishedEmail({
      locale,
      siteUrl: SITE,
      jobTitle: "Kıdemli Yazılım Geliştirici",
      jobUrl: `${SITE}jobs/senior-developer`,
    });
    assertWellFormed(email, `jobPublished/${locale}`);
    assert.ok(email.html.includes("Kıdemli Yazılım Geliştirici"));
    assert.ok(email.html.includes(`${SITE}jobs/senior-developer`));
    assert.equal(email.subject, EMAIL_COPY_EXTRAS[locale].jobPublished.subject);
  }
});

test("resume received email distinguishes first import from an update", () => {
  const initial = renderResumeReceivedEmail({
    locale: "tr",
    siteUrl: SITE,
    name: "Ayşe",
    isUpdate: false,
    profileUrl: `${SITE}profile/dashboard`,
  });
  assertWellFormed(initial, "resume/initial");
  assert.equal(initial.subject, EMAIL_COPY_EXTRAS.tr.resume.subject);
  assert.ok(initial.html.includes("Ayşe"));

  const update = renderResumeReceivedEmail({
    locale: "en",
    siteUrl: SITE,
    isUpdate: true,
    profileUrl: `${SITE}profile/dashboard`,
  });
  assertWellFormed(update, "resume/update");
  assert.equal(update.subject, EMAIL_COPY_EXTRAS.en.resume.updateSubject);
  assert.notEqual(update.subject, EMAIL_COPY_EXTRAS.en.resume.subject);
});

test("sales acknowledgement and team email carry the lead safely", () => {
  const payload = {
    locale: "tr",
    siteUrl: SITE,
    companyName: "Acme KKTC",
    contactName: "Mehmet",
    email: "mehmet@example.com",
    plan: "Kurumsal 30",
    durationDays: 30,
    note: "<script>alert(1)</script>",
    actionUrl: `${SITE}packages`,
  };
  const ack = renderSalesAcknowledgement(payload);
  assertWellFormed(ack, "sales/ack");
  assert.equal(ack.subject, EMAIL_COPY_EXTRAS.tr.sales.ackSubject);

  const team = renderSalesTeamEmail(payload);
  assertWellFormed(team, "sales/team");
  assert.ok(team.html.includes("Acme KKTC"));
  assert.ok(team.html.includes("mehmet@example.com"));
  assert.ok(!team.html.includes("<script>alert(1)</script>"));
  assert.ok(team.html.includes("&lt;script&gt;"));
});

test("engagement email carries an unsubscribe link and job rows", () => {
  for (const locale of EMAIL_LOCALES) {
    const email = renderEngagementEmail({
      locale,
      siteUrl: SITE,
      name: "Ayşe",
      jobs: [
        { title: "Ürün Yöneticisi", company: "Acme", url: `${SITE}jobs/pm` },
        { title: "Tasarımcı", company: "Beta" },
      ],
      jobsUrl: `${SITE}jobs`,
      unsubscribeUrl: `${SITE}unsubscribe?token=abc`,
    });
    assertWellFormed(email, `engagement/${locale}`);
    assert.ok(email.html.includes(`${SITE}unsubscribe?token=abc`));
    assert.ok(email.html.includes("Ürün Yöneticisi · Acme"));
    assert.ok(email.html.includes("Tasarımcı · Beta"));
    assert.equal(email.subject, EMAIL_COPY_EXTRAS[locale].engagement.subject);
  }
});

test("new email families escape hostile titles and notes", () => {
  const job = renderJobPublishedEmail({
    locale: "tr",
    siteUrl: SITE,
    jobTitle: '<img src=x onerror="alert(1)">',
    jobUrl: `${SITE}jobs/x`,
  });
  assert.ok(!job.html.includes("onerror=\"alert(1)\""));
  assert.ok(job.html.includes("&lt;img"));

  const engagement = renderEngagementEmail({
    locale: "de",
    siteUrl: SITE,
    jobs: [{ title: "<b>Bold</b>", company: "X & Y" }],
    jobsUrl: `${SITE}jobs`,
    unsubscribeUrl: `${SITE}unsubscribe`,
  });
  assert.ok(!engagement.html.includes("<b>Bold</b>"));
  assert.ok(engagement.html.includes("&lt;b&gt;Bold&lt;/b&gt; · X &amp; Y"));
});
