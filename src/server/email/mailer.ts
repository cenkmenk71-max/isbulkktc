import "server-only";

import { Resend } from "resend";
import { getAppBaseUrl } from "@/server/config/app-url";
import { classifyResendApiKey } from "@/server/config/resend-key";
import { getLocalePrefix, type AppLocale } from "@/i18n/routing";
import {
  renderEngagementEmail,
  renderFeedbackAcknowledgement,
  renderFeedbackTeamEmail,
  renderJobPublishedEmail,
  renderResumeReceivedEmail,
  renderSalesAcknowledgement,
  renderSalesTeamEmail,
  renderWelcomeEmail,
  type EngagementJob,
  type RenderedEmail,
  type WelcomeAudience,
} from "../../../supabase/functions/_shared/email-render.ts";
import { resolveEmailLocale } from "../../../supabase/functions/_shared/email-copy.ts";
import {
  renderCompanyProfileAcknowledgement,
  renderCompanyProfileTeamEmail,
  type CompanyProfileSubmission,
} from "./company-profile-render";
import { buildEmailHeaders, type EmailHeaders } from "./email-headers";
import { EMAIL_HEALTH_EVENT, reportDeliveryFailure } from "./delivery-health";

/**
 * Node-side transactional mailer for emails that originate in a Next.js server
 * action (welcome, feedback, sales, job published, résumé received) rather than
 * the Supabase notification worker.
 *
 * A provider error or a missing RESEND_API_KEY is swallowed inside `deliver`, so
 * a delivery problem never fails the caller's primary action. Resolving the app
 * base URL can still throw on misconfiguration, so callers must wrap the send in
 * a try/catch and treat a failure as non-fatal (see `submitFeedback`). The
 * worker-owned application notifications keep their own queue and are not sent
 * from here.
 */

const DEFAULT_FROM = "İşBul KKTC <no-reply@isbulkktc.com>";

function getResend(): Resend | null {
  const status = classifyResendApiKey(process.env.RESEND_API_KEY);
  if (status === "missing") {
    // Legitimately optional (local dev, preview without mail). A warning, not an
    // error, and the single place the reason is reported.
    console.warn("Outbound email skipped: RESEND_API_KEY is not configured.");
    return null;
  }
  if (status === "malformed") {
    // Present but not a Resend key (a copied Supabase token, a truncated value).
    // Reporting it as "not configured" hid the real cause for months (#186), so
    // name it distinctly; a health signal keyed on `event` can alert on it.
    console.error(EMAIL_HEALTH_EVENT, {
      event: "resend_key_malformed",
      message: "RESEND_API_KEY is set but is not a Resend key (expected `re_…`).",
    });
    return null;
  }
  return new Resend(process.env.RESEND_API_KEY!.trim());
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL?.trim() || DEFAULT_FROM;
}

/** Team inbox for inbound feedback; falls back to the sales contact. */
export function getFeedbackInbox(): string | null {
  const inbox =
    process.env.FEEDBACK_INBOX_EMAIL?.trim() ||
    process.env.SALES_CONTACT_EMAIL?.trim();
  return inbox && inbox.includes("@") ? inbox : null;
}

/**
 * Inbox that receives company-profile review alerts (#465); falls back to the
 * feedback inbox, then the sales contact. Without it a new submission has no
 * destination and the employer's message disappears silently.
 */
export function getCompanyReviewInbox(): string | null {
  const inbox =
    process.env.COMPANY_REVIEW_INBOX_EMAIL?.trim() || getFeedbackInbox();
  return inbox && inbox.includes("@") ? inbox : null;
}

/**
 * The monitored mailbox a reply to an outbound message should reach. The
 * default `from` is `no-reply@…`, so without a `Reply-To` a reply disappears
 * (#196). Falls back to the sales contact, then to the feedback inbox.
 */
function getReplyToInbox(): string | null {
  const inbox =
    process.env.SALES_INBOX_EMAIL?.trim() ||
    process.env.SALES_CONTACT_EMAIL?.trim() ||
    getFeedbackInbox();
  return inbox && inbox.includes("@") ? inbox : null;
}

