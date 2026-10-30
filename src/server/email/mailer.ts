import "server-only";

import { Resend } from "resend";
import { getAppBaseUrl } from "@/server/config/app-url";
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
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

function localeUrl(locale: AppLocale, path: string): string {
  return new URL(`${getLocalePrefix(locale)}${path}`, getAppBaseUrl()).toString();
}

async function deliver(
  email: RenderedEmail,
  to: string,
  idempotencyKey: string,
): Promise<void> {
  const resend = getResend();
  if (!resend) {
    console.warn("Outbound email skipped: RESEND_API_KEY is not configured.");
    return;
  }
  try {
    const result = await resend.emails.send(
      {
        from: fromAddress(),
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      { idempotencyKey },
    );
    if (result.error) {
      console.error("Outbound email was rejected by Resend.", {
        code: result.error.name,
      });
    }
  } catch (error) {
    console.error("Outbound email delivery failed.", {
      error: error instanceof Error ? error.message : "unknown_error",
    });
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
  await deliver(email, input.to, `engagement/${input.campaignId}`);
}
