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
  email: "destek@isbulkktc.com",
  phoneDisplay: "0539 131 64 21",
  phoneTel: "+905391316421",
  whatsapp: "https://wa.me/905391316421?text=Merhaba%20IsBul%20KKTC%2C%20ilan%20paketleri%20ve%20aday%20havuzu%20aktivasyonu%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum.",
} as const;

const tr: MarketingCopy = {
  subject: "🎯 6 Dilde İlan, Google'da Zirve, Canlı Aday Havuzu — İşe Alımınız Bitmiştir",
  preheader:
    "İlanlarınız otomatik 6 dile çevrilir, Google Jobs'a entegre olur ve binlerce aday profiline anında erişirsiniz. Kredi kartı yok, doğrudan WhatsApp'tan başlayın.",
  heading: "Doğru yetenekler size gelsin, siz sadece seçin",
  greeting: "Sayın Yetkili,",
  paragraphs: [
    "Kuzey Kıbrıs'ta doğru adaya ulaşmak için artık onlarca farklı kanal ve karmaşık Excel tablolarıyla uğraşmanıza gerek yok.",
    "İşBul KKTC, ilanlarınızı tek tıkla 6 dile çevirip dünyaya açan, Google'da en üst sıraya taşıyan ve başvuruları profesyonelce yönetmenizi sağlayan bölgenin en güçlü kariyer ağıdır.",
  ],
  featuresHeading: "İşBul KKTC ile işletmeniz şunları kazanır:",
  features: [
    {
      title: "🌍 6 dilde ilan yayınlayın — Google'da önde yer alın",
      body: "tr, en, ru, el, fa, de desteğiyle ilanlarınız otomatik olarak 6 dilde yayına girer. Google Jobs şeması entegrasyonu sayesinde arama sonuçlarında üst sıralara çıkar, uluslararası ve yerel aday kitlesine aynı anda ulaşırsınız.",
    },
    {
      title: "🔍 Aday havuzunu keşfedin — sadece başvurularla sınırlı kalmayın",
      body: "Platformdaki binlerce aday profilini filtreleyerek, ilanınıza başvurmayan ama tam uyan yetenekleri de bulun. Arama ve filtreleme araçlarıyla doğru adaya saniyeler içinde ulaşın.",
    },
    {
      title: "⚡ CV/başvuru yönetimini tek panelden otomatikleştirin",
      body: "Adaylar CV yükler, sistem anında yapılandırılmış profil oluşturur. Başvuruları kanban panellere taşıyın, not ekleyin, takımınızla paylaşın — e-posta zincirleri ve Excel tabloları tarihe karışıyor.",
    },
    {
      title: "✅ Doğrulanmış şirket rozeti — güven kazanın, başvuru artın",
      body: "Şirket kimlik doğrulaması geçen işletmelere 'Doğrulanmış' rozeti verilir. Rozetteki işletmeler aday gözünde öne çıkar, başvuru oranları ölçülebilir derecede artar.",
    },
    {
      title: "📦 Esnek ilan paketleri — ihtiyacınıza göre ödeyin",
      body: "Tek ilan, aylık sınırsız, kurumsal yıllık paketler. Süre dolduğunda otomatik yenileme yok, gizli ücret yok. Şeffaf fiyatlandırma ile bütçenizi siz yönetin.",
    },
  ],
  closing: "İşe alım sürecinizi bugün aynı tek platformda başlatın.",
  packagesLead: "İşletmenize uygun ilan paketlerini inceleyin ve hemen başlayın:",
  registerLead: "Veya doğrudan destek ekibimizle iletişime geçin:",
  primaryCta: "WhatsApp'tan Hemen Başlayın",
  secondaryCta: "E-posta ile Bilgi Alın",
  signOff:
    "Saygılarımızla, İşBul KKTC — Kuzey Kıbrıs'ta iş ve istihdam için dijital buluşma noktası",
  contactHeading: "Hızlı iletişim — karar vermek istiyorsanız:",
  contactLabels: { email: "E-posta", phone: "Telefon", whatsapp: "WhatsApp" },
  unsubscribeLabel: "Abonelikten çık",
  footerNote:
    "Bu e-postayı, İşBul KKTC'nin işletmeniz için yararlı olabileceğini düşündüğümüz için aldınız.",
};

