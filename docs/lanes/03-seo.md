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
