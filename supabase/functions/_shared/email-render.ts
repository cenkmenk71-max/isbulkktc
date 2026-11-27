/**
 * High-level email renderers: one function per email the platform sends.
 *
 * Each returns `{ subject, html, text }` so a caller only picks the template and
 * its data. Pure and globals-free: the same code runs in the Supabase Edge
 * Function worker (Deno) and in Node server actions, and is unit testable.
 */

import { BRAND, escapeHtml, renderEmailLayout, renderEmailText } from "./email-layout.ts";
import { getEmailCopy, MARKETING_CONSENT_COPY, resolveEmailLocale, type EmailLocale } from "./email-copy.ts";
import { getEmailCopyExtras } from "./email-copy-extras.ts";
import { getMarketingCopy, MARKETING_CONTACTS } from "./email-copy-marketing.ts";

export type RenderedEmail = { subject: string; html: string; text: string };

type SiteContext = { locale: string; siteUrl: string };

function paragraph(text: string): string {
  return `<p style="margin:0 0 12px;">${escapeHtml(text)}</p>`;
}

function strongLine(text: string): string {
  return `<p style="margin:0;font-size:15px;font-weight:600;color:${BRAND.ink};">${escapeHtml(text)}</p>`;
}

function listHtml(items: string[]): string {
  const rows = items
    .map(
      (item, index) =>
        `<tr><td style="vertical-align:top;padding:0 10px 10px 0;"><span class="ibk-icon-bg" style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${BRAND.greenSoft};color:${BRAND.green};font-size:13px;font-weight:700;">${
          index + 1
        }</span></td><td style="vertical-align:top;padding:0 0 10px;font-size:15px;line-height:1.55;color:${BRAND.ink};">${escapeHtml(
          item,
        )}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;">${rows}</table>`;
}

function render(
  ctx: SiteContext,
  build: (copy: ReturnType<typeof getEmailCopy>, locale: EmailLocale) => RenderedEmail,
): RenderedEmail {
  const locale: EmailLocale = resolveEmailLocale(ctx.locale);
  return build(getEmailCopy(locale), locale);
}

export function renderAuthConfirmation(input: SiteContext & {
  email: string;
  confirmationUrl: string;
}): RenderedEmail {
  return render(input, (copy, locale) => {
    const opts = {
      locale,
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
  return render(input, (copy, locale) => {
    const opts = {
      locale,
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
  return render(input, (copy, locale) => {
    const opts = {
      locale,
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
  return render(input, (copy, locale) => {
    const opts = {
      locale,
      preheader: copy.auth.passwordChangedLead,
      heading: copy.auth.passwordChangedHeading,
      introHtml: paragraph(`${copy.auth.passwordChangedLead} (${input.email})`),
      note: copy.auth.passwordChangedWarning,
      button: {
        label: locale === "tr" ? "Giriş ekranını aç" : locale === "de" ? "Anmeldeseite öffnen" : locale === "ru" ? "Открыть вход" : locale === "el" ? "Άνοιγμα σύνδεσης" : locale === "fa" ? "رفتن به صفحه ورود" : "Open sign in",
        url: new URL("login", input.siteUrl.endsWith("/") ? input.siteUrl : `${input.siteUrl}/`).toString(),
      },
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
  return render(input, (copy, locale) => {
    const isCandidate = input.audience === "candidate";
    const subject = isCandidate ? copy.welcome.candidateSubject : copy.welcome.employerSubject;
    const hook = isCandidate ? copy.welcome.candidateHeading : copy.welcome.employerHeading;
    const lead = isCandidate ? copy.welcome.candidateLead : copy.welcome.employerLead;
    const steps = isCandidate ? copy.welcome.candidateSteps : copy.welcome.employerSteps;
    const primaryCta = isCandidate ? copy.welcome.candidateCta : copy.welcome.employerCta;
    const secondaryCta = isCandidate
      ? copy.welcome.candidateSecondaryCta
      : copy.welcome.employerSecondaryCta;
    const eyebrow = isCandidate
      ? copy.welcome.candidateEyebrow
      : copy.welcome.employerEyebrow;
    const stepsHeading = isCandidate
      ? copy.welcome.candidateStepsHeading
      : copy.welcome.employerStepsHeading;
    const greeting = input.name?.trim()
      ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
      : "";
    const siteRoot = input.siteUrl.endsWith("/") ? input.siteUrl : `${input.siteUrl}/`;
    const secondaryUrl = new URL(isCandidate ? "jobs" : "packages", siteRoot).toString();
    const title = locale === "tr"
      ? (isCandidate ? "Profilinizi tamamlayarak başlayın" : "Şirketinizi işe alıma hazırlayın")
      : locale === "de"
        ? (isCandidate ? "Vervollständigen Sie zuerst Ihr Profil" : "Bereiten Sie Ihr Unternehmen auf die Personalsuche vor")
        : locale === "ru"
          ? (isCandidate ? "Начните с заполнения профиля" : "Подготовьте компанию к найму")
          : locale === "el"
            ? (isCandidate ? "Ξεκινήστε συμπληρώνοντας το προφίλ σας" : "Προετοιμάστε την εταιρεία σας για προσλήψεις")
            : locale === "fa"
              ? (isCandidate ? "با تکمیل نمایه خود شروع کنید" : "شرکت خود را برای استخدام آماده کنید")
              : (isCandidate ? "Start by completing your profile" : "Prepare your company to hire");
    const opts = {
      locale,
      preheader: lead,
      heading: title,
      hero: {
        eyebrow,
        hook,
        subhook: lead,
        cta: { label: primaryCta, url: input.actionUrl },
      },
      introHtml: greeting,
      sections: [{ heading: stepsHeading, html: listHtml(steps) }],
      button: { label: secondaryCta, url: secondaryUrl, secondary: true },
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
  return render(input, (copy, locale) => {
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
      locale,
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
  return render(input, (copy, locale) => {
    const greeting = input.name?.trim()
      ? `<p style="margin:0 0 12px;">${escapeHtml(input.name.trim())},</p>`
      : "";
    const opts = {
      locale,
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
  return render(input, (copy, locale) => {
    const rows: string[] = [];
    const push = (label: string, value: string) => {
      rows.push(
        `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:${BRAND.inkSoft};vertical-align:top;white-space:nowrap;">${escapeHtml(
          label,
        )}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top;">${value}</td></tr>`,
      );
    };
    if (input.name) push("Ad", escapeHtml(input.name));
    if (input.email) push("E-posta", escapeHtml(input.email));
    if (input.category) push(copy.labels.categoryLabel, escapeHtml(input.category));
    if (typeof input.rating === "number") push(copy.labels.ratingLabel, `${input.rating}/5`);
    push(copy.labels.messageLabel, escapeHtml(input.message).replace(/\n/g, "<br>"));

    const opts = {
      locale,
      preheader: copy.feedback.teamHeading,
      heading: copy.feedback.teamHeading,
      introHtml: paragraph(copy.feedback.receivedLead),
      sections: [
        {
          heading: copy.feedback.teamSubject,
          html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows.join("")}</table>`,
        },
      ],
      button: input.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
        ? {
            label: copy.feedback.teamReplyCta,
            url: `mailto:${input.email}?subject=${encodeURIComponent(copy.feedback.teamSubject)}`,
          }
        : undefined,
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
  expiresAt?: string | null;
}): RenderedEmail {
  const extras = getEmailCopyExtras(input.locale);
  const copy = getEmailCopy(input.locale);
  const steps = [...extras.jobPublished.steps];
  if (input.expiresAt) {
    const dateStr = new Intl.DateTimeFormat(input.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(input.expiresAt));
    steps.push(`İlan süresi sona erer: ${dateStr}`);
  }
  const opts = {
    locale: resolveEmailLocale(input.locale),
    preheader: extras.jobPublished.lead,
    heading: extras.jobPublished.heading,
    introHtml: `${paragraph(extras.jobPublished.lead)}${strongLine(input.jobTitle)}`,
    sections: [
      { heading: copy.notification.openDashboard, html: listHtml(steps) },
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
    locale: resolveEmailLocale(input.locale),
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
    locale: resolveEmailLocale(input.locale),
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


/**
 * Double-opt-in message. It asks the recipient to verify a marketing
 * preference; it is not itself a promotional campaign.
 */
export function renderMarketingConsentConfirmation(
  input: SiteContext & { confirmationUrl: string },
): RenderedEmail {
  const locale = resolveEmailLocale(input.locale);
  const copy = MARKETING_CONSENT_COPY[locale];
  const legal = getEmailCopy(locale).footer.legal;
  const opts = {
    locale,
    preheader: copy.lead,
    heading: copy.heading,
    introHtml: paragraph(copy.lead),
    button: { label: copy.cta, url: input.confirmationUrl },
    linkFallback: copy.fallback,
    note: copy.ignore,
    footerNote: legal,
    siteUrl: input.siteUrl,
  };
  return {
    subject: copy.subject,
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
      `<tr><td style="padding:6px 12px 6px 0;font-size:13px;font-weight:600;color:${BRAND.inkSoft};vertical-align:top;white-space:nowrap;">${escapeHtml(
        label,
      )}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top;">${value}</td></tr>`,
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
    locale: resolveEmailLocale(input.locale),
    preheader: extras.sales.teamHeading,
    heading: extras.sales.teamHeading,
    introHtml: paragraph(extras.sales.ackLead),
    sections: [
      {
        heading: extras.sales.teamSubject,
        html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${rows.join("")}</table>`,
      },
    ],
    button: input.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
      ? {
          label: extras.sales.replyCta,
          url: `mailto:${input.email}?subject=${encodeURIComponent(extras.sales.teamSubject)}`,
        }
      : undefined,
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
        ? `<li style="margin:0 0 8px;"><a href="${escapeHtml(job.url)}" style="color:${BRAND.green};text-decoration:none;font-weight:600;">${escapeHtml(
            label,
          )}</a></li>`
        : `<li style="margin:0 0 8px;font-weight:600;">${escapeHtml(label)}</li>`;
    })
    .join("");
  const opts = {
    locale: resolveEmailLocale(input.locale),
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

/** Job match alert: a new listing matches the candidate's skills. */
export function renderJobMatchAlertEmail(input: SiteContext & {
  jobTitle: string;
  companyName: string;
  matchScore: number;
  jobUrl: string;
}): RenderedEmail {
  return render(input, (_copy, locale) => {
    const copy = getEmailCopyExtras(locale);
    const subject = copy.jobMatch.subject.replace("{company}", input.companyName);
    const lead = copy.jobMatch.lead.replace("{company}", input.companyName);
    const opts = {
      locale,
      preheader: lead,
      heading: subject,
      introHtml: `${paragraph(lead)}${strongLine(input.jobTitle)}`,
      sections: [
        {
          heading: copy.jobMatch.companyHeading,
          html: `<p style="margin:0 0 12px;">${escapeHtml(input.companyName)}</p>`,
        },
        {
          heading: copy.jobMatch.matchScoreHeading,
          html: `<p style="margin:0 0 12px;">${copy.jobMatch.matchScoreLabel.replace("{score}", input.matchScore.toString())}</p>`,
        },
      ],
      button: { label: copy.jobMatch.cta, url: input.jobUrl },
      footerNote: _copy.footer.reason,
      siteUrl: input.siteUrl,
    };
    return {
      subject,
      html: renderEmailLayout(opts),
      text: renderEmailText(opts),
    };
  });
}

export type MarketingInput = SiteContext & {
  /** A signed recipient-specific opt-out URL is mandatory for promotional mail. */
  unsubscribeUrl: string;
};

/**
 * Acquisition email. Package limits and durations mirror the public package
 * catalogue; prices are intentionally never embedded because operators can
 * change them in the admin console. Every package CTA deep-links to its own
 * catalogue card, while WhatsApp, email and telephone actions use real channels.
 */
export function renderMarketingEmail(input: MarketingInput): RenderedEmail {
  if (!input.unsubscribeUrl || !/^https:\/\//i.test(input.unsubscribeUrl)) {
    throw new Error("marketing_email_requires_https_unsubscribe_url");
  }

  const locale = resolveEmailLocale(input.locale);
  const copy = getMarketingCopy(locale);
  const baseUrl = new URL(input.siteUrl);
  if (!baseUrl.pathname.endsWith("/")) baseUrl.pathname += "/";
  const packagePageUrl = new URL("packages#packages-current", baseUrl).toString();
  const packageUrl = (anchor: string) => new URL("packages#" + anchor, baseUrl).toString();

  const whatsappUrl = new URL(MARKETING_CONTACTS.whatsapp);
  whatsappUrl.searchParams.set("text", copy.whatsappMessage);
  const emailUrl = new URL("mailto:" + MARKETING_CONTACTS.email);
  emailUrl.searchParams.set("subject", copy.subject);
  emailUrl.searchParams.set("body", copy.whatsappMessage + "\n\n" + packagePageUrl);

  const tierConfig = [
    { id: "singleListing", anchor: "package-tek-ilan", accent: "#4b8066" },
    { id: "growth", anchor: "package-buyume", accent: "#c6a46a" },
    { id: "professional", anchor: "package-profesyonel", accent: "#326c54" },
    { id: "enterprise", anchor: "packages-lead-title", accent: "#9cbba7" },
  ] as const;

  const packages = tierConfig.map(({ id, anchor, accent }) => {
    const item = copy.packages[id];
    return {
      name: item.name,
      audience: item.audience,
      description: item.description,
      scope: item.scope,
      durationLabel: copy.durationLabel,
      accent,
      cta: { label: copy.packageCta, url: packageUrl(anchor) },
    };
  });

  const opts = {
    locale,
    preheader: copy.preheader,
    heading: copy.heading,
    introHtml: [paragraph(copy.greeting), ...copy.paragraphs.map(paragraph)].join(""),
    sections: [
      { heading: copy.featuresHeading, html: "" },
      {
        heading: copy.packagesHeading,
        html: paragraph(copy.packagesLead) + paragraph(copy.pricingNote),
      },
    ],
    outroHtml: paragraph(copy.closing),
    buttons: [
      {
        label: copy.whatsappCta,
        url: whatsappUrl.toString(),
        lead: copy.whatsappLead,
      },
      {
        label: copy.secondaryCta,
        url: emailUrl.toString(),
        lead: copy.contactHeading,
      },
    ],
    signatureHtml: paragraph(copy.signOff),
    contacts: [
      {
        label: copy.contactLabels.email,
        value: MARKETING_CONTACTS.email,
        url: "mailto:" + MARKETING_CONTACTS.email,
      },
      {
        label: copy.contactLabels.phone,
        value: MARKETING_CONTACTS.phoneDisplay,
        url: "tel:" + MARKETING_CONTACTS.phoneTel,
      },
      {
        label: copy.contactLabels.whatsapp,
        value: MARKETING_CONTACTS.phoneDisplay,
        url: whatsappUrl.toString(),
      },
    ],
    contactsHeading: copy.contactHeading,
    footerNote: copy.footerNote,
    siteUrl: baseUrl.toString(),
    unsubscribeUrl: input.unsubscribeUrl,
    unsubscribeLabel: copy.unsubscribeLabel,
    hero: {
      hook: copy.heroHook,
      subhook: copy.heroSubhook,
      cta: { label: copy.primaryCta, url: packagePageUrl },
    },
    features: copy.features,
    packages,
  };

  return {
    subject: copy.subject,
    html: renderEmailLayout(opts),
    text: renderEmailText(opts),
  };
}
