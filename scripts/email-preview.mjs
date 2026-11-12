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
 * Usage:
 *   node scripts/email-preview.mjs                    # render to .artifacts
 *   node scripts/email-preview.mjs --send me@mail.com # render + send all
 *   node scripts/email-preview.mjs --only welcome     # one template
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('.artifacts', 'email-preview');
const args = process.argv.slice(2);
const sendIdx = args.indexOf('--send');
const sendTo = sendIdx !== -1 ? args[sendIdx + 1] : null;
const onlyIdx = args.indexOf('--only');
const only = onlyIdx !== -1 ? args[onlyIdx + 1] : null;

const { renderWelcomeEmail } = await import(
  '../supabase/functions/_shared/email-render.ts'
);
const render = await import('../supabase/functions/_shared/email-render.ts');

const site = { locale: 'tr', siteUrl: 'https://isbulkktc.com' };

/** One entry per template: a name and the call that produces it. */
const TEMPLATES = {
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
    renderWelcomeEmail({ ...site, audience: 'candidate', name: 'Ayşe Yılmaz' }),
  'welcome-employer': () =>
    renderWelcomeEmail({ ...site, audience: 'employer', name: 'Mehmet Demir' }),
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
  engagement: () =>
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
      unsubscribeUrl:
        'https://isbulkktc.com/api/email/unsubscribe?e=aday%40example.com&s=SAMPLE',
    }),
  marketing: () =>
    render.renderMarketingEmail({
      ...site,
      packagesUrl: 'https://isbulkktc.com/tr/packages',
      registerUrl: 'https://isbulkktc.com/tr/register?audience=employer',
      unsubscribeUrl:
        'https://isbulkktc.com/api/email/unsubscribe?e=isletme%40example.com&s=SAMPLE',
    }),
};

const names = only ? [only] : Object.keys(TEMPLATES);
for (const name of names) {
  if (!TEMPLATES[name]) {
    console.error(`Unknown template "${name}". Known: ${Object.keys(TEMPLATES).join(', ')}`);
    process.exit(1);
  }
}

mkdirSync(OUT, { recursive: true });

const rendered = [];
for (const name of names) {
  try {
    const out = TEMPLATES[name]();
    writeFileSync(resolve(OUT, `${name}.html`), out.html);
    rendered.push({ name, ...out });
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
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error('RESEND_API_KEY is not set; cannot send.');
    process.exit(1);
  }
  const { buildEmailHeaders } = await import(
    '../src/server/email/email-headers.ts'
  );
  // Mirrors `deliver()` in the mailer: every message carries `Reply-To`, and the
  // promotional families carry the RFC 8058 one-click `List-Unsubscribe` pair. A
  // preview that omits them does not reproduce what the inbox actually sees
  // (#196) — a plain `from/to/subject` send is what a spam filter penalises.
  const replyToInbox =
    process.env.SALES_INBOX_EMAIL ||
    process.env.SALES_CONTACT_EMAIL ||
    'info@isbulkktc.com';
  const promotional = new Set(['marketing', 'engagement']);
  const unsubscribeUrl = (name) =>
    promotional.has(name)
      ? 'https://isbulkktc.com/api/email/unsubscribe?e=isletme%40example.com&s=SAMPLE'
      : null;
  console.log(`\nSending ${rendered.length} template(s) to ${sendTo}...`);
  for (const r of rendered) {
    // The acquisition family sends from the monitored `info@` mailbox (mirrors
    // the mailer); every other template keeps the transactional `no-reply@`.
    const from =
      r.name === 'marketing'
        ? 'İşBul KKTC <info@isbulkktc.com>'
        : 'İşBul KKTC <no-reply@isbulkktc.com>';
    const extra = buildEmailHeaders({
      replyToInbox,
      unsubscribeUrl: unsubscribeUrl(r.name),
    });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [sendTo],
        subject: `[TEST] ${r.subject}`,
        html: r.html,
        text: r.text,
        // The REST API wants `reply_to`, not the SDK's `replyTo`; sending the
        // SDK shape would silently drop the header.
        ...(extra.replyTo ? { reply_to: extra.replyTo } : {}),
        ...(extra.headers ? { headers: extra.headers } : {}),
      }),
    });
    const body = await response.json();
    console.log(
      `  ${r.name.padEnd(24)} ${response.ok ? `sent ${body.id}` : `FAILED ${JSON.stringify(body).slice(0, 80)}`}`,
    );
  }
}
