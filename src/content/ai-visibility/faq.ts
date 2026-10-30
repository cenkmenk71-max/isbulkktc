import type { AppLocale } from "@/i18n/routing";

/**
 * Frequently asked questions, written per language from the product's own
 * published copy. There is no machine translation here: the Turkish and English
 * answers restate the exact sentences the about/contact/packages pages already
 * ship (`AboutPage.realityBody`, `PackagesMeta.description`,
 * `ContactPage.*`), and the remaining four languages were written directly in
 * that language. Nothing claims a feature the site does not have — payment
 * really is off-site by IBAN, the directory really is source data, and the
 * support channels are the ones the footer renders.
 *
 * The questions are the ones answer engines are actually asked about this site:
 * who runs it, what it does, where it operates, what it costs, and how to
 * reach a human.
 */

export type FaqEntry = { question: string; answer: string };

export const faqByLocale: Record<AppLocale, readonly FaqEntry[]> = {
  tr: [
    {
      question: "İşBul KKTC nedir?",
      answer:
        "İşBul KKTC, Kuzey Kıbrıs Türk Cumhuriyeti için geliştirilen bir iş ve kariyer platformudur. İş arayanlar ilanları arar ve başvurur; işverenler ilan yayınlar ve başvuruları yönetir.",
    },
    {
      question: "Hangi bölgelerde hizmet veriyor?",
      answer:
        "Platform, Kuzey Kıbrıs'ın altı ilçesini kapsar: Lefkoşa, Gazimağusa, Girne, Güzelyurt, İskele ve Lefke.",
    },
    {
      question: "İlan yayınlamak ve başvurmak ücretli mi?",
      answer:
        "İş arayanlar için ilan arama ve başvuru ücretsizdir. İşverenler ilan paketlerini inceler; ödeme web sitesinde alınmaz, IBAN ve ödeme talimatı paket görüşmesi sonrası e-posta veya WhatsApp gibi kanallardan özel olarak iletilir.",
    },
    {
      question: "Şirket rehberindeki kayıtlar doğrulanmış mı?",
      answer:
        "Şirket rehberi, sağlanan kaynaklardaki kayıtları aramaya açar; listelenmek şirketin İşBul KKTC tarafından doğrulandığı anlamına gelmez.",
    },
    {
      question: "İşBul KKTC'ye nasıl ulaşabilirim?",
      answer:
        "E-posta (info@isbulkktc.com), telefon veya WhatsApp üzerinden ulaşabilirsiniz. Destek kanalları sitenin alt bilgisinde ve iletişim sayfasında listelenir.",
    },
    {
      question: "Platform hangi dilleri destekliyor?",
      answer:
        "Arayüz altı dilde sunulur: Türkçe, İngilizce, Rusça, Yunanca, Farsça ve Almanca.",
    },
  ],
  en: [
    {
      question: "What is İşBul KKTC?",
      answer:
        "İşBul KKTC is a jobs and careers platform built for the Turkish Republic of Northern Cyprus. Job seekers search listings and apply; employers publish vacancies and manage applications.",
    },
    {
      question: "Which areas does it cover?",
      answer:
        "The platform covers the six districts of Northern Cyprus: Nicosia, Famagusta, Kyrenia, Morphou, Trikomo and Lefka.",
    },
    {
      question: "Does it cost anything to post or apply?",
      answer:
        "Searching and applying is free for job seekers. Employers review job packages; payment is not collected on the website — IBAN details and payment instructions are shared privately by email or WhatsApp after discussing the package.",
    },
    {
      question: "Are the directory listings verified?",
      answer:
        "The company directory makes records from supplied source files searchable; a listing does not mean İşBul KKTC has verified that company.",
    },
    {
      question: "How can I contact İşBul KKTC?",
      answer:
        "By email (info@isbulkktc.com), phone or WhatsApp. The support channels are listed in the site footer and on the contact page.",
    },
    {
      question: "Which languages does the platform support?",
      answer:
        "The interface is available in six languages: Turkish, English, Russian, Greek, Persian and German.",
    },
  ],
  de: [
    {
      question: "Was ist İşBul KKTC?",
      answer:
        "İşBul KKTC ist eine Job- und Karriereplattform für die Türkische Republik Nordzypern. Arbeitssuchende durchsuchen Anzeigen und bewerben sich; Arbeitgeber veröffentlichen Stellen und verwalten Bewerbungen.",
    },
    {
      question: "Welche Gebiete werden abgedeckt?",
      answer:
        "Die Plattform umfasst die sechs Bezirke Nordzyperns: Nikosia, Famagusta, Kyrenia, Morphou, Trikomo und Lefka.",
    },
    {
      question: "Kostet das Veröffentlichen oder Bewerben etwas?",
      answer:
        "Die Suche und die Bewerbung sind für Arbeitssuchende kostenlos. Arbeitgeber sehen sich Anzeigenpakete an; die Zahlung erfolgt nicht auf der Website — Bankdaten und Anweisungen werden nach Besprechung des Pakets privat per E-Mail oder WhatsApp mitgeteilt.",
    },
    {
      question: "Sind die Verzeichniseinträge geprüft?",
      answer:
        "Das Unternehmensverzeichnis macht Einträge aus bereitgestellten Quelldateien durchsuchbar; ein Eintrag bedeutet nicht, dass İşBul KKTC das Unternehmen geprüft hat.",
    },
    {
      question: "Wie kann ich İşBul KKTC kontaktieren?",
      answer:
        "Per E-Mail (info@isbulkktc.com), Telefon oder WhatsApp. Die Support-Kanäle sind im Footer der Website und auf der Kontaktseite aufgeführt.",
    },
    {
      question: "Welche Sprachen unterstützt die Plattform?",
      answer:
        "Die Oberfläche ist in sechs Sprachen verfügbar: Türkisch, Englisch, Russisch, Griechisch, Persisch und Deutsch.",
    },
  ],
  fa: [
    {
      question: "İşBul KKTC چیست؟",
      answer:
        "İşBul KKTC یک پلتفرم کاریابی و مسیر شغلی است که برای جمهوری ترک قبرس شمالی ساخته شده است. کارجویان آگهی‌ها را جست‌وجو و درخواست می‌دهند؛ کارفرمایان آگهی منتشر می‌کنند و درخواست‌ها را مدیریت می‌کنند.",
    },
    {
      question: "این پلتفرم کدام مناطق را پوشش می‌دهد؟",
      answer:
        "این پلتفرم شش شهرستان قبرس شمالی را پوشش می‌دهد: لفکوشا، غازی‌ماغوسا، گیرنه، گوزلیورت، ایسکله و لفکه.",
    },
    {
      question: "ثبت آگهی یا درخواست هزینه دارد؟",
      answer:
        "جست‌وجو و درخواست برای کارجویان رایگان است. کارفرمایان بسته‌های آگهی را بررسی می‌کنند؛ پرداخت در وب‌سایت انجام نمی‌شود و اطلاعات IBAN پس از گفتگو درباره بسته، از طریق ایمیل یا واتساپ به‌صورت خصوصی ارسال می‌شود.",
    },
    {
      question: "اطلاعات فهرست شرکت‌ها تأیید شده است؟",
      answer:
        "فهرست شرکت‌ها امکان جست‌وجوی اطلاعات فایل‌های منبع را می‌دهد؛ ثبت یک شرکت به‌معنای تأیید آن توسط İşBul KKTC نیست.",
    },
    {
      question: "چگونه می‌توانم با İşBul KKTC تماس بگیرم؟",
      answer:
        "از طریق ایمیل (info@isbulkktc.com)، تلفن یا واتساپ. کانال‌های پشتیبانی در پاورقی وب‌سایت و صفحه تماس فهرست شده‌اند.",
    },
    {
      question: "پلتفرم از چه زبان‌هایی پشتیبانی می‌کند؟",
      answer:
        "رابط کاربری به شش زبان ارائه می‌شود: ترکی، انگلیسی، روسی، یونانی، فارسی و آلمانی.",
    },
  ],
  ru: [
    {
      question: "Что такое İşBul KKTC?",
      answer:
        "İşBul KKTC — платформа для поиска работы и построения карьеры в Турецкой Республике Северного Кипра. Соискатели ищут вакансии и откликаются; работодатели публикуют вакансии и управляют откликами.",
    },
    {
      question: "Какие районы охватывает платформа?",
      answer:
        "Платформа охватывает шесть районов Северного Кипра: Никосия, Фамагуста, Кирения, Морфу, Трикомо и Лефка.",
    },
    {
      question: "Платное ли размещение вакансий или отклики?",
      answer:
        "Поиск и отклики для соискателей бесплатны. Работодатели изучают пакеты вакансий; оплата не взимается на сайте — реквизиты и инструкции передаются лично по электронной почте или WhatsApp после обсуждения пакета.",
    },
    {
      question: "Проверены ли записи в каталоге?",
      answer:
        "Каталог позволяет искать записи из предоставленных источников; наличие записи не означает, что İşBul KKTC проверил компанию.",
    },
    {
      question: "Как связаться с İşBul KKTC?",
      answer:
        "По электронной почте (info@isbulkktc.com), телефону или WhatsApp. Каналы поддержки указаны в подвале сайта и на странице контактов.",
    },
    {
      question: "Какие языки поддерживает платформа?",
      answer:
        "Интерфейс доступен на шести языках: турецком, английском, русском, греческом, персидском и немецком.",
    },
  ],
  el: [
    {
      question: "Τι είναι το İşBul KKTC;",
      answer:
        "Το İşBul KKTC είναι μια πλατφόρμα εργασίας και καριέρας για την Τουρκική Δημοκρατία της Βόρειας Κύπρου. Οι αναζητούντες εργασία αναζητούν αγγελίες και υποβάλλουν αιτήσεις· οι εργοδότες δημοσιεύουν θέσεις και διαχειρίζονται τις αιτήσεις.",
    },
    {
      question: "Ποιες περιοχές καλύπτει;",
      answer:
        "Η πλατφόρμα καλύπτει τις έξι επαρχίες της Βόρειας Κύπρου: Λευκωσία, Αμμόχωστο, Κερύνεια, Μόρφου, Τρίκωμο και Λεύκα.",
    },
    {
      question: "Υπάρχει χρέωση για δημοσίευση ή αίτηση;",
      answer:
        "Η αναζήτηση και η υποβολή αίτησης είναι δωρεάν για τους αναζητούντες εργασία. Οι εργοδότες εξετάζουν τα πακέτα αγγελιών· η πληρωμή δεν γίνεται στον ιστότοπο — τα στοιχεία IBAN και οι οδηγίες κοινοποιούνται ιδιωτικά μέσω email ή WhatsApp μετά τη συζήτηση του πακέτου.",
    },
    {
      question: "Οι εγγραφές του καταλόγου είναι επαληθευμένες;",
      answer:
        "Ο κατάλογος εταιρειών επιτρέπει την αναζήτηση εγγραφών από παρεχόμενες πηγές· μια εγγραφή δεν σημαίνει ότι το İşBul KKTC έχει επαληθεύσει την εταιρεία.",
    },
    {
      question: "Πώς μπορώ να επικοινωνήσω με το İşBul KKTC;",
      answer:
        "Μέσω email (info@isbulkktc.com), τηλεφώνου ή WhatsApp. Τα κανάλια υποστήριξης αναφέρονται στο υποσέλιδο του ιστοτόπου και στη σελίδα επικοινωνίας.",
    },
    {
      question: "Ποιες γλώσσες υποστηρίζει η πλατφόρμα;",
      answer:
        "Η διεπαφή είναι διαθέσιμη σε έξι γλώσσες: τουρκικά, αγγλικά, ρωσικά, ελληνικά, περσικά και γερμανικά.",
    },
  ],
};

