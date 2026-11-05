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
Lane: LANE-SEO        Branch: lane/seo        PR: #105
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

---

## Micro-denetim raporu — #126 (SEO meta + GEO) ve #127 (link bütünlüğü)

```
Lane: LANE-SEO        Branch: lane/seo        PR: (bu PR)
Değişen dosyalar: src/lib/seo.ts,
                  src/app/[locale]/layout.tsx,
                  src/app/[locale]/(public)/rehber/[slug]/page.tsx,
                  src/app/[locale]/(public)/blog/[slug]/page.tsx,
                  src/app/[locale]/(admin)/admin/packages/page.tsx,
                  src/app/[locale]/(admin)/admin/company-profiles/page.tsx,
                  docs/lanes/03-seo.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅
            test:unit ✅ (380/380)  test:security ✅ (17 pass, 4 belgeli todo)
            build ✅ (NEXT_DIST_DIR=.next-lane-seo)  canlı standalone doğrulaması ✅
Canlıya dokundu mu: hayır (yalnızca okuma)
```

### Denetlenen dosyalar

`git ls-files` ile LANE-SEO sahipliği: **42 dosya** — `src/lib/seo.ts`,
`src/app/sitemap.ts`, `src/app/robots.ts`, `scripts/submit-indexnow.mjs` ve
`src/app/[locale]/**` altındaki **37 route/layout** dosyası. Hepsi tarandı.
Denetlenmeyen: yok.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/app/[locale]/layout.tsx:105` | SEO meta | 404 yanıtı hem `robots: noindex` (Next enjekte eder) hem `googlebot: index, follow` taşıyordu | 404 tek, çelişkisiz bir yönerge taşımalı | Google en kısıtlayıcıyı uygular ama `googlebot` token'ını tek başına okuyan botlar sayfayı indekslenebilir sanar | düzeltildi |
| 2 | `src/app/[locale]/(public)/rehber/[slug]/page.tsx` + `blog/[slug]/page.tsx` | link bütünlüğü | Dil değiştirici, çevrilen slug'lı sayfalarda hedef dilin slug'ını değil, geçerli slug'ı kullanıyor → `/en/rehber/kktc-is-bulma-rehberi` **404** | var olan kardeş sayfaya yönlenmeli | her rehber/blog sayfasında 5 dil için kırık bağlantı (kullanıcı + tarayıcı) | düzeltildi (route'ta 307) |
| 3 | `rehber/[slug]/page.tsx:20`, `blog/[slug]/page.tsx:19` | tutarlılık | `generateStaticParams` her dilde **varsayılan dilin** slug'larını üretiyordu → 6×3 yerine 15'i 404 olan URL ön-render ediliyordu | her dil kendi slug'larını üretmeli | 15 gereksiz/ölü prerender + gerçek sayfalar istek üzerine | düzeltildi |
| 4 | `(admin)/admin/content/page.tsx` | link bütünlüğü | Yönetim konsolu hiçbir yerden bağlantı almıyor (**yetim sayfa**) | admin konsolları birbirine bağlanmalı | panel erişilemez | düzeltildi (packages konsolundan bağlantı) |
| 5 | `(admin)/admin/company-profiles/page.tsx:93` | link bütünlüğü | dış bağlantıda `rel="noreferrer"` var, `noopener` yok | `noopener noreferrer` | `target="_blank"` reverse-tabnabbing yüzeyi | düzeltildi |
| 6 | `src/messages/*.json` `Legal` (48 anahtar × 5 dil) | SEO meta | `/privacy`, `/cookies`, `/terms` başlık+açıklaması **6 dilde de aynı Türkçe** metin | her dil kendi metni | 18 sayfa (3 rota × 6 dil) kopya meta; ayrıca sayfa gövdesi de çevrilmemiş | devredildi |

### Kanıt

- **Bulgu 1** (düzeltme öncesi, üretim standalone sunucusu):
  `curl /this-404` →
  `<meta name="robots" content="noindex"/>` **+**
  `<meta name="googlebot" content="index, follow, …"/>`.
  Google dokümanı: *"For situations where multiple crawlers are specified along
  with different rules, the search engine will use the sum of the negative
  rules."* (developers.google.com/search/docs/crawling-indexing/robots-meta-tag).
  Düzeltme sonrası 404 yalnız `robots: noindex` taşıyor; normal sayfalar
  `googlebot` ipuçlarını koruyor.
- **Bulgu 2** (düzeltme öncesi): `/en/rehber/kktc-is-bulma-rehberi` → **404**.
  Düzeltme sonrası 114 kombinasyon tarandı (6 dil × 6 içerik × geçerli/yanlış
  slug): **0 hata**; yanlış slug'lar 307 ile doğru kardeş sayfaya gidiyor, hiçbir
  dilin tanımadığı slug **404** kalıyor.
- **Bulgu 3**: `generateStaticParams` 18 yerine 90 param üretiyordu; build
  tablosunda `[+15 more paths]` yerine artık her dil kendi 3 slug'ını listeliyor.
- **Bulgu 6**: `node` ile katalog taraması — `Legal` 48 anahtarın tamamı 5 dilde
  tr ile birebir aynı (`{en:48, ru:48, el:48, fa:48, de:48}`). `curl
  /en/privacy` → `<title>Gizlilik Politikası · İşBul KKTC</title>`.

### Doğrulanan ve sağlam bulunanlar

- **Sitemap:** 186 `<loc>`, hepsi 200; her `<loc>` kendi canonical'ı (self-canonical);
  1302 `xhtml:link` hreflang hedefinin tamamı 200.
- **robots.txt:** `noindex` veren sayfaları `Disallow` **etmiyor**; yalnız `/api/`
  ve `/auth/` (meta taşıyamayan route handler'lar). `seo.spec.ts` kuralı korunuyor.
- **OG/Twitter:** her rotada `og-cover.webp` 1200×630 (~161 KB < 300 KB WhatsApp
  bütçesi), `summary_large_image`, 6 dilde yerelleşmiş `og:image:alt`.
- **Canonical:** hepsi mutlak string (`URL` instance tuzağı yok); içe aktarılan
  ilanlar tek (tr) canonical'a indiriyor, hreflang yayınlamıyor.
- **JSON-LD:** `WebSite`+`SearchAction` (`?query=` parametresiyle eşleşiyor),
  `Organization`, `BreadcrumbList`, `CollectionPage`, `FAQPage`, `JobPosting`.
- **IndexNow:** çift endpoint fallback + Vercel alias mantığı korunuyor; anahtar
  dosyası `public/isbulkktc….txt` doğru.
- **`target="_blank"`:** 7 kullanımın tamamı artık `noopener` taşıyor (bulgu 5
  düzeltildikten sonra).

### Sahibin yapması gerekenler

- Bulgu 6 (yasal metinlerin 6 dilde çevirisi) → **#141** açıldı (`agent:blocked`,
  sahibi LANE-URUN: `src/messages/**` + `src/server/dal/content.ts`).
- `NEXT_PUBLIC_{GOOGLE,BING,YANDEX}_SITE_VERIFICATION` — kod hazır, Vercel'de
  değer girilince etiketler yayınlanır. **Hâlâ yok.**

### Sonraki lane için notlar

- Bulgu 2'nin **kök nedeni** `src/components/layout/site-header.tsx` (dil
  değiştirici, LANE-TASARIM sahipliği): `usePathname()` çevrilen slug'ı her dilin
  önüne koyuyor. Route tarafında 307 fallback eklendi (savunma derinliği), ama
  doğru düzeltme header'ın `getPathname`/`localizedPathnames` ile hedef dilin
  slug'ını çözmesidir → LANE-TASARIM'a not.

---

## Micro-denetim raporu — tur 2 (#126 SEO meta + #127 link bütünlüğü)

```
Lane: LANE-SEO        Branch: lane/seo        PR: (bu PR)
Değişen dosyalar: src/lib/seo.ts,
                  src/app/[locale]/layout.tsx,
                  src/app/[locale]/(public)/rehber/[slug]/page.tsx,
                  src/app/[locale]/(public)/blog/[slug]/page.tsx,
                  src/app/robots.ts,
                  docs/lanes/03-seo.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅
            test:unit ✅ (392/392)  seo.spec.ts ✅ (18/20; 2 test seedli ilan verisi ister)  build ✅ (NEXT_DIST_DIR=.next-lane-seo)
            canlı standalone + gerçek tarayıcı (Playwright/chromium) doğrulaması ✅
Canlıya dokundu mu: hayır (yalnızca okuma)
```

### Denetlenen dosyalar

`git ls-files` → LANE-SEO sahipliği **42 dosya**: `src/lib/seo.ts`,
`src/app/sitemap.ts`, `src/app/robots.ts`, `scripts/submit-indexnow.mjs` ve
`src/app/[locale]/**` altındaki 37 route/layout. Hepsi tarandı; "bakılmadı" yok.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/lib/seo.ts` (`createLocalizedPageMetadata`) | SEO meta / tutarlılık | Rehber ve blog detay sayfaları `og:type=website` yayınlıyordu, ama aynı sayfanın JSON-LD'si `Article` | `og:type=article` | Sosyal graf ile sayfanın kendi `@type`'ı çelişir; OGP `article` alanları (published_time vb.) uygulanmaz | düzeltildi |
| 2 | `src/app/robots.ts:18` | link bütünlüğü / indeksleme | `Disallow: /auth/` yalnız öneksiz yolu kapsıyor; gerçek callback URL'leri `/{locale}/auth/callback` (5 dil) → **taranabilir** | her önekli auth yolu da disallow | OAuth callback'i robots meta taşıyamaz; önekli 5 kopya crawler'a açık | düzeltildi |
| 3 | `src/lib/seo.ts` twitter bloğu + `layout.tsx:119` | SEO meta | Hiçbir sayfa `twitter:image:alt` yayınlamıyordu (og:image:alt vardı) | erişilebilir/yerelleşmiş alt | X/Twitter kartında görsel alt metni yok | düzeltildi |

### Kanıt (üretim standalone + gerçek tarayıcı)

- **#1 önce:** `curl /rehber/kktc-is-bulma-rehberi` → `og:type=website` +
  JSON-LD `"@type":"Article"`. **Sonra:** `og:type=article`; `/`, `/jobs`, `/sss`
  `website` kalıyor (39/39 tarayıcı kontrolü geçti).
- **#2 önce:** `curl /robots.txt` → yalnız `Disallow: /auth/`; `/en/auth/callback`
  307 dönüyor (taranabilir). **Sonra:** `Disallow: /en/auth/`, `/ru/auth/`,
  `/el/auth/`, `/fa/auth/`, `/de/auth/` eklendi; `/login`, `/register` hâlâ
  disallow **değil** (noindex meta kuralı korunuyor).
- **#3 önce:** hiçbir sayfada `twitter:image:alt` yok. **Sonra:** her sayfada
  diline göre `og:image:alt` ile aynı metin.

### Doğrulanan ve sağlam bulunanlar (tur 2)

- Sitemap **186 `<loc>`**, hepsi 200; her `<loc>` self-canonical **ve**
  `og:url`'e eşit (186/186).
- Tam tarama (400 sayfa): **0 kırık iç bağlantı**; tüm keşfedilen yollar 200.
- Çevrilen slug'lı sayfaların yanlış-dil slug'ları **307** ile doğru kardeş
  sayfaya gidiyor; bilinmeyen slug **404** (tur 1 düzeltmesi korunuyor).
- 404 yanıtı tek `robots: noindex` taşıyor; çelişkili `googlebot` yok.
- `robots.txt` `noindex` sayfalarını (`/login`, `/admin`, ...) hâlâ disallow
  etmiyor.
- `og:image` 1200×630 (~161 KB) + `og:image:type=image/webp`; `twitter:card`
  `summary_large_image`.
- Canonical hep mutlak string (`URL` instance tuzağı yok); içe aktarılan ilanlar
  tek (tr) canonical.
- JSON-LD tüm sayfalarda geçerli JSON (`WebSite`+`SearchAction`, `Organization`,
  `BreadcrumbList`, `CollectionPage`, `FAQPage`, `Article`); `</script>` kaçağı yok.

### Devredilen (tur 1'den, hâlâ açık)

- **#141** — `/privacy`, `/cookies`, `/terms` meta+gövdesi 6 dilde aynı Türkçe.
  Sahibi LANE-URUN (`src/messages/**`) + LANE-SUPABASE (`seed-managed-content.sql`).

### Sahibin yapması gerekenler

- `NEXT_PUBLIC_{GOOGLE,BING,YANDEX}_SITE_VERIFICATION` — kod hazır, Vercel'de
  değer girilince etiketler yayınlanır. **Hâlâ yok.**
- **#141** çeviri işi.

### Not (tur 2, kanıtlanamayan)

Yerel standalone harness'te 404 sayfası gerçek tarayıcıda boş render edildi
(`<html id="__next_error__">`, `lang` yok). **Üretimde** (`isbulkktc.com`)
aynı URL `404` + `lang` + yerelleşmiş `h1` ile düzgün render ediyor; bu yüzden
yerel gözlem harness artifact'ı olarak işaretlendi, bulgu sayılmadı.
## Micro-denetim turu 3 — regresyon koruması (#126 + #127, aynı lane tekrar)

Bu oturumda `main` ilerlemişti: aynı lane'in önceki turu **#142**'yi merge
etmişti (çevrilmiş-slug yönlendirmesi, 404 robots çelişkisi, iki link boşluğu).
Bu yüzden aynı düzeltmeyi **tekrar yazmadım**; onun yerine kalan boşluğu kapattım.

### Kalan boşluk: hiç regresyon testi yoktu

Bu hata sınıfı **iki kez** shiple çıktı (#105 ve #142) ve **hiçbir birim testi**
`getLocalizedSlugPathnames` / `resolveLocalizedSlugPathname` sözleşmesini
tutmuyordu:

```
grep -rn 'resolveLocalizedSlugPathname|getLocalizedSlugPathnames' tests/ src/ \
  | grep -v 'src/lib/seo.ts|src/app/'   ->  (boş)
```

Ayrıca test edilemezdi: `src/lib/seo.ts` `@/server/config/app-url` üzerinden
`server-only` çekiyor, o yüzden saf slug mantığı ondan ayrılamıyordu.

### Düzeltme

- `src/lib/localized-slug-pathnames.ts` (yeni, **saf** — `server-only` yok):
  iki yardımcı buraya taşındı. `resolveLocalizedSlugPathname` ayrıca
  **kendine-yönlendirme** ve **yanlış-makale** uçlarını kapatacak şekilde
  sıkılaştırıldı:
  - istenen dil slug'a zaten sahipse `null` (eskiden aynı URL'e redirect riski),
  - hedef dilin listesi kısaysa / eşleşen slug aynıysa `null` (eskiden konumla
    farklı makaleye redirect riski).
- `src/lib/seo.ts`: iki yardımcıyı buradan re-export eder; route'lar ve
  `sitemap.ts` aynı import'u kullanmaya devam eder (davranış değişmedi).
- `src/lib/localized-slug-pathnames.test.ts` (yeni): **7 birim testi** —
  çevrilmiş slug çözümü, konumla eşleme, bilinmeyen slug → `null`, kendi-dil
  sahipliği → `null`, kısa hedef liste → `null`, ve `getLocalizedSlugPathnames`
  haritası.

### Kanıt

| Ölçüm | Önce | Sonra |
|---|---|---|
| `resolveLocalizedSlugPathname` için birim testi | 0 | 7 |
| Taranan iç hedef / 404 | 550 / **0** | 550 / **0** (değişmedi) |
| Sitemap `<loc>` / ölü | 186 / 0 | 186 / 0 (değişmedi) |
| Dil değiştirici hedefi | 308 → kendi slug'ı | 308 → kendi slug'ı (değişmedi) |
| Gerçek 404 (`/rehber/not-a-guide`) | 404 | 404 (değişmedi) |

`test:unit`: **402/402** (395 → 402, +7).

### Hâlâ açık (başka lane)

- **#144** — dil değiştiricinin kök nedeni `src/components/layout/site-header.tsx`
  (LANE-TASARIM): `usePathname()` çevrilen slug'ı her dilin önüne koyuyor.
  Route tarafındaki 308 fallback savunma derinliğidir; asıl düzeltme bileşende.
- **#141** — legal sayfaların 6 dilde çevirisi (LANE-URUN + LANE-SUPABASE).

### Kapılar (bu tur)

`lint ✅` `typecheck ✅` `check:frontend-source ✅` `test:unit ✅ (402/402)`

## Micro-denetim raporu — tur 4 (#126 SEO meta, #127 link bütünlüğü)

```
Lane: LANE-SEO        Branch: lane/seo        PR: (bu PR)
Değişen dosyalar: src/lib/seo.ts,
                  src/app/[locale]/layout.tsx,
                  src/app/[locale]/install/page.tsx,
                  docs/lanes/03-seo.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅
            test:unit ✅ (395/395)  test:security ✅ (22 pass, 2 belgeli todo)
            build ✅ (NEXT_DIST_DIR=.next-lane-seo)  canlı standalone doğrulaması ✅
Canlıya dokundu mu: hayır (yalnızca okuma; canlı Supabase'e yazı yok)
```

### Denetlenen dosyalar

`git ls-files` ile LANE-SEO sahipliği: **42 dosya** — `src/lib/seo.ts`,
`src/app/sitemap.ts`, `src/app/robots.ts`, `scripts/submit-indexnow.mjs` ve
`src/app/[locale]/**` altındaki **37 route/layout** dosyası. Hepsi tarandı.
Bakılmayan dosya: yok.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/app/[locale]/install/page.tsx:35` | SEO meta | `generateMetadata` `openGraph`/`twitter` yayınlamıyordu; sayfa locale layout'un **genel ana sayfa kartını** miras alıyordu (`og:title` = ana sayfa başlığı) ve **`og:url` hiç yoktu** | sayfanın kendi `title`/`description`/`canonical`'ı ile tutarlı sosyal kart | Poster/QR ile paylaşılan `/install` linki sohbette yanlış başlık+açıklama ve `og:url`'siz unfurl ediyordu (6 dil) | düzeltildi |
| 2 | `src/lib/seo.ts:33` + `src/app/[locale]/layout.tsx` | tutarlılık | `openGraphLocales` eşlemesi iki dosyada elle tekrarlanıyordu (biri `satisfies Record<AppLocale,string>`, diğeri `satisfies Record<(typeof routing.locales)[number],string>`) | tek kaynak | `og:locale` ↔ `alternateLocale` listesi sapabilir; drift sessiz | düzeltildi (tek export) |
| 3 | `src/messages/*.json` `Legal` (48 anahtar × 5 dil) | SEO meta | `/privacy`,`/cookies`,`/terms` başlık+açıklaması **6 dilde aynı Türkçe**; gövde de çevrilmemiş | her dil kendi metni | 18 sayfa kopya meta + kopya gövde | devredildi → **#141** |
| 4 | `(auth)/login/page.tsx`, `(auth)/register/page.tsx` | SEO meta | İkisi de layout'un genel `Meta.title`'ını taşıyor (`title`+`description` aynı) | rota-özel başlık | Her ikisi `noindex` olduğundan sıralama etkisi yok; yalnız paylaşım/sekme başlığı | devredildi (düşük öncelik, `src/messages/**` = LANE-URUN) |
| 5 | 404 yanıtı (tüm diller) | SEO meta | SSR `<html>` `lang`/`dir` taşımıyor (`<html id="__next_error__">`), gövde boş (RSC ile hidrate oluyor); `<title>`/`og:*` dolu | `<html lang="…" dir="…">` | Dil/RTL sinyali yalnız istemci JS'ine bağlı; `fa` için `dir="rtl"` SSR'da yok | devredildi → issue (`agent:blocked`; kök neden `src/app/layout.tsx` yok = LANE-TASARIM/INFRA alanı) |

### Kanıt (üretim standalone sunucusu, `curl`/`node`)

- **Bulgu 1 (önce):** `curl /install` → `<title>Uygulamayı yükle · İşBul KKTC</title>`
  ama `og:title=İşBul KKTC — KKTC ve Kuzey Kıbrıs İş İlanları`,
  `og:description` = ana sayfa açıklaması, **`og:url` yok**; aynısı `/en/install`,
  `/de/install`, `/fa/install` (6 dil).
  **Sonra:** `og:title=Uygulamayı yükle`, `og:description` = sayfanın kendi
  açıklaması, `og:url=http://…/install`, `og:image` 1200×630, `twitter:card`
  `summary_large_image`; `robots: noindex, follow` ve self-canonical **değişmedi**.
  Tüm 196 yol (186 sitemap + 10 ekstra) yeniden tarandı: **0 tutarsızlık**
  (`og:title` = marka-soneksiz `title`, `og:description` = `description`,
  `og:url` = `canonical`).
- **Bulgu 2:** `grep -n openGraphLocales` → tek tanım; `/`,`/en`,`/de` çıktısı
  `og:locale` `tr_TR`,`en_GB`,`de_DE` — layout kartı değişmedi.
- **Bulgu 5:** `curl /en/nonexistent` → `<html id="__next_error__">` (lang yok),
  gövde `<div hidden>`; `curl /en` → `<html lang="en" dir="ltr">`. Fark yalnız
  404 yolunda; `src/app/layout.tsx` olmadığı için Next'in iç hata ağacı kullanılıyor.

### Doğrulanan ve sağlam bulunanlar (bu tur, canlı)

- **Sitemap:** 186 `<loc>`; hepsi **200**; hepsi **self-canonical**; her birinde
  6 dil + `x-default` hreflang; **0 ölü URL**, **0 sitemap kaydı redirect**,
  **0 tekrar eden `<loc>`**, 42 `<lastmod>` hepsi geçerli ISO tarih.
- **hreflang karşılıklılık:** 186 sayfa × 6 dil hedefi tarandı → **0 ihlal**
  (her `hreflang` hedefi kaynağa geri işaret ediyor).
- **robots.txt:** `noindex` veren sayfaları `Disallow` **etmiyor**; yalnız
  `/api/`, `/auth/`. 404 tek ve çelişkisiz `robots: noindex` taşıyor.
- **Canonical:** hepsi mutlak string (`URL` instance tuzağı yok); `/jobs?page=2..999`
  404, filtreli URL'ler `/jobs`'a canonical + `noindex, follow`; içe aktarılan
  ilanlar tek (tr) canonical, hreflang yok.
- **Link bütünlüğü (#127):** 425 benzersiz iç bağlantı hedefi tarandı →
  **0 kırık**; 186 sitemap URL'sinde **0 yetim sayfa**; **0 boş/anlamsız anchor
  metni** ("buraya tıkla" vb. yok). `target="_blank"` (2 kullanım) `noopener
  noreferrer` taşıyor. Tüm iç fragment'lar (`#top`, `#overview`,
  `#company-profile`, `#directory-listing`) karşılık gelen `id`'ye sahip.
- **Sayfa hijyeni:** 186 sayfada tam **1 `<h1>`**, doğru `lang`, `<link
  rel="canonical">`, `<meta name="viewport">` ve `alt`'sız `<img>` **0**.
- **OG/Twitter:** `og-cover.webp` 1200×630 (~161 KB < 300 KB WhatsApp bütçesi),
  6 dilde yerelleşmiş `og:image:alt`.
- **GEO tarafı (LANE-GEO):** `llms.txt`/`llms-full.txt` 200; JSON-LD
  `WebSite`+`SearchAction` (`?query=` ile eşleşiyor), `Organization`,
  `BreadcrumbList`, `CollectionPage`, `FAQPage`, `JobPosting` tam. District
  `CollectionPage.name`'in `"Kyrenia İş İlanları"` diye tr-ekli kalması GEO
  alanına aittir (`src/content/**`) — bu lane dokunmadı, LANE-GEO'ya not.
- **IndexNow:** çift endpoint fallback + Vercel alias mantığı korunuyor; anahtar
  dosyası `public/isbulkktc….txt` içeriğiyle eşleşiyor.
- **Env:** `NEXT_PUBLIC_{GOOGLE,BING,YANDEX}_SITE_VERIFICATION` — kod hazır,
  Vercel'de değer girilince etiketler yayınlanır. **Hâlâ yok.**

### Sonraki lane için notlar

- Bulgu 5 (404 `lang`/`dir`) için `src/app/layout.tsx` eklenmesi gerekiyor —
  LANE-SEO'nun sahipliğinde değil; issue açıldı.
- `src/content/ai-visibility/structured-data.ts` `buildDistrictPageStructuredData`
  içindeki `name: \`${districtName} İş İlanları\`` Türkçe eki taşıyor; yerelleşmiş
  sayfada JSON-LD adı görünen `<h1>` ile uyuşmuyor → LANE-GEO.
