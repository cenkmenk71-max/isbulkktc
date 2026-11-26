/**
 * Localized copy for the job-published admin notification email.
 *
 * Sent to info@isbulkktc.com when a job is successfully published.
 * 6 locales: tr, en, ru, el, fa, de
 */

import {
  resolveEmailLocale,
  type EmailLocale,
} from "../../../supabase/functions/_shared/email-copy.ts";

export type JobPublishedAdminEmailCopy = {
  subject: string;
  heading: string;
  lead: string;
  detailsHeading: string;
  companyLabel: string;
  titleLabel: string;
  districtLabel: string;
  durationLabel: string;
  jobLinkLabel: string;
  adminLink: string;
  adminLinkText: string;
};

const COPY: Record<EmailLocale, JobPublishedAdminEmailCopy> = {
  tr: {
    subject: "Yeni iş ilanı yayınlandı — İşBul KKTC",
    heading: "Yeni iş ilanı yayına alındı",
    lead: "Aşağıdaki iş ilanı İşBul KKTC platformunda yayına alındı.",
    detailsHeading: "İlan detayları",
    companyLabel: "Şirket",
    titleLabel: "İlan başlığı",
    districtLabel: "İlçe",
    durationLabel: "İlan süresi",
    jobLinkLabel: "İlan linki",
    adminLink: "/admin/jobs",
    adminLinkText: "Yönetim panelinde ilanları görüntüle",
  },
  en: {
    subject: "New job listing published — İşBul KKTC",
    heading: "New job listing published",
    lead: "The following job listing has been published on the İşBul KKTC platform.",
    detailsHeading: "Listing details",
    companyLabel: "Company",
    titleLabel: "Listing title",
    districtLabel: "District",
    durationLabel: "Listing duration",
    jobLinkLabel: "Listing link",
    adminLink: "/admin/jobs",
    adminLinkText: "View job listings in admin panel",
  },
  ru: {
    subject: "Новое объявление опубликовано — İşBul KKTC",
    heading: "Новое объявление опубликовано",
    lead: "Следующее объявление было опубликовано на платформе İşBul KKTC.",
    detailsHeading: "Детали объявления",
    companyLabel: "Компания",
    titleLabel: "Название объявления",
    districtLabel: "Район",
    durationLabel: "Срок публикации",
    jobLinkLabel: "Ссылка на объявление",
    adminLink: "/admin/jobs",
    adminLinkText: "Просмотреть объявления в админ-панели",
  },
  el: {
    subject: "Νέα αγγελία εργασίας δημοσιεύτηκε — İşBul KKTC",
    heading: "Νέα αγγελία εργασίας δημοσιεύτηκε",
    lead: "Η παρακάτω αγγελία εργασίας δημοσιεύθηκε στην πλατφόρμα İşBul KKTC.",
    detailsHeading: "Στοιχεία αγγελίας",
    companyLabel: "Εταιρεία",
    titleLabel: "Τίτλος αγγελίας",
    districtLabel: "Περιοχή",
    durationLabel: "Διάρκεια αγγελίας",
    jobLinkLabel: "Σύνδεσμος αγγελίας",
    adminLink: "/admin/jobs",
    adminLinkText: "Προβολή αγγελιών στον πίνακα διαχείρισης",
  },
  fa: {
    subject: "آگهی جدید شغل منتشر شد — İşBul KKTC",
    heading: "آگهی جدید شغل منتشر شد",
    lead: "آگهی شغلی زیر در پلتفرم İşBul KKTC منتشر گردید.",
    detailsHeading: "جزئیات آگهی",
    companyLabel: "شرکت",
    titleLabel: "عنوان آگهی",
    districtLabel: "منطقه",
    durationLabel: "مدت آگهی",
    jobLinkLabel: "لینک آگهی",
    adminLink: "/admin/jobs",
    adminLinkText: "مشاهده آگهی‌ها در پنل مدیریت",
  },
  de: {
    subject: "Neue Stellenanzeige veröffentlicht — İşBul KKTC",
    heading: "Neue Stellenanzeige veröffentlicht",
    lead: "Die folgende Stellenanzeige wurde auf der İşBul KKTC-Plattform veröffentlicht.",
    detailsHeading: "Anzeigendetails",
    companyLabel: "Unternehmen",
    titleLabel: "Anzeigentitel",
    districtLabel: "Bezirk",
    durationLabel: "Anzeigendauer",
    jobLinkLabel: "Anzeigen-Link",
    adminLink: "/admin/jobs",
    adminLinkText: "Stellenanzeigen im Admin-Bereich anzeigen",
  },
};

export function getJobPublishedAdminCopy(
  locale: string | null | undefined,
): JobPublishedAdminEmailCopy {
  return COPY[resolveEmailLocale(locale)];
}