function localeUrl(locale: AppLocale, path: string): string {
  return new URL(`${getLocalePrefix(locale)}${path}`, getAppBaseUrl()).toString();
}

async function deliver(
  email: RenderedEmail,
  to: string,
  idempotencyKey: string,
  options: { unsubscribeUrl?: string } = {},
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    // The reason (missing vs malformed) was reported by `getResend`.
    return;
  }
  // `Reply-To` on every message, `List-Unsubscribe` only on the promotional
  // family (the caller passes `unsubscribeUrl` there) — RFC 8058 one-click.
  const extra: EmailHeaders = buildEmailHeaders({
    replyToInbox: getReplyToInbox(),
    unsubscribeUrl: options.unsubscribeUrl,
  });
  try {
    const result = await resend.emails.send(
      {
        from: fromAddress(),
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...extra,
      },
      { idempotencyKey },
    );
    if (result.error) {
      // The SDK returns errors rather than throwing, so this is the path a real
      // rejection (a network failure too — `fetchRequest` turns it into
      // `application_error`) takes. Reported under `email_health` so the same
      // alert covers a rejected send and the malformed-key case above (#186).
      reportDeliveryFailure(result.error);
    }
  } catch (error) {
    // Defence in depth. `resend`'s `fetchRequest` catches its own failures and
    // *returns* them (`{error}` above), so a thrown error here is unexpected —
    // an abort-signal rethrow, a header-construction bug, or a future SDK
    // change. It is still a delivery failure, so it is reported under the same
    // `email_health` signal rather than a bare sentence a rule cannot match
    // (#186).
    reportDeliveryFailure(error);
  }
}

export async function sendWelcomeEmail(input: {
  to: string;
  audience: WelcomeAudience;
  locale: string | null | undefined;
  name?: string | null;
  userId: string;
}): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const actionPath =
    input.audience === "employer" ? "/company/dashboard" : "/profile/dashboard";
  const email = renderWelcomeEmail({
    locale,
    siteUrl: localeUrl(locale, "/"),
    audience: input.audience,
    name: input.name,
    actionUrl: localeUrl(locale, actionPath),
  });
  await deliver(email, input.to, `welcome/${input.userId}`);
}

export async function sendFeedbackEmails(input: {
  name?: string | null;
  email?: string | null;
  locale: string | null | undefined;
  category?: string | null;
  rating?: number | null;
  message: string;
  feedbackId: string;
}): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const siteUrl = localeUrl(locale, "/");

  if (input.email) {
    const acknowledgement = renderFeedbackAcknowledgement({
      locale,
      siteUrl,
      name: input.name,
      email: input.email,
      category: input.category,
      rating: input.rating,
      message: input.message,
      actionUrl: localeUrl(locale, "/jobs"),
    });
    await deliver(acknowledgement, input.email, `feedback-ack/${input.feedbackId}`);
  }

  const inbox = getFeedbackInbox();
  if (inbox) {
    const teamEmail = renderFeedbackTeamEmail({
      locale,
      siteUrl,
      name: input.name,
      email: input.email,
      category: input.category,
      rating: input.rating,
      message: input.message,
      actionUrl: siteUrl,
    });
    await deliver(teamEmail, inbox, `feedback-team/${input.feedbackId}`);
  } else {
    console.warn("Feedback team email skipped: no inbox configured.");
  }
}

/** Sent to the employer when their listing goes live. */
export async function sendJobPublishedEmail(input: {
  to: string;
  locale: string | null | undefined;
  jobTitle: string;
  jobSlug: string;
  jobId: string;
}): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const email = renderJobPublishedEmail({
    locale,
    siteUrl: localeUrl(locale, "/"),
    jobTitle: input.jobTitle,
    jobUrl: localeUrl(locale, `/jobs/${input.jobSlug}`),
  });
  await deliver(email, input.to, `job-published/${input.jobId}`);
}

