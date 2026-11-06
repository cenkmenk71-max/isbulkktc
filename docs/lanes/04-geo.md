# LANE-GEO — Generative Engine Optimization (AI arama/lokal görünürlük)

Hedef: içeriğin **AI arama motorları** (ChatGPT, Perplexity, Google AI Overviews, Bing Copilot) ve **yerel/coğrafi** aramada en iyi görünmesi.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- İş: KKTC (Kuzey Kıbrıs) iş & kariyer platformu. Bölgeler: Lefkoşa, Mağusa/Gazimağusa, Girne, Güzelyurt, İskele, Lefke. 6 dil.
- `src/content/**` içerik kaynağı; `src/app/llms.txt/**` ve `public/llms*` mevcut olabilir (önce incele).

## Sahip olduğun yollar
`src/content/**`, `src/app/llms.txt/**`, `public/llms*`, ve **JSON-LD ÜRETEN
modüller**: `src/features/**/structured-data*.ts`,
`src/features/jobs/job-posting-structured-data.ts`.
**Route dosyalarına (`src/app/[locale]/**`) DOKUNMA** — onların sahibi LANE-SEO.
JSON-LD'nin *şeklini* sen üretirsin; route'a *mount* etmek SEO'nun işidir (isteğini
`docs/lanes/04-geo.md`'ye TODO olarak yaz).

## Yapılacaklar
1. **`llms.txt`:** makine-okunur, güncel site özeti (ne yapar, hangi sayfalar, hangi bölgeler, iletişim). `llms-full.txt` gerekiyorsa ekle.
2. **Yapısal veri (GEO):** `LocalBusiness`/`Organization` (address, geo, areaServed = KKTC bölgeleri, sameAs sosyal), `FAQPage`, `JobPosting`'in `jobLocation` alanı doğru ilçeyle mi.
3. **Bölgesel içerik:** her ilçe için tutarlı terminoloji (Türkçe/İngilizce/Rumca karşılıklar), "Kuzey Kıbrıs" vs "KKTC" tutarlılığı.
4. **AI-alıntılanabilirlik:** net H1/H2 hiyerarşisi, kısa özet cümleleri, tanımlı terimler, `dateModified`, kaynak/atıf blokları.
5. **`sameAs` / entity tutarlılığı:** Google Business, sosyal hesaplar, Wikidata benzeri tutarlı kimlik.
6. **Çok dillilik:** her dilde meta açıklama + anahtar kelime doğal; makine çevirisi kokusu yok.

## Kurallar
- İçerik değişiklikleri **gerçek, doğrulanabilir** bilgiye dayanmalı; uydurma işveren/istatistik yok.
- JSON-LD'yi şema doğrulayıcıyla (schema.org uyumu) kontrol et; `JobPosting` zorunlu alanları tam olsun.
- `check:frontend-source` ve axe erişilebilirlik gate'i yeşil kalmalı.

## Raporla
Eklenen/değişen içerik + yapısal veri örnekleri (JSON-LD parçaları) + hangi AI sorgularında görünürlük beklediğin. Branch + PR, CI yeşil.

---

## Rapor — `dateModified` (lane/geo-date-modified)

**Durum:** PR açık, CI bekliyor.

### Ne yapıldı
`JobPosting`'in `dateModified` alanı artık gerçek bir değişiklik anını taşıyor;
sitemap `lastmod` da aynı değeri kullanıyor (eskiden ikisi de `datePosted`'ı
tekrarlıyordu).

| Kaynak türü | `modified_at` türevi |
|---|---|
| `platform` | `jobs.updated_at` (mevcut `jobs_set_updated_at` trigger'ı) |
| `source_site` | `coalesce(source_updated_at, source_published_at, published_at)` |

- **iskibris** gerçek upstream `updated_at` yayınlıyor → doğrudan güveniliyor.
- **isbulkibris** hiç yayınlamıyor → yeni `job_source_snapshots` içerik-hash
  defteri, `last_changed_at`'i yalnızca görünür içerik gerçekten değişince
  ilerletiyor; dokunulmamış ilan tarihini koruyor (her import'ta yeniden
  damgalanmıyor).
- Her iki yolda da değer `datePosted`'dan önce olamaz (DB constraint + TS
  `resolveJobDateModified`).

### Sahiplik sınırı (dikkat)
Bu iş doğası gereği katmanlar arası olduğu için üç lane'in yoluna dokundu.
Kural 3'e göre bunları **sahibinin onayına** sunuyorum:

- `supabase/**` (migration + pgTAP) → **LANE-SUPABASE**. Canlı DB'ye
  **uygulanmadı**; yalnızca branch'te migration olarak duruyor. Uygulama
  LANE-SUPABASE'in kararı.
- `src/app/sitemap.ts` → **LANE-SEO** (tek satır: `lastModified: job.modifiedAt`).
- `src/features/jobs/job-posting-structured-data.ts` → GEO (bu lane, sahibi).

