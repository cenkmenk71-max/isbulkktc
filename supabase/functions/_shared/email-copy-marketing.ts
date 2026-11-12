/**
 * Localized copy for the acquisition ("marketing") email family.
 *
 * Every other family in this directory writes to someone the platform already
 * knows: a new signup, a candidate who applied, an employer whose listing went
 * live. This family is the one message that has to work on someone who has
 * never heard of İşBul KKTC — an employer who is hiring now — so it carries the
 * product's actual promises rather than a generic "welcome to our platform".
 *
 * The Turkish copy is the owner's own text, kept verbatim (only spacing
 * normalised); the other five locales are faithful translations of it. Kept in
 * its own module (like `email-copy-extras.ts`) so the core catalog and its
 * contract stay untouched. Same rule as the others: every locale implements the
 * whole type, so a missing translation is a compile error, never a silent
 * fallback to Turkish.
 */

import { resolveEmailLocale, type EmailLocale } from "./email-copy.ts";

export type MarketingFeature = { title: string; body: string };

export type MarketingCopy = {
  subject: string;
  preheader: string;
  heading: string;
  greeting: string;
  /** The two opening paragraphs, shown before the feature list. */
  paragraphs: string[];
  featuresHeading: string;
  features: MarketingFeature[];
  closing: string;
  /** Line introducing the packages call to action. */
  packagesLead: string;
  /** Line introducing the employer-registration call to action. */
  registerLead: string;
  primaryCta: string;
  secondaryCta: string;
  signOff: string;
  contactHeading: string;
  contactLabels: { email: string; phone: string; whatsapp: string };
  unsubscribeNote: string;
  unsubscribeLabel: string;
  /**
   * Footer line stating why this message was received. The transactional
   * families say "because of activity on your account"; a prospect has no
   * account, so claiming one would be false (and an accurate reason is what
   * consent-aware footer rules ask for). Kept per-locale with the rest of the
   * copy rather than reusing the account-activity wording.
   */
  footerNote: string;
};

/**
 * The brand's reachable contact channels. Addresses are locale-independent, so
 * they live here once rather than being repeated (and mistranslated) per
 * locale; only the row labels are localized. `mailto:`/`tel:` are the two
 * schemes the layout permits for contact rows so a tap opens the recipient's
 * own client instead of a copied address.
 */
export const MARKETING_CONTACTS = {
  email: "info@isbulkktc.com",
  phoneDisplay: "0539 131 64 21",
  phoneTel: "+905391316421",
  whatsapp: "https://wa.me/905391316421",
} as const;

const tr: MarketingCopy = {
  subject: "İşe alım sürecinizi İşbul KKTC ile tek platformda yönetin",
  preheader:
    "İlan yayınlayın, aday havuzunu keşfedin ve başvuruları tek panelden yönetin.",
  heading: "Doğru adaya ulaşmak, ilan yayınlamakla bitmez",
  greeting: "Sayın Yetkili,",
  paragraphs: [
    "Bir pozisyon için doğru adayı bulmak, yalnızca iş ilanı yayınlamakla bitmez. Adaylara ulaşmak, başvuruları değerlendirmek ve işe alım sürecini verimli yönetmek de en az ilan kadar önemlidir.",
    "İşbul KKTC, işletmelerin personel arayışlarını tek bir dijital platform üzerinden yürütebilmeleri için geliştirilmiş bir iş ve istihdam platformudur.",
  ],
  featuresHeading: "İşbul KKTC ile işletmeniz:",
  features: [
    {
      title: "İlan yayınlayabilir",
      body: "Açık pozisyonlarınızı ilgili iş arayanlarla buluşturabilirsiniz.",
    },
    {
      title: "Aday havuzunu keşfedebilir",
      body: "Aday profillerini inceleyerek personel arayışınızı yalnızca ilan başvurularıyla sınırlı tutmazsınız.",
    },
    {
      title: "Başvuru sürecini kolaylaştırabilir",
      body: "Adaylar CV'lerini yükleyerek otomatik profil oluşturma imkânından yararlanabilir.",
    },
    {
      title: "İşletmenizi tanıtabilir",
      body: "Şirket profilinizi oluşturarak işletmenizi ve açık pozisyonlarınızı platformda sergileyebilirsiniz.",
    },
  ],
  closing: "İşe alım sürecinizde kullanabileceğiniz bu imkânları keşfedin.",
  packagesLead: "İşletmenize uygun ilan paketlerini inceleyin:",
  registerLead: "İşveren hesabınızı oluşturmak için:",
  primaryCta: "İlan Paketlerini İnceleyin",
  secondaryCta: "İşveren Hesabı Oluştur",
  signOff:
    "Saygılarımızla, İşbul KKTC — Kuzey Kıbrıs'ta iş ve istihdam için dijital buluşma noktası",
  contactHeading: "Bize ulaşın",
  contactLabels: { email: "E-posta", phone: "Telefon", whatsapp: "WhatsApp" },
  unsubscribeNote:
    "Bu tür tanıtım e-postalarını almak istemiyorsanız abonelikten çıkabilirsiniz.",
  unsubscribeLabel: "Abonelikten çık",
  footerNote:
    "Bu e-postayı, İşbul KKTC'nin işletmeniz için yararlı olabileceğini düşündüğümüz için aldınız.",
};