/** Sent to the candidate after a CV import writes their profile. */
export async function sendResumeReceivedEmail(input: {
  to: string;
  locale: string | null | undefined;
  name?: string | null;
  isUpdate?: boolean;
  userId: string;
}): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const email = renderResumeReceivedEmail({
    locale,
    siteUrl: localeUrl(locale, "/"),
    name: input.name,
    isUpdate: input.isUpdate,
    profileUrl: localeUrl(locale, "/profile/dashboard"),
  });
  await deliver(
    email,
    input.to,
    `resume-received/${input.userId}/${input.isUpdate ? "update" : "initial"}`,
  );
}

/** Sales/lead flow: receipt to the prospect plus a copy to the team inbox. */
export async function sendSalesLeadEmails(input: {
  companyName?: string | null;
  contactName?: string | null;
  email?: string | null;
  locale: string | null | undefined;
  plan?: string | null;
  durationDays?: number | null;
  note?: string | null;
  leadId: string;
}): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const siteUrl = localeUrl(locale, "/");

  if (input.email) {
    const acknowledgement = renderSalesAcknowledgement({
      locale,
      siteUrl,
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      plan: input.plan,
      durationDays: input.durationDays,
      note: input.note,
      actionUrl: localeUrl(locale, "/packages"),
    });
    await deliver(acknowledgement, input.email, `sales-ack/${input.leadId}`);
  }

  const inbox =
    process.env.SALES_INBOX_EMAIL?.trim() ||
    process.env.SALES_CONTACT_EMAIL?.trim();
  if (inbox && inbox.includes("@")) {
    const teamEmail = renderSalesTeamEmail({
      locale,
      siteUrl,
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      plan: input.plan,
      durationDays: input.durationDays,
      note: input.note,
      actionUrl: siteUrl,
    });
    await deliver(teamEmail, inbox, `sales-team/${input.leadId}`);
  } else {
    console.warn("Sales team email skipped: no inbox configured.");
  }
}

/**
 * Engagement digest. Promotional, so it is the one family that carries an
 * unsubscribe link; callers must honour the recipient's opt-out.
 */
export async function sendEngagementEmail(input: {
  to: string;
  locale: string | null | undefined;
  name?: string | null;
  jobs: EngagementJob[];
  unsubscribeUrl: string;
  campaignId: string;
}): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const email = renderEngagementEmail({
    locale,
    siteUrl: localeUrl(locale, "/"),
    name: input.name,
    jobs: input.jobs,
    jobsUrl: localeUrl(locale, "/jobs"),
    unsubscribeUrl: input.unsubscribeUrl,
  });
  // The promotional family carries the one-click unsubscribe header (#196).
  await deliver(email, input.to, `engagement/${input.campaignId}`, {
    unsubscribeUrl: input.unsubscribeUrl,
  });
}

/**
 * Company profile submitted for review (#465). Sends the employer an
 * acknowledgement and alerts the review inbox. Both sends are independent and
 * best-effort: `deliver` swallows provider errors, and a caller wraps this in
 * try/catch so a mail problem never fails the primary insert.
 */
export async function sendCompanyProfileEmails(
  input: CompanyProfileSubmission & {
    /** The submitting employer's account email; the acknowledgement recipient. */
    to: string | null | undefined;
    locale: string | null | undefined;
    submissionId: string;
  },
): Promise<void> {
  const locale = resolveEmailLocale(input.locale);
  const siteUrl = localeUrl(locale, "/");

  if (input.to) {
    const acknowledgement = renderCompanyProfileAcknowledgement({
      locale,
      siteUrl,
      companyName: input.companyName,
      actionUrl: localeUrl(locale, "/company/dashboard"),
    });
    await deliver(
      acknowledgement,
      input.to,
      `company-profile-ack/${input.submissionId}`,
    );
  }

  const inbox = getCompanyReviewInbox();
  if (inbox) {
    const teamEmail = renderCompanyProfileTeamEmail({
      locale,
      siteUrl,
      companyName: input.companyName,
      categories: input.categories,
      website: input.website,
      phone: input.phone,
      publicEmail: input.publicEmail,
      address: input.address,
      submittedBy: input.submittedBy,
      actionUrl: localeUrl(locale, "/admin/company-profiles"),
    });
    await deliver(teamEmail, inbox, `company-profile-team/${input.submissionId}`);
  } else {
    console.warn("Company profile review email skipped: no inbox configured.");
  }
}
