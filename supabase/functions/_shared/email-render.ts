/**
 * High-level email renderers: one function per email the platform sends.
 *
 * Each returns `{ subject, html, text }` so a caller only picks the template and
 * its data. Pure and globals-free: the same code runs in the Supabase Edge
 * Function worker (Deno) and in Node server actions, and is unit testable.
 */

import { escapeHtml, renderEmailLayout, renderEmailText } from "./email-layout.ts";
import { getEmailCopy, resolveEmailLocale, type EmailLocale } from "./email-copy.ts";
import { getEmailCopyExtras } from "./email-copy-extras.ts";

export type RenderedEmail = { subject: string; html: string; text: string };

type SiteContext = { locale: string; siteUrl: string };

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function strongLine(text: string): string {
  return `<p style="margin:0;font-size:15px;font-weight:600;color:#1A1A1A;">${escapeHtml(text)}</p>`;
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

function render(ctx: SiteContext, build: (copy: ReturnType<typeof getEmailCopy>) => RenderedEmail): RenderedEmail {
  const locale: EmailLocale = resolveEmailLocale(ctx.locale);
  return build(getEmailCopy(locale));
}

export function renderAuthConfirmation(input: SiteContext & {
  email: string;
  confirmationUrl: string;
}): RenderedEmail {
  return render(input, (copy) => {
    const opts = {
      preheader: copy.auth.confirmationLead,
      heading: copy.auth.confirmationHeading,
      introHtml: paragraph(
        `${copy.auth.confirmationLead} (${input.email})`,
      ),
      button: { label: copy.auth.confirmationCta, url: input.confirmationUrl },
      linkFallback: copy.auth.confirmationFallback,
      note: copy.auth.confirmationIgnore,
      footerNote: copy.footer.legal,
      siteUrl: input.siteUrl,
    };
    return {
      subject: copy.auth.confirmationSubject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export function renderAuthRecovery(input: SiteContext & {
  email: string;
  confirmationUrl: string;
}): RenderedEmail {
  return render(input, (copy) => {
    const opts = {
      preheader: copy.auth.recoveryLead,
      heading: copy.auth.recoveryHeading,
      introHtml: paragraph(`${copy.auth.recoveryLead} (${input.email})`),
      button: { label: copy.auth.recoveryCta, url: input.confirmationUrl },
      linkFallback: copy.auth.confirmationFallback,
      note: copy.auth.recoveryIgnore,
      footerNote: copy.footer.legal,
      siteUrl: input.siteUrl,
    };
    return {
      subject: copy.auth.recoverySubject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export function renderAuthReauthentication(input: SiteContext & {
  token: string;
}): RenderedEmail {
  return render(input, (copy) => {
    const opts = {
      preheader: copy.auth.reauthenticationLead,
      heading: copy.auth.reauthenticationHeading,
      introHtml: paragraph(copy.auth.reauthenticationLead),
      code: input.token,
      note: copy.auth.reauthenticationIgnore,
      footerNote: copy.footer.legal,
      siteUrl: input.siteUrl,
    };
    return {
      subject: copy.auth.reauthenticationSubject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export function renderAuthPasswordChanged(input: SiteContext & {
  email: string;
}): RenderedEmail {
  return render(input, (copy) => {
    const opts = {
      preheader: copy.auth.passwordChangedLead,
      heading: copy.auth.passwordChangedHeading,
      introHtml: paragraph(`${copy.auth.passwordChangedLead} (${input.email})`),
      note: copy.auth.passwordChangedWarning,
      footerNote: copy.footer.legal,
      siteUrl: input.siteUrl,
    };
    return {
      subject: copy.auth.passwordChangedSubject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export type WelcomeAudience = "candidate" | "employer";

export function renderWelcomeEmail(input: SiteContext & {
  audience: WelcomeAudience;
  name?: string | null;
  actionUrl: string;
}): RenderedEmail {
  return render(input, (copy) => {
    const isCandidate = input.audience === "candidate";
    const subject = isCandidate ? copy.welcome.candidateSubject : copy.welcome.employerSubject;
    const heading = isCandidate ? copy.welcome.candidateHeading : copy.welcome.employerHeading;
    const lead = isCandidate ? copy.welcome.candidateLead : copy.welcome.employerLead;
    const steps = isCandidate ? copy.welcome.candidateSteps : copy.welcome.employerSteps;
    const cta = isCandidate ? copy.welcome.candidateCta : copy.welcome.employerCta;
    const greeting = input.name?.trim()
      ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
      : "";
    const opts = {
      preheader: lead,
      heading,
      introHtml: `${greeting}${paragraph(lead)}`,
      sections: [{ heading: isCandidate ? "İlk adımlar" : "İlk adımlar", html: listHtml(steps) }],
      button: { label: cta, url: input.actionUrl },
      footerNote: copy.footer.reason,
      siteUrl: input.siteUrl,
    };
    return {
      subject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export type NotificationEventType = "submitted" | "viewed" | "status_changed";

export function renderNotificationEmail(input: SiteContext & {
  eventType: NotificationEventType;
  isCandidate: boolean;
  jobTitle: string;
  status?: string | null;
  dashboardUrl: string;
}): RenderedEmail {
  return render(input, (copy) => {
    const status = input.status ? copy.statuses[input.status] : undefined;
    let subject: string;
    let lead: string;

    if (input.eventType === "viewed" && input.isCandidate) {
      subject = copy.notification.viewedSubject;
      lead = copy.notification.viewed;
    } else if (input.eventType === "status_changed" && status) {
      subject = copy.notification.statusSubject;
      lead = copy.notification.statusChanged.replace("{status}", status);
    } else if (input.eventType === "submitted" && input.isCandidate) {
      subject = copy.notification.candidateAppliedSubject;
      lead = copy.notification.candidateApplied;
    } else if (input.eventType === "submitted") {
      subject = copy.notification.employerAppliedSubject;
      lead = copy.notification.employerApplied;
    } else {
      throw new Error("unsupported_notification_event");
    }

    const opts = {
      preheader: lead,
      heading: subject,
      introHtml: `${paragraph(lead)}${strongLine(input.jobTitle)}`,
      button: { label: copy.notification.openDashboard, url: input.dashboardUrl },
      footerNote: copy.footer.reason,
      siteUrl: input.siteUrl,
    };
    return {
      subject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export type FeedbackInput = {
  locale: string;
  name?: string | null;
  email?: string | null;
  category?: string | null;
  rating?: number | null;
  message: string;
  actionUrl: string;
  siteUrl: string;
};

export function renderFeedbackAcknowledgement(input: FeedbackInput): RenderedEmail {
  return render(input, (copy) => {
    const greeting = input.name?.trim()
      ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
      : "";
    const opts = {
      preheader: copy.feedback.receivedLead,
      heading: copy.feedback.receivedHeading,
      introHtml: `${greeting}${paragraph(copy.feedback.receivedLead)}`,
      button: { label: copy.feedback.receivedCta, url: input.actionUrl },
      footerNote: copy.footer.reason,
      siteUrl: input.siteUrl,
    };
    return {
      subject: copy.feedback.receivedSubject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export function renderFeedbackTeamEmail(input: FeedbackInput): RenderedEmail {
  return render(input, (copy) => {
    const rows: string[] = [];
    const push = (label: string, value: string) => {
      rows.push(
        `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:#5B6572;vertical-align:top;white-space:nowrap;">${escapeHtml(
          label,
        )}</td><td style="padding:6px 0;font-size:14px;color:#1A1A1A;vertical-align:top;">${value}</td></tr>`,
      );
    };
    if (input.name) push("Ad", escapeHtml(input.name));
    if (input.email) push("E-posta", escapeHtml(input.email));
    if (input.category) push(copy.labels.categoryLabel, escapeHtml(input.category));
    if (typeof input.rating === "number") push(copy.labels.ratingLabel, `${input.rating}/5`);
    push(copy.labels.messageLabel, escapeHtml(input.message).replace(/\n/g, "<br>"));

    const opts = {
      preheader: copy.feedback.teamHeading,
      heading: copy.feedback.teamHeading,
      introHtml: paragraph(copy.feedback.receivedLead),
      sections: [
        {
          heading: copy.feedback.teamSubject,
          html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows.join("")}</table>`,
        },
      ],
      footerNote: copy.footer.reason,
      siteUrl: input.siteUrl,
    };
    return {
      subject: `${copy.feedback.teamSubject}: ${input.category ?? input.name ?? input.email ?? ""}`.trim(),
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

/** Job listing approved and published. */
export function renderJobPublishedEmail(input: SiteContext & {
  jobTitle: string;
  jobUrl: string;
}): RenderedEmail {
  const extras = getEmailCopyExtras(input.locale);
  const copy = getEmailCopy(input.locale);
  const opts = {
    preheader: extras.jobPublished.lead,
    heading: extras.jobPublished.heading,
    introHtml: `${paragraph(extras.jobPublished.lead)}${strongLine(input.jobTitle)}`,
    sections: [
      { heading: copy.notification.openDashboard, html: listHtml(extras.jobPublished.steps) },
    ],
    button: { label: extras.jobPublished.cta, url: input.jobUrl },
    footerNote: copy.footer.reason,
    siteUrl: input.siteUrl,
  };
  return {
    subject: extras.jobPublished.subject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}

/** CV / résumé received and imported into the candidate profile. */
export function renderResumeReceivedEmail(input: SiteContext & {
  name?: string | null;
  /** true when the import updated an existing profile rather than creating one */
  isUpdate?: boolean;
  profileUrl: string;
}): RenderedEmail {
  const extras = getEmailCopyExtras(input.locale);
  const copy = getEmailCopy(input.locale);
  const heading = input.isUpdate ? extras.resume.updateHeading : extras.resume.heading;
  const lead = input.isUpdate ? extras.resume.updateLead : extras.resume.lead;
  const subject = input.isUpdate ? extras.resume.updateSubject : extras.resume.subject;
  const greeting = input.name?.trim()
    ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
    : "";
  const opts = {
    preheader: lead,
    heading,
    introHtml: `${greeting}${paragraph(lead)}`,
    sections: [{ heading: copy.notification.openDashboard, html: listHtml(extras.resume.steps) }],
    button: { label: extras.resume.cta, url: input.profileUrl },
    footerNote: copy.footer.reason,
    siteUrl: input.siteUrl,
  };
  return {
    subject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}

export type SalesLeadInput = SiteContext & {
  companyName?: string | null;
  contactName?: string | null;
  email?: string | null;
  plan?: string | null;
  durationDays?: number | null;
  note?: string | null;
  actionUrl: string;
};

/** Quote request receipt for the prospective customer. */
export function renderSalesAcknowledgement(input: SalesLeadInput): RenderedEmail {
  const extras = getEmailCopyExtras(input.locale);
  const copy = getEmailCopy(input.locale);
  const greeting = input.contactName?.trim()
    ? `<p style="margin:0 0 12px;">${escapeHtml(input.contactName.trim())},</p>`
    : "";
  const opts = {
    preheader: extras.sales.ackLead,
    heading: extras.sales.ackHeading,
    introHtml: `${greeting}${paragraph(extras.sales.ackLead)}`,
    button: { label: extras.sales.ackCta, url: input.actionUrl },
    footerNote: copy.footer.reason,
    siteUrl: input.siteUrl,
  };
  return {
    subject: extras.sales.ackSubject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}

/** Quote request forwarded to the team inbox. */
export function renderSalesTeamEmail(input: SalesLeadInput): RenderedEmail {
  const extras = getEmailCopyExtras(input.locale);
  const copy = getEmailCopy(input.locale);
  const rows: string[] = [];
  const push = (label: string, value: string) => {
    rows.push(
      `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:#5B6572;vertical-align:top;white-space:nowrap;">${escapeHtml(
        label,
      )}</td><td style="padding:6px 0;font-size:14px;color:#1A1A1A;vertical-align:top;">${value}</td></tr>`,
    );
  };
  if (input.companyName) push(extras.sales.leadLabel, escapeHtml(input.companyName));
  if (input.contactName) push(copy.labels.jobLabel, escapeHtml(input.contactName));
  if (input.email) push("E-posta", escapeHtml(input.email));
  if (input.plan) push(extras.sales.planLabel, escapeHtml(input.plan));
  if (typeof input.durationDays === "number") {
    push(extras.sales.durationLabel, `${input.durationDays}`);
  }
  if (input.note) {
    push(extras.sales.messageLabel, escapeHtml(input.note).replace(/\n/g, "<br>"));
  }

  const opts = {
    preheader: extras.sales.teamHeading,
    heading: extras.sales.teamHeading,
    introHtml: paragraph(extras.sales.ackLead),
    sections: [
      {
        heading: extras.sales.teamSubject,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows.join("")}</table>`,
      },
    ],
    footerNote: copy.footer.reason,
    siteUrl: input.siteUrl,
  };
  return {
    subject: `${extras.sales.teamSubject}: ${input.companyName ?? input.email ?? ""}`.trim(),
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}

export type EngagementJob = { title: string; company: string; url?: string };

/** Periodic "jobs picked for you" digest; the only promotional family. */
export function renderEngagementEmail(input: SiteContext & {
  name?: string | null;
  jobs: EngagementJob[];
  jobsUrl: string;
  unsubscribeUrl: string;
}): RenderedEmail {
  const extras = getEmailCopyExtras(input.locale);
  const copy = getEmailCopy(input.locale);
  const greeting = input.name?.trim()
    ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
    : "";
  const rows = input.jobs
    .map((job) => {
      const label = extras.engagement.jobRow
        .replace("{title}", job.title)
        .replace("{company}", job.company);
      return job.url
        ? `<li style="margin:0 0 8px;"><a href="${escapeHtml(job.url)}" style="color:#0D5C3A;text-decoration:none;font-weight:600;">${escapeHtml(
            label,
          )}</a></li>`
        : `<li style="margin:0 0 8px;font-weight:600;">${escapeHtml(label)}</li>`;
    })
    .join("");
  const opts = {
    preheader: extras.engagement.lead,
    heading: extras.engagement.heading,
    introHtml: `${greeting}${paragraph(extras.engagement.lead)}`,
    sections: [
      {
        heading: extras.engagement.jobsHeading,
        html: `<ul style="margin:0;padding-left:18px;">${rows}</ul>`,
      },
    ],
    button: { label: extras.engagement.cta, url: input.jobsUrl },
    note: extras.engagement.unsubscribeNote,
    footerNote: copy.footer.reason,
    siteUrl: input.siteUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeLabel: extras.engagement.unsubscribeLabel,
  };
  return {
    subject: extras.engagement.subject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}
