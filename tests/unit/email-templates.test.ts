import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  renderMarketingEmail,
  renderNotificationEmail,
  renderResumeReceivedEmail,
  renderSalesAcknowledgement,
  renderSalesTeamEmail,
  renderWelcomeEmail,
  type RenderedEmail,
} from "../../supabase/functions/_shared/email-render";
import { EMAIL_COPY_EXTRAS } from "../../supabase/functions/_shared/email-copy-extras";
import {
  MARKETING_CONTACTS,
  MARKETING_COPY,
} from "../../supabase/functions/_shared/email-copy-marketing";

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

/**
 * The shell's palette is copied, not imported, from `src/styles/global.css`
 * because the email renders in a Deno worker and a Node action, neither of
 * which can read the app stylesheet. #191 is the drift that copy invites: the
 * shell carried a "matches the app's --green token" comment over a value the
 * token never held, so the brand repainted with no test failing. Pin each
 * `BRAND` colour to the token it claims, resolving one alias level.
 */
test("the email shell palette matches the app design tokens", () => {
  const css = readFileSync(
    new URL("../../src/styles/global.css", import.meta.url),
    "utf8",
  );

  const token = (name: string): string => {
    const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
    assert.ok(match, `--${name} is not declared in global.css`);
    const value = match[1].trim();
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    return alias ? token(alias[1]) : value;
  };

  const pairs: [keyof typeof BRAND, string][] = [
    ["green", "green"],
    ["greenDark", "green-hover"],
    ["greenSoft", "green-soft"],
    ["ink", "ink"],
    ["inkSoft", "ink-3"],
    ["line", "line"],
    ["muted", "muted"],
    ["footer", "surface"],
  ];

  for (const [brandKey, tokenName] of pairs) {
    assert.equal(
      BRAND[brandKey].toLowerCase(),
      token(tokenName).toLowerCase(),
      `BRAND.${brandKey} (${BRAND[brandKey]}) drifted from --${tokenName} (${token(tokenName)})`,
    );
  }
});

