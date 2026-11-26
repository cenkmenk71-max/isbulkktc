/**
 * Localized copy for the company-profile auto-verified emails.
 *
 * When a company profile is submitted and immediately verified (self-serve),
 * two emails are sent:
 * 1. Welcome email to the employer with next steps
 * 2. Admin notification with full company details for record-keeping
 *
 * 6 locales: tr, en, ru, el, fa, de
 */

import {
  resolveEmailLocale,
  type EmailLocale,
} from "../../../supabase/functions/_shared/email-copy.ts";

export type CompanyProfileVerifiedEmailCopy = {
  /** Sent to the employer after their profile is auto-verified. */
  employerSubject: string;
  employerHeading: string;
  employerLead: string;
  employerDetailsHeading: string;
  employerCompanyLabel: string;
  employerCategoriesLabel: string;
  employerWebsiteLabel: string;
  employerContactLabel: string;
  employerAddressLabel: string;
  employerNextStepsHeading: string;
  employerNextSteps: string[];
  employerCta: string;
  employerCtaUrl: string;
  employerSupportNote: string;
  /** Sent to the admin inbox (info@isbulkktc.com) for record-keeping. */
  adminSubject: string;
  adminHeading: string;
  adminLead: string;
  adminDetailsHeading: string;
  adminCompanyLabel: string;
  adminCategoriesLabel: string;
  adminWebsiteLabel: string;
  adminContactLabel: string;
  adminAddressLabel: string;
  adminSubmittedByLabel: string;
  adminReviewLink: string;
  adminReviewLinkText: string;
};

