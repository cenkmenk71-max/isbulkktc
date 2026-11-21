#!/usr/bin/env node
/**
 * Render every email template so a change can be seen, not just asserted.
 *
 * The owner's requirement: every marketing and transactional template must be
 * inspectable when it is finished. This renders each one with realistic sample
 * data and writes it to .artifacts/email-preview/ as a browser-openable HTML
 * file, plus an index that links them all.
 *
 * It can also send: `--send <address>` mails every template to one address so
 * the real inbox rendering (Gmail, Outlook) can be judged, which is the only
 * place a template's true appearance can be seen.
 *
 * The promotional families (`marketing`, `engagement`) embed a signed opt-out
 * link. The browser preview renders them with a placeholder signature, but a
 * *sent* link must be the real HMAC the `/api/email/unsubscribe` route verifies
 * — a placeholder once shipped to a real inbox as a dead `s=SAMPLE` opt-out. The
 * send path therefore re-renders those families for the actual recipient and
 * refuses to send one when no signing key is configured.
 *
 * Usage:
 *   node scripts/email-preview.mjs                    # render to .artifacts
 *   node scripts/email-preview.mjs --send me@mail.com # render + send all
 *   node scripts/email-preview.mjs --only welcome     # one template
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildUnsubscribeUrl,
  resolveUnsubscribeSigningKey,
} from '../src/server/email/unsubscribe-signature.ts';

const OUT = resolve('.artifacts', 'email-preview');

/**
 * True when the module was launched directly (`node scripts/email-preview.mjs`)
 * rather than imported by a test. `pathToFileURL` percent-encodes the path, so a
 * directory name holding a space or `#` still matches.
 */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

/**
 * The families whose rendered body embeds an opt-out link. Their render takes a
 * real URL, so the send path must re-render them for the actual recipient
 * instead of reusing the placeholder body the browser preview wrote.
 */
export const PROMOTIONAL_TEMPLATES = new Set(['marketing', 'engagement']);

/**
 * The signature the offline browser preview embeds. It is deliberately not a
 * valid HMAC and never reaches a mailbox: `--send` re-renders these families
 * with the real signature, and `assertNoPreviewLink` refuses any body that still
 * carries this marker.
 */
export const PREVIEW_SIGNATURE = 'PREVIEW-ONLY';

/** One entry per template: a name and the call that produces it. */
export const NATIVE_GOTRUE_TEMPLATES = Object.freeze([
  { name: "confirmation", filename: "confirmation.html" },
  { name: "recovery", filename: "recovery.html" },
  { name: "invite", filename: "invite.html" },
  { name: "magic_link", filename: "magic_link.html" },
  { name: "email_change", filename: "email_change.html" },
  { name: "reauthentication", filename: "reauthentication.html" },
  { name: "password-changed", filename: "password-changed.html" },
]);

export const STATIC_GOTRUE_TEMPLATES = new Set(
  NATIVE_GOTRUE_TEMPLATES.map(({ name }) => "auth-source-" + name.replace(/_/g, "-")),
);

/** Auth previews contain sample links, tokens, or a sample security notification. */
export const PREVIEW_ONLY_TEMPLATES = new Set([
  "auth-confirmation",
  "auth-recovery",
  "auth-reauthentication",
  "auth-password-changed",
  ...STATIC_GOTRUE_TEMPLATES,
]);

/** Supported locales rendered by the full email preview matrix. */
export const EMAIL_PREVIEW_LOCALES = Object.freeze(["tr", "en", "ru", "el", "fa", "de"]);

/**
 * Select the correct branch from the constrained GoTrue locale-template grammar
 * used by the native auth templates. This is not a general Go template runtime.
 */