const en: MarketingCopy = {
  subject: "🎯 6 Languages, Top Google Rank, Live Candidate Pool — Your Hiring Is Done",
  preheader:
    "Your listings auto-translate to 6 languages, integrate with Google Jobs, and unlock instant access to thousands of candidates. No credit card — start directly via WhatsApp.",
  heading: "Let the right talent come to you — you just choose",
  greeting: "Dear Hiring Manager,",
  paragraphs: [
    "Finding the right candidate in Northern Cyprus no longer requires juggling dozens of channels and messy spreadsheets.",
    "İşBul KKTC is the region's most powerful career network — your listings go live in 6 languages, rank top on Google Jobs, and give you professional application management in a single click.",
  ],
  featuresHeading: "With İşBul KKTC, your business gains:",
  features: [
    {
      title: "🌍 Publish in 6 languages — rank top on Google",
      body: "Listings automatically go live in tr, en, ru, el, fa, de. Google Jobs schema integration pushes your posts to top search positions, reaching international and local talent simultaneously.",
    },
    {
      title: "🔍 Explore the candidate pool — don't limit yourself to applicants",
      body: "Filter thousands of candidate profiles on the platform to find talent that didn't even apply to your listing. Search and filtering tools surface the right fit in seconds.",
    },
    {
      title: "⚡ Automate CV/application management from one dashboard",
      body: "Candidates upload CVs, the system instantly creates structured profiles. Move applications across kanban boards, add notes, share with your team — email chains and spreadsheets become history.",
    },
    {
      title: "✅ Verified company badge — build trust, increase applications",
      body: "Companies that pass identity verification receive a 'Verified' badge. Verified businesses stand out to candidates, measurably increasing application rates.",
    },
    {
      title: "📦 Flexible listing packages — pay for what you need",
      body: "Single listing, monthly unlimited, annual corporate packages. No auto-renewal surprises, no hidden fees. Transparent pricing puts you in control of your budget.",
    },
  ],
  closing: "Start running your hiring process on one platform today.",
  packagesLead: "Review the listing packages that fit your business and get started:",
  registerLead: "Or contact our support team directly:",
  primaryCta: "Start via WhatsApp",
  secondaryCta: "Get Info by Email",
  signOff:
    "Best regards, İşBul KKTC — the digital meeting point for jobs and employment in Northern Cyprus",
  contactHeading: "Quick contact — if you want to decide fast:",
  contactLabels: { email: "Email", phone: "Phone", whatsapp: "WhatsApp" },
  unsubscribeLabel: "Unsubscribe",
  footerNote:
    "You received this email because we believe İşBul KKTC could be useful for your business.",
};

