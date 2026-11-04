# LANE-SEO — teknik SEO, indeksleme, sitemap, canonical, OG

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- Site: **isbulkktc.com**, Next.js 16 App Router, `localePrefix: "as-needed"`, 6 dil (tr default + en/ru/de/fa/el).
- **Bilinen tuzaklar:** canonical **mutlak string** olmalı (`getLocalizedPageUrl(...).toString()`), `URL` instance'ı base sanılır. İçe aktarılan ilanlar TR metin → `createLocalizedPageMetadata({ contentLocale })` localized `alternates.languages`'ı atlar. Sitemap `revalidate = 3600`. `/jobs?page=N` ve filtreli URL'ler `/jobs`'a canonical'lanır.
- **Doğrulama etiketleri:** `NEXT_PUBLIC_{GOOGLE,BING,YANDEX}_SITE_VERIFICATION` — kod hazır, Vercel env değeri girilince yayınlanır (şu an **yok**).
- Şu an sitemap 334 `<loc>`; katalog 21'e indi → sitemap bir sonraki `revalidate`'de düşer.

## Sahip olduğun yollar
`src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts`,
`src/app/[locale]/**/opengraph-image.tsx`, `src/app/[locale]/**/twitter-image.tsx`,
`scripts/submit-indexnow.mjs`, **ve `src/app/[locale]/**` route/layout dosyaları**
(metadata, `<head>`, JSON-LD mount). **Bu route dosyalarının TEK sahibi sensin** —
`layout.tsx` ve `jobs/[slug]/page.tsx` dahil. JSON-LD'nin *şekli* GEO'nun üretici
modülünden gelir; *mount*'u sen yaparsın. TASARIM görsel/JSX değişikliği isterse
sana rapor eder.

## Yapılacaklar
1. **Sitemap:** 21 ilana göre doğru `<loc>`/`<lastmod>`; ölü URL yok; `revalidate` doğru.
2. **Canonical/hreflang:** her rota + her dil için self-canonical ve `x-default` doğru mu? İçe aktarılan ilanlarda duplicate yok mu? (`/tr/jobs/...` vs `/jobs/...`)
3. **robots.txt:** `noindex` veren sayfaları `Disallow` ETME kuralı korunuyor mu? `seo.spec.ts` bunu doğruluyor.
4. **OG/Twitter kartları:** `og-cover.webp` (1200×630, ~161 KB) doğru bağlı mı; sayfa-özel OG üretimi gerekiyor mu?
5. **Structured data:** `JobPosting` (addressCountry CY), `Organization`, `BreadcrumbList`, `WebSite`+`SearchAction` tam mı? Rich Results uyumu.
6. **IndexNow:** endpoint fallback + Vercel alias mantığı korunuyor mu?
7. **Core Web Vitals etkisi:** LCP/CLS'e zarar veren meta/font/script var mı (SEO açısından).

## Kurallar
- Değişikliği **canlı sunucuda** doğrula (dev sunucusu bazı hataları gizler). Gerekirse `NEXT_DIST_DIR=.next-lane-seo npm run build` sonra `git checkout -- tsconfig.json next-env.d.ts`.
- Her iddiayı HTML çıktısından `grep` ile kanıtla (`<link rel="canonical"`, `hreflang`, `og:image`).
- `check:frontend-source` ve `seo.spec.ts` yeşil kalmalı.

## Raporla
Bulgu tablosu (rota → mevcut → olması gereken → kanıt) + uygulanan düzeltmeler + sahibin girmesi gereken env değerleri. Branch + PR, CI yeşil.

---

## Uygulama raporu (lane/seo)

```
Lane: LANE-SEO        Branch: lane/seo        PR: (bu rapordan sonra açıldı)
Değişen dosyalar: src/lib/seo.ts, src/app/sitemap.ts,
                  src/app/[locale]/(public)/rehber/[slug]/page.tsx,
                  src/app/[locale]/(public)/blog/[slug]/page.tsx,
                  docs/lanes/03-seo.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅
                  test:unit ✅ (353/353)  build ✅ (NEXT_DIST_DIR=.next-lane-seo)
                  canlı standalone HTML/sitemap doğrulaması ✅
Canlıya dokundu mu: hayır (yalnızca okuma; canlı Supabase'e yazı yok)
```