### TODO (sahiplerine)
- [ ] **LANE-SUPABASE:** `20261024100000_v4_job_modified_at.sql` canlıya
      uygulanmalı. Not: migration `search_public_jobs` / `get_public_job_details`
      gövdelerini **20261021120000** (en güncel tanım) üzerinden yeniden
      kuruyor; 20261021110000 üzerinden kurmak `source_listing_url` ve işveren
      profil alanlarını sessizce düşürür (bu hata bir kez yaşandı, pgTAP
      `jobs_applications_rls` 55-57 yakaladı).
- [ ] **LANE-SEO:** `src/app/sitemap.ts` değişikliği (GEO'dan bağımsızsa) — onay/ret.

---

## Rapor — micro-denetim (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 22 | 22 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

Üreticileri tüketen ama sahibi olmadığım yüzeyler (rapor için okundu, yazılmadı):
`src/app/[locale]/layout.tsx`, `about/page.tsx`, `sss/page.tsx`,
`rehber/[slug]/page.tsx`, `blog/[slug]/page.tsx`, `is-ilanlari/[district]/page.tsx`,
`jobs/[slug]/page.tsx`, `src/app/sitemap.ts`, `src/lib/seo.ts`.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/content/ai-visibility/llms-brief.ts:65` | tutarlılık / GEO | `getGuideSlugs()` her dil için TR slug'ını kullanıyordu → `/en/rehber/kktc-is-bulma-rehberi` `getGuide("en", …)` ile çözülmüyor | her dil kendi slug'ını (`finding-a-job-in-northern-cyprus`) vermeli | `/llms-full.txt` içinde **15 kırık link** (6 dil × 3 rehber, TR hariç); AI motoru 404'e gidiyor | **düzeltildi** |
| 2 | `src/content/ai-visibility/structured-data.ts:69` | doğruluk | `Organization.logo` = `/icon-dark-32x32.png` (32×32) | Google `Organization` logo ≥112×112px | Google logo'yu reddeder; bilgi paneli/sonuç görseli kaybolur | **düzeltildi** |
| 3 | `src/features/jobs/job-posting-structured-data.ts:76` | doğruluk | `directApply: true` **her** ilan için; kaynak ilanlarda sayfada başvuru formu yok | `directApply` yalnızca platform ilanı için | kaynak ilanda sayfada olmayan bir "doğrudan başvuru" deneyimi iddia ediliyor | **düzeltildi** |
| 4 | `structured-data.ts:155,302` | ölü kod | `getRegionName` ve `LOCATION_DISTRICT/LOCALITY` re-export'u hiçbir yerde kullanılmıyor | kullanılmayan export kaldırılmalı | bakım yükü | **düzeltildi** |
| 5 | `faq.ts:259` | tutarlılık | `AI_VISIBILITY_UPDATED` = `2026-10-30`; brief bu turda değişti | kendi sözleşmesi: içerik değişince bump | `dateModified` gerçek değişikliği yansıtmıyor | **düzeltildi** (`2026-11-05`) |

**Doğru bulunanlar (bulgu yok):** `areaServed` altı ilçe + ülke; ilçe adları 6
dilde `HomeJobSearch.districts` ile birebir; `Mağusa`/`Gazimağusa` ayrımı tutarlı;
FAQ görünen metni ile `FAQPage` JSON-LD aynı kaynaktan; `regionNames` çevirileri
sayfa metniyle uyumlu; rehber/ilan bölüm sayıları 6 dilde simetrik; içerikte
dış bağlantı yok.

### Devredilen (başkasının dosyası — düzeltmedim)

- **LANE-SEO** `is-ilanlari/[district]/page.tsx`: `buildDistrictPageStructuredData`
  `jobsLabel`/`homeLabel` olarak `HomeJobSearch` **kahraman** metnini
  ("Fırsatları hesap açmadan keşfedin.", "KARİYERİNİZ İÇİN AÇIK İLANLAR")
  geçiyor; `BreadcrumbList` bu yüzden yanlış ad taşıyor. Doğrusu `DistrictPage`
  namespace'indeki `title`/`eyebrow`. Üretici doğru; çağrı yerinde yanlış argüman.
- **LANE-SEO** `sitemap.ts`: `/rehber` indeksi `GUIDE_UPDATED` (2026-11-04) ile
  `lastModified` veriyor ama `publicPages` içinde `/rehber` **yok** → indeks
  sitemap'te hiç listelenmiyor (var olan route, `feed.xml` de `/rehber/` linkiyor).
- **LANE-QA** `tests/e2e/seo.spec.ts`: `directApply` için assertion yok; kaynak
  ilanda `false`, platform ilanda `true` olduğunu doğrulayan bir E2E eklenebilir.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (383 test,
+3 yeni) · `bun run build` ✅ (NEXT_DIST_DIR ile; çıktıda kırık `/xx/rehber/kktc-*`
linki yok, `logo` = `icon-512.png`).

Yeni guard: `src/content/ai-visibility/geo-audit.test.ts` — #1 ve #2 için kırmızı→yeşil
kanıtlandı (bug yeniden konunca test kırmızı).

---

## Rapor — issue #152, branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Mount devri: issue #165 (LANE-SEO).

### Bulgu (LANE-SEO'dan devredildi, #152)

`/[locale]/is-turleri/[type]` iniş sayfaları **hiç JSON-LD yayınlamıyordu**;
kardeş rota `/[locale]/is-ilanlari/[district]` `CollectionPage` + `BreadcrumbList`
yayınlıyor. İkisi de aynı ağırlıkta (6 tür × 6 dil vs 6 ilçe × 6 dil), aynı
`JobsExperience` bileşenini render eden, sitemap'e giren indekslenebilir sayfalar.
Kanıt: `curl /is-turleri/tam-zamanli | grep ld+json` → yalnız layout'un
`WebSite|Organization` grafiği; `/is-ilanlari/girne` → + `CollectionPage|BreadcrumbList`.

### Ne yapıldı (GEO sahibi olduğu modülde)

`src/content/ai-visibility/structured-data.ts`:

- Ortak gövde `buildCollectionPageGraph()` içine çıkarıldı (CollectionPage +
  3 adımlı BreadcrumbList: home → `/jobs` → koleksiyon).
- `buildDistrictPageStructuredData()` bu gövdeyi kullanacak şekilde sadeleşti;
  `subjectName` = ilçe adı, `about` = `AdministrativeArea`.
- **Yeni** `buildJobTypePageStructuredData()`: `subjectName` = tür adı,
  `about` = `Thing` (çalışma türü bir yer değil), aynı `@graph` şekli.

**İlçe çıktısı bit bit aynı kaldı** (refactor iddiası pikselsiz/kanıtlı): 6 dil
için `JSON.stringify` çıktısı önce/sonra `diff` → boş.

### Devredilen — LANE-SEO (issue #165)

`src/app/[locale]/(public)/is-turleri/[type]/page.tsx` **mount**: `<JsonLd>` +
`buildJobTypePageStructuredData` çağrısı. `Nav.jobs` breadcrumb etiketi; kahraman
sloganı (`HomeJobSearch.title`) **değil**. Örnek kod ve beklenen JSON issue #165'te.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (421 test,
+2 yeni: koleksiyon şekli + dil öneki) · mount sonrası E2E LANE-SEO'nun PR'ında.

---

## Rapor — micro-denetim turu 2 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 23 | 23 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

Okunan ama yazılmayan (sahibi başkası): `src/app/[locale]/layout.tsx`,
`rehber/[slug]`, `blog/[slug]`, `is-ilanlari/[district]`, `jobs/[slug]`,
`sitemap.ts`, `src/lib/seo.ts`, `src/lib/social-links.ts`.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/content/ai-visibility/llms-brief.ts:170` | tutarlılık / GEO | Kısa brief "yerelleştirilmiş adresler yolun başına dil kodu eklenerek elde edilir" diyor; ama hemen üstünde listelediği 3 rehber bağlantısının slug'ı dile göre çevrili (`/en/rehber/kktc-is-bulma-rehberi` → 404) | kural, rehber bağlantılarının **istisna** olduğunu söylemeli | AI motoru brief'i izleyip 3 ölü URL türetiyor | **düzeltildi** |
| 2 | `src/content/ai-visibility/structured-data.ts:209` | tutarlılık / GEO | `buildGuideStructuredData` breadcrumb 2. adımı `"Rehber"`/`"Blog"` olarak **sabit** yazıyor; `de`/`fa`/`ru`… altında da Türkçe/Latin | çağıran, ürünün kendi yerelleştirilmiş etiketini geçmeli (`Nav.blog`, footer guide etiketi) | yapısal veri, sayfanın kendi dilinde adlandırmadığı bir bölümü iddia ediyor (#152'deki ilçe hatasının eşdeğeri) | üretici **düzeltildi** (opsiyonel `sectionName`); çağrı yeri **devredildi** (#179) |
| 3 | `src/content/guides/index.ts:42`, `src/content/editorial/index.ts:38` | ölü kod | `getGuideLocales()` / `getArticleLocales()` hiçbir yerde çağrılmıyor (repo geneli 0 kullanım) | kaldırılmalı | bakım yükü; yorum sitemap/static-params'ın kullandığını iddia ediyordu ama onlar `getGuideSlugs()`+`routing.locales` kullanıyor | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** iki brief'teki 135 tekil URL'nin tamamı gerçek
bir rotaya çözülüyor (`/sitemap.xml`, `/robots.txt`, `/llms-full.txt` dosya
işleyicileri hariç, onlar da mevcut); `SearchAction.target` `?query=` — `/jobs`
sayfası tam da `query` paramını okuyor; `Organization.logo` 512×512 mevcut asset;
`areaServed` altı ilçe; `getConfiguredSocialProfiles` `src/lib/social-links.ts`
ile aynı env anahtarlarını okuyor; FAQ JSON-LD ile görünen metin aynı kaynaktan;
`JobPosting` zorunlu alanları (`title`,`description`,`datePosted`,
`validThrough`,`hiringOrganization`,`jobLocation`) tam; `published` alanı ölü ama
tipin parçası — bu turda dokunulmadı (bulgu değil, gözlem).

### Devredilen — LANE-SEO (issue #179)

`rehber/[slug]` ve `blog/[slug]` mount'ları `buildGuideStructuredData`'ya
`sectionName` geçmeli (footer `links.guides` / `Nav.blog`). Varsayılan mevcut
çıktıyı koruyor, yani devir merge edilene kadar regresyon yok.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (432 test,
+2 yeni: bölüm etiketi + brief kural kapsamı) · her iki guard için kırmızı→yeşil
kanıtlandı.

---

## Rapor — issue #203, branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Mount devri: LANE-SEO.

### Bulgu (LANE-SEO'dan devredildi, #203)

Dört **indeks** sayfası (`/jobs`, `/companies`, `/rehber`, `/blog`) sayfaya-özel
hiçbir JSON-LD yayınlamıyordu; yalnız layout'un `WebSite`/`Organization` grafiği
vardı. Kardeş koleksiyon aileleri (`is-ilanlari/[district]`, `is-turleri/[type]`)
`CollectionPage` + `BreadcrumbList` yayınlıyor. `/jobs` ayrıca #190'ın birincil
anahtar kelimelerinin indiği sayfa.

### Ne yapıldı (GEO sahibi olduğu modülde)

`src/content/ai-visibility/structured-data.ts`:

- Yeni iç `buildIndexPageStructuredData()`: 2 adımlı breadcrumb (home → sayfanın
  kendisi; indeks kendi hiyerarşisinin tepesi) + `about` = `Thing`.
- Dört yeni export: `buildJobsIndexStructuredData`, `buildCompaniesIndexStructuredData`,
  `buildGuideIndexStructuredData`, `buildArticleIndexStructuredData`.
- `pageLabel` ürünün kendi bölüm etiketidir (`Nav.jobs`, `Nav.blog`,
  `Footer.links.guides`); ana sayfa kahraman sloganı (`JobsPage.title` =
  "Sıradaki işinizi bulun.") **değil** — `CollectionPage.name` bir konu adı
  olmalı, çağrı yeri bunu geçer.

### Kapsam-dışı notu da düzeltildi (#203 "Kapsam dışı")

`buildCollectionPageGraph` içindeki sabit `"İş İlanları"` eki kaldırıldı:
`buildDistrictPageStructuredData` / `buildJobTypePageStructuredData` artık
opsiyonel `pageName` alıyor (varsayılan eski etiket → geriye dönük uyumlu). Bu,
#152/#179 ile aynı sınıftır (İngilizce sayfa Türkçe ad taşıyordu).

### Devredilen — LANE-SEO (issue #230)

Dört indeks route'una `<JsonLd>` + yeni üretici çağrısı; ayrıca
`is-ilanlari/[district]` ve `is-turleri/[type]` mount'larına `pageName` geçilmeli
(`DistrictPage.title` / `JobTypePage.title`). Örnek kod ve beklenen JSON issue'da.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (496 test,
+2 yeni: indeks breadcrumb'ı + `pageName`) · `pageName` guard'ı için kırmızı→yeşil
kanıtlandı · `JSON.stringify` ile 6 dil × 4 indeks çıktısı gözle doğrulandı.

---

## Rapor — micro-denetim turu 3 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 23 | 23 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

Not: LANE-İÇERİK eklendikten sonra `src/content/**` **metin** tarafı onun;
buradaki denetim **JSON-LD/llms üreticileri** ve `site.ts` (operatör verisi
modülü, kullanıcı metni değil) üzerindedir — ikisi de GEO.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/content/ai-visibility/llms-brief.ts:182` | tutarlılık / GEO | Brief'in "Yapılandırılmış veri" bölümü yalnız `Organization`/`WebSite`/`FAQPage`/`JobPosting` sayıyor; site artık ayrıca `/sss` FAQPage, 4 indeks + 2 koleksiyon ailesinde `CollectionPage`+`BreadcrumbList`, rehber/yazıda `Article` yayınlıyor | brief, yayınlanan tüm aileleri adlandırmalı | AI motoru sitenin yapısal veri haritasını eksik/yanlış kurar | **düzeltildi** |
| 2 | `src/content/ai-visibility/site.ts`, `structured-data.ts`, `src/features/jobs/job-posting-structured-data.ts` | tutarlılık (tek kaynak) | `"CY"` üç dosyada, bölge adı iki dosyada ayrı literal; biri değişince diğerleri sessizce sapar | ülke kodu tek yerde (`COUNTRY_CODE`), bölge adı `regionNames.tr`'den | yapısal veri grafikleri arasında sessiz tutarsızlık | **düzeltildi** (çıktı bit bit aynı) |

**Doğru bulunanlar (bulgu yok):** `Article`/`JobPosting` zorunlu alanları tam;
ilçe adları 6 dilde `HomeJobSearch.districts` ile birebir; brief'teki 135 URL'nin
tamamı gerçek rotaya çözülüyor; FAQ JSON-LD görünen metinle aynı kaynaktan;
`JobPosting.directApply` yalnız platform ilanında `true`; `hiringOrganization.sameAs`
schema.org'a uygun (işverenin kendi sitesi); rehber/yazı içeriği 6 dilde yapısal
olarak sağlam (kopya slug/açıklama, boş bölüm yok).

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (509 test,
+2 yeni) · iki guard için kırmızı→yeşil kanıtlandı · refactor sonrası grafik
çıktısı `diff` boş (geriye dönük uyumlu).

---

## Rapor — micro-denetim turu 4 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Bir devir: LANE-SEO (#251).

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 24 | 24 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

Not: LANE-İÇERİK `src/content/**` **metin** tarafının sahibi; bu denetim
**JSON-LD/llms üreticileri** ve `site.ts` (operatör verisi) üzerindedir.

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `structured-data.ts:218`, `job-posting-structured-data.ts:69` | tutarlılık (tek kaynak) | Marka adı `"İşBul KKTC"` iki üreticide yeniden yazılmış; `SITE_NAME` (`site.ts`) zaten var | üreticiler `SITE_NAME` okumalı | bir yeniden adlandırma, grafiğin kendi içinde siteye iki ad verdirir (breadcrumb home etiketi + `JobPosting.identifier.name`) | **düzeltildi** |
| 2 | `structured-data.ts:215` | doğruluk / GEO | `Article.datePublished` her zaman `updated`'dan geliyor; `Article` modelinde ayrı `published` alanı var ve hiçbir yerde okunmuyor | `datePublished` ilk yayın tarihi olmalı | bir yazı düzenlendiğinde Google'a "bu tarihte yayımlandı" denir; `ARTICLE_PUBLISHED` (2026-11-04) ile `updated` ayrıştığında yanlış olur | üretici **düzeltildi** (opsiyonel `published`, varsayılan `updated`); çağrı yeri **devredildi** (#251) |

**Doğru bulunanlar (bulgu yok):** `Article`/`JobPosting` zorunlu alanları tam;
ilçe adları 6 dilde `HomeJobSearch.districts` ile birebir; brief'teki 135 URL
gerçek rotaya çözülüyor; FAQ JSON-LD görünen metinle aynı kaynaktan;
`directApply` yalnız platform ilanında `true`; `hiringOrganization.sameAs`
schema.org tanımına uygun; rehber/yazı içeriği 6 dilde yapısal olarak sağlam;
`COUNTRY_CODE` tek kaynak (tur 3); ilçe sayfasının `about.containedInPlace.name`
değerinin yerelleşmesi bilinçli tasarım (sayfa zaten yerelleşiyor, `identifier`
sabit) — bulgu sayılmadı.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (516 test,
+2 yeni) · iki guard için kırmızı→yeşil kanıtlandı · grafik çıktısı `diff` boş.

---

## Rapor — micro-denetim turu 5 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Devir yok (iki düzeltme de GEO'nun
kendi üreticisinde).

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 24 | 24 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

### Bulgular

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `llms-brief.ts:65-70` | tutarlılık / AI-görünürlük | Liste kalemlerinin tek istisnası rehber bağlantılarıydı: anchor makine slug'ı (`Rehber: kktc-is-bulma-rehberi`); kardeşleri (ilçe, tür, birincil sayfalar) insan etiketi taşıyor | anchor hedefi adlandırmalı (rehberin kendi başlığı) | AI motoru alıntılanabilir bir ad görmüyor; brief okunabilirliği düşüyor | **düzeltildi** |
| 2 | `llms-brief.ts:119-124` | tutarlılık / çok dillilik | Tam brief'in **her** dil bölümü birincil sayfalar için İngilizce etiket kullanıyordu (`de` bölümünde "Job listings") | etiket o dilde olmalı | 6 dilin 5'inde yarı İngilizce bölüm; "makine çevirisi kokusu" | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** brief'teki 135 URL gerçek rotaya çözülüyor;
`Article`/`JobPosting` zorunlu alanları tam; ilçe adları 6 dilde katalogla
birebir; FAQ JSON-LD görünen metinle aynı kaynaktan; rehber/yazı içeriği 6 dilde
yapısal olarak sağlam (kopya slug, boş bölüm, geçersiz tarih yok);
`employmentType` değerleri (`FULL_TIME`, `CONTRACTOR`, `INTERN`…) ve
`jobLocationType: "TELECOMMUTE"` Google'ın resmî JobPosting örneğiyle uyumlu.

Değerlendirilip **bulgu sayılmayanlar:** `servedDistricts.alternates` arama
alias tablosunun bir üst kümesi değil (ör. "lefkosa turk belediyesi" yok) — bu
tablo `alternateName` için değil, arama normalizasyonu için; JSON-LD'de yer adı
varyantları zaten Türkçe + İngilizce + Rumca biçimleri taşıyor. FAQ
`dateModified` yönetilen içeriğin `updated_at`'ini izlemiyor — RPC o alanı
döndürmüyor (LANE-SUPABASE'in alanı), GEO tarafında düzeltilemez.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (520 test,
+2 yeni) · iki guard için kırmızı→yeşil kanıtlandı.

---

## Rapor — micro-denetim turu 6 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Devir yok.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 24 | 24 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `llms-brief.ts:167-176`, `:150-156`, `:205-216` | tutarlılık / çok dillilik | `/llms-full.txt`'in **de/ru/el/fa** bölümleri hâlâ İngilizce/Türkçe etiket taşıyordu: `- [Full-time jobs](…/de/is-turleri/tam-zamanli)` (oysa ürünün kendi kataloğu `HomeJobSearch.jobTypes.full_time = "Vollzeit"`), ilçe anchor'ı `- [Kyrenia jobs](…)` (İngilizce "jobs" eki), ve ilçe listesi başlığı her bölümde Türkçe `- Hizmet verilen ilçeler:`. Kök neden: `llms-brief.ts` etiketleri sabit yazıyordu ("the brief is TR + EN only" yorumu bayat — üretici altı dil üretiyor) | etiket, ürünün kendi kataloğundan gelmeli | 6 dilin 5'inde brief, ürünün kendi yerelleştirilmiş adlarıyla çelişiyor ("makine çevirisi kokusu") | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** brief'teki tüm URL'ler gerçek rotaya çözülüyor;
kısa brief'in "Öne çıkan sayfalar" listesi hâlâ 22 bağlantı; ilçe adları 6 dilde
katalogla birebir; `Article`/`JobPosting` zorunlu alanları tam; FAQ JSON-LD
görünen metinle aynı kaynaktan; rehber/yazı içeriği 6 dilde yapısal olarak sağlam.

### Ne yapıldı

`src/content/ai-visibility/llms-brief.ts` artık altı arayüz kataloğunu
(`src/messages/*.json`) okuyor ve etiketleri **üretmiyor, devralıyor**:

- ilçe anchor'ı = `DistrictPage.title` şablonu + yerelleştirilmiş ilçe adı
  (`de`: "Jobs in Kyrenia", `ru`: "Вакансии в Кирения", `fa`: "آگهی‌های استخدام در گیرنه");
- istihdam türü anchor'ı = `JobTypePage.title` + `HomeJobSearch.jobTypes[key]`
  (`de`: "Vollzeit Jobs", `ru`: "Полная занятость вакансии");
- ilçe listesi başlığı = `HomeJobSearch.allDistricts` (`Tüm ilçeler`, `Alle Bezirke`, `همه مناطق`).

Sabit `jobTypeLabelsTr`/`jobTypeLabelsEn` tabloları ve `"iş ilanları"`/`"jobs"`
eki silindi. Kataloglar yalnız iki `force-static` route tarafından import
ediliyor, istemci paketine sızmıyor. İçerik yazılmadı (LANE-İÇERİK'in alanı);
yalnız mevcut çeviriler tek kaynaktan okunuyor.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (556 test,
+1 yeni guard) · guard kırmızı→yeşil kanıtlandı (bug geri konunca 4 test kırmızı).

---

## Rapor — micro-denetim turu 7 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Devir yok.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 25 | 25 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `job-posting-structured-data.ts:48` (tüketici) + yeni `src/content/ai-visibility/job-description-html.ts` | doğruluk / GEO | `JobPosting.description` ham düz metindi. Google Jobs "You must format the description in HTML. At minimum, add paragraph breaks using `<br>`, `<p>`, or `\n`" diyor. İçe aktarılan ilanların açıklaması **tek satıra çöküyor** (`clampText` her boşluk dizisini tek boşluğa indiriyor) ve tek yapı bullet karakteri; seed'de 328 bullet var, **0** `<p>`/`<br>`/`\n` | açıklama HTML olmalı, paragraf/liste sınırları korunmalı | Google Jobs ilanı okunamaz tek blok olarak görür; madde işaretleri kaybolur (zengin sonuç kalitesi) | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** brief'teki tüm URL'ler gerçek rotaya çözülüyor
(157 link, malformed 0); kısa brief hâlâ 22 bağlantı; ilçe adları 6 dilde katalogla
birebir; `faqByLocale` ile `seed-managed-content.sql` **birebir** aynı (6×6);
`Article`/`JobPosting` zorunlu alanları tam; `employmentType` ve
`jobLocationType: "TELECOMMUTE"` Google'ın resmî örneğiyle uyumlu; `resolveJobDateModified`
`dateModified >= datePosted` koruyor; ilçe/indeks `pageName`/`pageLabel` mount'ları yerinde.

### Ne yapıldı

Yeni `src/content/ai-visibility/job-description-html.ts` (`toJobDescriptionHtml`):
düz metni `<p>` + `<ul><li>` yapısına **yeniden akıtır** (içeriği yeniden yazmaz),
metni HTML-escape eder, zaten blok markup içeren değeri dokunmadan geçirir, boş
değeri boş bırakır. `buildJobPostingStructuredData` açıklamayı bu yardımcıdan geçiriyor.
Görünen sayfa etkilenmiyor (React düz metni render ediyor); yalnız JSON-LD değeri
Google'ın istediği biçimi alıyor.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (572 test,
+2 yeni guard) · guard kırmızı→yeşil kanıtlandı · gerçek seed açıklamasıyla çıktı
gözle doğrulandı (`<p>…</p><ul><li>…`).

---

## Rapor — micro-denetim turu 8 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Devir yok.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 25 | 25 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `src/content/ai-visibility/job-description-html.ts:46` (tur 7'de eklenen modül) | hata yolu / doğruluk | Modülün sözleşmesi "metin escape edilir" diyor, ama passthrough dalı **herhangi bir yerde** blok-tag regex'i eşleşince tetikleniyordu. `"Satır sonu <br> burada literal"` ve `"Küçüktür <div> işareti…"` gibi düz metinler fragment sanılıp **escape'siz** geçiyordu; `&` ve `<` ham JSON-LD'ye giriyordu | yalnız **gerçek** HTML fragment'ı (tag ile başlayan + kapalı blok eleman veya `<br>`) geçmeli, gerisi escape edilmeli | ham `<`/`&` yapısal veriye sızar; sözleşme ile kod çelişir | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** brief'teki tüm URL'ler gerçek rotaya çözülüyor
(157 link, malformed 0); kısa brief hâlâ 22 bağlantı; `faqByLocale` ile
`seed-managed-content.sql` birebir aynı (6×6); rehber/yazı slug'ları 6 dilde
konumsal olarak eşleşiyor (hreflang çözülür); `JobPosting` zorunlu alanları tam;
seed'deki 22 işveren logo URL'si `curl -L` ile **200** (403 yok); ilçe/indeks
`pageName`/`pageLabel` mount'ları yerinde.

Değerlendirilip **bulgu sayılmayanlar:** `LOCATION_LOCALITY`/`LOCATION_DISTRICT`
yalnız kendi modülünde kullanılıyor ama operatör verisinin adlandırılmış parçası
(silmek adresi isimsizleştirir) — bulgu değil. `llms-brief` içindeki
`primaryPages.label` ile `Nav.*` etiketleri ayrışıyor (ör. "Kariyer gündemi" vs
"İş Haberleri"); ikisi de ürünün kendi metni, sayfa başlığı ile gezinme etiketi
farklı olabilir — kasıtlı.

### Ne yapıldı

`isHtmlFragment()` eklendi: değer `<` ile başlamıyorsa metin; başlıyorsa **kapalı**
bir blok elemanı (`<p>…</p>`) ya da `<br>` içermesi gerekir. Böylece düz metin
içinde geçen `<br>`/`<div>` artık markup sayılmıyor ve escape ediliyor. Modülün
doc-comment'i de yeni kuralı anlatacak şekilde güncellendi.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (594 test,
+1 genişletilmiş guard) · guard kırmızı→yeşil kanıtlandı (tur 7'deki hatalı
regex geri konunca test kırmızı).

---

## Rapor — micro-denetim turu 9 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Devir yok.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 26 | 26 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `structured-data.ts:170` (`sectionName`), `:253-290` (`pageName`) | tutarlılık / çok dillilik | `buildGuideStructuredData`'nın `sectionName` varsayılanı sabit `"Rehber"`/`"Blog"`, `buildCollectionPageGraph`'ın `pageName` varsayılanı sabit `` `${subjectName} İş İlanları` `` idi. Bu parametreleri **atlayan** bir çağrı, `en`/`de`/`fa` sayfada Türkçe etiket üretiyordu (ölçüldü: `district(en)` → `"Kyrenia İş İlanları"`, `jobtype(de)` → `"Praktikum İş İlanları"`, `guide(fa)` → `"Blog"`). Kod, parametreyi geçmeyi unutmanın cezalandırılmadığı bir yol bırakıyordu — #179/#230'da düzeltilen hatanın aynısı | varsayılan, ürünün kendi kataloğundan gelmeli | bir gelecek çağrı yeri sessizce Türkçe etiket yayınlar | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** `Organization.geo` koordinatları (35.3394, 33.1961)
Nominatim'in resmî kaydıyla birebir (`35.3394085, 33.1960746`); `article`/`guide`
içeriğinde 6 dilde kopya başlık/gövde/liste öğesi yok (React key çakışması yok);
`/logos` altındaki 316 yerel dosya adı `resolveLogoSrc` deseniyle %100 uyumlu;
seed'deki 22 işveren logo URL'si `curl -L` ile 200; brief'teki tüm URL'ler gerçek
rotaya çözülüyor; `faqByLocale` ile `seed-managed-content.sql` birebir aynı (6×6);
CSP `script-src 'unsafe-inline'` içerdiği için inline JSON-LD engellenmiyor;
`/llms.txt` ve `/llms-full.txt` `force-static` ve `robots.txt`'in `Disallow`
listesinde değil (taranabilir).

Değerlendirilip **bulgu sayılmayanlar:** `FaqSection` girdileri `question` ile
key'leniyor ama admin RPC'si kopya soru engellemiyor — SSR'da gözlemlenebilir bir
arıza üretilemedi (denendi: kopya girdiyle render'da uyarı yok) ve paketli
katalogda kopya yok; yönetici verisiyle sınırlı, düşük etkili bir kenar durumu.

### Ne yapıldı

Yeni `src/content/ai-visibility/interface-catalog.ts`: altı arayüz kataloğunu
(`src/messages/*.json`) tek yerden sunar (`catalogs`, `fillTemplate`). Hem
`llms-brief.ts` hem `structured-data.ts` buradan okuyor (önce brief kendi kopyasını
tutuyordu). Üreticilerin varsayılanları artık katalogdan türetiliyor:

- `pageName` → `DistrictPage.title` / `JobTypePage.title` + konu adı;
- `sectionName` → `Nav.blog` / `Footer.links.guides`.

**Geriye dönük uyumluluk:** parametreleri açıkça geçen mevcut çağrı yerlerinin
çıktısı bit bit aynı (`diff` boş). Yeni modül yalnız sunucu modülleri tarafından
import ediliyor (iki `force-static` route + sunucu bileşenlerinden mount edilen
üreticiler), istemci paketine sızmıyor.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (630 test,
+1 yeni guard) · guard kırmızı→yeşil kanıtlandı (eski sabit varsayılanlar geri
konunca test kırmızı).

---

## Rapor — micro-denetim turu 10 (issue #126), branch `lane/geo`

**Durum:** düzeltmeler branch'te, CI bekliyor. Devir yok.

### Denetlenen dosyalar (`git ls-files`)

| Glob | N | Bakıldı |
|---|---|---|
| `src/content/**` | 26 | 26 (hepsi) |
| `src/app/llms.txt/**` | 1 | 1 |
| `public/llms*` | 0 | — (dosya yok) |
| `src/features/**/structured-data*.ts` | 1 | 1 |
| `src/features/jobs/job-posting-structured-data.ts` | 1 | 1 |

### Bulgu

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `interface-catalog.ts:77` (`fillTemplate`, tur 9'da eklediğim yardımcı) | doğruluk / sınır girdi | `String.replace`'e **string** replacement verilmişti; JS replacement string'inde `$&`, `` $` ``, `$'`, `$$`, `$1` özel anlam taşır. Ölçüldü: `fillTemplate("{district} Jobs", "$&")` → `"{district} Jobs"` (şablonun kendisi), `"$'"` → `" Jobs Jobs"`, `"$$"` → `"$ Jobs"`. Değer veri olduğu hâlde yorumlanıyordu | değer birebir yerleşmeli | ilçe/tür adı `$` içerirse yapısal veri ve breadcrumb bozulur; bugün katalogda `$` yok, ama girdi sınırda | **düzeltildi** |

**Doğru bulunanlar (bulgu yok):** `JsonLd` `<` kaçışı `</script>` enjeksiyonunu
engelliyor; `getConfiguredSocialProfiles` yalnız `https?://` değerleri kabul
ediyor (şemasız değer düşüyor); `buildPostalAddress` tek kaynak (`COUNTRY_CODE`);
brief'teki tüm URL'ler gerçek rotaya çözülüyor; `faqByLocale` ile
`seed-managed-content.sql` birebir aynı (6×6); üretici varsayılanları katalogdan
geliyor (tur 9); `/logos` altındaki 316 dosya adı renderer deseniyle uyumlu.

Değerlendirilip **bulgu sayılmayanlar:** #327 (`de` `DistrictPage.title` /
`JobTypePage.title` İngilizce kopya) `src/messages/**` içinde — LANE-İÇERİK'in
sahipliğinde ve zaten `lane:icerik` + `agent:handoff` ile açılmış; GEO yalnız
tüketici (üretici doğru davranıyor, çeviri eksik).

### Ne yapıldı

`fillTemplate` replacement'ı fonksiyona çevrildi (`() => value`), böylece değer
`$` örüntüleri yorumlanmadan birebir yerleşiyor. Doc-comment gerekçeyi yazıyor.

### Kapılar
`lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` ✅ (637 test,
+1 yeni guard) · guard kırmızı→yeşil kanıtlandı (string replacement geri konunca
`fillTemplate mangled "$&"` ile kırmızı).