/**
 * Section headings for the on-page FAQ block, per language, so the rendered
 * markup carries the same language as the JSON-LD `FAQPage` next to it.
 */
export const faqSectionByLocale: Record<
  AppLocale,
  { kicker: string; title: string; lead: string }
> = {
  tr: {
    kicker: "SIKÇA SORULAN SORULAR",
    title: "İşBul KKTC hakkında sık sorulan sorular",
    lead: "Platformun ne yaptığı, hangi bölgeleri kapsadığı ve nasıl iletişime geçileceğine dair kısa yanıtlar.",
  },
  en: {
    kicker: "FREQUENTLY ASKED QUESTIONS",
    title: "Frequently asked questions about İşBul KKTC",
    lead: "Short answers about what the platform does, which areas it covers and how to get in touch.",
  },
  de: {
    kicker: "HÄUFIGE FRAGEN",
    title: "Häufige Fragen zu İşBul KKTC",
    lead: "Kurze Antworten darauf, was die Plattform leistet, welche Gebiete sie abdeckt und wie Sie uns erreichen.",
  },
  fa: {
    kicker: "پرسش‌های پرتکرار",
    title: "پرسش‌های پرتکرار درباره İşBul KKTC",
    lead: "پاسخ‌های کوتاه درباره کارکرد پلتفرم، مناطق تحت پوشش و راه‌های تماس.",
  },
  ru: {
    kicker: "ЧАСТЫЕ ВОПРОСЫ",
    title: "Частые вопросы об İşBul KKTC",
    lead: "Краткие ответы о том, что делает платформа, какие районы охватывает и как связаться.",
  },
  el: {
    kicker: "ΣΥΧΝΕΣ ΕΡΩΤΗΣΕΙΣ",
    title: "Συχνές ερωτήσεις για το İşBul KKTC",
    lead: "Σύντομες απαντήσεις για το τι κάνει η πλατφόρμα, ποιες περιοχές καλύπτει και πώς να επικοινωνήσετε.",
  },
};

