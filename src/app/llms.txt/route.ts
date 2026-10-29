import { routing } from "@/i18n/routing";
import { getAppBaseUrl } from "@/server/config/app-url";

export const dynamic = "force-static";

/**
 * Plain-text brief for answer engines and AI crawlers (the llms.txt convention).
 * Served from the app origin so the URLs stay absolute and canonical.
 */
export function GET() {
  const baseUrl = getAppBaseUrl();
  const origin = baseUrl.origin;
  const body = `# İşBul KKTC

> Kuzey Kıbrıs Türk Cumhuriyeti (KKTC) için iş ve kariyer platformu. İş arayanlar
> ilanları arar ve başvurur; işverenler ilan yayınlar ve başvuruları yönetir.

Desteklenen diller: ${routing.locales.join(", ")}. Varsayılan dil: ${routing.defaultLocale}.
Bölge: Kuzey Kıbrıs Türk Cumhuriyeti. Para birimi: TRY (₺).

## Ana sayfalar

- [İş ilanları](${origin}/jobs): Bölgeye ve çalışma biçimine göre filtrelenebilir güncel ilanlar.
- [Şirketler](${origin}/companies): KKTC'de faaliyet gösteren işverenler dizini.
- [Freelance](${origin}/freelance): Serbest çalışma ve proje işleri.
- [Paketler](${origin}/packages): İşverenler için ilan yayınlama paketleri.
- [Hakkımızda](${origin}/about)
- [Blog](${origin}/blog): Kariyer ve işe alım rehberleri.
- [İletişim](${origin}/contact)

## Kaynaklar

- [Site haritası](${origin}/sitemap.xml)
- [robots.txt](${origin}/robots.txt)

## Notlar

- İlan detay sayfaları \`schema.org/JobPosting\` yapılandırılmış verisi içerir.
- Yayınlanan ilanlar platformun kendi ilanları ve kamuya açık kaynak işveren
  listelerinden derlenmiştir; kaynak ilanlar için provenans kaydı tutulur.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
