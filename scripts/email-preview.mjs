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

import { mkdirSync, writeFileSync } from 'node:fs';
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
export function buildTemplates(render, site) {
  return {
    'auth-confirmation': () =>
      render.renderAuthConfirmation({
        ...site,
        email: 'aday@example.com',
        confirmationUrl: 'https://isbulkktc.com/auth/callback?code=SAMPLE',
      }),
    'auth-recovery': () =>
      render.renderAuthRecovery({
        ...site,
        email: 'aday@example.com',
        recoveryUrl: 'https://isbulkktc.com/reset-password?code=SAMPLE',
      }),
    'auth-reauthentication': () =>
      render.renderAuthReauthentication({ ...site, code: '482913' }),
    'auth-password-changed': () => render.renderAuthPasswordChanged(site),
    welcome: () =>
      render.renderWelcomeEmail({ ...site, audience: 'candidate', name: 'Ayşe Yılmaz' }),
    'welcome-employer': () =>
      render.renderWelcomeEmail({ ...site, audience: 'employer', name: 'Mehmet Demir' }),
    'notification-viewed': () =>
      render.renderNotificationEmail({
        ...site,
        eventType: 'viewed',
        isCandidate: true,
        jobTitle: 'Kıdemli Frontend Geliştirici',
        dashboardUrl: 'https://isbulkktc.com/tr/profile/dashboard',
      }),
    'notification-status': () =>
      render.renderNotificationEmail({
        ...site,
        eventType: 'status_changed',
        isCandidate: true,
        jobTitle: 'Kıdemli Frontend Geliştirici',
        status: 'shortlisted',
        dashboardUrl: 'https://isbulkktc.com/tr/profile/dashboard',
      }),
    'feedback-ack': () =>
      render.renderFeedbackAcknowledgement({
        ...site,
        name: 'Ayşe',
        message: 'Sitede ilan filtreleri çok kullanışlı, teşekkürler.',
      }),
    'feedback-team': () =>
      render.renderFeedbackTeamEmail({
        ...site,
        name: 'Ayşe',
        email: 'aday@example.com',
        message: 'Sitede ilan filtreleri çok kullanışlı, teşekkürler.',
      }),
    'job-published': () =>
      render.renderJobPublishedEmail({
        ...site,
        companyName: 'Örnek Teknoloji Ltd.',
        jobTitle: 'Kıdemli Frontend Geliştirici',
        jobUrl: 'https://isbulkktc.com/tr/jobs/ornek',
      }),
    'resume-received': () =>
      render.renderResumeReceivedEmail({
        ...site,
        companyName: 'Örnek Teknoloji Ltd.',
        jobTitle: 'Kıdemli Frontend Geliştirici',
        candidateName: 'Ayşe Yılmaz',
      }),
    'sales-ack': () =>
      render.renderSalesAcknowledgement({
        ...site,
        name: 'Mehmet',
        company: 'Örnek Teknoloji Ltd.',
      }),
    'sales-team': () =>
      render.renderSalesTeamEmail({
        ...site,
        name: 'Mehmet',
        company: 'Örnek Teknoloji Ltd.',
        email: 'mehmet@example.com',
        phone: '+90 533 000 0000',
        message: 'İlan paketleri hakkında bilgi almak istiyorum.',
      }),
    engagement: (unsubscribeUrl) =>
      render.renderEngagementEmail({
        ...site,
        audience: 'candidate',
        name: 'Ayşe',
        jobs: [
          {
            title: 'Kıdemli Frontend Geliştirici',
            company: 'Örnek Teknoloji Ltd.',
            location: 'Lefkoşa',
            url: 'https://isbulkktc.com/tr/jobs/1',
          },
          {
            title: 'Ürün Yöneticisi',
            company: 'Kıbrıs Dijital',
            location: 'Girne',
            url: 'https://isbulkktc.com/tr/jobs/2',
          },
        ],
        jobsUrl: 'https://isbulkktc.com/tr/jobs',
        unsubscribeUrl,
      }),
    marketing: (unsubscribeUrl) =>
      render.renderMarketingEmail({
        ...site,
        packagesUrl: 'https://isbulkktc.com/tr/packages',
        registerUrl: 'https://isbulkktc.com/tr/register?audience=employer',
        unsubscribeUrl,
      }),
  };
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
  const site = { locale: 'tr', siteUrl: 'https://isbulkktc.com' };
  const templates = buildTemplates(render, site);

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
