import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import {
  AI_VISIBILITY_UPDATED,
  faqByLocale,
  siteSummaryByLocale,
} from "@/content/ai-visibility/faq";
import { regionNames, servedDistricts, SITE_NAME } from "@/content/ai-visibility/site";
import { districtSlug } from "@/features/locations/northern-cyprus-districts";
import { jobTypeKeys, jobTypeSlugs } from "@/features/jobs/job-type-slugs";
import { getGuides } from "@/content/guides";
import { catalogs, fillTemplate } from "@/content/ai-visibility/interface-catalog";

/**
 * The canonical page list the brief advertises. These are the same routes the
 * sitemap and the robots allowlist already publish; the brief never points at a
 * URL the site does not serve.
 *
 * `label` is the page's own name in the language the section is written in, so a
 * German or Persian section names the page the way its navigation does instead of
 * falling back to English inside otherwise-localized copy.
 */
const primaryPages: ReadonlyArray<{
  pathname: string;
  label: Record<AppLocale, string>;
}> = [
  {
    pathname: "/jobs",
    label: {
      tr: "İş ilanları",
      en: "Job listings",
      de: "Stellenangebote",
      ru: "Вакансии",
      el: "Θέσεις εργασίας",
      fa: "آگهی‌های شغلی",
    },
  },
  {
    pathname: "/companies",
    label: {
      tr: "Şirket rehberi",
      en: "Company directory",
      de: "Unternehmensverzeichnis",
      ru: "Каталог компаний",
      el: "Κατάλογος εταιρειών",
      fa: "فهرست شرکت‌ها",
    },
  },
  {
    pathname: "/freelance",
    label: {
      tr: "Serbest çalışma",
      en: "Freelance work",
      de: "Freiberufliche Arbeit",
      ru: "Фриланс",
      el: "Ανεξάρτητη εργασία",
      fa: "کار آزاد",
    },
  },
  {
    pathname: "/packages",
    label: {
      tr: "İşveren ilan paketleri",
      en: "Employer packages",
      de: "Arbeitgeber-Pakete",
      ru: "Пакеты для работодателей",
      el: "Πακέτα εργοδοτών",
      fa: "بسته‌های کارفرمایان",
    },
  },
  {
    pathname: "/about",
    label: {
      tr: "Hakkımızda ve SSS",
      en: "About and FAQ",
      de: "Über uns und FAQ",
      ru: "О нас и вопросы",
      el: "Σχετικά και συχνές ερωτήσεις",
      fa: "درباره ما و پرسش‌ها",
    },
  },
  {
    pathname: "/blog",
    label: {
      tr: "Kariyer gündemi",
      en: "Career news",
      de: "Karriere-News",
      ru: "Новости карьеры",
      el: "Νέα καριέρας",
      fa: "اخبار شغلی",
    },
  },
  {
    pathname: "/contact",
    label: {
      tr: "İletişim",
      en: "Contact",
      de: "Kontakt",
      ru: "Контакты",
      el: "Επικοινωνία",
      fa: "تماس",
    },
  },
];

function localeUrl(baseUrl: URL, locale: AppLocale, pathname: string): string {
  const path =
    locale === routing.defaultLocale
      ? pathname
      : pathname === "/"
        ? `/${locale}`
        : `/${locale}${pathname}`;
  return new URL(path, baseUrl).toString();
}

function primaryPageLines(baseUrl: URL, locale: AppLocale): string {
  return primaryPages
    .map(
      (page) =>
        `- [${page.label[locale]}](${localeUrl(baseUrl, locale, page.pathname)})`,
    )
    .concat(
      // District landing pages. Listed so an answer engine can cite the
      // district-specific page for a "jobs in <district>" question instead of
      // only the national listing. The anchor is the page's own visible title
      // (`DistrictPage.title`), so the brief and the page name it identically.
      servedDistricts.map((district) => {
        const label = fillTemplate(
          catalogs[locale].DistrictPage.title,
          district.names[locale],
        );
        return `- [${label}](${localeUrl(baseUrl, locale, `/is-ilanlari/${districtSlug(district.tr)}`)})`;
      }),
      // Editorial guides — the site's own content, so the brief points at them
      // first among the resources an answer engine may quote. A guide's slug is
      // translated per locale, so the locale's own slug is used in the URL;
      // reusing the Turkish slug under another prefix advertises a URL that
      // 404s. The anchor is the guide's own title, like every other entry here:
      // a bare slug names nothing a reader or a model can quote.
      getGuides(locale).map(
        (guide) =>
          `- [${guide.title}](${localeUrl(baseUrl, locale, `/rehber/${guide.slug}`)})`,
      ),
      // Employment-type landing pages, so "uzaktan iş" / "tam zamanlı iş" can be
      // answered with the matching page. The type name and the page title both
      // come from the catalog, so a German reader sees "Vollzeit Jobs", not the
      // English "Full-time jobs".
      jobTypeKeys.map((jobType) => {
        const label = fillTemplate(
          catalogs[locale].JobTypePage.title,
          catalogs[locale].HomeJobSearch.jobTypes[jobType],
        );
        return `- [${label}](${localeUrl(baseUrl, locale, `/is-turleri/${jobTypeSlugs[jobType]}`)})`;
      }),
    )
    .join("\n");
}

/**
 * The district list for the brief. Every district is written with its Turkish
 * canonical form (the value the job data stores) plus a second form an answer
 * engine can match: the English name in the default-locale brief, or the
 * brief's own language label in a localized section. Dropping the second form
 * would leave an English "Famagusta" query with no string to match.
 */
