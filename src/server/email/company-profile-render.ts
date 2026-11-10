/**
 * Renderers for the company-profile review emails (#465).
 *
 * Two messages: the employer's acknowledgement and the review-team alert.
 * Pure and globals-free so the Node mailer and the unit tests can both use
 * them. Reuses the shared transactional shell (`renderEmailLayout`) so the
 * brand header, footer and RTL/`lang` handling stay identical to every other
 * email the platform sends.
 */

import {
  escapeHtml,
  renderEmailLayout,
  renderEmailText,
} from "../../../supabase/functions/_shared/email-layout.ts";
import {
  getEmailCopy,
  resolveEmailLocale,
} from "../../../supabase/functions/_shared/email-copy.ts";
import type { RenderedEmail } from "../../../supabase/functions/_shared/email-render.ts";
import { getCompanyProfileCopy } from "./company-profile-copy.ts";

type SiteContext = { locale: string; siteUrl: string };

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function listHtml(items: string[]): string {
  const rows = items
    .map(
      (item, index) =>
        `<tr><td style="vertical-align:top;padding:0 10px 10px 0;"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:#e2ece5;color:#0D5C3A;font-size:12px;font-weight:700;">${
          index + 1
        }</span></td><td style="vertical-align:top;padding:0 0 10px;font-size:15px;line-height:1.55;color:#1A1A1A;">${escapeHtml(
          item,
        )}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">${rows}</table>`;
}

export type CompanyProfileSubmission = {
  companyName: string;
  categories?: string | null;
  website?: string | null;
  phone?: string | null;
  publicEmail?: string | null;
  address?: string | null;
  /** The submitting employer's account email, shown to the review team only. */
  submittedBy?: string | null;
};

/** Employer acknowledgement: "your profile is under review". */
export function renderCompanyProfileAcknowledgement(
  input: SiteContext &
    Pick<CompanyProfileSubmission, "companyName"> & { actionUrl: string },
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getCompanyProfileCopy(locale);
  const base = getEmailCopy(locale);
  const opts = {
    locale,
    preheader: copy.ackLead,
    heading: copy.ackHeading,
    introHtml: `${paragraph(copy.ackLead)}<p style="margin:0;font-size:15px;font-weight:600;color:#1A1A1A;">${escapeHtml(
      input.companyName,
    )}</p>`,
    sections: [
      { heading: copy.ackStepsHeading, html: listHtml(copy.ackSteps) },
    ],
    button: { label: copy.ackCta, url: input.actionUrl },
    footerNote: base.footer.reason,
    siteUrl: input.siteUrl,
  };
  return {
    subject: copy.ackSubject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}

/** Review-team alert: a new submission is waiting in the queue. */
export function renderCompanyProfileTeamEmail(
  input: SiteContext & CompanyProfileSubmission & { actionUrl: string },
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getCompanyProfileCopy(locale);
  const base = getEmailCopy(locale);

  const rows: string[] = [];
  const push = (label: string, value: string | null | undefined) => {
    if (!value) return;
    rows.push(
      `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:#5B6572;vertical-align:top;white-space:nowrap;">${escapeHtml(
        label,
      )}</td><td style="padding:6px 0;font-size:14px;color:#1A1A1A;vertical-align:top;">${escapeHtml(
        value,
      ).replace(/\n/g, "<br>")}</td></tr>`,
    );
  };
  push(copy.companyLabel, input.companyName);
  push(copy.categoriesLabel, input.categories);
  push(copy.websiteLabel, input.website);
  push(copy.contactLabel, input.publicEmail ?? input.phone);
  push(copy.addressLabel, input.address);
  push(copy.submittedByLabel, input.submittedBy);

  const opts = {
    locale,
    preheader: copy.teamLead,
    heading: copy.teamHeading,
    introHtml: paragraph(copy.teamLead),
    sections: [
      {
        heading: copy.teamDetailsHeading,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows.join("")}</table>`,
      },
    ],
    button: { label: copy.teamCta, url: input.actionUrl },
    note: copy.reviewNote,
    footerNote: base.footer.reason,
    siteUrl: input.siteUrl,
  };
  return {
    subject: `${copy.teamSubject}: ${input.companyName}`,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}
