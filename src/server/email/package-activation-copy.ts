/**
 * Localized copy for the package activation email.
 *
 * Sent to the employer when their payment is confirmed and the package becomes active.
 * 6 locales: tr, en, ru, el, fa, de
 */

import {
  resolveEmailLocale,
  type EmailLocale,
} from "../../../supabase/functions/_shared/email-copy.ts";

export type PackageActivationEmailCopy = {
  subject: string;
  heading: string;
  lead: string;
  detailsHeading: string;
  packageLabel: string;
  jobsLabel: string;
  durationLabel: string;
  stepsHeading: string;
  steps: string[];
  cta: string;
  ctaUrl: string;
  supportNote: string;
};

const COPY: Record<EmailLocale, PackageActivationEmailCopy> = {
  tr: {
    subject: "İlan paketiniz aktif — İşBul KKTC",
    heading: "İlan paketiniz aktif edildi",
    lead: "Ödemeniz onaylandı ve ilan paketiniz artık kullanıma hazır.",
    detailsHeading: "Paket detayları",
    packageLabel: "Paket",
    jobsLabel: "Aktif ilan hakkı",
    durationLabel: "İlan süresi",
    stepsHeading: "Şimdi ne yapabilirsiniz?",
    steps: [
      "İş ilanları oluşturun ve yayınlayın",
      "Aday başvurularını işveren panelinden takip edin",
      "Paket süresi dolmadan ilanlarınızı yönetin",
    ],
    cta: "İlan oluştur",
    ctaUrl: "/company/jobs/new",
    supportNote: "Herhangi bir sorunuz olursa info@isbulkktc.com adresinden bize ulaşabilirsiniz.",
  },
  en: {
    subject: "Your listing package is active — İşBul KKTC",
    heading: "Your listing package has been activated",
    lead: "Your payment has been confirmed and your listing package is now ready to use.",
    detailsHeading: "Package details",
    packageLabel: "Package",
    jobsLabel: "Active job allowance",
    durationLabel: "Listing duration",
    stepsHeading: "What you can do now",
    steps: [
      "Create and publish job listings",
      "Track candidate applications from your employer dashboard",
      "Manage your listings until the package expires",
    ],
    cta: "Create a listing",
    ctaUrl: "/company/jobs/new",
    supportNote: "If you have any questions, contact us at info@isbulkktc.com.",
  },
  ru: {
    subject: "Ваш пакет объявлений активирован — İşBul KKTC",
    heading: "Ваш пакет объявлений активирован",
    lead: "Ваш платеж подтвержден, и пакет объявлений теперь готов к использованию.",
    detailsHeading: "Детали пакета",
    packageLabel: "Пакет",
    jobsLabel: "Лимит активных объявлений",
    durationLabel: "Срок объявления",
    stepsHeading: "Что вы можете сделать сейчас",
    steps: [
      "Создавайте и публикуйте объявления о вакансиях",
      "Отслеживайте отклики кандидатов в кабинете работодателя",
      "Управляйте своими объявлениями до истечения срока пакета",
    ],
    cta: "Создать объявление",
    ctaUrl: "/company/jobs/new",
    supportNote: "Если у вас есть вопросы, свяжитесь с нами по адресу info@isbulkktc.com.",
  },
  el: {
    subject: "Το πακέτο αγγελιών σας ενεργοποιήθηκε — İşBul KKTC",
    heading: "Το πακέτο αγγελιών σας ενεργοποιήθηκε",
    lead: "Η πληρωμή σας επιβεβαιώθηκε και το πακέτο αγγελιών σας είναι πλέον έτοιμο για χρήση.",
    detailsHeading: "Στοιχεία πακέτου",
    packageLabel: "Πακέτο",
    jobsLabel: "Όριο ενεργών αγγελιών",
    durationLabel: "Διάρκεια αγγελίας",
    stepsHeading: "Τι μπορείτε να κάνετε τώρα",
    steps: [
      "Δημιουργήστε και δημοσιεύστε αγγελίες εργασίας",
      "Παρακολουθήστε τις αιτήσεις υποψηφίων από τον πίνακα εργοδότη",
      "Διαχειριστείτε τις αγγελίες σας μέχρι να λήξει το πακέτο",
    ],
    cta: "Δημιουργία αγγελίας",
    ctaUrl: "/company/jobs/new",
    supportNote: "Αν έχετε οποιαδήποτε ερώτηση, επικοινωνήστε μαζί μας στο info@isbulkktc.com.",
  },
  fa: {
    subject: "بسته آگهی شما فعال شد — İşBul KKTC",
    heading: "بسته آگهی شما فعال شد",
    lead: "پرداخت شما تأیید شد و بسته آگهی شما اکنون برای استفاده آماده است.",
    detailsHeading: "جزئیات بسته",
    packageLabel: "بسته",
    jobsLabel: "سهم آگهی فعال",
    durationLabel: "مدت آگهی",
    stepsHeading: "اکنون چه می‌توانید انجام دهید؟",
    steps: [
      "آگهی‌های شغل ایجاد و منتشر کنید",
      "درخواست‌های نامزدها را از پنل کارفرما پیگیری کنید",
      "آگهی‌های خود را تا انقضای بسته مدیریت کنید",
    ],
    cta: "ایجاد آگهی",
    ctaUrl: "/company/jobs/new",
    supportNote: "در صورت هرگونه سوال، با ما از طریق info@isbulkktc.com تماس بگیرید.",
  },
  de: {
    subject: "Ihr Anzeigenpaket ist aktiv — İşBul KKTC",
    heading: "Ihr Anzeigenpaket wurde aktiviert",
    lead: "Ihre Zahlung wurde bestätigt und Ihr Anzeigenpaket ist nun einsatzbereit.",
    detailsHeading: "Paketdetails",
    packageLabel: "Paket",
    jobsLabel: "Aktives Anzeigenkontingent",
    durationLabel: "Anzeigendauer",
    stepsHeading: "Was Sie jetzt tun können",
    steps: [
      "Stellenanzeigen erstellen und veröffentlichen",
      "Bewerbungen im Arbeitgeber-Dashboard verfolgen",
      "Ihre Anzeigen bis zum Paketablauf verwalten",
    ],
    cta: "Anzeige erstellen",
    ctaUrl: "/company/jobs/new",
    supportNote: "Bei Fragen kontaktieren Sie uns unter info@isbulkktc.com.",
  },
};

export function getPackageActivationCopy(
  locale: string | null | undefined,
): PackageActivationEmailCopy {
  return COPY[resolveEmailLocale(locale)];
}