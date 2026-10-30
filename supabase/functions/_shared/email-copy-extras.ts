/**
 * Localized copy for the newer email families — listing published, CV received,
 * sales/lead and engagement. Kept in its own module so the original
 * `email-copy.ts` contract stays stable and the two can be reviewed apart.
 *
 * Same contract as `email-copy.ts`: every locale implements the whole type, so a
 * missing translation is a compile error rather than a silent English fallback.
 */

import { resolveEmailLocale, type EmailLocale } from "./email-copy.ts";

export type EmailCopyExtras = {
  jobPublished: {
    subject: string;
    heading: string;
    lead: string;
    steps: string[];
    cta: string;
  };
  resume: {
    subject: string;
    heading: string;
    lead: string;
    steps: string[];
    cta: string;
    /** Shown when the candidate imported a file into an existing profile. */
    updateSubject: string;
    updateHeading: string;
    updateLead: string;
  };
  sales: {
    /** Sent to the person who asked for a quote. */
    ackSubject: string;
    ackHeading: string;
    ackLead: string;
    ackCta: string;
    /** Sent to the team inbox. */
    teamSubject: string;
    teamHeading: string;
    leadLabel: string;
    planLabel: string;
    durationLabel: string;
    messageLabel: string;
  };
  engagement: {
    subject: string;
    heading: string;
    lead: string;
    jobsHeading: string;
    cta: string;
    /** Plain-text line for a job row in the digest. */
    jobRow: string;
    unsubscribeNote: string;
    unsubscribeLabel: string;
  };
  labels: {
    profileLabel: string;
    jobLabel: string;
    companyLabel: string;
  };
};

const tr: EmailCopyExtras = {
  jobPublished: {
    subject: "İlanınız yayında",
    heading: "İlanınız yayına alındı",
    lead: "İlanınız onaylandı ve artık İşBul KKTC üzerinde adaylara görünüyor.",
    steps: [
      "İlanı aday gözüyle kontrol edin",
      "Başvuruları işveren panelinden izleyin",
      "Öne çıkan adaylarla hızlıca iletişime geçin",
    ],
    cta: "İlanı görüntüle",
  },
  resume: {
    subject: "Özgeçmişiniz alındı",
    heading: "Özgeçmişiniz profilize eklendi",
    lead: "Yüklediğiniz özgeçmişi profilinize aktardık. Bilgilerinizi kontrol edip tamamlayabilirsiniz.",
    steps: [
      "Aktarılan deneyim ve eğitim bilgilerini gözden geçirin",
      "Eksik alanları tamamlayın",
      "Profilinizi işverenlere açık hale getirin",
    ],
    cta: "Profilimi kontrol et",
    updateSubject: "Özgeçmişiniz güncellendi",
    updateHeading: "Özgeçmiş bilgileriniz güncellendi",
    updateLead: "Yüklediğiniz özgeçmiş profilinize işlendi ve güncel bilgileriniz kaydedildi.",
  },
  sales: {
    ackSubject: "Teklif talebiniz alındı",
    ackHeading: "Teklif talebiniz bize ulaştı",
    ackLead: "Kurumsal ilan paketi talebiniz için teşekkür ederiz. Ekibimiz kapsamı netleştirmek için en kısa sürede dönecek.",
    ackCta: "Paketleri inceleyin",
    teamSubject: "Yeni kurumsal teklif talebi",
    teamHeading: "Yeni teklif talebi alındı",
    leadLabel: "Şirket / Yetkili",
    planLabel: "Paket",
    durationLabel: "İlan süresi",
    messageLabel: "Not",
  },
  engagement: {
    subject: "Size uygun yeni ilanlar var",
    heading: "Bu haftanın öne çıkan ilanları",
    lead: "Profilinize uygun güncel ilanları derledik. Kaçırmamak için başvurunuzu tamamlayın.",
    jobsHeading: "Öne çıkan ilanlar",
    cta: "Tüm ilanları görün",
    jobRow: "{title} · {company}",
    unsubscribeNote: "Bu tür tanıtım e-postalarını almak istemiyorsanız abonelikten çıkabilirsiniz.",
    unsubscribeLabel: "Abonelikten çık",
  },
  labels: {
    profileLabel: "Profil",
    jobLabel: "İlan",
    companyLabel: "Şirket",
  },
};

