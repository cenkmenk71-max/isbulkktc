/**
 * Renderer for job match alert emails. Pure and globals-free: the same code
 * runs in Node server actions and is unit testable with plain `node --test`.
 */

import {
  BRAND,
  escapeHtml,
  renderEmailLayout,
  renderEmailText,
  type EmailLayoutOptions,
} from "../../../supabase/functions/_shared/email-layout.ts";
import { resolveEmailLocale } from "../../../supabase/functions/_shared/email-copy.ts";
import {
  getJobMatchAlertCopy,
  type JobMatchAlertCopy,
} from "./job-match-alert-copy.ts";
import type { RenderedEmail } from "../../../supabase/functions/_shared/email-render.ts";

type JobMatchJob = { title: string; company: string; url: string };

function jobRows(jobs: JobMatchJob[], copy: JobMatchAlertCopy): string {
  const rows = jobs
    .map((job) => {
      const label = copy.jobRow
        .replace("{title}", escapeHtml(job.title))
        .replace("{company}", escapeHtml(job.company));
      return `<li style="margin:0 0 8px;"><a href="${escapeHtml(
        job.url,
      )}" style="color:${BRAND.green};text-decoration:none;font-weight:600;">${label}</a></li>`;
    })
    .join("");
  return `<ul style="margin:0;padding-left:18px;">${rows}</ul>`;
}

export function renderJobMatchAlert(input: {
  locale: string | null | undefined;
  name?: string | null;
  jobs: JobMatchJob[];
  jobsUrl: string;
  siteUrl: string;
  unsubscribeUrl: string;
}): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getJobMatchAlertCopy(locale);
  const greeting = input.name?.trim()
    ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
    : "";
  const opts: EmailLayoutOptions = {
    locale,
    preheader: copy.lead,
    heading: copy.heading,
    introHtml: `${greeting}<p style="margin:0 0 12px;">${escapeHtml(copy.lead)}</p>`,
    sections: [
      {
        heading: copy.jobsHeading,
        html: jobRows(input.jobs, copy),
      },
    ],
    button: { label: copy.cta, url: input.jobsUrl },
    footerNote: copy.footerReason,
    siteUrl: input.siteUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeLabel: copy.unsubscribeLabel,
  };
  return {
    subject: copy.subject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}
