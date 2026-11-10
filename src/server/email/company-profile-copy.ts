/**
 * Localized copy for the company-profile review emails (#465).
 *
 * The employer submits their profile for review, a `pending` row lands in
 * `company_profile_submissions`, and — before this module — nobody was told:
 * not the employer, not the review team. The submission then silently
 * disappeared until an admin happened to open the queue.
 *
 * `supabase/functions/_shared/**` (the shared transactional copy) belongs to
 * LANE-SUPABASE, so this family keeps its copy here, in the Node mailer's own
 * directory. Every locale implements the whole type, so a missing translation
 * is a compile error rather than a silent Turkish/English fallback.
 */

import {
  resolveEmailLocale,
  type EmailLocale,
} from "../../../supabase/functions/_shared/email-copy.ts";

export type CompanyProfileEmailCopy = {
  /** Sent to the employer after they submit their profile for review. */
  ackSubject: string;
  ackHeading: string;
  ackLead: string;
  ackStepsHeading: string;
  ackSteps: string[];
  ackCta: string;
  /** Sent to the platform review inbox. */
  teamSubject: string;
  teamHeading: string;
  teamLead: string;
  teamCta: string;
  teamDetailsHeading: string;
  companyLabel: string;
  categoriesLabel: string;
  websiteLabel: string;
  contactLabel: string;
  addressLabel: string;
  submittedByLabel: string;
  reviewNote: string;
};