function resolveLocaleBranches(source, locale) {
  const openingPattern = /\{\{\s*if eq \$locale "tr"\s*\}\}/g;
  let output = "";
  let cursor = 0;
  let opening;

  while ((opening = openingPattern.exec(source))) {
    output += source.slice(cursor, opening.index);
    const branchStart = openingPattern.lastIndex;
    const markerPattern = /\{\{\s*(else if eq \$locale "([^"]+)"|else|end)\s*\}\}/g;
    markerPattern.lastIndex = branchStart;

    let activeLocale = "tr";
    let segmentStart = branchStart;
    let selected = null;
    let fallback = null;
    let closing = -1;
    let marker;

    while ((marker = markerPattern.exec(source))) {
      const segment = source.slice(segmentStart, marker.index);
      if (activeLocale === locale) selected = segment;
      if (activeLocale === "__fallback__") fallback = segment;

      if (marker[1] === "end") {
        closing = markerPattern.lastIndex;
        break;
      }

      activeLocale = marker[1] === "else" ? "__fallback__" : marker[2];
      segmentStart = markerPattern.lastIndex;
    }

    if (closing < 0) {
      throw new Error("GoTrue locale branch is missing its closing template end");
    }
    output += selected ?? fallback ?? "";
    cursor = closing;
    openingPattern.lastIndex = closing;
  }

  return output + source.slice(cursor);
}

/** Resolve one GoTrue template into a safe, inert preview for a supported locale. */
export function renderGoTrueTemplatePreview(source, locale = "tr") {
  if (typeof source !== "string") {
    throw new TypeError("GoTrue template source must be a string");
  }
  if (!EMAIL_PREVIEW_LOCALES.includes(locale)) {
    throw new Error("unsupported_email_preview_locale");
  }

  const localePrefix = locale === "tr" ? "" : "/" + locale;
  const siteUrl = "https://isbulkktc.com" + localePrefix + "/";
  const callbackUrl = "https://isbulkktc.com" + localePrefix + "/auth/callback?code=SAMPLE";

  const html = resolveLocaleBranches(source, locale)
    .replace(/\{\{\s*\$locale\s*\}\}/g, locale)
    .replace(/\{\{\s*if \$rtl\s*\}\}rtl\{\{\s*else\s*\}\}ltr\{\{\s*end\s*\}\}/g, locale === "fa" ? "rtl" : "ltr")
    .replace(/\{\{\s*if \$rtl\s*\}\}padding-right\{\{\s*else\s*\}\}padding-left\{\{\s*end\s*\}\}/g, locale === "fa" ? "padding-right" : "padding-left")
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, callbackUrl)
    .replace(/\{\{\s*\.SiteURL\s*\}\}/g, siteUrl)
    .replace(/\{\{\s*\.NewEmail\s*\}\}/g, "yeni.adres@isbulkktc.com")
    .replace(/\{\{\s*\.Email\s*\}\}/g, "ornek@isbulkktc.com")
    .replace(/\{\{\s*\.Token\s*\}\}/g, "482913")
    .replace(/\{\{[\s\S]*?\}\}/g, "");

  if (html.includes("{{")) {
    throw new Error("GoTrue preview contains an unresolved template expression");
  }
  return html;
}