const ru: MarketingCopy = {
  subject: "🎯 6 языков, топ Google, живая база кандидатов — ваш найм завершён",
  preheader:
    "Ваши вакансии автоматически переводятся на 6 языков, интегрируются с Google Jobs и дают мгновенный доступ к тысячам кандидатов. Без кредитной карты — начните прямо через WhatsApp.",
  heading: "Пусть правильные таланты найдут вас — вы только выбирайте",
  greeting: "Уважаемый руководитель,",
  paragraphs: [
    "Для поиска подходящего кандидата на Северном Кипре больше не нужно ловлиться между десятками каналов и хаотичными таблицами.",
    "İşBul KKTC — самая мощная платформа занятости региона: ваши вакансии уходят в эфир на 6 языках, занимают верхние позиции в Google Jobs и дают профессиональное управление откликами в один клик.",
  ],
  featuresHeading: "С İşBul KKTC ваша компания получает:",
  features: [
    {
      title: "🌍 Публикуйте на 6 языках — будьте в топе Google",
      body: "Вакансии автоматически публикуются на tr, en, ru, el, fa, de. Интеграция со схемой Google Jobs поднимает ваши объявления в топ выдачи, охватывая международную и локальную аудиторию одновременно.",
    },
    {
      title: "🔍 Изучайте базу кандидатов — не ограничивайтесь откликами",
      body: "Фильтруйте тысячи профилей кандидатов на платформе, чтобы найти таланты, которые не откликались на вашу вакансию. Инструменты поиска и фильтрации находят идеального кандидата за секунды.",
    },
    {
      title: "⚡ Автоматизируйте управление резюме/откликами из одной панели",
      body: "Кандидаты загружают резюме, система мгновенно создает структурированные профили. Перемещайте отклики по канбан-доскам, добавляйте заметки, делитесь с командой — цепочки писем и таблицы остаются в прошлом.",
    },
    {
      title: "✅ Верифицированная значка компании — выигрывайте доверие, увеличивайте отклики",
      body: "Компании, прошедшие верификацию личности, получают значок 'Верифицирован'. Верифицированные бизнесы выделяются в глазах кандидатов, измеримо увеличивая количество откликов.",
    },
    {
      title: "📦 Гибкие тарифы на вакансии — платите за то, что нужно",
      body: "Одна вакансия, безлимит на месяц, корпоративный годовой пакет. Никаких неожиданных автопродлений, никаких скрытых комиссий. Прозрачная цена дает вам контроль над бюджетом.",
    },
  ],
  closing: "Начните вести процесс найма на одной платформе уже сегодня.",
  packagesLead: "Ознакомьтесь с тарифами, подходящими для вашего бизнеса, и начните:",
  registerLead: "Или свяжитесь с нашей командой поддержки напрямую:",
  primaryCta: "Начать через WhatsApp",
  secondaryCta: "Получить информацию по email",
  signOff:
    "С уважением, İşBul KKTC — цифровая точка встречи для работы и занятости в Северном Кипре",
  contactHeading: "Быстрая связь — если хотите решить быстро:",
  contactLabels: { email: "Эл. почта", phone: "Телефон", whatsapp: "WhatsApp" },
  unsubscribeLabel: "Отписаться",
  footerNote:
    "Вы получили это письмо, потому что мы считаем, что İşBul KKTC может быть полезен вашей компании.",
};

