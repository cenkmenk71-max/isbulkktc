/**
 * Localized employer-acquisition copy. Package names, audiences, summaries and
 * terms mirror the public package catalogue in src/messages so prices and
 * entitlements are not duplicated or allowed to drift in email campaigns.
 */

import { resolveEmailLocale, type EmailLocale } from "./email-copy.ts";

export type MarketingFeature = { icon: string; title: string; body: string };
export type MarketingPackage = { name: string; audience: string; description: string; scope: string };
export type MarketingCopy = {
  subject: string; preheader: string; heading: string; greeting: string;
  paragraphs: string[]; featuresHeading: string; features: MarketingFeature[];
  closing: string; packagesLead: string; registerLead: string;
  primaryCta: string; secondaryCta: string; signOff: string; contactHeading: string;
  contactLabels: { email: string; phone: string; whatsapp: string };
  unsubscribeLabel: string; footerNote: string; heroHook: string; heroSubhook: string;
  packagesHeading: string; pricingNote: string; durationLabel: string; packageCta: string;
  whatsappCta: string; whatsappLead: string; whatsappMessage: string;
  packages: Record<"singleListing" | "growth" | "professional" | "enterprise", MarketingPackage>;
};

export const MARKETING_CONTACTS = {
  email: "info@isbulkktc.com",
  phoneDisplay: "0539 131 64 21",
  phoneTel: "+905391316421",
  whatsapp: "https://wa.me/905391316421",
} as const;

