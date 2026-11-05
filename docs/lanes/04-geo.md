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