const el: MarketingCopy = {
  subject: "🎯 6 Γλώσσες, Κορυφή στο Google, Ζωντανό Πλαίσιο Υποψηφίων — Η Πρόσληψή σας Ολοκληρώθηκε",
  preheader:
    "Οι αγγελίες σας μεταφράζονται αυτόματα σε 6 γλώσσες, ενσωματώνονται στο Google Jobs και σας δίνουν άμεση πρόσβαση σε χιλιάδες υποψηφίους. Χωρίς πιστωτική κάρτα — ξεκινήστε απευθείας μέσω WhatsApp.",
  heading: "Ας έρθει το σωστό τάλεντο κοντά σας — εσείς απλά επιλέγετε",
  greeting: "Αξιότιμε/η,",
  paragraphs: [
    "Η εύρεση του σωστού υποψηφίου στη Βόρεια Κύπρο δεν απαιτεί πλέον να ξεχωρίζετε μεταξύ δεκάδων καναλιών και хаотиχών υπολογιστικών φύλλων.",
    "Το İşBul KKTC είναι το ισχυρότερο δίκτυο καριέρας της περιοχής — οι αγγελίες σας δημοσιεύονται σε 6 γλώσσες, κατακτώνται την κορυφή του Google Jobs και σας προσφέρουν επαγγελματική διαχείριση αιτήσεων με ένα κλικ.",
  ],
  featuresHeading: "Με το İşBul KKTC η επιχείρησή σας κερδίζει:",
  features: [
    {
      title: "🌍 Δημοσιεύστε σε 6 γλώσσες — κατακτήστε την κορυφή του Google",
      body: "Οι αγγελίες δημοσιεύονται αυτόματα στα tr, en, ru, el, fa, de. Η ενσωμάτωση σχήματος Google Jobs αναβαθμίζει τις αγγελίες σας στην κορυφή των αποτελεσμάτων αναζήτησης, φτάνοντας ταυτόχρονα διεθνή και τοπικό ταλέντο.",
    },
    {
      title: "🔍 Εξερευνήστε το σύνολο υποψηφίων — μην περιορίζεστε στις αιτήσεις",
      body: "Φιλτράρετε χιλιάδες προφίλ υποψηφίων στην πλατφόρμα για να βρείτε ταλέντα που δεν έκαναν καν αιτήσεις. Τα εργαλεία αναζήτησης και φιλτράρισης εντοπίζουν το ιδανικό match δευτερόλεπτα.",
    },
    {
      title: "⚡ Αυτοματοποιήστε τη διαχείριση CV/αιτήσεων από έναν πίνακα",
      body: "Οι υποψήφιοι ανεβάζουν CV, το σύστημα δημιουργεί άμεσα δομημένα προφίλ. Μετακινείτε αιτήσεις σε kanban πίνακες, προσθέτετε σημειώσεις, μοιράζεστε με την ομάδα — αλυσίδες email και υπολογιστικά φύλλα γίνονται παρελθόν.",
    },
    {
      title: "✅ Επιβεβαιωμένο βεϊλ εταιρείας — χτίστε εμπιστοσύνη, αυξήστε αιτήσεις",
      body: "Οι επιχειρήσεις που περνάνε την επαλήθευση ταυτότητας λαμβάνουν βεϊλ 'Επιβεβαιωμένο'. Οι επιβεβαιωμένες επιχειρήσεις ξεχωρίζουν στους υποψηφίους, αυξάνοντας μετρήσιμα τις αιτήσεις.",
    },
    {
      title: "📦 Ελαστικά πακέτα αγγελιών — πληρώστε για ό,τι χρειάζεστε",
      body: "Μια αγγελία, απεριόριστο μηνιαίο, ετήσιο εταιρικό πακέτο. Καμία εκπληκτική αυτόματη ανανέωση, καμία κρυφή χρέωση. Διαφανές pricing σας δίνει τον έλεγχο του προϋπολογισμού.",
    },
  ],
  closing: "Ξεκινήστε να διαχειρίζεστε τη διαδικασία πρόσληψης σε μία πλατφόρμα σήμερα.",
  packagesLead: "Δείτε τα πακέτα αγγελιών που ταιριάζουν στην επιχείρησή σας και ξεκινήστε:",
  registerLead: "Ή επικοινωνήστε άμεσα με την ομάδα υποστήριξής μας:",
  primaryCta: "Ξεκινήστε μέσω WhatsApp",
  secondaryCta: "Λάβετε πληροφορίες με email",
  signOff:
    "Με εκτίμηση, İşBul KKTC — το ψηφιακό σημείο συνάντησης για εργασία και απασχόληση στη Βόρεια Κύπρο",
  contactHeading: "Γρήγορη επικοινωνία — αν θέλετε να αποφασίσετε τώρα:",
  contactLabels: { email: "Email", phone: "Τηλέφωνο", whatsapp: "WhatsApp" },
  unsubscribeLabel: "Διαγραφή",
  footerNote:
    "Λάβατε αυτό το email επειδή πιστεύουμε ότι το İşBul KKTC μπορεί να είναι χρήσιμο για την επιχείρησή σας.",
};