/**
 * ISO date the AI-visibility content was last authored. Bump it when the FAQ
 * copy or the brief changes so `dateModified` stays truthful.
 */
export const AI_VISIBILITY_UPDATED = "2026-10-30";

/**
 * A short, quotable summary of the platform per language, used as the opening
 * paragraph of the machine-readable brief so an answer engine can lift one
 * sentence without parsing the whole page.
 */
export const siteSummaryByLocale: Record<AppLocale, string> = {
  tr: "İşBul KKTC, Kuzey Kıbrıs Türk Cumhuriyeti için bir iş ve kariyer platformudur; altı ilçede ilan arama, başvuru ve işveren ilan yönetimi sunar.",
  en: "İşBul KKTC is a jobs and careers platform for the Turkish Republic of Northern Cyprus, offering job search, applications and employer vacancy management across its six districts.",
  de: "İşBul KKTC ist eine Job- und Karriereplattform für die Türkische Republik Nordzypern mit Stellensuche, Bewerbungen und Stellenverwaltung in ihren sechs Bezirken.",
  fa: "İşBul KKTC یک پلتفرم کاریابی و مسیر شغلی برای جمهوری ترک قبرس شمالی است که جست‌وجوی کار، ارسال درخواست و مدیریت آگهی را در شش شهرستان ارائه می‌دهد.",
  ru: "İşBul KKTC — платформа для поиска работы и карьеры в Турецкой Республике Северного Кипра: поиск вакансий, отклики и управление вакансиями в шести районах.",
  el: "Το İşBul KKTC είναι μια πλατφόρμα εργασίας και καριέρας για την Τουρκική Δημοκρατία της Βόρειας Κύπρου, με αναζήτηση θέσεων, αιτήσεις και διαχείριση αγγελιών στις έξι επαρχίες της.",
};