test("the email page background is pure white, never a tinted canvas", () => {
  // A tinted canvas reads as bulk mail to filters and to the eye, and a gray
  // one is what put these sends in spam; the page must sit on white.
  assert.equal(BRAND.surface, "#FFFFFF");
  const html = renderEmailLayout({
    preheader: "x",
    heading: "y",
    footerNote: "f",
    siteUrl: SITE,
  });
  assert.match(
    html,
    /<body style="margin:0;padding:0;background:#FFFFFF;/,
    "the email body is not painted white",
  );
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

test("the shell declares the recipient locale and direction (WCAG 3.1.1)", () => {
  // The auth templates already emit lang/dir from the locale; the transactional
  // shell hard-coded `lang="tr"` with no `dir`, so a Persian mail was announced
  // as Turkish and laid out LTR (#271).
  const render = (locale: string) =>
    renderEmailLayout({
      locale,
      preheader: "p",
      heading: "h",
      footerNote: "f",
      siteUrl: SITE,
    });

  for (const locale of ["tr", "en", "ru", "el", "de"]) {
    assert.match(render(locale), new RegExp(`<html lang="${locale}" dir="ltr">`), `${locale} lang/dir`);
  }
  assert.match(render("fa"), /<html lang="fa" dir="rtl">/, "Persian must be rtl");

  // A missing or malformed locale keeps the Turkish default rather than
  // emitting nothing. A valid tag is passed through; the renderers resolve it
  // to a shipped locale first, so `lang` always matches the copy language.
  assert.match(render(undefined as unknown as string), /<html lang="tr" dir="ltr">/);
  assert.match(render("!!"), /<html lang="tr" dir="ltr">/);
  assert.match(render("fr"), /<html lang="fr" dir="ltr">/);
});

test("the RTL shell mirrors the header logo padding", () => {
  const render = (locale: string) =>
    renderEmailLayout({
      locale,
      preheader: "p",
      heading: "h",
      footerNote: "f",
      siteUrl: SITE,
    });
  assert.ok(render("tr").includes("padding-left:14px"));
  assert.ok(render("fa").includes("padding-right:14px"));
  assert.ok(!render("fa").includes("padding-left:14px"));
});

test("every transactional renderer emits the recipient's lang and dir", () => {
  // End-to-end through the renderers the mailer actually calls, not just the
  // shell: the locale must survive from the caller to `<html>`.
  for (const locale of EMAIL_LOCALES) {
    const email = renderWelcomeEmail({
      locale,
      siteUrl: SITE,
      audience: "candidate",
      actionUrl: `${SITE}profile/dashboard`,
    });
    const dir = locale === "fa" ? "rtl" : "ltr";
    assert.ok(
      email.html.includes(`<html lang="${locale}" dir="${dir}">`),
      `${locale}: welcome email must declare lang/dir`,
    );
  }
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

// ---------------------------------------------------------------------------
// Acquisition / marketing family
// ---------------------------------------------------------------------------

function renderMarketing(locale: string) {
  return renderMarketingEmail({
    locale,
    siteUrl: SITE,
    packagesUrl: `${SITE}packages`,
    registerUrl: `${SITE}register?audience=employer`,
    unsubscribeUrl: `${SITE}api/email/unsubscribe?e=x&s=y`,
  });
}

test("every marketing locale has a complete, non-empty catalog", () => {
  for (const locale of EMAIL_LOCALES) {
    const copy = MARKETING_COPY[locale];
    assert.ok(copy.subject.length > 0, `${locale}: subject`);
    assert.ok(copy.heading.length > 0, `${locale}: heading`);
    assert.ok(copy.greeting.length > 0, `${locale}: greeting`);
    assert.ok(copy.paragraphs.length >= 2, `${locale}: opening paragraphs`);
    assert.ok(copy.features.length >= 3, `${locale}: feature list`);
    for (const feature of copy.features) {
      assert.ok(feature.title.length > 0, `${locale}: feature title`);
      assert.ok(feature.body.length > 0, `${locale}: feature body`);
    }
    assert.ok(copy.primaryCta.length > 0, `${locale}: primary CTA`);
    assert.ok(copy.secondaryCta.length > 0, `${locale}: secondary CTA`);
    assert.ok(copy.signOff.length > 0, `${locale}: sign-off`);
    assert.ok(copy.unsubscribeLabel.length > 0, `${locale}: unsubscribe label`);
    assert.ok(copy.footerNote.length > 0, `${locale}: footer reason`);
  }
});

test("the acquisition footer does not claim the recipient has an account", () => {
  // The transactional families say "because of activity on your account"; a
  // prospect has none, so that line would be false on this family.
  for (const locale of EMAIL_LOCALES) {
    const email = renderMarketing(locale);
    assert.ok(
      email.html.includes(escapeHtml(MARKETING_COPY[locale].footerNote)),
      `${locale}: marketing footer reason`,
    );
    assert.ok(
      !email.html.includes(getEmailCopy(locale).footer.reason),
      `${locale}: no account-activity claim`,
    );
  }
});

test("the Turkish marketing copy keeps the owner's verbatim wording", () => {
  const tr = MARKETING_COPY.tr;
  assert.equal(tr.greeting, "Sayın Yetkili,");
  assert.ok(tr.paragraphs[0].includes("yalnızca iş ilanı yayınlamakla bitmez"));
  assert.ok(tr.paragraphs[1].includes("İşBul KKTC"));
  assert.ok(tr.features.some((feature) => feature.title.includes("İlan yayınlayabilir")));
  assert.equal(tr.primaryCta, "İlan Paketlerini İnceleyin");
  assert.equal(tr.secondaryCta, "İşveren Hesabı Oluştur");
});

test("marketing email renders in every locale with both CTAs and contacts", () => {
  for (const locale of EMAIL_LOCALES) {
    const email = renderMarketing(locale);
    assertWellFormed(email, `marketing/${locale}`);
    const copy = MARKETING_COPY[locale];
    assert.equal(email.subject, copy.subject);

    // Both actions, in the owner's order, each with its lead-in line.
    const primary = email.html.indexOf(copy.primaryCta);
    const secondary = email.html.indexOf(copy.secondaryCta);
    assert.ok(primary !== -1 && secondary !== -1, `${locale}: both CTAs present`);
    assert.ok(primary < secondary, `${locale}: primary CTA precedes secondary`);
    assert.ok(email.html.includes(copy.packagesLead), `${locale}: primary lead-in`);
    assert.ok(email.html.includes(copy.registerLead), `${locale}: secondary lead-in`);
    assert.ok(email.html.includes(`${SITE}packages`), `${locale}: packages link`);
    assert.ok(
      email.html.includes(`${SITE}register?audience=employer`),
      `${locale}: employer register link`,
    );

    // The three reachable contact channels, each as a real link.
    assert.ok(email.html.includes(`mailto:${MARKETING_CONTACTS.email}`), `${locale}: email link`);
    assert.ok(email.html.includes(`tel:${MARKETING_CONTACTS.phoneTel}`), `${locale}: tel link`);
    assert.ok(email.html.includes(MARKETING_CONTACTS.whatsapp), `${locale}: whatsapp link`);
    // The heading is uppercased in the sender with the message locale (see the
    // casing test below), so expect the locale-cased form.
    assert.ok(
      email.html.includes(copy.contactHeading.toLocaleUpperCase(locale)),
      `${locale}: contact heading`,
    );

    // Promotional: the opt-out is present in the body (HTML-escaped) and the
    // text alternative (raw).
    assert.ok(
      email.html.includes(`${SITE}api/email/unsubscribe?e=x&amp;s=y`),
      `${locale}: unsubscribe link`,
    );
    assert.ok(
      email.text.includes(`${SITE}api/email/unsubscribe?e=x&s=y`),
      `${locale}: text unsubscribe`,
    );
    assert.ok(email.text.includes(copy.greeting), `${locale}: text greeting`);
  }
});

test("headings uppercase with the recipient's language rules, not the client's", () => {
  // The owner reported "başlıklarda i yerine ı kullanılmış": the section and
  // contact headings were uppercased by CSS `text-transform`, which resolves
  // with the *client's* locale and turned Turkish dotted `i` into dotless `I`.
  // Casing now happens in the sender, so the Turkish dotted `i` survives.
  const tr = renderMarketing("tr");
  assert.ok(
    tr.html.includes("İŞBUL KKTC İLE İŞLETMENİZ:"),
    "the Turkish features heading keeps its dotted capital İ",
  );
  assert.ok(tr.html.includes("BİZE ULAŞIN"), "the Turkish contact heading keeps its dotted İ");
  // The dotless form is exactly the regression; it must not appear anywhere.
  assert.ok(!tr.html.includes("IŞLETMENIZ"), "no dotless capital I in the Turkish heading");
  assert.ok(!tr.html.includes("BIZE ULAŞIN"), "no dotless capital I in the Turkish contact heading");

  // Casing no longer depends on a CSS property the client may drop (Outlook),
  // and it never lowercases a heading that the sender already cased.
  assert.ok(!tr.html.includes("text-transform"), "casing is pre-applied, not delegated to CSS");
  for (const locale of EMAIL_LOCALES) {
    const copy = MARKETING_COPY[locale];
    const email = renderMarketing(locale);
    assert.ok(
      email.html.includes(copy.featuresHeading.toLocaleUpperCase(locale)),
      `${locale}: features heading cased with the message locale`,
    );
    assert.ok(
      email.html.includes(copy.contactHeading.toLocaleUpperCase(locale)),
      `${locale}: contact heading cased with the message locale`,
    );
  }
});

test("the promotional families carry no redundant unsubscribe sentence", () => {
  // The gray callout repeated the footer's opt-out in prose. The footer link and
  // the List-Unsubscribe header are the working opt-out; the note was noise, so
  // it must not creep back into either promotional family.
  const marketing = renderMarketing("tr");
  const engagement = renderEngagementEmail({
    locale: "tr",
    siteUrl: SITE,
    jobs: [{ title: "Ürün Yöneticisi", company: "Acme" }],
    jobsUrl: `${SITE}jobs`,
    unsubscribeUrl: `${SITE}unsubscribe?token=abc`,
  });
  for (const email of [marketing, engagement]) {
    assert.ok(
      !email.html.includes("abonelikten çıkabilirsiniz"),
      "no redundant unsubscribe sentence",
    );
    assert.ok(!email.text.includes("abonelikten çıkabilirsiniz"));
  }
  // The real opt-out stays: footer link in the body, one-click header for the client.
  assert.ok(marketing.html.includes(`${SITE}api/email/unsubscribe?e=x&amp;s=y`));
  assert.ok(engagement.html.includes(`${SITE}unsubscribe?token=abc`));
});

test("the marketing contact rows only admit mailto:, tel: and https:", () => {
  // A hostile URL smuggled into a contact row is dropped, not rendered as a link.
  const html = renderEmailLayout({
    preheader: "x",
    heading: "x",
    footerNote: "x",
    siteUrl: SITE,
    contacts: [
      { label: "Bad", value: "click", url: "javascript:alert(1)" },
      { label: "Good", value: "info@isbulkktc.com", url: "mailto:info@isbulkktc.com" },
    ],
  });
  assert.ok(!html.includes("javascript:"), "a hostile contact scheme is dropped");
  assert.ok(html.includes("mailto:info@isbulkktc.com"));
});

test("the text alternative carries no tags and lists every contact", () => {
  const email = renderMarketing("tr");
  assert.ok(!email.text.includes("<"), "no markup in the text alternative");
  // The escaped HTML entities must be decoded back for the text part, or a
  // recipient of the text alternative reads `Kuzey Kıbrıs&#39;ta`.
  assert.ok(!email.text.includes("&#39;"), "no escaped apostrophe in the text part");
  assert.ok(email.text.includes("Kuzey Kıbrıs'ta"), "the apostrophe is decoded");
  assert.ok(email.text.includes(MARKETING_CONTACTS.email));
  assert.ok(email.text.includes(MARKETING_CONTACTS.phoneDisplay));
  assert.ok(email.text.includes(MARKETING_CONTACTS.whatsapp));
  assert.ok(email.text.includes(MARKETING_COPY.tr.primaryCta));
  assert.ok(email.text.includes(MARKETING_COPY.tr.secondaryCta));
});
