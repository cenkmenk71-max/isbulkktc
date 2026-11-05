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

---

## Micro-denetim turu 5 — JSON-LD etiket tutarlılığı (#126)

Beşinci tur. `main` yine ilerlemişti (#147, #148 merge edilmiş); önceki turların
kapattığını tekrar yazmadım. Bu turda **JSON-LD'nin görünen içerikle uyuşması**
boyutuna odaklandım (AUDIT.md "JSON-LD görünen içerikle uyuşuyor mu").

### Envanter (`git ls-files`)

| Grup | N | Bakıldı |
|---|---|---|
| `src/lib/seo.ts`, `src/app/sitemap.ts`, `src/app/robots.ts` | 3 | 3/3 |
| `src/app/[locale]/**` route/layout | 37 | 37/37 |
| **Toplam** | **40** | **40/40** |

Bakılmayan dosya yok.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/app/[locale]/(public)/is-ilanlari/[district]/page.tsx:86-87` | JSON-LD / görünür içerik | `BreadcrumbList` etiketleri `HomeJobSearch` **hero sloganlarıydı**: `homeLabel` = `"KARİYERİNİZ İÇİN AÇIK İLANLAR"`, `jobsLabel` = `"Fırsatları hesap açmadan keşfedin."` | breadcrumb'ın yürüdüğü sayfaların adları: home = `İşBul KKTC`, jobs = `Nav.jobs` | Google/AI, ana sayfayı ve `/jobs`'u sloganla adlandırıyordu; **36 sayfa** (6 ilçe × 6 dil) | **Düzeltildi** |
| 2 | `src/content/ai-visibility/structured-data.ts:255` | JSON-LD / dil tutarlılığı | `name: \`${districtName} İş İlanları\`` — `districtName` yerelleşiyor ama `"İş İlanları"` sabit → `de`/`en`/`ru` sayfada **iki dilli** ad (`'Kyrenia İş İlanları'`) | görünen `<h1>`/başlıkla aynı dil | 5 dil × 6 ilçe = 30 sayfada yapısal veri dili karışık | **Devredildi** → #152 (LANE-GEO; üretici modül onun) |
| 3 | `src/content/ai-visibility/structured-data.ts:208` | JSON-LD / dil tutarlılığı | Rehber/blog breadcrumb bölüm adı sabit `"Rehber"` → `/de/rehber/...` sayfasında 2. adım `'Rehber'` | bölüm adı da yerelleşmeli (`Guides.metaTitle`/`Nav`) | 2 içerik ailesi × 6 dil | **Devredildi** → #152 (LANE-GEO) |
| 4 | `src/app/[locale]/(public)/is-turleri/[type]/page.tsx` | JSON-LD | Kardeş rota `is-ilanlari/[district]` `CollectionPage`+`BreadcrumbList` yayınlıyor; `is-turleri/[type]` **hiç JSON-LD yayınlamıyor** | tür eşdeğeri | 36 indekslenebilir iniş sayfası yapısal verisiz | **Devredildi** → #152 (LANE-GEO) |
| 5 | `src/messages/**` `Legal` | SEO meta | 3 rota × 6 dil aynı Türkçe meta+gövde | dile özgü | 18 sayfa kopya | **#141** (açık) |

### Kanıt (üretim standalone, öncesi → sonrası)

```
# Bulgu 1 — 6 dilin tamamı
/en/is-ilanlari/girne  önce : 'OPEN ROLES FOR YOUR NEXT STEP' | 'Explore opportunities without signing up.' | 'Kyrenia'
                       sonra: 'İşBul KKTC' | 'Jobs' | 'Kyrenia'
/de/is-ilanlari/lefkosa sonra: 'İşBul KKTC' | 'Stellenangebote' | 'Nikosia'
/ru/is-ilanlari/girne   sonra: 'İşBul KKTC' | 'Вакансии' | 'Кирения'

# Bulgu 2 (devredildi) — hâlâ iki dilli
/de/is-ilanlari/girne  CollectionPage.name = 'Kyrenia İş İlanları'
/ru/is-ilanlari/girne  CollectionPage.name = 'Кирения İş İlanları'
```

### Doğrulanan ve sağlam bulunanlar (bu tur)

- **Meta:** legal (#141) dışında 102 rota×dil kombinasyonunda `title`/`description`
  benzersiz; auth sayfaları layout varsayılanını miras alıyor ama `noindex`.
- **Canonical:** 84/84 indekslenebilir rota self-canonical; `og:url` **her yerde**
  canonical'a eşit (0 sapma).
- **hreflang:** her rota × dilde 7 hedef (6 dil + `x-default`), küme birebir aynı.
- **Sitemap:** XML geçerli; 186 `<loc>`, 0 ölü, 0 kopya; `changefreq`/`priority`
  aralıkta; her girdide `xhtml:link` alternates.
- **Link bütünlüğü:** 324 sayfa, 544 iç hedef → **0 404** (yalnız beklenen 308
  `as-needed` + 307 auth kapısı). 570 dış linkin hepsi `target="_blank"` +
  `noopener noreferrer`.
- **JSON-LD:** 102/102 blok geçerli JSON; `FAQPage` görünen sorularla eşleşiyor;
  `og:type` rehber/blog'da `article`.
- **IndexNow:** `public/isbulkktcada1d9ce6917a3363df4ff8fccc7629a.txt` içeriği
  dosya adıyla birebir.

### Kapılar

`lint ✅` `typecheck ✅` `check:frontend-source ✅` `test:unit ✅ (408/408)`
`test:security ✅ (22/22)` `build ✅`

### Sahibin yapması gerekenler

- **#152** — JSON-LD üreticisi: `is-turleri` mount'u + district/rehber dil
  karışması (LANE-GEO).
- **#141** — legal sayfaların çevirisi (LANE-URUN + LANE-SUPABASE).
- **#144** — dil değiştirici kök nedeni (LANE-TASARIM).

### Sonraki lane için notlar

- Bulgu 1 birim testi **eklenmedi**: `tests/**` LANE-QA sahipliğinde. QA turu
  breadcrumb etiketlerinin `Nav.jobs`/`SITE_NAME` olduğunu doğrulayabilir
  (yöntem: `curl … | grep ld+json` → `BreadcrumbList.itemListElement`).

---

## Micro-denetim raporu — tur 6 (#163 bulunabilirlik + #126/#127)

```
Lane: LANE-SEO        Branch: lane/seo        PR: (bu PR)
Değişen dosyalar: src/lib/seo.ts, docs/lanes/03-seo.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅
            test:unit ✅ (408/408)  test:security ✅ (22 pass, 2 belgeli todo)
            build ✅ (NEXT_DIST_DIR=.next-lane-seo)  canlı standalone + üretim doğrulaması ✅
Canlıya dokundu mu: hayır (yalnızca okuma; canlı Supabase'e yazı yok)
```

### Denetlenen dosyalar

`git ls-files` ile LANE-SEO sahipliği: **42 dosya** — `src/lib/seo.ts`,
`src/app/sitemap.ts`, `src/app/robots.ts`, `scripts/submit-indexnow.mjs` ve
`src/app/[locale]/**` altındaki **37 route/layout**. Hepsi tarandı; "bakılmadı" yok.

### #163 — bulunabilirlik zinciri, kanıtlı durum

| Halka | Ölçüm (üretim, `curl`/`node`) | Durum |
|---|---|---|
| Doğrulama etiketi | `google-site-verification` **var** (`1zuidCsJ2y0GCfp_g-AmsYuagg_fIDDCo36POZr0wSM`, 6 dilde); `msvalidate.01`/`yandex-verification` **yok** | kısmi |
| robots.txt | `Allow: /`; yalnız `/api/` + 6 `/auth/` yolu disallow; `Disallow: /` **yok** | ✅ |
| Sitemap | 207 `<loc>`, **207/207 → 200**, hepsi self-canonical, `noindex` URL **yok**, 0 tekrar | ✅ |
| Bot engeli | Googlebot/Bingbot/YandexBot/AhrefsBot/GPTBot/boş UA → hepsi **200**, `cf-mitigated` **yok**; bot ve tarayıcı HTML'i aynı (fark = her istekte değişen dinamik render, cloaking değil) | ✅ |
| SSR içerik | Googlebot `/jobs`'ta **21 ilan + 20 ilan linki** görüyor (istemci hidrasyonu gerekmiyor) | ✅ |
| IndexNow | `submit-indexnow.yml` günlük çalışıyor (son run 2026-11-05 06:32 UTC, success); alias sitemap **207/207 kanonik host**; canlı POST → api.indexnow.org 200, bing.com 200, yandex.com 202 `{"success":true}` | ✅ |
| Ölçüm | `site:isbulkktc.com` → DuckDuckGo'da **0 sonuç** (Bing beslemeli) | ⚠️ indeksleme gecikmesi |
| Sunucu | TTFB 0.11–0.15 s, toplam 0.6–1.2 s (tüm bot UA'ları) | ✅ |

**Sonuç:** LANE-SEO'nun sahip olduğu teknik katmanın tamamı doğru; **kopuk
halka lane dışında**: Bing/Yandex mülk doğrulaması yok ve indeks henüz oluşmamış
(yeni alan + 21 ilan). Bu, `agent:handoff` işidir (aşağıda).

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/lib/seo.ts:160-179` (`createLocalizedPageMetadata`) | SEO meta / OGP | Tek-dilli sayfalar (`contentLocale` set: içe aktarılan ilanlar) hreflang alternates'ini düşürüyor ama **`og:locale:alternate` 5 dili yine de yayınlıyordu**. `GET /jobs/<slug>` → `og:locale:tr_TR` + `en_GB,ru_RU,el_GR,fa_IR,de_DE`; `GET /en/jobs/<slug>` → `og:locale:en_GB` (sayfa TR, canonical TR) + `tr_TR,ru_RU,…` | tek-dilli sayfa başka dil sürümü ilan etmemeli; `og:locale` kanonik URL'in dili olmalı | Sosyal bot 6 dilde var olduğunu sandığı sayfayı yanlış dille unfurl eder; OGP `alternate` semantiği ihlali | düzeltildi |
| 2 | `src/app/[locale]/not-found.tsx` + kök layout | SEO meta | 404 yanıtı `<html>`'de `lang`/`dir` taşımıyor, SSR gövdesi boş | `<html lang dir>` | `fa` RTL sinyali yok | devredildi → **#149** |
| 3 | `src/messages/*.json` `Legal` | SEO meta | `/privacy`,`/cookies`,`/terms` başlık+açıklaması 6 dilde aynı Türkçe | her dil kendi metni | 18 sayfa kopya meta+gövde | devredildi → **#141** |
| 4 | `src/app/[locale]/(public)/is-turleri/[type]/page.tsx` | JSON-LD mount | Tür iniş sayfaları sayfaya-özel JSON-LD yayınlamıyor (ilçe yayınlıyor) | eşdeğer `CollectionPage`+`BreadcrumbList` | zengin sonuç kaybı | devredildi → **#152** (GEO üretir, SEO mount eder) |
| 5 | `feed.xml` keşfi | SEO meta | `/feed.xml` 200 + geçerli RSS ama `<head>`'de `rel="alternate" type="application/rss+xml"` autodiscovery linki **yok** | `<link rel="alternate" type="application/rss+xml" href="/feed.xml">` | RSS keşfedilebilirliği düşük | devredildi (aşağıda issue) |

### Kanıt

- **Bulgu 1 (önce):** `curl https://isbulkktc.com/en/jobs/source-iskibris-…` →
  `<link rel="canonical" href="https://isbulkktc.com/jobs/…">` (TR) **ama**
  `og:locale=en_GB` + `og:locale:alternate` `tr_TR,ru_RU,el_GR,fa_IR,de_DE`.
  OGP spesifikasyonu: `og:locale:alternate` = *"An array of other locales this
  page is available in."* (ogp.me). Sayfa tek dilde → dizi boş olmalı.
  **Sonra (standalone, `NEXT_DIST_DIR=.next-lane-seo`):** ilan sayfaları
  `og:locale` (yalnız) taşıyor, `og:locale:alternate` **yok**; `/freelance` gibi
  yerelleşmiş sayfalar 5 alternates'i **koruyor**. Build çıktısı:
  `openGraph:{…,locale:k[r],...n?{}:{alternateLocale:…}}`.
- **Bulgu 2:** `curl /en/nonexistent` → `<html id="__next_error__">` (lang yok);
  `curl /en` → `<html lang="en" dir="ltr">`. Üretimde de aynı.
- **Bulgu 3:** üretim meta taraması (207 sayfa): yalnız 3 başlık + 3 açıklama
  ailesi kopya — hepsi yasal sayfalar.
- **Bulgu 4:** `curl /is-turleri/tam-zamanli` → yalnız layout `WebSite|Organization`;
  `curl /is-ilanlari/girne` → + `CollectionPage|BreadcrumbList`.
- **Bulgu 5:** `curl / | grep -i rss` → **yok**; `curl /feed.xml` → 200
  `application/rss+xml`, 6 `<item>`.

### Doğrulanan ve sağlam bulunanlar (üretim)

- **Sitemap:** 207 `<loc>` (186 statik/yerelleşmiş + 21 ilan), 207/207 → 200,
  self-canonical, hreflang 6 dil + `x-default`, `noindex` URL yok, 0 tekrar,
  `lastmod` gelecekte değil.
- **hreflang karşılıklılık:** 207 sayfa tarandı, 186 hedef → **0 ihlal, 0 ölü hedef**.
- **robots.txt:** `noindex` sayfaları disallow etmiyor; yalnız `/api/` + 6 `/auth/`.
- **Canonical:** mutlak string; `/jobs?page=2` canonical `/jobs`; `?page=3+` 404;
  `/jobs?district=girne` gibi filtreler `/jobs`'a canonical + `noindex, follow`;
  `/en/jobs/<slug>` → `/jobs/<slug>` (tek TR canonical).
- **Sayfa hijyeni:** 186 sitemap sayfasında 1 `<h1>`, doğru `lang`,
  canonical, viewport; `alt`'sız `<img>` 0; yetim 0; kırık iç bağlantı 0 (415 hedef).
- **JobPosting:** `title, description, datePosted, validThrough,
  hiringOrganization, jobLocation.address.addressCountry=CY, employmentType,
  identifier, url` dolu.
- **OG/Twitter:** `og-cover.webp` 1200×630 (~161 KB), `twitter:image:alt` yerelleşmiş.

### Sahibin yapması gerekenler

- `NEXT_PUBLIC_BING_SITE_VERIFICATION` ve `NEXT_PUBLIC_YANDEX_SITE_VERIFICATION`
  Vercel'de **yok** (Google var). Kod hazır; değer girilince etiketler yayınlanır.
- Bing Webmaster Tools + Yandex Webmaster'da mülkü doğrulayıp sitemap'i göndermek
  (IndexNow tek başına indeksleme garantisi değildir).
- Google Search Console kapsam raporu: 207 URL'nin kaçı indeksli (bu lane erişemez).

### Sonraki lane için notlar

- `#163`'ün geri kalanı LANE-CLOUDFLARE (bot/edge) + sahip (Search Console/Bing
  doğrulama) işidir; LANE-SEO tarafı temiz.