export function buildTemplates(render, site, companyProfileRender = render, goTrue = {}) {
  const templates = {
    "auth-confirmation": () =>
      render.renderAuthConfirmation({
        ...site,
        email: "aday@example.com",
        confirmationUrl: "https://isbulkktc.com/tr/auth/callback?code=SAMPLE",
      }),
    "auth-recovery": () =>
      render.renderAuthRecovery({
        ...site,
        email: "aday@example.com",
        confirmationUrl: "https://isbulkktc.com/tr/auth/callback?code=SAMPLE",
      }),
    "auth-reauthentication": () =>
      render.renderAuthReauthentication({ ...site, token: "482913" }),
    "auth-password-changed": () =>
      render.renderAuthPasswordChanged({ ...site, email: "aday@example.com" }),
    "welcome-candidate": () =>
      render.renderWelcomeEmail({
        ...site,
        audience: "candidate",
        name: "Esra Kapli",
        actionUrl: "https://isbulkktc.com/tr/profile/dashboard",
      }),
    "welcome-employer": () =>
      render.renderWelcomeEmail({
        ...site,
        audience: "employer",
        name: "Mehmet Demir",
        actionUrl: "https://isbulkktc.com/tr/company/dashboard",
      }),
    "notification-candidate-applied": () =>
      render.renderNotificationEmail({
        ...site,
        eventType: "submitted",
        isCandidate: true,
        jobTitle: "Kıdemli Frontend Geliştirici",
        dashboardUrl: "https://isbulkktc.com/tr/profile/dashboard#my-applications",
      }),
    "notification-employer-applied": () =>
      render.renderNotificationEmail({
        ...site,
        eventType: "submitted",
        isCandidate: false,
        jobTitle: "Kıdemli Frontend Geliştirici",
        dashboardUrl: "https://isbulkktc.com/tr/company/dashboard",
      }),
    "notification-viewed": () =>
      render.renderNotificationEmail({
        ...site,
        eventType: "viewed",
        isCandidate: true,
        jobTitle: "Kıdemli Frontend Geliştirici",
        dashboardUrl: "https://isbulkktc.com/tr/profile/dashboard#my-applications",
      }),
    "notification-status": () =>
      render.renderNotificationEmail({
        ...site,
        eventType: "status_changed",
        isCandidate: true,
        jobTitle: "Kıdemli Frontend Geliştirici",
        status: "shortlisted",
        dashboardUrl: "https://isbulkktc.com/tr/profile/dashboard#my-applications",
      }),
    "feedback-ack": () =>
      render.renderFeedbackAcknowledgement({
        ...site,
        name: "Esra",
        message: "İlan filtreleri çok kullanışlı, teşekkürler.",
        actionUrl: "https://isbulkktc.com/tr/jobs",
      }),
    "feedback-team": () =>
      render.renderFeedbackTeamEmail({
        ...site,
        name: "Esra",
        email: "aday@example.com",
        category: "Öneri",
        rating: 5,
        message: "İlan filtreleri çok kullanışlı, teşekkürler.",
        actionUrl: "https://isbulkktc.com/tr/",
      }),
    "job-published": () =>
      render.renderJobPublishedEmail({
        ...site,
        jobTitle: "Kıdemli Frontend Geliştirici",
        jobUrl: "https://isbulkktc.com/tr/jobs/ornek",
      }),
    "resume-received": () =>
      render.renderResumeReceivedEmail({
        ...site,
        name: "Esra Kapli",
        isUpdate: false,
        profileUrl: "https://isbulkktc.com/tr/profile/dashboard",
      }),
    "resume-updated": () =>
      render.renderResumeReceivedEmail({
        ...site,
        name: "Esra Kapli",
        isUpdate: true,
        profileUrl: "https://isbulkktc.com/tr/profile/dashboard",
      }),
    "sales-ack": () =>
      render.renderSalesAcknowledgement({
        ...site,
        companyName: "Örnek Teknoloji Ltd.",
        contactName: "Mehmet Demir",
        email: "mehmet@example.com",
        plan: "Büyüme",
        durationDays: 30,
        note: "Üç pozisyon için ilan yayınlamak istiyoruz.",
        actionUrl: "https://isbulkktc.com/tr/packages",
      }),
    "sales-team": () =>
      render.renderSalesTeamEmail({
        ...site,
        companyName: "Örnek Teknoloji Ltd.",
        contactName: "Mehmet Demir",
        email: "mehmet@example.com",
        plan: "Büyüme",
        durationDays: 30,
        note: "Üç pozisyon için ilan yayınlamak istiyoruz.",
        actionUrl: "https://isbulkktc.com/tr/admin/sales-leads",
      }),
    "company-profile-ack": () =>
      companyProfileRender.renderCompanyProfileAcknowledgement({
        ...site,
        companyName: "Örnek Teknoloji Ltd.",
        actionUrl: "https://isbulkktc.com/tr/company/dashboard",
      }),
    "company-profile-team": () =>
      companyProfileRender.renderCompanyProfileTeamEmail({
        ...site,
        companyName: "Örnek Teknoloji Ltd.",
        categories: "Teknoloji, Yazılım",
        website: "https://example.com",
        phone: "0539 000 00 00",
        publicEmail: "ik@example.com",
        address: "Girne",
        submittedBy: "mehmet@example.com",
        actionUrl: "https://isbulkktc.com/tr/admin/company-profiles",
      }),
    engagement: (unsubscribeUrl) =>
      render.renderEngagementEmail({
        ...site,
        name: "Esra",
        jobs: [
          {
            title: "Kıdemli Frontend Geliştirici",
            company: "Örnek Teknoloji Ltd.",
            url: "https://isbulkktc.com/tr/jobs/ornek-frontend",
          },
          {
            title: "Ürün Yöneticisi",
            company: "Kıbrıs Dijital",
            url: "https://isbulkktc.com/tr/jobs/ornek-urun",
          },
        ],
        jobsUrl: "https://isbulkktc.com/tr/jobs",
        unsubscribeUrl,
      }),
    marketing: (unsubscribeUrl) =>
      render.renderMarketingEmail({
        ...site,
        unsubscribeUrl,
      }),
  };

  const sourceSubjects = {
    confirmation: "İşBul KKTC e-posta adresinizi doğrulayın",
    recovery: "İşBul KKTC şifre yenileme bağlantınız",
    invite: "İşBul KKTC'ye davet edildiniz",
    magic_link: "İşBul KKTC giriş bağlantınız",
    email_change: "Yeni e-posta adresinizi doğrulayın",
    reauthentication: "İşBul KKTC kimlik doğrulama kodunuz",
    "password-changed": "İşBul KKTC şifreniz değiştirildi",
  };
  for (const [name, html] of Object.entries(goTrue)) {
    const templateName = "auth-source-" + name.replace(/_/g, "-");
    templates[templateName] = () => ({
      subject: sourceSubjects[name] || "İşBul KKTC hesap e-postası",
      html,
      text: html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim(),
    });
  }
  return templates;
}

