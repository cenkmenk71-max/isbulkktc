/**
 * Localized copy for job match alert emails.
 *
 * Same contract as `email-copy-extras.ts`: every locale implements the whole
 * type, so a missing translation is a compile error rather than a silent
 * English fallback. All six supported locales are explicitly maintained.
 */

import { resolveEmailLocale, type EmailLocale } from "../../../supabase/functions/_shared/email-copy.ts";

export type JobMatchAlertCopy = {
  subject: string;
  heading: string;
  lead: string;
  jobsHeading: string;
  jobRow: string;
  cta: string;
  unsubscribeLabel: string;
  footerReason: string;
};

const tr: JobMatchAlertCopy = {
  subject: "Profilinize uygun yeni ilanlar",
  heading: "Sizin için eşleşen yeni ilanlar",
  lead: "Yayınlanan ilanlardan profilinize uygun olanları derledik. Hemen başvuru yapabilirsiniz.",
  jobsHeading: "Eşleşen ilanlar",
  jobRow: "{title} · {company}",
  cta: "İlanları görüntüle",
  unsubscribeLabel: "Bu bildirimleri iptal et",
  footerReason: "Bu e-postayı İşBul KKTC hesabınızdaki eşleşen ilan bildirimleri nedeniyle aldınız.",
};

const en: JobMatchAlertCopy = {
  subject: "New jobs matching your profile",
  heading: "New jobs matched to your profile",
  lead: "We gathered newly published listings that match your profile. Apply right away.",
  jobsHeading: "Matched jobs",
  jobRow: "{title} · {company}",
  cta: "View jobs",
  unsubscribeLabel: "Turn off these notifications",
  footerReason: "You received this email because of job match notifications on your İşBul KKTC account.",
};

const ru: JobMatchAlertCopy = {
  subject: "Новые вакансии, подходящие вашему профилю",
  heading: "Новые вакансии, подходящие вам",
  lead: "Мы собрали опубликованные вакансии, соответствующие вашему профилю. Откликайтесь сразу.",
  jobsHeading: "Подходящие вакансии",
  jobRow: "{title} · {company}",
  cta: "Посмотреть вакансии",
  unsubscribeLabel: "Отключить эти уведомления",
  footerReason: "Вы получили это письмо из-за уведомлений о подходящих вакансиях в вашем аккаунте İşBul KKTC.",
};

const el: JobMatchAlertCopy = {
  subject: "Νέες θέσεις που ταιριάζουν στο προφίλ σας",
  heading: "Νέες θέσεις που σας ταιριάζουν",
  lead: "Συγκεντρώσαμε νέες δημοσιευμένες θέσεις που ταιριάζουν στο προφίλ σας. Κάντε αίτηση αμέσως.",
  jobsHeading: "Ταιριάζουσες θέσεις",
  jobRow: "{title} · {company}",
  cta: "Προβολή θέσεων",
  unsubscribeLabel: "Απενεργοποίηση αυτών των ειδοποιήσεων",
  footerReason: "Λάβατε αυτό το email λόγω ειδοποιήσεων των των απόκρισης εργασίας στον λογαριασμό σας İşBul KKTC.",
};

const fa: JobMatchAlertCopy = {
  subject: "موقعیت‌های جدید متناسب با پروفایل شما",
  heading: "موقعیت‌های جدید متناسب با شما",
  lead: "آگهی‌های منتشر‌شده جدیدی متناسب با پروفایل شما جمع‌آوری کردیم. زودتر درخواست دهید.",
  jobsHeading: "موقعیت‌های متناسب",
  jobRow: "{title} · {company}",
  cta: "مشاهده موقعیت‌ها",
  unsubscribeLabel: "غیرفعال کردن این اعلانات",
  footerReason: "این ایمیل به دلیل اعلان‌های تطابق شغلی در حساب İşBul KKTC شما ارسال شد.",
};

const de: JobMatchAlertCopy = {
  subject: "Neue Stellen, die zu Ihrem Profil passen",
  heading: "Neue Stellen, die zu Ihnen passen",
  lead: "Wir haben neu veröffentlichte Anzeigen gesammelt, die zu Ihrem Profil passen. Bewerben Sie sich jetzt.",
  jobsHeading: "Passende Stellen",
  jobRow: "{title} · {company}",
  cta: "Stellen ansehen",
  unsubscribeLabel: "Diese Benachrichtigungen deaktivieren",
  footerReason: "Sie erhalten diese E-Mail aufgrund von Stellenübereinstimmungs-Benachrichtigungen in Ihrem İşBul KKTC-Konto.",
};

export const JOB_MATCH_ALERT_COPY: Record<EmailLocale, JobMatchAlertCopy> = {
  tr,
  en,
  ru,
  el,
  fa,
  de,
};

export function getJobMatchAlertCopy(
  locale: string | null | undefined,
): JobMatchAlertCopy {
  return JOB_MATCH_ALERT_COPY[resolveEmailLocale(locale)];
}