const en: MarketingCopy = {
  subject: "Run your whole hiring process on İşbul KKTC",
  preheader:
    "Post listings, explore the candidate pool and manage applications from one dashboard.",
  heading: "Reaching the right candidate takes more than posting a listing",
  greeting: "Dear Hiring Manager,",
  paragraphs: [
    "Finding the right candidate for a role does not end with publishing a job listing. Reaching applicants, reviewing applications and running the hiring process efficiently matter just as much.",
    "İşbul KKTC is an employment platform built so businesses can run their entire staffing search through a single digital platform.",
  ],
  featuresHeading: "With İşbul KKTC, your business can:",
  features: [
    {
      title: "Publish listings",
      body: "Connect your open positions with the job seekers who are looking for them.",
    },
    {
      title: "Explore the candidate pool",
      body: "Review candidate profiles, so your search is not limited to the applications a listing brings.",
    },
    {
      title: "Simplify applications",
      body: "Candidates can upload their CV and benefit from automatic profile creation.",
    },
    {
      title: "Showcase your company",
      body: "Build a company profile and present your business and open positions on the platform.",
    },
  ],
  closing: "Explore the tools you can use in your hiring process.",
  packagesLead: "Review the listing packages that fit your business:",
  registerLead: "To create your employer account:",
  primaryCta: "View Listing Packages",
  secondaryCta: "Create Employer Account",
  signOff:
    "Best regards, İşbul KKTC — the digital meeting point for jobs and employment in Northern Cyprus",
  contactHeading: "Get in touch",
  contactLabels: { email: "Email", phone: "Phone", whatsapp: "WhatsApp" },
  unsubscribeNote:
    "If you no longer want these promotional emails, you can unsubscribe.",
  unsubscribeLabel: "Unsubscribe",
  footerNote:
    "You received this email because we believe İşbul KKTC could be useful for your business.",
};

const ru: MarketingCopy = {
  subject: "Ведите весь процесс найма в İşbul KKTC",
  preheader:
    "Публикуйте вакансии, изучайте базу кандидатов и управляйте откликами из одной панели.",
  heading: "Найти нужного кандидата — это больше, чем разместить вакансию",
  greeting: "Уважаемый руководитель,",
  paragraphs: [
    "Поиск подходящего кандидата не заканчивается публикацией вакансии. Донести предложение до соискателей, рассмотреть отклики и эффективно вести процесс найма не менее важно.",
    "İşbul KKTC — это платформа занятости, созданная для того, чтобы компании вели поиск персонала через единую цифровую платформу.",
  ],
  featuresHeading: "С İşbul KKTC ваша компания может:",
  features: [
    {
      title: "Публиковать вакансии",
      body: "Связывайте открытые позиции с соискателями, которые их ищут.",
    },
    {
      title: "Изучать базу кандидатов",
      body: "Просматривайте профили кандидатов, чтобы поиск не ограничивался откликами на вакансию.",
    },
    {
      title: "Упростить отклики",
      body: "Кандидаты могут загрузить резюме и воспользоваться автоматическим созданием профиля.",
    },
    {
      title: "Презентовать компанию",
      body: "Создайте профиль компании и представьте свой бизнес и открытые позиции на платформе.",
    },
  ],
  closing: "Изучите возможности, которые можно использовать в процессе найма.",
  packagesLead: "Ознакомьтесь с тарифами на размещение вакансий:",
  registerLead: "Чтобы создать аккаунт работодателя:",
  primaryCta: "Посмотреть тарифы",
  secondaryCta: "Создать аккаунт работодателя",
  signOff:
    "С уважением, İşbul KKTC — цифровая точка встречи для работы и занятости в Северном Кипре",
  contactHeading: "Свяжитесь с нами",
  contactLabels: { email: "Эл. почта", phone: "Телефон", whatsapp: "WhatsApp" },
  unsubscribeNote:
    "Если вы больше не хотите получать такие рекламные письма, вы можете отписаться.",
  unsubscribeLabel: "Отписаться",
  footerNote:
    "Вы получили это письмо, потому что мы считаем, что İşbul KKTC может быть полезен вашей компании.",
};

