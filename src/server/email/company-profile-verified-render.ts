/**
 * Renderers for the company-profile auto-verified emails.
 *
 * Two messages:
 * 1. Employer welcome email with next steps (CTA to /packages)
 * 2. Admin notification with full company details for record-keeping
 *
 * Pure and globals-free so the Node mailer and the unit tests can both use them.
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
import { getCompanyProfileVerifiedCopy } from "./company-profile-verified-copy.ts";

type SiteContext = { locale: string; siteUrl: string };

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function strongLine(text: string): string {
  return `<p style="margin:0;font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(text)}</p>`;
}

function detailRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:${BRAND.inkSoft};vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top;">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`;
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

export type CompanyProfileVerifiedEmployerInput = SiteContext & {
  companyName: string;
  categories?: string | null;
  website?: string | null;
  phone?: string | null;
  publicEmail?: string | null;
  address?: string | null;
  actionUrl: string;
};

export type CompanyProfileVerifiedAdminInput = SiteContext & {
  companyName: string;
  categories?: string | null;
  website?: string | null;
  phone?: string | null;
  publicEmail?: string | null;
  address?: string | null;
  submittedBy?: string | null;
  actionUrl: string;
};

/** Employer welcome email: "your profile is live, next step is packages". */
export function renderCompanyProfileVerifiedEmployerEmail(
  input: CompanyProfileVerifiedEmployerInput,
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getCompanyProfileVerifiedCopy(locale);
  const base = getEmailCopy(locale);

  const contactParts: string[] = [];
  if (input.phone) contactParts.push(input.phone);
  if (input.publicEmail) contactParts.push(input.publicEmail);
  const contactValue = contactParts.join(" · ") || null;

  const opts = {
    locale,
    preheader: copy.employerLead,
    heading: copy.employerHeading,
    introHtml: `${paragraph(copy.employerLead)}${strongLine(input.companyName)}`,
    sections: [
      {
        heading: copy.employerDetailsHeading,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${detailRow(copy.employerCompanyLabel, input.companyName)}${detailRow(copy.employerCategoriesLabel, input.categories)}${detailRow(copy.employerWebsiteLabel, input.website)}${detailRow(copy.employerContactLabel, contactValue)}${detailRow(copy.employerAddressLabel, input.address)}</table>`,
      },
      {
        heading: copy.employerNextStepsHeading,
        html: listHtml(copy.employerNextSteps),
      },
    ],
    button: { label: copy.employerCta, url: input.actionUrl },
    footerNote: base.footer.reason,
    siteUrl: input.siteUrl,
  };

  return {
    subject: copy.employerSubject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}

/** Admin notification email: new company profile auto-verified. */
export function renderCompanyProfileVerifiedAdminEmail(
  input: CompanyProfileVerifiedAdminInput,
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = getCompanyProfileVerifiedCopy(locale);
  const base = getEmailCopy(locale);

  const contactParts: string[] = [];
  if (input.phone) contactParts.push(input.phone);
  if (input.publicEmail) contactParts.push(input.publicEmail);
  const contactValue = contactParts.join(" · ") || null;

  const opts = {
    locale,
    preheader: copy.adminLead,
    heading: copy.adminHeading,
    introHtml: paragraph(copy.adminLead),
    sections: [
      {
        heading: copy.adminDetailsHeading,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${detailRow(copy.adminCompanyLabel, input.companyName)}${detailRow(copy.adminCategoriesLabel, input.categories)}${detailRow(copy.adminWebsiteLabel, input.website)}${detailRow(copy.adminContactLabel, contactValue)}${detailRow(copy.adminAddressLabel, input.address)}${detailRow(copy.adminSubmittedByLabel, input.submittedBy)}</table>`,
      },
    ],
    button: { label: copy.adminReviewLinkText, url: input.actionUrl },
    footerNote: base.footer.reason,
    siteUrl: input.siteUrl,
  };

  return {
    subject: `${copy.adminSubject}: ${input.companyName}`,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}