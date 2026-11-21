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
  renderMarketingConsentConfirmation,
  renderMarketingEmail,
  renderNotificationEmail,
  renderResumeReceivedEmail,
  renderSalesAcknowledgement,
  renderSalesTeamEmail,
  renderWelcomeEmail,
  type RenderedEmail,
} from "../../supabase/functions/_shared/email-render";
import { EMAIL_COPY_EXTRAS } from "../../supabase/functions/_shared/email-copy-extras";
import { MARKETING_CONSENT_COPY } from "../../supabase/functions/_shared/email-copy";
import {
  MARKETING_CONTACTS,
  MARKETING_COPY,
} from "../../supabase/functions/_shared/email-copy-marketing";
import {
  LOCATION_DISTRICT,
  LOCATION_LOCALITY,
  regionNames,
} from "../../src/content/ai-visibility/site";

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
  assert.doesNotMatch(
    email.text,
    /<!doctype html|<\/?(?:html|head|body|table|thead|tbody|tr|td|th|div|span|p|a|h[1-6]|ul|ol|li|style)\b/i,
    `${label}: text alternative contains generated HTML markup`,
  );
  assert.equal((email.html.match(/<h1\b/g) ?? []).length, 1, `${label}: exactly one primary heading`);
  assert.match(email.html, /<body\b[^>]*>\s*<div lang="[a-z]{2}" dir="(?:ltr|rtl)">/, `${label}: body content carries language and direction`);
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channel = (start: number) => {
      const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
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
    assert.ok(copy.welcome.candidateEyebrow.length > 0, `${locale}: candidate eyebrow`);
    assert.ok(copy.welcome.employerEyebrow.length > 0, `${locale}: employer eyebrow`);
    assert.ok(copy.welcome.candidateSecondaryCta.length > 0, `${locale}: candidate secondary CTA`);
    assert.ok(copy.welcome.employerSecondaryCta.length > 0, `${locale}: employer secondary CTA`);
    assert.ok(copy.welcome.candidateStepsHeading.length > 0, `${locale}: candidate steps heading`);
    assert.ok(copy.welcome.employerStepsHeading.length > 0, `${locale}: employer steps heading`);
    assert.ok(copy.feedback.teamReplyCta.length > 0, `${locale}: feedback reply CTA`);
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

  // Only the colour keys map to a CSS token; `postalAddress` is a record, not a
  // colour, so it is excluded from the pairing.
  type BrandColorKey = {
    [K in keyof typeof BRAND]: (typeof BRAND)[K] extends string ? K : never;
  }[keyof typeof BRAND];

  const pairs: [BrandColorKey, string][] = [
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

test("email text and action colors meet WCAG AA contrast", () => {
  const pairs = [
    ["button label", BRAND.white, BRAND.green],
    ["brand link", BRAND.green, BRAND.surface],
    ["body text", BRAND.ink, BRAND.surface],
    ["footer text", BRAND.inkSoft, BRAND.footer],
  ] as const;

  for (const [label, foreground, background] of pairs) {
    assert.ok(
      contrastRatio(foreground, background) >= 4.5,
      `${label} contrast is below 4.5:1`,
    );
  }
});

/**
 * A commercial message must carry a valid physical postal address (CAN-SPAM
 * 7704(a)(5)). The operator publishes its location only at locality/district
 * granularity, so the footer mirrors the site's own organization graph rather
 * than a more precise address nobody published. This pins the footer copy to
 * `site.ts`, so a move updates the emails or fails here.
 */
test("the footer postal address mirrors the site's published location", () => {
  assert.equal(BRAND.postalAddress.locality, LOCATION_LOCALITY);
  assert.equal(BRAND.postalAddress.district, LOCATION_DISTRICT);
  assert.equal(BRAND.postalAddress.country, regionNames.tr);

  const html = renderEmailLayout({
    preheader: "x",
    heading: "y",
    footerNote: "z",
    siteUrl: SITE,
  });
  assert.ok(html.includes("Alsancak"), "the footer names the locality");
  assert.ok(html.includes("Girne"), "the footer names the district");
  assert.ok(
    html.includes(escapeHtml(regionNames.tr)),
    "the footer names the country",
  );

  const text = renderEmailText({
    preheader: "x",
    heading: "y",
    footerNote: "z",
    siteUrl: SITE,
  });
  assert.ok(text.includes("Alsancak, Girne"), "the text footer carries it too");
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
  assert.ok(team.html.includes("mailto:mehmet@example.com?subject="), "feedback team mail has a real reply action");
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
    assert.ok(extras.sales.replyCta.length > 0, `${locale}: sales reply CTA`);
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
  assert.ok(team.html.includes("mailto:mehmet@example.com?subject="), "sales team mail has a real reply action");
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
    unsubscribeUrl: `${SITE}api/email/unsubscribe?e=x&s=y`,
  });
}

test("marketing email logo and dark-mode surfaces remain email-client safe", () => {
  const email = renderMarketing("tr");

  // Email clients do not resolve root-relative image paths against the website.
  assert.match(
    email.html,
    /<img src="https:\/\/isbulkktc\.com\/images\/isbul-logo-mark-white\.png"/,
    "brand logo must use an absolute HTTPS URL",
  );
  assert.doesNotMatch(
    email.html,
    /<img[^>]+src=["']\/images\//i,
    "root-relative logo URLs are invalid in email clients",
  );

  // Keep foreground and surface treatments paired instead of globally forcing
  // every paragraph, cell and heading to white.
  for (const token of [
    'class="ibk-content"',
    'class="ibk-content-bg"',
    'class="ibk-package-card"',
    'class="ibk-panel"',
    'class="ibk-icon-bg"',
    'class="ibk-button-secondary-cell"',
    '@media (prefers-color-scheme:dark)',
    '[data-ogsc]',
    '[data-ogsb]',
  ]) {
    assert.ok(email.html.includes(token), `missing dark-mode contract: ${token}`);
  }

  assert.doesNotMatch(
    email.html,
    /(?:^|\n)\s*(?:p|div|td|span|h1|h2|h3|h4|strong|b|th|li)\s*,\s*(?:div|td|span|h1)/i,
    "dark mode must not use the previous global text-colour override",
  );
});

test("every marketing locale has complete, proof-checked package copy", () => {
  for (const locale of EMAIL_LOCALES) {
    const copy = MARKETING_COPY[locale];
    assert.ok(copy.subject.length > 0, `${locale}: subject`);
    assert.ok(copy.heroHook.length > 0, `${locale}: hero`);
    assert.ok(copy.heroSubhook.length > 0, `${locale}: hero subhook`);
    assert.equal(copy.packages && Object.keys(copy.packages).length, 4, `${locale}: all four packages`);
    assert.equal(copy.features.length, 4, `${locale}: four verified features`);
    for (const feature of copy.features) {
      assert.ok(feature.title.length > 0 && feature.body.length > 0, `${locale}: feature copy`);
    }
    for (const id of ["singleListing", "growth", "professional", "enterprise"] as const) {
      const item = copy.packages[id];
      assert.ok(item.name && item.audience && item.description && item.scope, `${locale}/${id}: complete package`);
    }
    assert.ok(copy.durationLabel.length > 0, `${locale}: durations`);
    assert.ok(copy.packageCta.length > 0, `${locale}: package CTA`);
    assert.ok(copy.whatsappCta.length > 0, `${locale}: WhatsApp CTA`);
    assert.ok(copy.unsubscribeLabel.length > 0, `${locale}: unsubscribe label`);
    assert.ok(copy.footerNote.length > 0, `${locale}: footer reason`);
  }
});

test("the acquisition email does not make unverified ranking, translation or scale claims", () => {
  const tr = renderMarketing("tr");
  for (const unsupported of [
    "Google'da zirve",
    "en üst sıraya",
    "otomatik olarak 6 dile",
    "binlerce aday",
    "sınırsız",
    "yıllık paket",
  ]) {
    assert.equal(tr.html.toLocaleLowerCase("tr").includes(unsupported.toLocaleLowerCase("tr")), false, unsupported);
  }
  assert.ok(tr.html.includes("ödeme web sitesinde alınmaz"));
  assert.ok(tr.html.includes("İlan adedi yazılı teklifte netleştirilir"));
});

test("the acquisition footer describes a real quote/contact follow-up, not an assumed account", () => {
  for (const locale of EMAIL_LOCALES) {
    const email = renderMarketing(locale);
    assert.ok(
      email.html.includes(escapeHtml(MARKETING_COPY[locale].footerNote)),
      `${locale}: marketing footer reason`,
    );
    assert.ok(!email.html.includes(getEmailCopy(locale).footer.reason), `${locale}: no account-activity claim`);
  }
});

test("marketing email has functional links for every package and contact action in all locales", () => {
  const packageTargets = [
    "https://isbulkktc.com/packages#package-tek-ilan",
    "https://isbulkktc.com/packages#package-buyume",
    "https://isbulkktc.com/packages#package-profesyonel",
    "https://isbulkktc.com/packages#packages-lead-title",
  ];
  for (const locale of EMAIL_LOCALES) {
    const email = renderMarketing(locale);
    const copy = MARKETING_COPY[locale];
    assertWellFormed(email, `marketing/${locale}`);
    assert.equal(email.subject, copy.subject);
    assert.ok(email.html.includes("https://isbulkktc.com/packages#packages-current"), `${locale}: hero package catalogue`);
    for (const target of packageTargets) {
      assert.ok(email.html.includes(target), `${locale}: working package target ${target}`);
    }
    assert.ok(email.html.includes("https://wa.me/905391316421?text="), `${locale}: WhatsApp deep link`);
    assert.ok(email.html.includes("mailto:info@isbulkktc.com"), `${locale}: canonical mail address`);
    assert.ok(email.html.includes("tel:+905391316421"), `${locale}: telephone link`);
    assert.ok(email.html.includes("0539 131 64 21"), `${locale}: displayed telephone`);
    assert.ok(email.html.includes("info@isbulkktc.com"), `${locale}: support mailbox`);
    assert.ok(email.html.includes(copy.unsubscribeLabel), `${locale}: unsubscribe action`);
    assert.ok(email.html.includes(`${SITE}api/email/unsubscribe?e=x&amp;s=y`), `${locale}: unsubscribe URL`);
    assert.ok(email.text.includes(`${SITE}api/email/unsubscribe?e=x&s=y`), `${locale}: text opt-out URL`);
    assert.ok(email.text.includes("https://isbulkktc.com/packages#package-buyume"), `${locale}: text package links`);
    assert.ok(email.text.includes(MARKETING_CONTACTS.email), `${locale}: text support email`);
    assert.ok(email.text.includes(MARKETING_CONTACTS.phoneDisplay), `${locale}: text phone`);
    assert.ok(email.text.includes(copy.primaryCta), `${locale}: text primary CTA`);
    assert.ok(!email.html.includes("₺1.290") && !email.html.includes("₺2.790") && !email.html.includes("₺3.990"), `${locale}: no stale hard-coded prices`);
  }
});

test("candidate and employer welcome emails are genuinely different journeys", () => {
  for (const locale of EMAIL_LOCALES) {
    const candidate = renderWelcomeEmail({
      locale,
      siteUrl: SITE,
      audience: "candidate",
      name: "Esra Kapli",
      actionUrl: `${SITE}profile/dashboard`,
    });
    const employer = renderWelcomeEmail({
      locale,
      siteUrl: SITE,
      audience: "employer",
      name: "Mehmet Demir",
      actionUrl: `${SITE}company/dashboard`,
    });
    assertWellFormed(candidate, `welcome/candidate/${locale}`);
    assertWellFormed(employer, `welcome/employer/${locale}`);
    assert.ok(candidate.html.includes(MARKETING_CONTACTS.email));
    assert.ok(candidate.html.includes(`${SITE}profile/dashboard`));
    assert.ok(candidate.html.includes(`${SITE}jobs`));
    assert.ok(candidate.html.includes(getEmailCopy(locale).welcome.candidateEyebrow));
    assert.ok(candidate.html.includes(getEmailCopy(locale).welcome.candidateSecondaryCta));
    assert.ok(employer.html.includes(`${SITE}company/dashboard`));
    assert.ok(employer.html.includes(`${SITE}packages`));
    assert.ok(employer.html.includes(getEmailCopy(locale).welcome.employerEyebrow));
    assert.ok(employer.html.includes(getEmailCopy(locale).welcome.employerSecondaryCta));
    assert.notEqual(candidate.subject, employer.subject);
    assert.notEqual(candidate.html, employer.html);
  }
});

test("password-change security mail provides a working localized sign-in destination", () => {
  const email = renderAuthPasswordChanged({
    locale: "tr",
    siteUrl: SITE,
    email: "esra@example.com",
  });
  assertWellFormed(email, "auth/password-changed");
  assert.ok(email.html.includes("https://isbulkktc.com/login"));
  assert.ok(email.html.includes("Giriş ekranını aç"));
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

test("the text alternative keeps entity decoding, paragraph breaks and contact details", () => {
  const email = renderMarketing("tr");
  assert.ok(!email.text.includes("<"), "marketing copy has no markup-like text");
  assert.ok(email.text.includes(MARKETING_CONTACTS.email));
  assert.ok(email.text.includes(MARKETING_CONTACTS.phoneDisplay));
  assert.ok(email.text.includes(MARKETING_CONTACTS.whatsapp));
  assert.ok(email.text.includes(MARKETING_COPY.tr.primaryCta));
  assert.ok(email.text.includes(MARKETING_COPY.tr.secondaryCta));

  const plain = renderEmailText({
    locale: "tr",
    preheader: "Ön izleme",
    heading: "Düz metin testi",
    introHtml: "<p>Kuzey Kıbrıs&#39;ta çalışmak.</p><p>İkinci paragraf.</p>",
    footerNote: "Bilgilendirme",
    siteUrl: SITE,
  });
  assert.ok(!plain.includes("&#39;"), "apostrophe entity is decoded");
  assert.ok(plain.includes("Kuzey Kıbrıs'ta"), "the apostrophe is preserved");
  assert.ok(plain.includes("çalışmak.\nİkinci paragraf."), "paragraph boundaries are preserved");
});

test("marketing consent confirmation emails are localized and transactional in all six locales", () => {
  for (const locale of EMAIL_LOCALES) {
    const confirmationUrl = "https://isbulkktc.com/api/email/confirm-marketing?token=sample.signature";
    const email = renderMarketingConsentConfirmation({
      locale,
      siteUrl: SITE,
      confirmationUrl,
    });
    assertWellFormed(email, "marketing-consent/" + locale);
    assert.equal(email.subject, MARKETING_CONSENT_COPY[locale].subject);
    assert.ok(email.html.includes(confirmationUrl), locale + ": confirmation link in HTML");
    assert.ok(email.text.includes(confirmationUrl), locale + ": confirmation link in text");
    assert.ok(email.html.includes(MARKETING_CONSENT_COPY[locale].cta), locale + ": localized action");
    assert.ok(email.html.includes(MARKETING_CONSENT_COPY[locale].ignore), locale + ": no-request warning");
  }
});