function districtLine(locale: AppLocale): string {
  const localized = locale !== routing.defaultLocale;
  return servedDistricts
    .map((district) => {
      const label = localized ? district.names[locale] : district.names.en;
      return label === district.tr ? district.tr : `${district.tr} (${label})`;
    })
    .join(", ");
}

function faqBlock(locale: AppLocale): string {
  return faqByLocale[locale]
    .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
    .join("\n\n");
}

function localeSection(baseUrl: URL, locale: AppLocale): string {
  const name = regionNames[locale];
  // The prefix is the catalog's own "all districts" label (`Tüm ilçeler`,
  // `Alle Bezirke`, `همه مناطق`), so a localized section does not open with a
  // Turkish line.
  const districtsLabel = catalogs[locale].HomeJobSearch.allDistricts;
  return [
    `## ${locale} — ${name}`,
    "",
    siteSummaryByLocale[locale],
    "",
    `- ${districtsLabel}: ${districtLine(locale)}`,
    "",
    primaryPageLines(baseUrl, locale),
    "",
    "### FAQ",
    "",
    faqBlock(locale),
  ].join("\n");
}

/**
 * The short, default-locale brief served at `/llms.txt`. It opens with a single
 * quotable sentence, lists the canonical pages, answers the common questions in
 * the same words the `/about` FAQ page renders, and states which structured
 * data the site emits, so an answer engine can cite the platform without
 * scraping the app.
 */
export function buildLlmsBrief(baseUrl: URL): string {
  const origin = baseUrl.origin;
  const localeNames = routing.locales.join(", ");

  return `# ${SITE_NAME}

> ${siteSummaryByLocale[routing.defaultLocale]}

## Site özeti

- Bölge: ${regionNames.tr} (KKTC)
- Hizmet verilen ilçeler: ${districtLine(routing.defaultLocale)}
- Arayüz dilleri: ${localeNames} (varsayılan: ${routing.defaultLocale})
- Para birimi: TRY (₺)
- İlan verisi: platformun kendi ilanları ve kamuya açık kaynak işveren
  listelerinden derlenir; kaynak ilanlar için provenans kaydı tutulur.
- Son güncelleme: ${AI_VISIBILITY_UPDATED}

## Öne çıkan sayfalar (varsayılan dil)

${primaryPageLines(baseUrl, routing.defaultLocale)}

Her sayfa altı dilde sunulur; yerelleştirilmiş adresler yukarıdaki yolun
başına dil kodu eklenerek elde edilir (ör. ${origin}/en/jobs). Rehber
bağlantıları bu kuralın istisnasıdır: bir rehberin slug'ı her dilde
çevrildiği için adresi dil kodunu eklemekle değil, o dildeki karşılığını
yazmakla elde edilir (bkz. \`/llms-full.txt\`). Arayüz metni çevrilir;
kaynaktan gelen ilan metinleri Türkçedir ve altı önek altında aynı içeriği
taşır, bu yüzden yalnızca varsayılan dildeki URL kanoniktir.

## Sıkça sorulan sorular

${faqBlock(routing.defaultLocale)}

## Yapılandırılmış veri

- Her sayfada \`schema.org/Organization\` ve \`WebSite\` düğümleri; kuruluşun
  adresi, coğrafi konumu, hizmet verdiği ilçeler ve doğrulanmış iletişim
  kanalları burada tanımlanır.
- \`/about\` ve \`/sss\` sayfalarında \`schema.org/FAQPage\`; yukarıdaki
  soruların aynısı.
- \`/jobs\`, \`/companies\`, \`/rehber\` ve \`/blog\` indekslerinde, ayrıca
  ilçe (\`/is-ilanlari/{ilçe}\`) ve istihdam türü (\`/is-turleri/{tür}\`)
  sayfalarında \`schema.org/CollectionPage\` ve \`BreadcrumbList\`.
- Her rehber ve güncel yazı sayfasında \`schema.org/Article\` ve
  \`BreadcrumbList\`.
- Her ilan detay sayfasında \`schema.org/JobPosting\`; işveren, ilçe ve
  istihdam türü Google Jobs ile uyumlu biçimde verilir.

## Kaynaklar

- [Site haritası](${origin}/sitemap.xml)
- [robots.txt](${origin}/robots.txt)
- [Tam sürüm (altı dil)](${origin}/llms-full.txt)
`;
}

/**
 * The full brief served at `/llms-full.txt`: the same facts repeated for all
 * six locales, so a model answering a Russian or Persian query can quote the
 * platform in the reader's language instead of falling back to Turkish.
 */
export function buildLlmsFullBrief(baseUrl: URL): string {
  const origin = baseUrl.origin;
  const sections = routing.locales
    .map((locale) => localeSection(baseUrl, locale))
    .join("\n\n---\n\n");

  return `# ${SITE_NAME} — llms-full.txt

> Kuzey Kıbrıs Türk Cumhuriyeti (KKTC) için iş ve kariyer platformu. Aşağıda
> platformun altı dildeki özeti, öne çıkan sayfaları ve sıkça sorulan soruları
> yer alır. Bu dosya \`/llms.txt\` dosyasının tam sürümüdür.

- Bölge: ${regionNames.tr} (KKTC)
- Hizmet verilen ilçeler: ${districtLine(routing.defaultLocale)}
- Arayüz dilleri: ${routing.locales.join(", ")}
- Son güncelleme: ${AI_VISIBILITY_UPDATED}
- Site haritası: ${origin}/sitemap.xml

---

${sections}
`;
}