/** Renders `name`; a promotional family takes the opt-out URL it must embed. */
export function renderTemplate(templates, name, unsubscribeUrl) {
  const build = templates[name];
  return PROMOTIONAL_TEMPLATES.has(name) ? build(unsubscribeUrl) : build();
}

/** The placeholder opt-out URL the offline preview embeds, or `null`. */
export function previewUnsubscribeUrl(name) {
  if (!PROMOTIONAL_TEMPLATES.has(name)) return null;
  const address = name === 'marketing' ? 'isletme@example.com' : 'aday@example.com';
  return `https://isbulkktc.com/api/email/unsubscribe?e=${encodeURIComponent(address)}&s=${PREVIEW_SIGNATURE}`;
}

/**
 * The send decision for one template.
 *
 * A promotional family must carry a real signed opt-out for the recipient, so
 * when no signing key is configured there is no link to embed and the family is
 * refused rather than sent with a dead one. A transactional family has no such
 * requirement and is always sendable.
 */
export function planSend({ name, recipient, siteUrl, signingKey }) {
  if (PREVIEW_ONLY_TEMPLATES.has(name)) {
    return { send: false, reason: "auth preview contains sample authentication data and cannot be sent" };
  }
  if (!PROMOTIONAL_TEMPLATES.has(name)) {
    return { send: true, unsubscribeUrl: null };
  }
  if (!signingKey) {
    return { send: false, reason: 'no unsubscribe signing key configured' };
  }
  const unsubscribeUrl = buildUnsubscribeUrl(recipient, {
    baseUrl: siteUrl,
    key: signingKey,
  });
  if (!unsubscribeUrl) {
    return { send: false, reason: `unusable site URL "${siteUrl}"` };
  }
  return { send: true, unsubscribeUrl };
}