### Bulgu 1 — Rehber ve blog sayfalarının `hreflang` + sitemap URL'leri 404 veriyordu (YÜKSEK)

**Rota:** `/[locale]/rehber/[slug]`, `/[locale]/blog/[slug]` — 6 dil × 6 içerik.

**Mevcut (bozuk):** Rehber ve blog yazılarının slug'ı her dilde çevrilidir
(`kktc-is-bulma-rehberi` ↔ `finding-a-job-in-northern-cyprus`), ama
`createLocalizedPageMetadata` tek bir `pathname` alıp her dilin önüne aynı slug'ı
koyuyordu. Sonuç: her sayfa, var olmayan 5 kardeş URL'i `hreflang` olarak ilan
ediyor ve sitemap aynı 5 ölü URL'i listeliyordu.

**Olması gereken:** Her dil için o dilin *kendi* slug'ı (`hreflang` karşılıklı ve
kendine-canonical).

**Kanıt (düzeltme öncesi, üretim standalone sunucusu):**
- Sitemap'te 186 `<loc>` vardı, bunlardan **30'u 404** dönüyordu
  (24'ü 5 dilde rehber/blog detayları + ilgili karışıklıklar).
- `/en/rehber/finding-a-job-in-northern-cyprus` sayfasının `hreflang="de"` hedefi
  `/de/rehber/finding-a-job-in-northern-cyprus` idi → **404**
  (doğrusu `/de/rehber/arbeit-finden-in-nordzypern`).

**Kanıt (düzeltme sonrası):** Sitemap 186 `<loc>`; **0 ölü URL**; 900 çeviri
`hreflang` hedefi 200 döndü; her dilde `hreflang` kümesi birebir aynı ve
kendine-canonical doğru.

**Uygulanan düzeltme:**
- `src/lib/seo.ts`: `getLocalizedSlugPathnames({ section, locale, slug, siblings })`
  eklendi — slug'ı sahibi olduğu dilde bulup *sıra numarasıyla* her dilin kardeş
  slug'ına eşler (liste uzunluğu farklıysa güvenli tarafa, kendi slug'ına düşer).
  `createLocalizedPageMetadata` artık opsiyonel `localizedPathnames` alıyor;
  canonical + `hreflang` + `x-default` hepsi ondan üretiliyor.
- `rehber/[slug]/page.tsx` ve `blog/[slug]/page.tsx`: `localizedPathnames` geçildi.
- `src/app/sitemap.ts`: rehber/blog detay girdileri kardeş slug'la üretiliyor.
  Ayrıca tekrar eden `languages` kurulumu tek `buildLocalizedEntries` yardımcısına
  indirildi (davranış aynı; `changefreq`/`priority`/`lastmod` değerleri korundu).

### Bulgu tablosu

| Rota | Mevcut | Olması gereken | Kanıt |
|---|---|---|---|
| `/[locale]/rehber/[slug]` | 5 dilde 404 `hreflang` | her dil kendi slug'ı | önce 404 / sonra 200 |
| `/[locale]/blog/[slug]` | 5 dilde 404 `hreflang` | her dil kendi slug'ı | önce 404 / sonra 200 |
| `sitemap.xml` | 30 ölü `<loc>` | yalnız 200 veren URL | `curl` taraması |
| `/robots.txt` | doğru (`Disallow` yok) | değişmeden korundu | `seo.spec.ts` kuralı |
| canonical (statik/ilan) | doğru, mutlak string | korundu | `curl` |

### Sahibin girmesi gereken env değerleri

- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `NEXT_PUBLIC_BING_SITE_VERIFICATION`,
  `NEXT_PUBLIC_YANDEX_SITE_VERIFICATION` — kod hazır; Vercel'de değer girilince
  etiketler yayınlanır. **Hâlâ yok.**

### Sonraki lane için notlar

- `feed.xml` ve `llms.txt` yalnızca varsayılan dil (tr) slug'larını kullanıyor ve
  bunlar 200 dönüyor; dokunulmadı.
- Bu düzeltme yalnızca çeviri slug'ı olan **içerik** ailelerini kapsar; ilçe
  (`/is-ilanlari/*`) ve çalışma türü (`/is-turleri/*`) slug'ları her dilde aynı
  olduğu için zaten doğruydu.
