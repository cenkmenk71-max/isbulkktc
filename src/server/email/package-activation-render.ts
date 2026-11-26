/**
 * Renderer for the package activation email.
 *
 * Pure and globals-free so the Node mailer and the unit tests can both use it.
 * Reuses the shared transactional shell (renderEmailLayout) so the brand
 * header, footer and RTL/lang handling stay identical to every other email.
 */

import {
  BRAND,
  escapeHtml,
  renderEmailLayout,
  renderEmailText,
} from "../../../supabase/functions/_shared/email-layout.ts";
import { getEmailCopy, resolveEmailLocale } from "../../../supabase/functions/_shared/email-copy.ts";
import type { RenderedEmail } from "../../../supabase/functions/_shared/email-render.ts";
import { getPackageActivationCopy } from "./package-activation-copy.ts";

type SiteContext = { locale: string; siteUrl: string };

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function strongLine(text: string): string {
  return `<p style="margin:0;font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(text)}</p>`;
}

function detailRow(label: string, value: string): string {
  return `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:${BRAND.inkSoft};vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

function listHtml(items: string[]): string {
  const rows = items
    .map(
      (item, index) =>
        `<tr><td style="vertical-align:top;padding:0 10px 10px 0;"><span class="ibk-icon-bg" style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.greenSoft};color:${BRAND.green};font-size:12px;font-weight:700;">${
          index + 1
        }</span></td><td style="vertical-align:top;padding:0 0 10px;font-size:15px;line-height:1.55;color:${BRAND.ink};">${escapeHtml(
          item,
        )}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">${rows}</table>`;
}

export type PackageActivationInput = SiteContext & {
  companyName: string;
  packageName: string;
  maxJobs: number;
  expiresAt: string | null;
  actionUrl: string;
};

export function renderPackageActivationEmail(
  input: PackageActivationInput,
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getPackageActivationCopy(locale);
  const base = getEmailCopy(locale);

  const durationText = input.expiresAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(input.expiresAt))
    : copy.steps[2].includes("süresiz") || copy.steps[2].includes("unlimited") || copy.steps[2].includes("не ограничен")
      ? "Süresiz"
      : "Unlimited";

  const opts = {
    locale,
    preheader: copy.lead,
    heading: copy.heading,
    introHtml: `${paragraph(copy.lead)}${strongLine(input.companyName)}`,
    sections: [
      {
        heading: copy.detailsHeading,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${detailRow(copy.packageLabel, input.packageName)}${detailRow(copy.jobsLabel, `${input.maxJobs}`)}${detailRow(copy.durationLabel, durationText)}</table>`,
      },
      {
        heading: copy.stepsHeading,
        html: listHtml(copy.steps),
      },
    ],
    button: { label: copy.cta, url: input.actionUrl },
    footerNote: base.footer.reason,
    siteUrl: input.siteUrl,
  };

  return {
    subject: copy.subject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}