const en: EmailCopyExtras = {
  jobPublished: {
    subject: "Your listing is live",
    heading: "Your listing is now live",
    lead: "Your listing was approved and is now visible to candidates on İşBul KKTC.",
    steps: [
      "Preview the listing as a candidate sees it",
      "Track applications from your employer dashboard",
      "Reach out to strong candidates quickly",
    ],
    cta: "View listing",
  },
  resume: {
    subject: "We received your CV",
    heading: "Your CV was added to your profile",
    lead: "We imported the CV you uploaded into your profile. Review the details and finish anything missing.",
    steps: [
      "Check the imported experience and education",
      "Complete the missing fields",
      "Make your profile visible to employers",
    ],
    cta: "Review my profile",
    updateSubject: "Your CV was updated",
    updateHeading: "Your CV details were updated",
    updateLead: "The CV you uploaded was applied to your profile and your details are saved.",
  },
  sales: {
    ackSubject: "We received your quote request",
    ackHeading: "Your quote request reached us",
    ackLead: "Thanks for your interest in a corporate listing package. Our team will get back to you shortly to confirm the scope.",
    ackCta: "Explore packages",
    teamSubject: "New corporate quote request",
    teamHeading: "A new quote request arrived",
    leadLabel: "Company / contact",
    planLabel: "Package",
    durationLabel: "Listing duration",
    messageLabel: "Note",
  },
  engagement: {
    subject: "New jobs picked for you",
    heading: "This week's highlighted jobs",
    lead: "We gathered fresh listings that match your profile. Apply before they close.",
    jobsHeading: "Highlighted jobs",
    cta: "See all jobs",
    jobRow: "{title} · {company}",
    unsubscribeNote: "You can unsubscribe if you no longer want these promotional emails.",
    unsubscribeLabel: "Unsubscribe",
  },
  labels: {
    profileLabel: "Profile",
    jobLabel: "Job",
    companyLabel: "Company",
  },
};

const ru: EmailCopyExtras = {
  jobPublished: {
    subject: "Ваше объявление опубликовано",
    heading: "Ваше объявление опубликовано",
    lead: "Объявление одобрено и теперь видно соискателям на İşBul KKTC.",
    steps: [
      "Посмотрите объявление глазами соискателя",
      "Следите за откликами в кабинете работодателя",
      "Быстро связывайтесь с сильными кандидатами",
    ],
    cta: "Открыть объявление",
  },
  resume: {
    subject: "Мы получили ваше резюме",
    heading: "Резюме добавлено в профиль",
    lead: "Мы перенесли загруженное резюме в ваш профиль. Проверьте данные и дополните недостающее.",
    steps: [
      "Проверьте перенесённый опыт и образование",
      "Заполните пропущенные поля",
      "Сделайте профиль видимым для работодателей",
    ],
    cta: "Проверить профиль",
    updateSubject: "Ваше резюме обновлено",
    updateHeading: "Данные резюме обновлены",
    updateLead: "Загруженное резюме применено к профилю, данные сохранены.",
  },
  sales: {
    ackSubject: "Мы получили ваш запрос на смету",
    ackHeading: "Ваш запрос получен",
    ackLead: "Спасибо за интерес к корпоративному пакету объявлений. Мы скоро свяжемся, чтобы уточнить объём.",
    ackCta: "Смотреть пакеты",
    teamSubject: "Новый запрос корпоративного предложения",
    teamHeading: "Получен новый запрос",
    leadLabel: "Компания / контакт",
    planLabel: "Пакет",
    durationLabel: "Срок объявления",
    messageLabel: "Примечание",
  },
  engagement: {
    subject: "Новые вакансии для вас",
    heading: "Избранные вакансии недели",
    lead: "Мы собрали свежие вакансии по вашему профилю. Успейте откликнуться.",
    jobsHeading: "Избранные вакансии",
    cta: "Все вакансии",
    jobRow: "{title} · {company}",
    unsubscribeNote: "Вы можете отписаться, если не хотите получать такие письма.",
    unsubscribeLabel: "Отписаться",
  },
  labels: {
    profileLabel: "Профиль",
    jobLabel: "Вакансия",
    companyLabel: "Компания",
  },
};