const fa: MarketingCopy = {
  subject: "🎯 ۶ زبان، رتبه اول گوگل، مخزن زنده کارجویان — استخدام شما تمام شد",
  preheader:
    "آگهی‌های شما به‌صورت خودکار به ۶ زبان ترجمه می‌شوند، با Google Jobs یکپارچه می‌شوند و دسترسی فوری به هزاران کارجوی را فراهم می‌کنند. بدون کارت اعتباری — مستقیماً از طریق واتس‌اپ آغاز کنید.",
  heading: "بگذارید تا بهترین استعدادها به سراغ شما بیایند — شما فقط انتخاب کنید",
  greeting: "مدیر محترم،",
  paragraphs: [
    "یافتن کارجوی مناسب در Kuzey Kıbrıs دیگر نیازی به جستجو در ده‌ها کانال مختلف و 엑سل‌های مضطرب ندارد.",
    "İşBul KKTC قدرتمندترین شبکه کار و اشتغال منطقه است — آگهی‌های شما در ۶ زبان منتشر می‌شوند، در رتبه اول Google Jobs قرار می‌گیرند و مدیریت حرفه‌ای درخواست‌ها را با یک کلیک فراهم می‌کنند.",
  ],
  featuresHeading: "با İşBul KKTC، کسب‌وکار شما موارد زیر را بدست می‌آورد:",
  features: [
    {
      title: "🌍 در ۶ زبان آگهی دهید — در رتبه اول Google قرار بگیرید",
      body: "آگهی‌ها به‌صورت خودکار در tr، en، ru، el، fa، de منتشر می‌شوند. یکپارچه‌سازی با اسکیمای Google Jobs آگهی‌های شما را در نتایج جستجوی بالایی قرار می‌دهد و همزمان مخاطبین بین‌المللی و محلی را پوشش می‌دهد.",
    },
    {
      title: "🔍 مجموعه کارجویان را کاوش کنید — به درخواست‌های آگهی محدود نمانید",
      body: "هزاران پروفایل کارجوی در پلتفرم را فیلتر کنید تا talentoهایی را پیدا کنید که اصلا به آگهی شما درخواست نداده‌اند. ابزارهای جستجو و فیلتر، فرد مناسب را در ثانیه‌ها شناسایی می‌کنند.",
    },
    {
      title: "⚡ مدیریت CV/درخواست‌ها را از یک داشبورد خودکار کنید",
      body: "کارجویان CV بارگذاری می‌کنند، سیستم بلافاصله پروفایل ساختاریافته می‌سازد. درخواست‌ها را در بردهای kanban جابجا کنید، یادداشت اضافه کنید، با تیم به اشتراک بگذارید — زنجیره‌های ایمیل و اکسل‌ها گذشته می‌شوند.",
    },
    {
      title: "✅ نشانه تایید شرکت — اعتماد بسازید، درخواست‌ها را افزایش دهید",
      body: "شرکت‌هایی که احراز هویت را می‌گذرند، نشانه «تایید شده» دریافت می‌کنند. شرکت‌های تایید شده در نظر کارجویان برجسته می‌شوند و نرخ درخواست‌ها به‌صورت قابل‌قياسی افزایش می‌یابد.",
    },
    {
      title: "📦 بسته‌های آگهی انعطاف‌پذیر — برای نیاز خود بپردازید",
      body: "یک آگهی، نامحدود ماهانه، بسته سالانه سازمانی. هیچ تمدید خودکار شگفت‌انگیزی، هیچ هزینه مخفی. قیمت‌گذاری شفاف، کنترل بودجه را به دست شما می‌دهد.",
    },
  ],
  closing: "فرایند استخدام خود را امروز در یک پلتفرم آغاز کنید.",
  packagesLead: "بسته‌های آگهی مناسب کسب‌وکار خود را ببینید و آغاز کنید:",
  registerLead: "یا مستقیماً با تیم پشتیبانی ما تماس بگیرید:",
  primaryCta: "از طریق واتس‌اپ آغاز کنید",
  secondaryCta: "دریافت اطلاعات از طریق ایمیل",
  signOff:
    "با احترام، İşBul KKTC — نقطه دیدار دیجیتال برای کار و اشتغال در قبرس شمالی",
  contactHeading: "تماس سریع — اگر می‌خواهید سریع تصمیم بگیرید:",
  contactLabels: { email: "ایمیل", phone: "تلفن", whatsapp: "واتس‌اپ" },
  unsubscribeLabel: "لغو اشتراک",
  footerNote:
    "این ایمیل را دریافت کردید چون فکر می‌کنیم İşBul KKTC می‌تواند برای کسب‌وکار شما مفید باشد.",
};