const COPY: Record<EmailLocale, CompanyProfileEmailCopy> = {
  tr: {
    ackSubject: "Şirket profiliniz incelemeye alındı",
    ackHeading: "Şirket profiliniz incelemeye gönderildi",
    ackLead:
      "Şirket profiliniz ekibimize ulaştı. İnceleme tamamlandığında profiliniz İşBul KKTC'de yayına alınacak ve sonucu size e-posta ile bildireceğiz.",
    ackStepsHeading: "İnceleme süreci",
    ackSteps: [
      "Ekibimiz gönderdiğiniz bilgileri inceler",
      "Onaylanan profil şirket dizininde yayınlanır",
      "Sonucu bu e-posta adresine bildiririz",
    ],
    ackCta: "İşveren panelime git",
    teamSubject: "Yeni şirket profili gönderimi",
    teamHeading: "İncelenmeyi bekleyen yeni profil gönderimi",
    teamLead: "İnceleme kuyruğuna yeni bir şirket profili gönderimi geldi.",
    teamCta: "Yönetim panelini aç",
    teamDetailsHeading: "Gönderim ayrıntıları",
    companyLabel: "Şirket",
    categoriesLabel: "Kategoriler",
    websiteLabel: "Web sitesi",
    contactLabel: "İletişim",
    addressLabel: "Adres",
    submittedByLabel: "Gönderen",
    reviewNote:
      "Bu gönderimi yönetim panelindeki şirket profili kuyruğundan inceleyebilirsiniz.",
  },
  en: {
    ackSubject: "Your company profile is under review",
    ackHeading: "Your company profile was sent for review",
    ackLead:
      "Your company profile reached our team. Once the review is complete it will be published on İşBul KKTC, and we will email you the outcome.",
    ackStepsHeading: "What happens next",
    ackSteps: [
      "Our team reviews the details you submitted",
      "The approved profile is published in the company directory",
      "We email the outcome to this address",
    ],
    ackCta: "Go to my employer dashboard",
    teamSubject: "New company profile submission",
    teamHeading: "New profile submission awaiting review",
    teamLead: "A new company profile submission arrived in the review queue.",
    teamCta: "Open the admin area",
    teamDetailsHeading: "Submission details",
    companyLabel: "Company",
    categoriesLabel: "Categories",
    websiteLabel: "Website",
    contactLabel: "Contact",
    addressLabel: "Address",
    submittedByLabel: "Submitted by",
    reviewNote:
      "Review this submission from the company profile queue in the admin area.",
  },
  ru: {
    ackSubject: "Профиль вашей компании отправлен на проверку",
    ackHeading: "Профиль компании отправлен на проверку",
    ackLead:
      "Профиль вашей компании поступил в нашу команду. После проверки он будет опубликован на İşBul KKTC, и мы сообщим вам результат по электронной почте.",
    ackStepsHeading: "Что будет дальше",
    ackSteps: [
      "Наша команда проверяет указанные данные",
      "Одобренный профиль публикуется в каталоге компаний",
      "Результат мы отправим на этот адрес",
    ],
    ackCta: "Перейти в кабинет работодателя",
    teamSubject: "Новая заявка на профиль компании",
    teamHeading: "Новая заявка на проверку профиля",
    teamLead: "В очередь проверки поступила новая заявка на профиль компании.",
    teamCta: "Открыть панель администратора",
    teamDetailsHeading: "Детали заявки",
    companyLabel: "Компания",
    categoriesLabel: "Категории",
    websiteLabel: "Сайт",
    contactLabel: "Контакт",
    addressLabel: "Адрес",
    submittedByLabel: "Отправитель",
    reviewNote:
      "Проверьте эту заявку в очереди профилей компаний в панели администратора.",
  },
  el: {
    ackSubject: "Το προφίλ της εταιρείας σας υποβλήθηκε για έλεγχο",
    ackHeading: "Το προφίλ της εταιρείας σας στάλθηκε για έλεγχο",
    ackLead:
      "Το προφίλ της εταιρείας σας έφτασε στην ομάδα μας. Μόλις ολοκληρωθεί ο έλεγχος, θα δημοσιευτεί στο İşBul KKTC και θα σας ενημερώσουμε για το αποτέλεσμα με email.",
    ackStepsHeading: "Τι ακολουθεί",
    ackSteps: [
      "Η ομάδα μας ελέγχει τα στοιχεία που υποβάλατε",
      "Το εγκεκριμένο προφίλ δημοσιεύεται στον κατάλογο εταιρειών",
      "Το αποτέλεσμα αποστέλλεται σε αυτή τη διεύθυνση",
    ],
    ackCta: "Μετάβαση στον πίνακα εργοδότη",
    teamSubject: "Νέα υποβολή προφίλ εταιρείας",
    teamHeading: "Νέα υποβολή προφίλ προς έλεγχο",
    teamLead: "Μια νέα υποβολή προφίλ εταιρείας έφτασε στην ουρά ελέγχου.",
    teamCta: "Άνοιγμα περιοχής διαχείρισης",
    teamDetailsHeading: "Στοιχεία υποβολής",
    companyLabel: "Εταιρεία",
    categoriesLabel: "Κατηγορίες",
    websiteLabel: "Ιστότοπος",
    contactLabel: "Επικοινωνία",
    addressLabel: "Διεύθυνση",
    submittedByLabel: "Υποβολή από",
    reviewNote:
      "Ελέγξτε αυτή την υποβολή από την ουρά προφίλ εταιρειών στην περιοχή διαχείρισης.",
  },
  fa: {
    ackSubject: "پروفایل شرکت شما برای بررسی ارسال شد",
    ackHeading: "پروفایل شرکت شما برای بررسی ارسال شد",
    ackLead:
      "پروفایل شرکت شما به تیم ما رسید. پس از پایان بررسی، پروفایل شما در İşBul KKTC منتشر می‌شود و نتیجه را از طریق ایمیل به شما اطلاع می‌دهیم.",
    ackStepsHeading: "مراحل بعدی",
    ackSteps: [
      "تیم ما اطلاعات ارسالی شما را بررسی می‌کند",
      "پروفایل تأییدشده در فهرست شرکت‌ها منتشر می‌شود",
      "نتیجه به همین نشانی ایمیل فرستاده می‌شود",
    ],
    ackCta: "رفتن به پنل کارفرما",
    teamSubject: "ارسال پروفایل جدید شرکت",
    teamHeading: "پروفایل جدید در انتظار بررسی",
    teamLead: "درخواست جدیدی برای پروفایل شرکت در صف بررسی رسید.",
    teamCta: "باز کردن بخش مدیریت",
    teamDetailsHeading: "جزئیات درخواست",
    companyLabel: "شرکت",
    categoriesLabel: "دسته‌ها",
    websiteLabel: "وب‌سایت",
    contactLabel: "تماس",
    addressLabel: "نشانی",
    submittedByLabel: "ارسال‌کننده",
    reviewNote: "این درخواست را از صف پروفایل شرکت‌ها در بخش مدیریت بررسی کنید.",
  },
  de: {
    ackSubject: "Ihr Firmenprofil wird geprüft",
    ackHeading: "Ihr Firmenprofil wurde zur Prüfung gesendet",
    ackLead:
      "Ihr Firmenprofil ist bei unserem Team eingegangen. Nach Abschluss der Prüfung wird es auf İşBul KKTC veröffentlicht, und wir informieren Sie per E-Mail über das Ergebnis.",
    ackStepsHeading: "Wie es weitergeht",
    ackSteps: [
      "Unser Team prüft die von Ihnen übermittelten Angaben",
      "Das freigegebene Profil wird im Firmenverzeichnis veröffentlicht",
      "Das Ergebnis senden wir an diese Adresse",
    ],
    ackCta: "Zum Arbeitgeber-Dashboard",
    teamSubject: "Neue Einreichung eines Firmenprofils",
    teamHeading: "Neue Profileinreichung zur Prüfung",
    teamLead: "Eine neue Profileinreichung ist in der Prüf-Warteschlange eingegangen.",
    teamCta: "Admin-Bereich öffnen",
    teamDetailsHeading: "Details zur Einreichung",
    companyLabel: "Unternehmen",
    categoriesLabel: "Kategorien",
    websiteLabel: "Website",
    contactLabel: "Kontakt",
    addressLabel: "Adresse",
    submittedByLabel: "Eingereicht von",
    reviewNote:
      "Prüfen Sie diese Einreichung in der Warteschlange für Firmenprofile im Admin-Bereich.",
  },
};

export function getCompanyProfileCopy(
  locale: string | null | undefined,
): CompanyProfileEmailCopy {
  return COPY[resolveEmailLocale(locale)];
}