const el: EmailCopyExtras = {
  jobPublished: {
    subject: "Η αγγελία σας δημοσιεύτηκε",
    heading: "Η αγγελία σας είναι ενεργή",
    lead: "Η αγγελία εγκρίθηκε και είναι πλέον ορατή στους υποψηφίους στο İşBul KKTC.",
    steps: [
      "Δείτε την αγγελία όπως την βλέπει ο υποψήφιος",
      "Παρακολουθήστε τις αιτήσεις από τον πίνακα εργοδότη",
      "Επικοινωνήστε γρήγορα με δυνατούς υποψηφίους",
    ],
    cta: "Προβολή αγγελίας",
  },
  resume: {
    subject: "Λάβαμε το βιογραφικό σας",
    heading: "Το βιογραφικό προστέθηκε στο προφίλ σας",
    lead: "Εισαγάγαμε το βιογραφικό που ανεβάσατε στο προφίλ σας. Ελέγξτε τα στοιχεία και συμπληρώστε ό,τι λείπει.",
    steps: [
      "Ελέγξτε την εισαγόμενη εμπειρία και εκπαίδευση",
      "Συμπληρώστε τα κενά πεδία",
      "Κάντε το προφίλ ορατό στους εργοδότες",
    ],
    cta: "Έλεγχος προφίλ",
    updateSubject: "Το βιογραφικό σας ενημερώθηκε",
    updateHeading: "Τα στοιχεία του βιογραφικού ενημερώθηκαν",
    updateLead: "Το βιογραφικό που ανεβάσατε εφαρμόστηκε στο προφίλ και τα στοιχεία αποθηκεύτηκαν.",
  },
  sales: {
    ackSubject: "Λάβαμε το αίτημα προσφοράς σας",
    ackHeading: "Το αίτημά σας έφτασε σε εμάς",
    ackLead: "Ευχαριστούμε για το ενδιαφέρον σας σε εταιρικό πακέτο αγγελιών. Θα επικοινωνήσουμε σύντομα για το εύρος.",
    ackCta: "Δείτε τα πακέτα",
    teamSubject: "Νέο αίτημα εταιρικής προσφοράς",
    teamHeading: "Λήφθηκε νέο αίτημα προσφοράς",
    leadLabel: "Εταιρεία / επαφή",
    planLabel: "Πακέτο",
    durationLabel: "Διάρκεια αγγελίας",
    messageLabel: "Σημείωση",
  },
  engagement: {
    subject: "Νέες θέσεις για εσάς",
    heading: "Επιλεγμένες θέσεις της εβδομάδας",
    lead: "Συγκεντρώσαμε νέες αγγελίες που ταιριάζουν στο προφίλ σας. Κάντε αίτηση έγκαιρα.",
    jobsHeading: "Επιλεγμένες θέσεις",
    cta: "Όλες οι θέσεις",
    jobRow: "{title} · {company}",
    unsubscribeNote: "Μπορείτε να διαγραφείτε αν δεν θέλετε αυτά τα ενημερωτικά email.",
    unsubscribeLabel: "Διαγραφή",
  },
  labels: {
    profileLabel: "Προφίλ",
    jobLabel: "Θέση",
    companyLabel: "Εταιρεία",
  },
};

const fa: EmailCopyExtras = {
  jobPublished: {
    subject: "آگهی شما منتشر شد",
    heading: "آگهی شما فعال شد",
    lead: "آگهی شما تأیید شد و اکنون برای نامزدها در İşBul KKTC قابل مشاهده است.",
    steps: [
      "آگهی را از دید یک نامزد بررسی کنید",
      "درخواست‌ها را از پنل کارفرما پیگیری کنید",
      "سریع با نامزدهای مناسب تماس بگیرید",
    ],
    cta: "مشاهده آگهی",
  },
  resume: {
    subject: "رزومه شما دریافت شد",
    heading: "رزومه به پروفایل شما افزوده شد",
    lead: "رزومه بارگذاری‌شده را به پروفایل شما منتقل کردیم. اطلاعات را بررسی و تکمیل کنید.",
    steps: [
      "سابقه و تحصیلات منتقل‌شده را بررسی کنید",
      "فیلدهای ناقص را تکمیل کنید",
      "پروفایل خود را برای کارفرمایان نمایان کنید",
    ],
    cta: "بررسی پروفایل",
    updateSubject: "رزومه شما به‌روزرسانی شد",
    updateHeading: "اطلاعات رزومه به‌روزرسانی شد",
    updateLead: "رزومه بارگذاری‌شده در پروفایل شما اعمال و اطلاعات ذخیره شد.",
  },
  sales: {
    ackSubject: "درخواست قیمت شما دریافت شد",
    ackHeading: "درخواست شما به ما رسید",
    ackLead: "از علاقه شما به بسته آگهی سازمانی سپاسگزاریم. تیم ما به‌زودی برای تعیین جزئیات تماس می‌گیرد.",
    ackCta: "مشاهده بسته‌ها",
    teamSubject: "درخواست جدید قیمت سازمانی",
    teamHeading: "درخواست قیمت جدید دریافت شد",
    leadLabel: "شرکت / مخاطب",
    planLabel: "بسته",
    durationLabel: "مدت آگهی",
    messageLabel: "یادداشت",
  },
  engagement: {
    subject: "موقعیت‌های جدید برای شما",
    heading: "موقعیت‌های منتخب این هفته",
    lead: "آگهی‌های تازه‌ای متناسب با پروفایل شما جمع‌آوری کردیم. زودتر اقدام کنید.",
    jobsHeading: "موقعیت‌های منتخب",
    cta: "همه موقعیت‌ها",
    jobRow: "{title} · {company}",
    unsubscribeNote: "اگر این ایمیل‌های تبلیغاتی را نمی‌خواهید، می‌توانید لغو اشتراک کنید.",
    unsubscribeLabel: "لغو اشتراک",
  },
  labels: {
    profileLabel: "پروفایل",
    jobLabel: "موقعیت",
    companyLabel: "شرکت",
  },
};