const de: MarketingCopy = {
  subject: "🎯 6 Sprachen, Top-Google-Platz, Live-Kandidatenpool — Ihr Einstellungsprozess ist erledigt",
  preheader:
    "Ihre Anzeigen werden automatisch in 6 Sprachen übersetzt, in Google Jobs integriert und geben Ihnen sofortigen Zugriff auf Tausende Kandidaten. Keine Kreditkarte — starten Sie direkt per WhatsApp.",
  heading: "Lassen Sie die richtigen Talente zu sich kommen — Sie wählen nur aus",
  greeting: "Sehr geehrte Damen und Herren,",
  paragraphs: [
    "Die Suche nach dem richtigen Kandidaten in Nordzypern erfordert nicht mehr das Jonglieren zwischen Dutzenden Kanälen und chaotischen Tabellen.",
    "İşBul KKTC ist das stärkste Karrierenetzwerk der Region — Ihre Anzeigen gehen in 6 Sprachen live, erreichen Top-Platzierungen bei Google Jobs und geben Ihnen professionelles Bewerbermanagement mit einem Klick.",
  ],
  featuresHeading: "Mit İşBul KKTC gewinnt Ihr Unternehmen:",
  features: [
    {
      title: "🌍 In 6 Sprachen veröffentlichen — bei Google ganz oben stehen",
      body: "Anzeigen gehen automatisch in tr, en, ru, el, fa, de live. Die Google-Jobs-Schema-Integration katapultiert Ihre Anzeigen an die Spitze der Suchergebnisse und erreicht internationale sowie lokale Talente gleichzeitig.",
    },
    {
      title: "🔍 Kandidatenpool durchsuchen — nicht auf Bewerbungen beschränkt",
      body: "Filtern Sie tausende Kandidatenprofile auf der Plattform, um Talente zu finden, die sich gar nicht auf Ihre Anzeige beworben haben. Such- und Filtertools finden den perfekten Match in Sekunden.",
    },
    {
      title: "⚡ CV/Bewerbungs-Management aus einem Dashboard automatisieren",
      body: "Kandidaten laden CVs hoch, das System erstellt sofort strukturierte Profile. Bewerbungen auf Kanban-Boards verschieben, Notizen hinzufügen, mit dem Team teilen — E-Mail-Ketten und Tabellen gehören der Vergangenheit an.",
    },
    {
      title: "✅ Verifiziertes Firmen-Badge — Vertrauen schaffen, Bewerbungen steigern",
      body: "Unternehmen, die die Identitätsprüfung bestehen, erhalten ein 'Verifiziert'-Badge. Verifizierte Unternehmen stechen Kandidaten ins Auge und erhöhen die Bewerbungsrate messbar.",
    },
    {
      title: "📦 Flexible Anzeigenpakete — zahlen Sie nur für das, was Sie brauchen",
      body: "Einzelanzeige, monatlich unbegrenzt, jährliches Corporate-Paket. Keine automatischen Verlängerungen, keine versteckten Gebühren. Transparente Preise geben Ihnen die Budgetkontrolle.",
    },
  ],
  closing: "Starten Sie Ihren Einstellungsprozess noch heute auf einer Plattform.",
  packagesLead: "Sehen Sie sich die Anzeigenpakete an, die zu Ihrem Unternehmen passen, und legen Sie los:",
  registerLead: "Oder kontaktieren Sie unser Support-Team direkt:",
  primaryCta: "Per WhatsApp starten",
  secondaryCta: "Info per E-Mail anfordern",
  signOff:
    "Mit freundlichen Grüßen, İşBul KKTC — der digitale Treffpunkt für Arbeit und Beschäftigung in Nordzypern",
  contactHeading: "Schneller Kontakt — wenn Sie schnell entscheiden wollen:",
  contactLabels: { email: "E-Mail", phone: "Telefon", whatsapp: "WhatsApp" },
  unsubscribeLabel: "Abmelden",
  footerNote:
    "Sie erhalten diese E-Mail, weil wir glauben, dass İşBul KKTC für Ihr Unternehmen nützlich sein könnte.",
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