import type { AppLocale } from "@/i18n/routing";
import { routing } from "@/i18n/routing";
import {
  AI_VISIBILITY_UPDATED,
  faqByLocale,
  siteSummaryByLocale,
} from "@/content/ai-visibility/faq";
import { regionNames, servedDistricts, SITE_NAME } from "@/content/ai-visibility/site";

/**
 * The canonical page list the brief advertises. These are the same routes the
 * sitemap and the robots allowlist already publish; the brief never points at a
 * URL the site does not serve.
 */
const primaryPages: ReadonlyArray<{ pathname: string; tr: string; en: string }> =
  [
    { pathname: "/jobs", tr: "İş ilanları", en: "Job listings" },
    { pathname: "/companies", tr: "Şirket rehberi", en: "Company directory" },
    { pathname: "/freelance", tr: "Serbest çalışma", en: "Freelance work" },
    { pathname: "/packages", tr: "İşveren ilan paketleri", en: "Employer packages" },
    { pathname: "/about", tr: "Hakkımızda ve SSS", en: "About and FAQ" },
    { pathname: "/blog", tr: "Kariyer gündemi", en: "Career news" },
    { pathname: "/contact", tr: "İletişim", en: "Contact" },
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
    .map((page) => {
      const label = locale === routing.defaultLocale ? page.tr : page.en;
      return `- [${label}](${localeUrl(baseUrl, locale, page.pathname)})`;
    })
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
  return [
    `## ${locale} — ${name}`,
    "",
    siteSummaryByLocale[locale],
    "",
    `- Hizmet verilen ilçeler: ${districtLine(locale)}`,
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
başına dil kodu eklenerek elde edilir (ör. ${origin}/en/jobs). Arayüz metni
çevrilir; kaynaktan gelen ilan metinleri Türkçedir ve altı önek altında aynı
içeriği taşır, bu yüzden yalnızca varsayılan dildeki URL kanoniktir.

## Sıkça sorulan sorular

${faqBlock(routing.defaultLocale)}

## Yapılandırılmış veri

- Her sayfada \`schema.org/Organization\` ve \`WebSite\` düğümleri; kuruluşun
  adresi, coğrafi konumu, hizmet verdiği ilçeler ve doğrulanmış iletişim
  kanalları burada tanımlanır.
- \`/about\` sayfasında \`schema.org/FAQPage\`; yukarıdaki soruların aynısı.
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