const el: MarketingCopy = {
  subject: "Διαχειριστείτε όλη τη διαδικασία πρόσληψης στο İşbul KKTC",
  preheader:
    "Δημοσιεύστε αγγελίες, εξερευνήστε το σύνολο υποψηφίων και διαχειριστείτε τις αιτήσεις από ένα ταμπλό.",
  heading: "Η εύρεση του σωστού υποψηφίου είναι κάτι περισσότερο από μια αγγελία",
  greeting: "Αξιότιμε/η,",
  paragraphs: [
    "Η εύρεση του σωστού υποψηφίου για μια θέση δεν τελειώνει με τη δημοσίευση μιας αγγελίας. Η προσέγγιση των υποψηφίων, η αξιολόγηση των αιτήσεων και η αποδοτική διαχείριση της διαδικασίας πρόσληψης είναι εξίσου σημαντικές.",
    "Το İşbul KKTC είναι μια πλατφόρμα απασχόλησης, σχεδιασμένη ώστε οι επιχειρήσεις να διεξάγουν την αναζήτηση προσωπικού μέσω μίας ψηφιακής πλατφόρμας.",
  ],
  featuresHeading: "Με το İşbul KKTC η επιχείρησή σας μπορεί να:",
  features: [
    {
      title: "Δημοσιεύει αγγελίες",
      body: "Συνδέστε τις ανοιχτές θέσεις σας με τους υποψηφίους που τις αναζητούν.",
    },
    {
      title: "Εξερευνά το σύνολο υποψηφίων",
      body: "Δείτε προφίλ υποψηφίων, ώστε η αναζήτησή σας να μην περιορίζεται στις αιτήσεις μιας αγγελίας.",
    },
    {
      title: "Απλοποιεί τις αιτήσεις",
      body: "Οι υποψήφιοι μπορούν να ανεβάσουν το βιογραφικό τους και να επωφεληθούν από την αυτόματη δημιουργία προφίλ.",
    },
    {
      title: "Προβάλλει την εταιρεία σας",
      body: "Δημιουργήστε προφίλ εταιρείας και παρουσιάστε την επιχείρησή σας και τις ανοιχτές θέσεις στην πλατφόρμα.",
    },
  ],
  closing: "Εξερευνήστε τα εργαλεία που μπορείτε να χρησιμοποιήσετε στη διαδικασία πρόσληψης.",
  packagesLead: "Δείτε τα πακέτα αγγελιών που ταιριάζουν στην επιχείρησή σας:",
  registerLead: "Για να δημιουργήσετε λογαριασμό εργοδότη:",
  primaryCta: "Δείτε τα πακέτα αγγελιών",
  secondaryCta: "Δημιουργία λογαριασμού εργοδότη",
  signOff:
    "Με εκτίμηση, İşbul KKTC — το ψηφιακό σημείο συνάντησης για εργασία και απασχόληση στη Βόρεια Κύπρο",
  contactHeading: "Επικοινωνήστε μαζί μας",
  contactLabels: { email: "Email", phone: "Τηλέφωνο", whatsapp: "WhatsApp" },
  unsubscribeNote:
    "Αν δεν θέλετε πια αυτά τα διαφημιστικά email, μπορείτε να διαγραφείτε.",
  unsubscribeLabel: "Διαγραφή",
  footerNote:
    "Λάβατε αυτό το email επειδή πιστεύουμε ότι το İşbul KKTC μπορεί να είναι χρήσιμο για την επιχείρησή σας.",
};