/** Refuses a body that still carries the preview placeholder opt-out link. */
export function assertNoPreviewLink(name, email) {
  if (email.html.includes(PREVIEW_SIGNATURE) || email.text.includes(PREVIEW_SIGNATURE)) {
    throw new Error(
      `${name}: rendered body still carries the "${PREVIEW_SIGNATURE}" preview opt-out link`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sendIdx = args.indexOf('--send');
  const sendTo = sendIdx !== -1 ? args[sendIdx + 1] : null;
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

  const render = await import('../supabase/functions/_shared/email-render.ts');
  const companyProfileRender = await import('../src/server/email/company-profile-render.ts');
  const site = { locale: 'tr', siteUrl: 'https://isbulkktc.com/tr/' };
  const goTrue = {};
  for (const { name, filename } of NATIVE_GOTRUE_TEMPLATES) {
    const source = readFileSync(resolve("supabase", "templates", filename), "utf8");
    goTrue[name] = renderGoTrueTemplatePreview(source);
  }
  const templates = buildTemplates(render, site, companyProfileRender, goTrue);

  const names = only ? [only] : Object.keys(templates);
  for (const name of names) {
    if (!templates[name]) {
      console.error(`Unknown template "${name}". Known: ${Object.keys(templates).join(', ')}`);
      process.exit(1);
    }
  }

  mkdirSync(OUT, { recursive: true });

  const rendered = [];
  const byName = new Map();
  for (const name of names) {
    try {
      const out = renderTemplate(templates, name, previewUnsubscribeUrl(name));
      writeFileSync(resolve(OUT, `${name}.html`), out.html);
      writeFileSync(resolve(OUT, `${name}.txt`), out.text, "utf8");
      rendered.push({ name, ...out });
      byName.set(name, out);
      console.log(
        `  ${name.padEnd(24)} html ${String(out.html.length).padStart(6)}  text ${String(out.text.length).padStart(5)}  "${out.subject}"`,
      );
    } catch (error) {
      console.error(`  ${name.padEnd(24)} FAILED: ${error.message}`);
    }
  }

  // An index so every template is one click away in a browser.
  const index = `<!doctype html><meta charset="utf-8"><title>E-posta şablonları</title>
<style>body{font:15px/1.5 system-ui;margin:24px;max-width:900px}h1{font-size:20px}
li{margin:6px 0}a{color:#194435}small{color:#414846}</style>
<h1>E-posta şablonları (${rendered.length})</h1>
<ul>${rendered
    .map(
      (r) =>
        `<li><a href="./${r.name}.html">${r.name}</a> — <small>${r.subject}</small></li>`,
    )
    .join('')}</ul>`;
  writeFileSync(resolve(OUT, 'index.html'), index);

  console.log(`\n${rendered.length} template(s) written to ${OUT}`);
  console.log(`Open: ${resolve(OUT, 'index.html')}`);

  if (sendTo) {
    await sendAll({ templates, byName, names, sendTo, site });
  }
}

/**
 * Sends every rendered template to one address, mirroring what the production
 * mailer puts on the wire.
 *
 * The promotional families are re-rendered here with the recipient's *real*
 * signed opt-out link; the body the browser preview wrote embeds a placeholder
 * and is never sent. When no signing key is configured the family is skipped
 * rather than delivered with a dead link.
 */
async function sendAll({ templates, byName, names, sendTo, site }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set; cannot send.');
    process.exit(1);
  }
  const { buildEmailHeaders } = await import('../src/server/email/email-headers.ts');

  // Mirrors `deliver()` in the mailer: every message carries `Reply-To`, and the
  // promotional families carry the RFC 8058 one-click `List-Unsubscribe` pair. A
  // preview that omits them does not reproduce what the inbox actually sees
  // (#196) — a plain `from/to/subject` send is what a spam filter penalises.
  const replyToInbox =
    process.env.SALES_INBOX_EMAIL ||
    process.env.SALES_CONTACT_EMAIL ||
    'info@isbulkktc.com';
  const signingKey = resolveUnsubscribeSigningKey();
  if (!signingKey) {
    console.warn(
      'No unsubscribe signing key (ENGAGEMENT_UNSUBSCRIBE_SECRET / RESEND_API_KEY): promotional templates will be skipped.',
    );
  }

  console.log(`\nSending ${names.length} template(s) to ${sendTo}...`);
  for (const name of names) {
    const plan = planSend({
      name,
      recipient: sendTo,
      siteUrl: site.siteUrl,
      signingKey,
    });
    if (!plan.send) {
      console.error(`  ${name.padEnd(24)} SKIPPED — ${plan.reason}`);
      continue;
    }

    // A promotional body is re-rendered with the recipient's real signed link;
    // the preview render embeds a placeholder and must never be sent.
    const email = PROMOTIONAL_TEMPLATES.has(name)
      ? renderTemplate(templates, name, plan.unsubscribeUrl)
      : byName.get(name);
    if (!email) {
      console.error(`  ${name.padEnd(24)} SKIPPED — not rendered`);
      continue;
    }
    assertNoPreviewLink(name, email);

    // The acquisition family sends from the monitored `info@` mailbox (mirrors
    // the mailer); every other template keeps the transactional `no-reply@`.
    const from =
      name === 'marketing'
        ? 'İşBul KKTC <info@isbulkktc.com>'
        : 'İşBul KKTC <no-reply@isbulkktc.com>';
    const extra = buildEmailHeaders({
      replyToInbox,
      unsubscribeUrl: plan.unsubscribeUrl,
    });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [sendTo],
        // Send the real subject. A `[TEST]` prefix is a recognised spam
        // trigger, so a preview that adds one does not reproduce what the
        // inbox will see and biases the placement check against us.
        subject: email.subject,
        html: email.html,
        text: email.text,
        // The REST API wants `reply_to`, not the SDK's `replyTo`; sending the
        // SDK shape would silently drop the header.
        ...(extra.replyTo ? { reply_to: extra.replyTo } : {}),
        ...(extra.headers ? { headers: extra.headers } : {}),
      }),
    });
    const body = await response.json();
    console.log(
      `  ${name.padEnd(24)} ${response.ok ? `sent ${body.id}` : `FAILED ${JSON.stringify(body).slice(0, 80)}`}`,
    );
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
