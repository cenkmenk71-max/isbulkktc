import "server-only";

import { getLocalePrefix, isAppLocale, type AppLocale } from "@/i18n/routing";

/**
 * Notification copy for push payloads, in every shipped locale.
 *
 * This lives server-side and mirrors the email templates rather than reusing
 * them: a push payload is capped by the push service (a few kilobytes, and iOS
 * truncates aggressively), so it carries a short line and a link, not a rendered
 * document. Keeping it here also means the payload never needs the recipient's
 * profile to be joined in — only their locale.
 *
 * The link is always built from a locale prefix plus a relative route, so a push
 * can never point outside the app.
 */

type ApplicationEventType = "submitted" | "viewed" | "status_changed";

type Copy = { title: string; body: (jobTitle: string, status: string) => string };

const statusLabels: Record<AppLocale, Record<string, string>> = {
  tr: {
    submitted: "Başvuruldu",
    reviewing: "İnceleniyor",
    shortlisted: "Kısa listeye alındı",
    rejected: "Reddedildi",
    hired: "İşe alındı",
    withdrawn: "Geri çekildi",
  },
  en: {
    submitted: "Submitted",
    reviewing: "Under review",
    shortlisted: "Shortlisted",
    rejected: "Not selected",
    hired: "Hired",
    withdrawn: "Withdrawn",
  },
  ru: {
    submitted: "Отправлено",
    reviewing: "На рассмотрении",
    shortlisted: "В шорт-листе",
    rejected: "Отказ",
    hired: "Принят",
    withdrawn: "Отозвано",
  },
  el: {
    submitted: "Υποβλήθηκε",
    reviewing: "Υπό εξέταση",
    shortlisted: "Στη λίστα",
    rejected: "Απορρίφθηκε",
    hired: "Προσλήφθηκε",
    withdrawn: "Αποσύρθηκε",
  },
  fa: {
    submitted: "ارسال شد",
    reviewing: "در حال بررسی",
    shortlisted: "فهرست کوتاه",
    rejected: "رد شد",
    hired: "استخدام شد",
    withdrawn: "لغو شد",
  },
  de: {
    submitted: "Beworben",
    reviewing: "In Prüfung",
    shortlisted: "In der Auswahl",
    rejected: "Abgelehnt",
    hired: "Eingestellt",
    withdrawn: "Zurückgezogen",
  },
};

const copy: Record<AppLocale, Record<ApplicationEventType, Copy>> = {
  tr: {
    submitted: {
      title: "Başvurunuz alındı",
      body: (job) => `${job} ilanına başvurunuz alındı.`,
    },
    viewed: {
      title: "Başvurunuz görüntülendi",
      body: (job) => `${job} ilanı için başvurunuz işveren tarafından görüntülendi.`,
    },
    status_changed: {
      title: "Başvuru durumu güncellendi",
      body: (job, status) => `${job}: yeni durum — ${status}.`,
    },
  },
  en: {
    submitted: {
      title: "Application received",
      body: (job) => `Your application for ${job} was received.`,
    },
    viewed: {
      title: "Your application was viewed",
      body: (job) => `The employer viewed your application for ${job}.`,
    },
    status_changed: {
      title: "Application status updated",
      body: (job, status) => `${job}: new status — ${status}.`,
    },
  },
  ru: {
    submitted: {
      title: "Отклик получен",
      body: (job) => `Ваш отклик на вакансию ${job} получен.`,
    },
    viewed: {
      title: "Ваш отклик просмотрен",
      body: (job) => `Работодатель просмотрел ваш отклик на ${job}.`,
    },
    status_changed: {
      title: "Статус отклика обновлён",
      body: (job, status) => `${job}: новый статус — ${status}.`,
    },
  },
  el: {
    submitted: {
      title: "Η αίτηση ελήφθη",
      body: (job) => `Η αίτησή σας για ${job} ελήφθη.`,
    },
    viewed: {
      title: "Η αίτησή σας προβλήθηκε",
      body: (job) => `Ο εργοδότης προέβαλε την αίτησή σας για ${job}.`,
    },
    status_changed: {
      title: "Η κατάσταση ενημερώθηκε",
      body: (job, status) => `${job}: νέα κατάσταση — ${status}.`,
    },
  },
  fa: {
    submitted: {
      title: "درخواست دریافت شد",
      body: (job) => `درخواست شما برای ${job} دریافت شد.`,
    },
    viewed: {
      title: "درخواست شما دیده شد",
      body: (job) => `کارفرما درخواست شما را برای ${job} مشاهده کرد.`,
    },
    status_changed: {
      title: "وضعیت درخواست به‌روز شد",
      body: (job, status) => `${job}: وضعیت جدید — ${status}.`,
    },
  },
  de: {
    submitted: {
      title: "Bewerbung eingegangen",
      body: (job) => `Ihre Bewerbung für ${job} ist eingegangen.`,
    },
    viewed: {
      title: "Ihre Bewerbung wurde angesehen",
      body: (job) => `Der Arbeitgeber hat Ihre Bewerbung für ${job} angesehen.`,
    },
    status_changed: {
      title: "Bewerbungsstatus aktualisiert",
      body: (job, status) => `${job}: neuer Status — ${status}.`,
    },
  },
};

export type ApplicationPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

/**
 * The category a notification belongs to, so the recipient's preference toggle
 * is honoured. Submitted/viewed/status changes are all application updates.
 */
export const applicationNotificationCategory = "application_updates" as const;

export function buildApplicationPushPayload(input: {
  eventType: string;
  toStatus: string | null;
  jobTitle: string;
  applicationId: string;
  locale: string | null;
}): ApplicationPushPayload {
  const locale: AppLocale = isAppLocale(input.locale ?? "") ? (input.locale as AppLocale) : "tr";
  const eventType: ApplicationEventType =
    input.eventType === "submitted" || input.eventType === "viewed"
      ? input.eventType
      : "status_changed";
  const entry = copy[locale][eventType];
  const statusLabel =
    statusLabels[locale][input.toStatus ?? ""] ?? statusLabels[locale].submitted;

  return {
    title: entry.title,
    body: entry.body(input.jobTitle, statusLabel),
    // The candidate dashboard is guarded; an expired session bounces to
    // sign-in with the destination preserved, so the link stays useful. The
    // anchor targets the applications section and matches the email CTA.
    url: `${getLocalePrefix(locale)}/profile/dashboard#my-applications`,
    // Tagging by application collapses successive updates to one row on the
    // lock screen instead of stacking a notification per status change.
    tag: `application-${input.applicationId}`,
  };
}
