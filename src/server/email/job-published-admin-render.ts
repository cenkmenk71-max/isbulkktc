/**
 * Renderer for the job-published admin notification email.
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
import { getJobPublishedAdminCopy } from "./job-published-admin-copy.ts";

type SiteContext = { locale: string; siteUrl: string };

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function detailRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:${BRAND.inkSoft};vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top;">${escapeHtml(value)}</td></tr>`;
}

export type JobPublishedAdminInput = SiteContext & {
  companyName: string;
  jobTitle: string;
  district: string | null;
  durationDays: number;
  jobSlug: string;
  actionUrl: string;
  adminLink: string;
};

/** Admin notification: new job published. */
export function renderJobPublishedAdminEmail(
  input: JobPublishedAdminInput,
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getJobPublishedAdminCopy(locale);
  const base = getEmailCopy(locale);

  const jobUrl = `${input.siteUrl.replace(/\/$/, "")}${input.actionUrl}/${input.jobSlug}`.replace(/\/jobs\/jobs\//, "/jobs/");

  // Determine duration label based on locale
  const durationLabel = copy.durationLabel.toLowerCase().includes("süre") ? "gün"
    : copy.durationLabel.toLowerCase().includes("duration") ? "days"
    : copy.durationLabel.toLowerCase().includes("дней") ? "дней"
    : copy.durationLabel.toLowerCase().includes("ημέρες") ? "ημέρες"
    : copy.durationLabel.toLowerCase().includes("روز") ? "روز"
    : "Tage";

  const opts = {
    locale,
    preheader: copy.lead,
    heading: copy.heading,
    introHtml: paragraph(copy.lead),
    sections: [
      {
        heading: copy.detailsHeading,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${detailRow(copy.companyLabel, input.companyName)}${detailRow(copy.titleLabel, input.jobTitle)}${detailRow(copy.districtLabel, input.district)}${detailRow(copy.durationLabel, `${input.durationDays} ${durationLabel}`)}${detailRow(copy.jobLinkLabel, jobUrl)}</table>`,
      },
    ],
    button: { label: copy.adminLinkText, url: `${input.siteUrl.replace(/\/$/, "")}${input.adminLink}` },
    footerNote: base.footer.reason,
    siteUrl: input.siteUrl,
  };

  return {
    subject: `${copy.subject}: ${input.jobTitle}`,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}