const fa: MarketingCopy = {
  subject: "کل فرایند استخدام خود را در İşbul KKTC مدیریت کنید",
  preheader:
    "آگهی منتشر کنید، مجموعه کارجویان را ببینید و درخواست‌ها را از یک پنل مدیریت کنید.",
  heading: "یافتن کارجوی مناسب بیش از انتشار یک آگهی است",
  greeting: "مدیر محترم،",
  paragraphs: [
    "یافتن کارجوی مناسب برای یک موقعیت، تنها با انتشار آگهی تمام نمی‌شود. رسیدن به کارجویان، بررسی درخواست‌ها و مدیریت کارآمد فرایند استخدام نیز به همان اندازه مهم است.",
    "İşbul KKTC یک پلتفرم اشتغال است که ساخته شده تا کسب‌وکارها جستجوی نیروی خود را از طریق یک پلتفرم دیجیتال واحد پیش ببرند.",
  ],
  featuresHeading: "با İşbul KKTC، کسب‌وکار شما می‌تواند:",
  features: [
    {
      title: "آگهی منتشر کند",
      body: "موقعیت‌های شغلی باز خود را به کارجویانی که به دنبال آن‌ها هستند برسانید.",
    },
    {
      title: "مجموعه کارجویان را ببیند",
      body: "پروفایل کارجویان را بررسی کنید تا جستجوی شما به درخواست‌های یک آگهی محدود نماند.",
    },
    {
      title: "درخواست‌ها را ساده کند",
      body: "کارجویان می‌توانند رزومه خود را بارگذاری کنند و از ساخت خودکار پروفایل بهره ببرند.",
    },
    {
      title: "شرکت خود را معرفی کند",
      body: "پروفایل شرکت بسازید و کسب‌وکار و موقعیت‌های باز خود را در پلتفرم نمایش دهید.",
    },
  ],
  closing: "امکاناتی را که می‌توانید در فرایند استخدام به کار ببرید کشف کنید.",
  packagesLead: "بسته‌های آگهی مناسب کسب‌وکار خود را ببینید:",
  registerLead: "برای ساخت حساب کارفرما:",
  primaryCta: "مشاهده بسته‌های آگهی",
  secondaryCta: "ساخت حساب کارفرما",
  signOff:
    "با احترام، İşbul KKTC — نقطه دیدار دیجیتال برای کار و اشتغال در قبرس شمالی",
  contactHeading: "با ما در تماس باشید",
  contactLabels: { email: "ایمیل", phone: "تلفن", whatsapp: "واتس‌اپ" },
  unsubscribeNote:
    "اگر دیگر این ایمیل‌های تبلیغاتی را نمی‌خواهید، می‌توانید لغو اشتراک کنید.",
  unsubscribeLabel: "لغو اشتراک",
  footerNote:
    "این ایمیل را دریافت کردید چون فکر می‌کنیم İşbul KKTC می‌تواند برای کسب‌وکار شما مفید باشد.",
};

const de: MarketingCopy = {
  subject: "Steuern Sie Ihren gesamten Einstellungsprozess mit İşbul KKTC",
  preheader:
    "Anzeigen veröffentlichen, Kandidatenpool durchsuchen und Bewerbungen in einem Dashboard verwalten.",
  heading: "Den richtigen Kandidaten zu finden ist mehr als eine Anzeige",
  greeting: "Sehr geehrte Damen und Herren,",
  paragraphs: [
    "Den richtigen Kandidaten für eine Stelle zu finden, endet nicht mit der Veröffentlichung einer Anzeige. Kandidaten zu erreichen, Bewerbungen zu prüfen und den Einstellungsprozess effizient zu steuern, ist ebenso wichtig.",
    "İşbul KKTC ist eine Beschäftigungsplattform, mit der Unternehmen ihre Personalsuche über eine einzige digitale Plattform abwickeln können.",
  ],
  featuresHeading: "Mit İşbul KKTC kann Ihr Unternehmen:",
  features: [
    {
      title: "Anzeigen veröffentlichen",
      body: "Bringen Sie Ihre offenen Stellen mit den Jobsuchenden zusammen, die sie suchen.",
    },
    {
      title: "Den Kandidatenpool durchsuchen",
      body: "Prüfen Sie Kandidatenprofile, damit Ihre Suche nicht auf die Bewerbungen einer Anzeige beschränkt bleibt.",
    },
    {
      title: "Bewerbungen vereinfachen",
      body: "Kandidaten können ihren Lebenslauf hochladen und die automatische Profilerstellung nutzen.",
    },
    {
      title: "Ihr Unternehmen präsentieren",
      body: "Erstellen Sie ein Firmenprofil und präsentieren Sie Ihr Unternehmen und Ihre offenen Stellen auf der Plattform.",
    },
  ],
  closing:
    "Entdecken Sie die Möglichkeiten, die Sie in Ihrem Einstellungsprozess nutzen können.",
  packagesLead: "Sehen Sie sich die Anzeigenpakete an, die zu Ihrem Unternehmen passen:",
  registerLead: "Um Ihr Arbeitgeberkonto zu erstellen:",
  primaryCta: "Anzeigenpakete ansehen",
  secondaryCta: "Arbeitgeberkonto erstellen",
  signOff:
    "Mit freundlichen Grüßen, İşbul KKTC — der digitale Treffpunkt für Arbeit und Beschäftigung in Nordzypern",
  contactHeading: "Kontakt aufnehmen",
  contactLabels: { email: "E-Mail", phone: "Telefon", whatsapp: "WhatsApp" },
  unsubscribeNote:
    "Wenn Sie diese Werbe-E-Mails nicht mehr erhalten möchten, können Sie sich abmelden.",
  unsubscribeLabel: "Abmelden",
  footerNote:
    "Sie erhalten diese E-Mail, weil wir glauben, dass İşbul KKTC für Ihr Unternehmen nützlich sein könnte.",
};

export const MARKETING_COPY: Record<EmailLocale, MarketingCopy> = {
  tr,
  en,
  ru,
  el,
  fa,
  de,
};

export function getMarketingCopy(
  locale: string | null | undefined,
): MarketingCopy {
  return MARKETING_COPY[resolveEmailLocale(locale)];
}