export const MARKETING_COPY: Record<EmailLocale, MarketingCopy> = {
  "tr": {
    "subject": "İşBul KKTC işveren paketleri: işe alım kapsamınızı seçin",
    "preheader": "Tek ilan, en fazla üç veya beş ilan ya da kurumsal teklif. Her ilan için 1, 7 veya 30 günlük süre seçeneklerini inceleyin.",
    "heading": "İşe alım ihtiyacınıza uygun ilan paketini seçin",
    "greeting": "Sayın Yetkili,",
    "paragraphs": [
      "İşBul KKTC işveren paketleri, aynı anda yayınlamak istediğiniz açık pozisyon sayısına göre farklı ilan hakları sunar.",
      "Her ilan için 1, 7 veya 30 gün seçebilirsiniz. Kurumsal paketin ilan adedi ve kapsamı yazılı teklifte netleştirilir."
    ],
    "featuresHeading": "Paketlerin temel farkları",
    "features": [
      {
        "icon": "01",
        "title": "Tek açık pozisyon",
        "body": "Tek İlan paketi, bir açık pozisyon için 1 ilan hakkı sunar."
      },
      {
        "icon": "03",
        "title": "Birden fazla pozisyon",
        "body": "Büyüme paketi, aynı dönemde en fazla 3 ilan hakkı sunar."
      },
      {
        "icon": "05",
        "title": "Düzenli işe alım",
        "body": "Profesyonel paketi, aynı dönemde en fazla 5 ilan hakkı sunar."
      },
      {
        "icon": "✓",
        "title": "Kurumsal kapsam",
        "body": "Kurumsal paketin ilan adedi, kapsamı ve süresi yazılı teklifte netleştirilir."
      }
    ],
    "closing": "Paket kapsamlarını inceleyin ve ihtiyacınıza uygun seçeneği ekibimizle netleştirin.",
    "packagesLead": "İşveren paketlerini ilan kapsamı ve süre seçenekleriyle karşılaştırın.",
    "registerLead": "Ödeme web sitesinde alınmaz. IBAN ve ödeme talimatı, paket görüşmesi sonrasında özel olarak iletilir.",
    "primaryCta": "Paketleri incele",
    "secondaryCta": "E-posta taslağını aç",
    "signOff": "Saygılarımızla, İşBul KKTC",
    "unsubscribeLabel": "Abonelikten çık",
    "footerNote": "Bu e-posta, İşBul KKTC'nin işverenlere yönelik ilan paketleri hakkında bilgilendirme amacıyla gönderilmiştir.",
    "packageCta": "Paketi incele",
    "whatsappLead": "Seçtiğiniz ilan paketi ve kapsamı hakkında ekibimizle görüşün.",
    "whatsappMessage": "Merhaba, İşBul KKTC ilan paketleri hakkında bilgi almak istiyorum. Lütfen paket kapsamı ve ödeme adımları hakkında bilgi paylaşır mısınız?",
    "heroHook": "İşe alım ihtiyacınıza uygun ilan paketini seçin",
    "heroSubhook": "İlan adedini belirleyin; her ilan için 1, 7 veya 30 gün seçin.",
    "packagesHeading": "İşe alımınıza uygun ilan paketini seçin.",
    "pricingNote": "Güncel ilan paketi koşullarını inceleyin; ödeme web sitesinde alınmaz. IBAN ve ödeme talimatı, paket görüşmesi sonrasında özel olarak iletilir.",
    "durationLabel": "İlan süresi: Her ilan için 1, 7 veya 30 gün",
    "whatsappCta": "WhatsApp taslağını aç",
    "contactHeading": "Seçtiğiniz ilan paketi hakkında ekibimize ulaşın.",
    "contactLabels": {
      "email": "E-posta",
      "phone": "Telefon",
      "whatsapp": "WhatsApp"
    },
    "packages": {
      "singleListing": {
        "audience": "TEK AÇIK POZİSYON",
        "name": "Tek İlan",
        "description": "Bir pozisyonu, ihtiyacınıza uygun 1, 7 veya 30 günlük süreyle yayımlamak için.",
        "scope": "1 ilan hakkı · Her ilan için 1, 7 veya 30 gün · Tek bir açık pozisyon için"
      },
      "growth": {
        "audience": "BİRDEN FAZLA POZİSYON",
        "name": "Büyüme",
        "description": "Aynı dönemde en fazla üç pozisyon için sade ve ölçülü bir ilan kapsamı.",
        "scope": "En fazla 3 ilan hakkı · Her ilan için 1, 7 veya 30 gün · Birden fazla pozisyon için"
      },
      "professional": {
        "audience": "DÜZENLİ İŞE ALIM",
        "name": "Profesyonel",
        "description": "Aynı dönemde en fazla beş pozisyon yayımlayan işe alım ekipleri için.",
        "scope": "En fazla 5 ilan hakkı · Her ilan için 1, 7 veya 30 gün · Düzenli işe alım yapan ekipler için"
      },
      "enterprise": {
        "audience": "KURUMSAL İŞE ALIM",
        "name": "Kurumsal",
        "description": "İlan adedi ve süreleri önceden belirlenmiş, yazılı özel teklif isteyen kuruluşlar için.",
        "scope": "İlan adedi yazılı teklifte netleştirilir · Her ilan için 1, 7 veya 30 gün · Kapsam ve süre teklif öncesi onaylanır"
      }
    }
  },
  "en": {
    "subject": "İşBul KKTC employer packages: choose your hiring scope",
    "preheader": "Compare one-, up-to-three and up-to-five listing options, with 1, 7 or 30 days per listing. Corporate scope is agreed in a written quote.",
    "heading": "Choose a listing package for your hiring needs",
    "greeting": "Dear Hiring Manager,",
    "paragraphs": [
      "İşBul KKTC employer packages provide listing allowances based on the number of open roles you need to publish at the same time.",
      "Choose 1, 7 or 30 days for each listing. The listing quantity and scope for a corporate package are defined in a written quote."
    ],
    "featuresHeading": "How the packages differ",
    "features": [
      {
        "icon": "01",
        "title": "One open role",
        "body": "Single Listing includes one job listing for one open role."
      },
      {
        "icon": "03",
        "title": "Multiple open roles",
        "body": "Growth includes up to three listings at the same time."
      },
      {
        "icon": "05",
        "title": "Regular hiring",
        "body": "Professional includes up to five listings at the same time."
      },
      {
        "icon": "✓",
        "title": "Corporate scope",
        "body": "The listing quantity, scope and duration for Corporate are agreed in a written quote."
      }
    ],
    "closing": "Review the package scope and discuss the option that fits your hiring needs with our team.",
    "packagesLead": "Compare employer packages by listing allowance and duration.",
    "registerLead": "Payment is not collected on the website. IBAN details and payment instructions are shared privately after discussing the package.",
    "primaryCta": "View packages",
    "secondaryCta": "Open email draft",
    "signOff": "Best regards, İşBul KKTC",
    "unsubscribeLabel": "Unsubscribe",
    "footerNote": "This email provides information about İşBul KKTC listing packages for employers.",
    "packageCta": "View package",
    "whatsappLead": "Speak with our team about the selected listing package and its scope.",
    "whatsappMessage": "Hello, I would like information about İşBul KKTC listing packages. Please share the package scope and payment steps.",
    "heroHook": "Choose a listing package for your hiring needs",
    "heroSubhook": "Choose your listing allowance, then select 1, 7 or 30 days per listing.",
    "packagesHeading": "Choose a job package that fits your hiring.",
    "pricingNote": "Explore job packages. Payment is not collected on the website; IBAN details and payment instructions are shared privately by email or WhatsApp after discussing the package.",
    "durationLabel": "Listing duration: Choose 1, 7 or 30 days per listing",
    "whatsappCta": "Open WhatsApp draft",
    "contactHeading": "Contact our team about this listing package.",
    "contactLabels": {
      "email": "Email",
      "phone": "Phone",
      "whatsapp": "WhatsApp"
    },
    "packages": {
      "singleListing": {
        "audience": "ONE OPEN ROLE",
        "name": "Single Listing",
        "description": "Publish one role for the duration that fits: 1, 7 or 30 days.",
        "scope": "1 job listing · Choose 1, 7 or 30 days per listing · For one open position"
      },
      "growth": {
        "audience": "MULTIPLE OPEN ROLES",
        "name": "Growth",
        "description": "Straightforward listing capacity for up to three open roles at a time.",
        "scope": "Up to 3 job listings · Choose 1, 7 or 30 days per listing · For multiple open positions"
      },
      "professional": {
        "audience": "REGULAR HIRING",
        "name": "Professional",
        "description": "For hiring teams publishing up to five open roles at a time.",
        "scope": "Up to 5 job listings · Choose 1, 7 or 30 days per listing · For teams hiring regularly"
      },
      "enterprise": {
        "audience": "ENTERPRISE HIRING",
        "name": "Corporate",
        "description": "For organisations that need a written quote with clearly defined listing quantities and durations.",
        "scope": "Listing quantity is set in the written quote · Choose 1, 7 or 30 days per listing · Scope and duration agreed before the quote"
      }
    }
  },
  "ru": {
    "subject": "Пакеты İşBul KKTC для работодателей: выберите объём найма",
    "preheader": "Сравните пакеты на 1, до 3 и до 5 объявлений. Для каждого объявления доступны сроки 1, 7 или 30 дней; корпоративные условия фиксируются письменно.",
    "heading": "Выберите пакет объявлений для ваших задач найма",
    "greeting": "Уважаемый работодатель!",
    "paragraphs": [
      "Пакеты İşBul KKTC предоставляют разное количество объявлений в зависимости от числа открытых вакансий, которые вы хотите публиковать одновременно.",
      "Для каждого объявления можно выбрать срок 1, 7 или 30 дней. Количество объявлений и объём корпоративного пакета фиксируются в письменном предложении."
    ],
    "featuresHeading": "Чем отличаются пакеты",
    "features": [
      {
        "icon": "01",
        "title": "Одна открытая вакансия",
        "body": "Пакет «Одно объявление» включает одно объявление для одной открытой вакансии."
      },
      {
        "icon": "03",
        "title": "Несколько вакансий",
        "body": "Пакет «Рост» позволяет одновременно разместить до трёх объявлений."
      },
      {
        "icon": "05",
        "title": "Регулярный найм",
        "body": "Пакет «Профессиональный» позволяет одновременно разместить до пяти объявлений."
      },
      {
        "icon": "✓",
        "title": "Корпоративные условия",
        "body": "Количество объявлений, объём и срок корпоративного пакета согласуются в письменном предложении."
      }
    ],
    "closing": "Изучите условия пакетов и обсудите с нашей командой подходящий вариант.",
    "packagesLead": "Сравните пакеты для работодателей по количеству объявлений и срокам публикации.",
    "registerLead": "Оплата на сайте не принимается. Реквизиты IBAN и инструкции по оплате сообщаются лично после обсуждения пакета.",
    "primaryCta": "Посмотреть пакеты",
    "secondaryCta": "Открыть черновик письма",
    "signOff": "С уважением, İşBul KKTC",
    "unsubscribeLabel": "Отписаться",
    "footerNote": "Это письмо содержит информацию о пакетах объявлений İşBul KKTC для работодателей.",
    "packageCta": "Посмотреть пакет",
    "whatsappLead": "Обсудите с нашей командой выбранный пакет объявлений и его условия.",
    "whatsappMessage": "Здравствуйте! Меня интересуют пакеты объявлений İşBul KKTC. Пожалуйста, расскажите об объёме пакетов и порядке оплаты.",
    "heroHook": "Выберите пакет объявлений для ваших задач найма",
    "heroSubhook": "Выберите количество объявлений и срок публикации: 1, 7 или 30 дней.",
    "packagesHeading": "Выберите пакет вакансий для ваших задач.",
    "pricingNote": "Изучите пакеты вакансий. Оплата производится переводом по IBAN вне сайта; реквизиты и инструкции сообщаются лично после обсуждения условий.",
    "durationLabel": "Срок публикации: 1, 7 или 30 дней для каждого объявления",
    "whatsappCta": "Открыть черновик WhatsApp",
    "contactHeading": "Свяжитесь с нами по поводу выбранного пакета вакансий.",
    "contactLabels": {
      "email": "Эл. почта",
      "phone": "Телефон",
      "whatsapp": "WhatsApp"
    },
    "packages": {
      "singleListing": {
        "audience": "ОДНА ОТКРЫТАЯ ВАКАНСИЯ",
        "name": "Одно объявление",
        "description": "Опубликуйте одну вакансию на подходящий срок: 1, 7 или 30 дней.",
        "scope": "1 объявление о вакансии · 1, 7 или 30 дней для каждого объявления · Для одной открытой вакансии"
      },
      "growth": {
        "audience": "НЕСКОЛЬКО ОТКРЫТЫХ ВАКАНСИЙ",
        "name": "Рост",
        "description": "Простой пакет до трёх одновременно открытых вакансий.",
        "scope": "До 3 объявлений о вакансиях · 1, 7 или 30 дней для каждого объявления · Для нескольких открытых вакансий"
      },
      "professional": {
        "audience": "РЕГУЛЯРНЫЙ НАЙМ",
        "name": "Профессиональный",
        "description": "Для команд, публикующих до пяти открытых вакансий одновременно.",
        "scope": "До 5 объявлений о вакансиях · 1, 7 или 30 дней для каждого объявления · Для команд с регулярным наймом"
      },
      "enterprise": {
        "audience": "КОРПОРАТИВНЫЙ НАЙМ",
        "name": "Корпоративный",
        "description": "Для организаций, которым нужно письменное предложение с точным количеством объявлений и сроками.",
        "scope": "Количество объявлений указывается в письменном предложении · 1, 7 или 30 дней для каждого объявления · Объём и срок согласуются до подготовки предложения"
      }
    }
  },
  "el": {
    "subject": "Πακέτα εργοδοτών İşBul KKTC: επιλέξτε το εύρος προσλήψεων",
    "preheader": "Συγκρίνετε επιλογές για 1, έως 3 και έως 5 αγγελίες, με διάρκεια 1, 7 ή 30 ημερών ανά αγγελία. Οι εταιρικοί όροι συμφωνούνται γραπτώς.",
    "heading": "Επιλέξτε πακέτο αγγελιών για τις ανάγκες προσλήψεών σας",
    "greeting": "Αγαπητέ εργοδότη,",
    "paragraphs": [
      "Τα πακέτα εργοδοτών του İşBul KKTC προσφέρουν διαφορετικό αριθμό αγγελιών ανάλογα με τις ανοιχτές θέσεις που θέλετε να δημοσιεύετε ταυτόχρονα.",
      "Για κάθε αγγελία μπορείτε να επιλέξετε διάρκεια 1, 7 ή 30 ημερών. Ο αριθμός αγγελιών και το εύρος του εταιρικού πακέτου καθορίζονται σε γραπτή προσφορά."
    ],
    "featuresHeading": "Οι βασικές διαφορές των πακέτων",
    "features": [
      {
        "icon": "01",
        "title": "Μία ανοιχτή θέση",
        "body": "Το πακέτο Μίας Αγγελίας περιλαμβάνει μία αγγελία για μία ανοιχτή θέση."
      },
      {
        "icon": "03",
        "title": "Πολλαπλές θέσεις",
        "body": "Το πακέτο Ανάπτυξης περιλαμβάνει έως τρεις αγγελίες ταυτόχρονα."
      },
      {
        "icon": "05",
        "title": "Τακτικές προσλήψεις",
        "body": "Το Επαγγελματικό πακέτο περιλαμβάνει έως πέντε αγγελίες ταυτόχρονα."
      },
      {
        "icon": "✓",
        "title": "Εταιρικό εύρος",
        "body": "Ο αριθμός, το εύρος και η διάρκεια των εταιρικών αγγελιών συμφωνούνται σε γραπτή προσφορά."
      }
    ],
    "closing": "Εξετάστε το εύρος των πακέτων και συζητήστε με την ομάδα μας την κατάλληλη επιλογή.",
    "packagesLead": "Συγκρίνετε τα πακέτα εργοδοτών ως προς τον αριθμό και τη διάρκεια των αγγελιών.",
    "registerLead": "Η πληρωμή δεν πραγματοποιείται στον ιστότοπο. Τα στοιχεία IBAN και οι οδηγίες πληρωμής αποστέλλονται ιδιωτικά μετά τη συζήτηση του πακέτου.",
    "primaryCta": "Δείτε τα πακέτα",
    "secondaryCta": "Άνοιγμα προσχεδίου email",
    "signOff": "Με εκτίμηση, İşBul KKTC",
    "unsubscribeLabel": "Κατάργηση εγγραφής",
    "footerNote": "Αυτό το email παρέχει πληροφορίες για τα πακέτα αγγελιών του İşBul KKTC για εργοδότες.",
    "packageCta": "Προβολή πακέτου",
    "whatsappLead": "Συζητήστε με την ομάδα μας για το επιλεγμένο πακέτο και το εύρος του.",
    "whatsappMessage": "Γεια σας, θα ήθελα πληροφορίες για τα πακέτα αγγελιών του İşBul KKTC. Παρακαλώ ενημερώστε με για το εύρος των πακέτων και τα βήματα πληρωμής.",
    "heroHook": "Επιλέξτε πακέτο αγγελιών για τις ανάγκες προσλήψεών σας",
    "heroSubhook": "Επιλέξτε αριθμό αγγελιών και διάρκεια 1, 7 ή 30 ημερών για καθεμία.",
    "packagesHeading": "Επιλέξτε πακέτο αγγελιών που ταιριάζει στις ανάγκες σας.",
    "pricingNote": "Εξερευνήστε τα πακέτα αγγελιών. Η πληρωμή γίνεται με μεταφορά IBAN εκτός ιστοτόπου· τα στοιχεία και οι οδηγίες κοινοποιούνται ιδιωτικά μετά τη συζήτηση των όρων.",
    "durationLabel": "Διάρκεια αγγελίας: Επιλέξτε 1, 7 ή 30 ημέρες ανά αγγελία",
    "whatsappCta": "Άνοιγμα πρόχειρου WhatsApp",
    "contactHeading": "Επικοινωνήστε μαζί μας για αυτό το πακέτο αγγελιών.",
    "contactLabels": {
      "email": "Email",
      "phone": "Τηλέφωνο",
      "whatsapp": "WhatsApp"
    },
    "packages": {
      "singleListing": {
        "audience": "ΜΙΑ ΑΝΟΙΧΤΗ ΘΕΣΗ",
        "name": "Μία αγγελία",
        "description": "Δημοσιεύστε μία θέση για 1, 7 ή 30 ημέρες, ανάλογα με τις ανάγκες σας.",
        "scope": "1 αγγελία εργασίας · Επιλέξτε 1, 7 ή 30 ημέρες ανά αγγελία · Για μία ανοιχτή θέση"
      },
      "growth": {
        "audience": "ΠΟΛΛΕΣ ΑΝΟΙΧΤΕΣ ΘΕΣΕΙΣ",
        "name": "Ανάπτυξη",
        "description": "Απλή δυνατότητα δημοσίευσης έως τριών ανοιχτών θέσεων ταυτόχρονα.",
        "scope": "Έως 3 αγγελίες εργασίας · Επιλέξτε 1, 7 ή 30 ημέρες ανά αγγελία · Για πολλές ανοιχτές θέσεις"
      },
      "professional": {
        "audience": "ΤΑΚΤΙΚΕΣ ΠΡΟΣΛΗΨΕΙΣ",
        "name": "Επαγγελματικό",
        "description": "Για ομάδες προσλήψεων που δημοσιεύουν έως πέντε ανοιχτές θέσεις ταυτόχρονα.",
        "scope": "Έως 5 αγγελίες εργασίας · Επιλέξτε 1, 7 ή 30 ημέρες ανά αγγελία · Για ομάδες με τακτικές προσλήψεις"
      },
      "enterprise": {
        "audience": "ΕΤΑΙΡΙΚΕΣ ΠΡΟΣΛΗΨΕΙΣ",
        "name": "Εταιρικό",
        "description": "Για οργανισμούς που χρειάζονται γραπτή προσφορά με καθορισμένο αριθμό και διάρκεια αγγελιών.",
        "scope": "Ο αριθμός αγγελιών ορίζεται στη γραπτή προσφορά · Επιλέξτε 1, 7 ή 30 ημέρες ανά αγγελία · Το εύρος και η διάρκεια συμφωνούνται πριν από την προσφορά"
      }
    }
  },
  "fa": {
    "subject": "بسته‌های کارفرمایان İşBul KKTC: دامنه استخدام خود را انتخاب کنید",
    "preheader": "گزینه‌های ۱، حداکثر ۳ و حداکثر ۵ آگهی را مقایسه کنید؛ مدت هر آگهی ۱، ۷ یا ۳۰ روز است. شرایط سازمانی در پیشنهاد کتبی تعیین می‌شود.",
    "heading": "بسته آگهی متناسب با نیاز استخدام خود را انتخاب کنید",
    "greeting": "کارفرمای گرامی،",
    "paragraphs": [
      "بسته‌های کارفرمایان İşBul KKTC بر اساس تعداد موقعیت‌های شغلی بازی که می‌خواهید هم‌زمان منتشر کنید، ظرفیت‌های متفاوتی ارائه می‌کنند.",
      "برای هر آگهی می‌توانید مدت ۱، ۷ یا ۳۰ روز را انتخاب کنید. تعداد آگهی‌ها و دامنه بسته سازمانی در پیشنهاد کتبی مشخص می‌شود."
    ],
    "featuresHeading": "تفاوت اصلی بسته‌ها",
    "features": [
      {
        "icon": "01",
        "title": "یک موقعیت شغلی باز",
        "body": "بسته یک آگهی شامل یک آگهی برای یک موقعیت شغلی باز است."
      },
      {
        "icon": "03",
        "title": "چند موقعیت شغلی",
        "body": "بسته رشد امکان انتشار هم‌زمان حداکثر سه آگهی را فراهم می‌کند."
      },
      {
        "icon": "05",
        "title": "استخدام منظم",
        "body": "بسته حرفه‌ای امکان انتشار هم‌زمان حداکثر پنج آگهی را فراهم می‌کند."
      },
      {
        "icon": "✓",
        "title": "دامنه سازمانی",
        "body": "تعداد، دامنه و مدت آگهی‌های سازمانی در پیشنهاد کتبی توافق می‌شود."
      }
    ],
    "closing": "دامنه بسته‌ها را بررسی کنید و گزینه مناسب را با تیم ما نهایی کنید.",
    "packagesLead": "بسته‌های کارفرمایان را از نظر تعداد آگهی و مدت انتشار مقایسه کنید.",
    "registerLead": "پرداخت در وب‌سایت انجام نمی‌شود. اطلاعات IBAN و دستورالعمل پرداخت پس از گفتگو درباره بسته به‌صورت خصوصی ارسال می‌شود.",
    "primaryCta": "مشاهده بسته‌ها",
    "secondaryCta": "باز کردن پیش‌نویس ایمیل",
    "signOff": "با احترام، İşBul KKTC",
    "unsubscribeLabel": "لغو اشتراک",
    "footerNote": "این ایمیل برای ارائه اطلاعات درباره بسته‌های آگهی İşBul KKTC ویژه کارفرمایان ارسال شده است.",
    "packageCta": "مشاهده بسته",
    "whatsappLead": "درباره بسته انتخابی و دامنه آن با تیم ما گفتگو کنید.",
    "whatsappMessage": "سلام، مایل به دریافت اطلاعات درباره بسته‌های آگهی İşBul KKTC هستم. لطفاً دامنه بسته‌ها و مراحل پرداخت را توضیح دهید.",
    "heroHook": "بسته آگهی متناسب با نیاز استخدام خود را انتخاب کنید",
    "heroSubhook": "تعداد آگهی را انتخاب کنید، سپس برای هر آگهی مدت ۱، ۷ یا ۳۰ روز را برگزینید.",
    "packagesHeading": "بسته‌ای متناسب با نیاز استخدام خود انتخاب کنید.",
    "pricingNote": "بسته‌های آگهی را بررسی کنید. پرداخت از طریق انتقال IBAN و خارج از وب‌سایت انجام می‌شود؛ اطلاعات بانکی پس از گفتگو درباره شرایط بسته به‌صورت خصوصی ارسال می‌شود.",
    "durationLabel": "مدت انتشار آگهی: انتخاب ۱، ۷ یا ۳۰ روز برای هر آگهی",
    "whatsappCta": "باز کردن پیش‌نویس واتس‌اپ",
    "contactHeading": "درباره این بسته آگهی با تیم ما تماس بگیرید.",
    "contactLabels": {
      "email": "ایمیل",
      "phone": "تلفن",
      "whatsapp": "WhatsApp"
    },
    "packages": {
      "singleListing": {
        "audience": "یک موقعیت شغلی باز",
        "name": "یک آگهی",
        "description": "یک موقعیت را برای مدت مناسب خود، یعنی ۱، ۷ یا ۳۰ روز منتشر کنید.",
        "scope": "۱ آگهی شغلی · انتخاب ۱، ۷ یا ۳۰ روز برای هر آگهی · برای یک موقعیت شغلی باز"
      },
      "growth": {
        "audience": "چند موقعیت شغلی باز",
        "name": "رشد",
        "description": "ظرفیت ساده برای انتشار هم‌زمان حداکثر سه موقعیت شغلی باز.",
        "scope": "تا ۳ آگهی شغلی · انتخاب ۱، ۷ یا ۳۰ روز برای هر آگهی · برای چند موقعیت شغلی باز"
      },
      "professional": {
        "audience": "استخدام منظم",
        "name": "حرفه‌ای",
        "description": "برای تیم‌هایی که هم‌زمان حداکثر پنج موقعیت شغلی باز منتشر می‌کنند.",
        "scope": "تا ۵ آگهی شغلی · انتخاب ۱، ۷ یا ۳۰ روز برای هر آگهی · برای تیم‌هایی با استخدام منظم"
      },
      "enterprise": {
        "audience": "استخدام سازمانی",
        "name": "سازمانی",
        "description": "برای سازمان‌هایی که پیشنهاد کتبی با تعداد و مدت مشخص آگهی نیاز دارند.",
        "scope": "تعداد آگهی‌ها در پیشنهاد کتبی مشخص می‌شود · انتخاب ۱، ۷ یا ۳۰ روز برای هر آگهی · دامنه و مدت پیش از ارائه پیشنهاد توافق می‌شود"
      }
    }
  },
  "de": {
    "subject": "İşBul KKTC Arbeitgeberpakete: Wählen Sie Ihren Personalbedarf",
    "preheader": "Vergleichen Sie Optionen für 1, bis zu 3 und bis zu 5 Anzeigen. Je Anzeige sind 1, 7 oder 30 Tage möglich; Unternehmensumfänge werden schriftlich vereinbart.",
    "heading": "Wählen Sie ein Anzeigenpaket passend zu Ihrem Personalbedarf",
    "greeting": "Guten Tag,",
    "paragraphs": [
      "Die Arbeitgeberpakete von İşBul KKTC bieten unterschiedliche Anzeigenkontingente, je nachdem, wie viele offene Stellen Sie gleichzeitig veröffentlichen möchten.",
      "Für jede Anzeige können Sie 1, 7 oder 30 Tage wählen. Anzahl, Umfang und Laufzeit eines Unternehmenspakets werden in einem schriftlichen Angebot festgelegt."
    ],
    "featuresHeading": "Die wichtigsten Paketunterschiede",
    "features": [
      {
        "icon": "01",
        "title": "Eine offene Stelle",
        "body": "Das Einzelanzeigenpaket umfasst eine Stellenanzeige für eine offene Stelle."
      },
      {
        "icon": "03",
        "title": "Mehrere offene Stellen",
        "body": "Das Wachstumspaket umfasst bis zu drei gleichzeitig veröffentlichte Anzeigen."
      },
      {
        "icon": "05",
        "title": "Regelmäßige Personalsuche",
        "body": "Das Professional-Paket umfasst bis zu fünf gleichzeitig veröffentlichte Anzeigen."
      },
      {
        "icon": "✓",
        "title": "Unternehmensumfang",
        "body": "Anzahl, Umfang und Laufzeit der Unternehmensanzeigen werden schriftlich vereinbart."
      }
    ],
    "closing": "Prüfen Sie den Paketumfang und besprechen Sie mit unserem Team die passende Option.",
    "packagesLead": "Vergleichen Sie Arbeitgeberpakete nach Anzeigenkontingent und Laufzeit.",
    "registerLead": "Zahlungen werden nicht auf der Website angenommen. IBAN-Daten und Zahlungsanweisungen erhalten Sie nach Besprechung des Pakets privat.",
    "primaryCta": "Pakete ansehen",
    "secondaryCta": "E-Mail-Entwurf öffnen",
    "signOff": "Mit freundlichen Grüßen, İşBul KKTC",
    "unsubscribeLabel": "Abbestellen",
    "footerNote": "Diese E-Mail informiert über die Anzeigenpakete von İşBul KKTC für Arbeitgeber.",
    "packageCta": "Paket ansehen",
    "whatsappLead": "Besprechen Sie das ausgewählte Anzeigenpaket und seinen Umfang mit unserem Team.",
    "whatsappMessage": "Guten Tag, ich hätte gerne Informationen zu den Anzeigenpaketen von İşBul KKTC. Bitte informieren Sie mich über Paketumfang und Zahlungsablauf.",
    "heroHook": "Wählen Sie ein Anzeigenpaket passend zu Ihrem Personalbedarf",
    "heroSubhook": "Legen Sie die Anzahl der Anzeigen fest und wählen Sie je Anzeige 1, 7 oder 30 Tage.",
    "packagesHeading": "Wählen Sie ein Stellenpaket passend zu Ihrem Bedarf.",
    "pricingNote": "Entdecken Sie Anzeigenpakete. Die Zahlung erfolgt per IBAN-Überweisung außerhalb der Website; Bankdaten und Anweisungen werden nach Besprechung der Paketbedingungen privat mitgeteilt.",
    "durationLabel": "Anzeigendauer: Je Anzeige 1, 7 oder 30 Tage",
    "whatsappCta": "WhatsApp-Entwurf öffnen",
    "contactHeading": "Kontaktieren Sie uns zu diesem Stellenanzeigenpaket.",
    "contactLabels": {
      "email": "E-Mail",
      "phone": "Telefon",
      "whatsapp": "WhatsApp"
    },
    "packages": {
      "singleListing": {
        "audience": "EINE OFFENE STELLE",
        "name": "Einzelanzeige",
        "description": "Veröffentlichen Sie eine Stelle für 1, 7 oder 30 Tage – passend zu Ihrem Bedarf.",
        "scope": "1 Stellenanzeige · Je Anzeige 1, 7 oder 30 Tage · Für eine offene Stelle"
      },
      "growth": {
        "audience": "MEHRERE OFFENE STELLEN",
        "name": "Wachstum",
        "description": "Einfacher Anzeigenumfang für bis zu drei gleichzeitig offene Stellen.",
        "scope": "Bis zu 3 Stellenanzeigen · Je Anzeige 1, 7 oder 30 Tage · Für mehrere offene Stellen"
      },
      "professional": {
        "audience": "REGELMÄSSIGE PERSONALSUCHE",
        "name": "Professionell",
        "description": "Für Teams, die bis zu fünf offene Stellen gleichzeitig veröffentlichen.",
        "scope": "Bis zu 5 Stellenanzeigen · Je Anzeige 1, 7 oder 30 Tage · Für Teams mit regelmäßigem Personalbedarf"
      },
      "enterprise": {
        "audience": "PERSONALSUCHE FÜR UNTERNEHMEN",
        "name": "Unternehmen",
        "description": "Für Organisationen, die ein schriftliches Angebot mit festgelegter Anzeigenzahl und Laufzeit benötigen.",
        "scope": "Die Anzeigenzahl wird im schriftlichen Angebot festgelegt · Je Anzeige 1, 7 oder 30 Tage · Umfang und Laufzeit werden vor dem Angebot vereinbart"
      }
    }
  }
};

export function getMarketingCopy(locale: string | null | undefined): MarketingCopy {
  return MARKETING_COPY[resolveEmailLocale(locale)];
}