const de: EmailCopyExtras = {
  jobPublished: {
    subject: "Ihre Anzeige ist online",
    heading: "Ihre Anzeige ist jetzt online",
    lead: "Ihre Anzeige wurde freigegeben und ist nun für Kandidaten auf İşBul KKTC sichtbar.",
    steps: [
      "Prüfen Sie die Anzeige aus Kandidatensicht",
      "Verfolgen Sie Bewerbungen im Arbeitgeber-Dashboard",
      "Kontaktieren Sie starke Kandidaten schnell",
    ],
    cta: "Anzeige ansehen",
  },
  resume: {
    subject: "Wir haben Ihren Lebenslauf erhalten",
    heading: "Ihr Lebenslauf wurde ins Profil übernommen",
    lead: "Wir haben den hochgeladenen Lebenslauf in Ihr Profil übernommen. Prüfen Sie die Angaben und ergänzen Sie Fehlendes.",
    steps: [
      "Prüfen Sie übernommene Erfahrung und Ausbildung",
      "Ergänzen Sie fehlende Felder",
      "Machen Sie Ihr Profil für Arbeitgeber sichtbar",
    ],
    cta: "Profil prüfen",
    updateSubject: "Ihr Lebenslauf wurde aktualisiert",
    updateHeading: "Ihre Lebenslauf-Angaben wurden aktualisiert",
    updateLead: "Der hochgeladene Lebenslauf wurde in Ihr Profil übernommen und gespeichert.",
  },
  sales: {
    ackSubject: "Wir haben Ihre Angebotsanfrage erhalten",
    ackHeading: "Ihre Anfrage ist bei uns eingegangen",
    ackLead: "Danke für Ihr Interesse an einem Firmen-Anzeigenpaket. Unser Team meldet sich in Kürze zum Umfang.",
    ackCta: "Pakete ansehen",
    teamSubject: "Neue Firmen-Angebotsanfrage",
    teamHeading: "Neue Angebotsanfrage eingegangen",
    leadLabel: "Firma / Kontakt",
    planLabel: "Paket",
    durationLabel: "Anzeigendauer",
    messageLabel: "Notiz",
  },
  engagement: {
    subject: "Neue Stellen für Sie",
    heading: "Ausgewählte Stellen der Woche",
    lead: "Wir haben passende neue Anzeigen für Ihr Profil zusammengestellt. Bewerben Sie sich rechtzeitig.",
    jobsHeading: "Ausgewählte Stellen",
    cta: "Alle Stellen",
    jobRow: "{title} · {company}",
    unsubscribeNote: "Sie können sich abmelden, wenn Sie diese Werbe-E-Mails nicht mehr möchten.",
    unsubscribeLabel: "Abmelden",
  },
  labels: {
    profileLabel: "Profil",
    jobLabel: "Stelle",
    companyLabel: "Firma",
  },
};

export const EMAIL_COPY_EXTRAS: Record<EmailLocale, EmailCopyExtras> = {
  tr,
  en,
  ru,
  el,
  fa,
  de,
};

export function getEmailCopyExtras(
  locale: string | null | undefined,
): EmailCopyExtras {
  return EMAIL_COPY_EXTRAS[resolveEmailLocale(locale)];
}