const COPY: Record<EmailLocale, CompanyProfileVerifiedEmailCopy> = {
  tr: {
    employerSubject: "Şirket profiliniz oluşturuldu ve yayınlandı — İşBul KKTC",
    employerHeading: "Şirket profiliniz oluşturuldu ve yayınlandı",
    employerLead: "Tebrikler! Şirket profiliniz doğrulandı ve İşBul KKTC şirket rehberinde yayına alındı.",
    employerDetailsHeading: "Profil özeti",
    employerCompanyLabel: "Şirket",
    employerCategoriesLabel: "Kategoriler",
    employerWebsiteLabel: "Web sitesi",
    employerContactLabel: "İletişim",
    employerAddressLabel: "Adres",
    employerNextStepsHeading: "Sonraki adım: İlan paketi seçin",
    employerNextSteps: [
      "İlan paketlerimizi inceleyin ve ihtiyacınıza uygun olanı seçin",
      "WhatsApp veya e-posta ile bizimle iletişime geçin",
      "Ödeme onaylandıktan hemen sonra ilan hakkınız aktif olur",
    ],
    employerCta: "Paketleri incele",
    employerCtaUrl: "/packages",
    employerSupportNote: "Herhangi bir sorunuz olursa info@isbulkktc.com adresinden bize ulaşabilirsiniz.",
    adminSubject: "Yeni şirket profili otomatik doğrulandı",
    adminHeading: "Yeni şirket profili oluşturuldu ve yayınlandı",
    adminLead: "Aşağıdaki şirket profili otomatik doğrulama sürecinden geçerek yayına alındı.",
    adminDetailsHeading: "Şirket detayları",
    adminCompanyLabel: "Şirket",
    adminCategoriesLabel: "Kategoriler",
    adminWebsiteLabel: "Web sitesi",
    adminContactLabel: "İletişim",
    adminAddressLabel: "Adres",
    adminSubmittedByLabel: "Oluşturan",
    adminReviewLink: "/admin/company-profiles",
    adminReviewLinkText: "Yönetim panelinde şirket profillerini görüntüle",
  },
  en: {
    employerSubject: "Your company profile has been created and published — İşBul KKTC",
    employerHeading: "Your company profile has been created and published",
    employerLead: "Congratulations! Your company profile has been verified and published in the İşBul KKTC company directory.",
    employerDetailsHeading: "Profile summary",
    employerCompanyLabel: "Company",
    employerCategoriesLabel: "Categories",
    employerWebsiteLabel: "Website",
    employerContactLabel: "Contact",
    employerAddressLabel: "Address",
    employerNextStepsHeading: "Next step: Choose a listing package",
    employerNextSteps: [
      "Review our listing packages and select the one that fits your needs",
      "Contact us via WhatsApp or email",
      "Your listing allowance activates immediately after payment confirmation",
    ],
    employerCta: "View packages",
    employerCtaUrl: "/packages",
    employerSupportNote: "If you have any questions, contact us at info@isbulkktc.com.",
    adminSubject: "New company profile auto-verified",
    adminHeading: "New company profile created and published",
    adminLead: "The following company profile was auto-verified and published via the self-serve flow.",
    adminDetailsHeading: "Company details",
    adminCompanyLabel: "Company",
    adminCategoriesLabel: "Categories",
    adminWebsiteLabel: "Website",
    adminContactLabel: "Contact",
    adminAddressLabel: "Address",
    adminSubmittedByLabel: "Created by",
    adminReviewLink: "/admin/company-profiles",
    adminReviewLinkText: "View company profiles in admin panel",
  },
  ru: {
    employerSubject: "Профиль вашей компании создан и опубликован — İşBul KKTC",
    employerHeading: "Профиль вашей компании создан и опубликован",
    employerLead: "Поздравляем! Профиль вашей компании верифицирован и опубликован в каталоге компаний İşBul KKTC.",
    employerDetailsHeading: "Сводка профиля",
    employerCompanyLabel: "Компания",
    employerCategoriesLabel: "Категории",
    employerWebsiteLabel: "Веб-сайт",
    employerContactLabel: "Контакты",
    employerAddressLabel: "Адрес",
    employerNextStepsHeading: "Следующий шаг: выберите пакет объявлений",
    employerNextSteps: [
      "Изучите наши пакеты объявлений и выберите подходящий",
      "Свяжитесь с нами через WhatsApp или электронную почту",
      "Ваш лимит объявлений активируется сразу после подтверждения оплаты",
    ],
    employerCta: "Посмотреть пакеты",
    employerCtaUrl: "/packages",
    employerSupportNote: "Если у вас есть вопросы, напишите нам на info@isbulkktc.com.",
    adminSubject: "Новый профиль компании автоматически верифицирован",
    adminHeading: "Новый профиль компании создан и опубликован",
    adminLead: "Следующий профиль компании прошел автоматическую верификацию и был опубликован через самообслуживание.",
    adminDetailsHeading: "Детали компании",
    adminCompanyLabel: "Компания",
    adminCategoriesLabel: "Категории",
    adminWebsiteLabel: "Веб-сайт",
    adminContactLabel: "Контакты",
    adminAddressLabel: "Адрес",
    adminSubmittedByLabel: "Создано пользователем",
    adminReviewLink: "/admin/company-profiles",
    adminReviewLinkText: "Просмотреть профили компаний в админ-панели",
  },
  el: {
    employerSubject: "Το προφίλ της εταιρείας σας δημιουργήθηκε και δημοσιεύτηκε — İşBul KKTC",
    employerHeading: "Το προφίλ της εταιρείας σας δημιουργήθηκε και δημοσιεύτηκε",
    employerLead: "Συγχαρητήρια! Το προφίλ της εταιρείας σας επαληθεύτηκε και δημοσιεύθηκε στον κατάλογο εταιρειών του İşBul KKTC.",
    employerDetailsHeading: "Περίληψη προφίλ",
    employerCompanyLabel: "Εταιρεία",
    employerCategoriesLabel: "Κατηγορίες",
    employerWebsiteLabel: "Ιστότοπος",
    employerContactLabel: "Επικοινωνία",
    employerAddressLabel: "Διεύθυνση",
    employerNextStepsHeading: "Επόμενο βήμα: Επιλέξτε πακέτο αγγελιών",
    employerNextSteps: [
      "Εξετάστε τα πακέτα αγγελιών μας και επιλέξτε αυτό που ταιριάζει στις ανάγκες σας",
      "Επικοινωνήστε μαζί μας μέσω WhatsApp ή email",
      "Το όριο αγγελιών σας ενεργοποιείται αμέσως μετά την επιβεβαίωση πληρωμής",
    ],
    employerCta: "Δείτε τα πακέτα",
    employerCtaUrl: "/packages",
    employerSupportNote: "Αν έχετε οποιαδήποτε ερώτηση, επικοινωνήστε μαζί μας στο info@isbulkktc.com.",
    adminSubject: "Νέο προφίλ εταιρείας επαληθεύτηκε αυτόματα",
    adminHeading: "Νέο προφίλ εταιρείας δημιουργήθηκε και δημοσιεύτηκε",
    adminLead: "Το παρακάτω προφίλ εταιρείας επαληθεύτηκε αυτόματα και δημοσιεύθηκε μέσω της ροής αυτοεξυπηρέτησης.",
    adminDetailsHeading: "Στοιχεία εταιρείας",
    adminCompanyLabel: "Εταιρεία",
    adminCategoriesLabel: "Κατηγορίες",
    adminWebsiteLabel: "Ιστότοπος",
    adminContactLabel: "Επικοινωνία",
    adminAddressLabel: "Διεύθυνση",
    adminSubmittedByLabel: "Δημιουργήθηκε από",
    adminReviewLink: "/admin/company-profiles",
    adminReviewLinkText: "Προβολή προφίλ εταιρειών στον πίνακα διαχείρισης",
  },
  fa: {
    employerSubject: "پروفایل شرکت شما ایجاد و منتشر شد — İşBul KKTC",
    employerHeading: "پروفایل شرکت شما ایجاد و منتشر شد",
    employerLead: "تبریک! پروفایل شرکت شما تأیید شده و در فهرست شرکت‌های İşBul KKTC منتشر گردید.",
    employerDetailsHeading: "خلاصه پروفایل",
    employerCompanyLabel: "شرکت",
    employerCategoriesLabel: "دسته‌ها",
    employerWebsiteLabel: "وب‌سایت",
    employerContactLabel: "تماس",
    employerAddressLabel: "نشانی",
    employerNextStepsHeading: "مرحله بعد: انتخاب بسته آگهی",
    employerNextSteps: [
      "بسته‌های آگهی ما را بررسی کنید و بسته مناسب نیازهای خود را انتخاب کنید",
      "از طریق WhatsApp یا ایمیل با ما تماس بگیرید",
      "سهم آگهی شما بلافاصله بعد از تأیید پرداخت فعال می‌شود",
    ],
    employerCta: "مشاهده بسته‌ها",
    employerCtaUrl: "/packages",
    employerSupportNote: "در صورت هرگونه سوال، با ما از طریق info@isbulkktc.com تماس بگیرید.",
    adminSubject: "پروفایل جدید شرکت به‌طور خودکار تأیید شد",
    adminHeading: "پروفایل جدید شرکت ایجاد و منتشر شد",
    adminLead: "پروفایل شرکت زیر از طریق فرآیند خودсерلیک از استعلام به تأیید و انتشار رسیده است.",
    adminDetailsHeading: "جزئیات شرکت",
    adminCompanyLabel: "شرکت",
    adminCategoriesLabel: "دسته‌ها",
    adminWebsiteLabel: "وب‌سایت",
    adminContactLabel: "تماس",
    adminAddressLabel: "نشانی",
    adminSubmittedByLabel: "ایجادکننده",
    adminReviewLink: "/admin/company-profiles",
    adminReviewLinkText: "مشاهده پروفایل‌های شرکت در پنل مدیریت",
  },
  de: {
    employerSubject: "Ihr Firmenprofil wurde erstellt und veröffentlicht — İşBul KKTC",
    employerHeading: "Ihr Firmenprofil wurde erstellt und veröffentlicht",
    employerLead: "Herzlichen Glückwunsch! Ihr Firmenprofil wurde verifiziert und im İşBul KKTC-Firmenverzeichnis veröffentlicht.",
    employerDetailsHeading: "Profilübersicht",
    employerCompanyLabel: "Unternehmen",
    employerCategoriesLabel: "Kategorien",
    employerWebsiteLabel: "Website",
    employerContactLabel: "Kontakt",
    employerAddressLabel: "Adresse",
    employerNextStepsHeading: "Nächster Schritt: Anzeigenpaket wählen",
    employerNextSteps: [
      "Prüfen Sie unsere Anzeigenpakete und wählen Sie das passende aus",
      "Kontaktieren Sie uns per WhatsApp oder E-Mail",
      "Ihr Anzeigenkontingent wird sofort nach Zahlungsbestätigung aktiviert",
    ],
    employerCta: "Pakete ansehen",
    employerCtaUrl: "/packages",
    employerSupportNote: "Bei Fragen kontaktieren Sie uns unter info@isbulkktc.com.",
    adminSubject: "Neues Firmenprofil automatisch verifiziert",
    adminHeading: "Neues Firmenprofil erstellt und veröffentlicht",
    adminLead: "Das folgende Firmenprofil wurde über den Self-Service-Flow automatisch verifiziert und veröffentlicht.",
    adminDetailsHeading: "Firmendetails",
    adminCompanyLabel: "Unternehmen",
    adminCategoriesLabel: "Kategorien",
    adminWebsiteLabel: "Website",
    adminContactLabel: "Kontakt",
    adminAddressLabel: "Adresse",
    adminSubmittedByLabel: "Erstellt von",
    adminReviewLink: "/admin/company-profiles",
    adminReviewLinkText: "Firmenprofile im Admin-Bereich anzeigen",
  },
};

export function getCompanyProfileVerifiedCopy(
  locale: string | null | undefined,
): CompanyProfileVerifiedEmailCopy {
  return COPY[resolveEmailLocale(locale)];
}