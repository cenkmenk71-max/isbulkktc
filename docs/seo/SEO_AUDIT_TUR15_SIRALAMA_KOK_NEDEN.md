# Tur 15 — "Site çıkmıyor tam domain yazmadan" kök-neden denetimi (2026-11-12)

**Kapsam:** isbulkktc.com canlı sıralama/görünürlük sorunu + GSC coverage triyajı.
**Yöntem:** canlı HTTP/HTML ölçümü (curl + JSON-LD ayrıştırma), Bing/DDG arama sonuçları,
GSC coverage anlık görüntüsü (repo raporları), rakip/ikiz alan adı incelemesi.
**Sınıflandırma:** CONFIRMED / LIKELY / NOT FOUND / NOT APPLICABLE.
**Kısıt:** Google'a doğrudan sorgu bu ortamdan engelli (bot koruması) ve Google OAuth kimliği
yok → per-URL URL Inspection çalıştırılamadı. Google için kanıt **GSC coverage** + **dolaylı
mekanizma**; Bing'de ise **doğrudan canlı kanıt** var.

---

## 0. Yönetici özeti (tek paragraf)

Site **teknik olarak indekslenebilir ve indekslenmiş** durumda (Bing'de `site:` 1.870 sonuç,
marka sorgusunda #1; sitemap 183 URL tamamı PASS). Sorun **indeksleme değil, sıralama**: iki
ölümcül sinyal birleşiyor — **(1)** yayındaki **21 ilanın 21'i** kaynak siteden kelimesi
kelimesine kopya (sitede **tek bir özgün ilan yok**) ve **(2)** aynı markayı (`İşbul KKTC`)
üstlenen **ikinci bir canlı alan adı** (`isbulkibris.com`) var; üstelik o sitenin
`Organization.alternateName` alanı **birebir "İşbul KKTC"** içeriyor. Google/Bing aynı metni
**daha eski + daha otoriter** kaynakta görünce **kaynağı** sıralar; marka sorgusunda ise
**varlık (entity) iki alan adı arasında bölündüğü** için net bir sahip seçilemez. Buna ~2
aylık yeni alan adı ve ~sıfır dış bağlantı eklenince "tam domain yazmadan çıkmıyor" sonucu
kaçınılmaz hale geliyor. **Kod tarafında sıralamayı bozan tek bir hata YOK** — kalan iş
**içerik özgünlüğü + marka/domain birleştirme + otorite**.

---

## 1. Ölçülen canlı kanıt (yeniden üretilebilir)

### 1.1 Sıralama (Bing, canlı — 2026-11-12)

| Sorgu | Sonuç | isbulkktc.com |
|---|---|---|
| `kıbrıs iş ilanları` (genel) | 1) iskibris.com 2) kktcportal.net 3) kariyer.net 4) kibristailan.com 5) isbuldumkibris.com 6) **isbulkibris.com** 7) secretcv.com … | **YOK (ilk 10'da değil)** |
| `isbulkktc` (marka) | 1) **isbulkktc.com** 2) instagram 3) **github.com/LBCron/isbulkktc** 4) github.com/ORIJINuss … | **#1 (marka çalışıyor)** |
| `site:isbulkktc.com` | — | **1.870 sonuç (indeksli)** |

> **Yorum:** Marka sorgusunda site kendini buluyor → **indeksleme sağlam**. Genel sorguda
> yok → **otorite/özgünlük yok**. Kullanıcının şikâyeti ("tam domain yazmadan çıkmıyor") ve
> "GitHub sayfası öne geçiyor" gözlemi **birebir** bu tabloyla eşleşiyor: marka sorgusunda
> site #1 ama hemen ardında **public GitHub deposu** var — site dış bağlantı/atıf
> toplamadığı için repo ona yetişiyor.

### 1.2 İçerik özgünlüğü (CONFIRMED — P0 kök neden)

```bash
curl -s https://isbulkktc.com/sitemap.xml | grep -o '<loc>' | wc -l          # 183
curl -s https://isbulkktc.com/sitemap.xml | grep -o '<loc>[^<]*</loc>' \
  | grep -c '/jobs/'                                                          # 21
curl -s https://isbulkktc.com/jobs | grep -o 'href="/jobs/source-[^"]*"' \
  | sort -u | wc -l                                                           # 20
curl -s https://isbulkktc.com/jobs | grep -oE 'href="/jobs/[a-z0-9-]+"' \
  | grep -v 'source-' | sort -u | wc -l                                       # 0  <-- yerli ilan YOK
```

- Sitemap'teki **21 ilan URL'sinin 21'i** `source-*` (içe aktarılmış).
- `/jobs` listesinde **20/20** bağlantı `source-*`; **yerli (platform) ilan 0**.
- Örnek eşleşme (birebir kopya): `isbulkktc.com/jobs/source-iskibris-insaat-muhendisi`
  ↔ `iskibris.com` aynı ilan, aynı gövde. Kaynak markası temizlenmiş, **kaynak atıfı yok**.
- `JobPosting` şemasında **`isBasedOn` / `sameAs` YOK** → Google'a "bu metin bizim değil"
  sinyali veriliyor.

### 1.3 İkiz alan adı / marka çakışması (CONFIRMED — P0 kök neden)

`isbulkibris.com` canlı `Organization` şeması (canlı çekildi):

```json
{"@type":"Organization","@id":"https://isbulkibris.com/#org",
 "name":"İşbul Kıbrıs",
 "alternateName":["İşbul KKTC","İşbul Kıbrıs","Isbul Kibris","IsbulKibris"],
 "url":"https://isbulkibris.com","telephone":"+90 542 882 20 18"}
```

- İkiz site **`alternateName` alanında birebir "İşbul KKTC"** yazıyor → marka, tanım
  gereği **iki alan adına** bağlı.
- İki alan adı da **canlı**, **hiçbiri diğerine yönlendirmiyor** (`/` → 200 / 200).
- Kayıt tarihleri: `isbulkktc.com` **2026-09-19** (~2 ay), `isbulkibris.com` **2026-07-13**
  (daha eski → kopya metinlerde **kaynak avantajı onda**), `iskibris.com` **2015** (gerçek rakip).
- İki site arasında **çapraz bağlantı 0** → Google'a "aynı işletme" sinyali gitmiyor,
  yalnız **çakışan marka adı** görünüyor.

### 1.4 Diğer canlı bulgular

| Bulgu | Ölçüm | Sınıf |
|---|---|---|
| Public HTML'de `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` + aynı yanıtta `Set-Cookie: NEXT_LOCALE` | `cf-cache-status: DYNAMIC`, `x-vercel-cache: MISS`, `age: 0` | CONFIRMED |
| Public GitHub **fork** + bağımsız Vercel dağıtımı | `LBCron/isbulkktc` (public fork, 2026-11-08) → `isbulkktc-amber.vercel.app` **canlı**, `Allow: /`, canonical → `isbulkktc.com` | CONFIRMED |
| Kaynak repo görünürlüğü | `cenkmenk71-max/isbulkktc` **private=False** | CONFIRMED |
| GSC coverage | 43 "Tarandı — dizine eklenmedi" + 12 "Keşfedildi — dizine eklenmedi" | CONFIRMED (mevcut) |

---

## 2. Sınıflandırma (istenen çıktı)

### 2.1 CONFIRMED

| # | Bulgu | Önem | Neden kök neden |
|---|---|---|---|
| C1 | **Katalog %100 kopya; sıfır özgün ilan** (21/21 `source-*`, 0 yerli) | **P0** | Google aynı metnin **sahibini** arar; kaynak daha eski + otoriter → sayfamız "yayıncı" sayılmaz, sıralanmaz. |
| C2 | **İkiz alan adı `isbulkibris.com` birebir "İşbul KKTC" markasını taşıyor**, ikisi de canlı, yönlendirme yok | **P0** | Marka varlığı (entity) iki alan adı arasında **bölünür**; Google net bir "sahip" seçemez. |
| C3 | Public HTML'de **`no-store` + `Set-Cookie`** | P2 | Edge/CDN önbelleği kapanır (`DYNAMIC`/`MISS`); tarama bütçesi ve render tazeliği israf olur. Sıralamayı **doğrudan** bozmaz ama yeni/küçük siteye zarar. |
| C4 | **Public fork + bağımsız Vercel yayını** (`isbulkktc-amber.vercel.app`) | P2 | İzlenmeyen ikinci bir kopya yüzeyi; canonical doğru olduğu için **risk sınırlı** ama gereksiz. |
| C5 | **GSC 43+12 "eklenmedi" kovası** | P2 | İnce/çok kopyalı/yeni içeriğin **klasik imzası** → C1 ile tutarlı. |

### 2.2 LIKELY

| # | Bulgu | Önem | Kanıt |
|---|---|---|---|
| L1 | **Yeni alan adı + otorite açığı** (~2 ay, ~sıfır dış bağlantı) | **P1** | Genel sorguda Bing ilk 10'da yok; marka sorgusunda var. `Organization.sameAs` **boş** (hiç sosyal/kurumsal doğrulama bağlantısı yok). |
| L2 | **Marka belirsizliği entity'yi dağıtıyor** | P1 | Aynı marka iki domainde; marka sorgusunda hemen ardında public GitHub repo'su — site dış atıf toplamadığı için repo yetişiyor. |
| L3 | **İnce (thin) facet/şehir landing sayfaları** | P2 | 43+12 kovası; boş facet'ler `noindex`'e alınmış (doğru) ama dolu olanlar da zayıf metinli. |
| L4 | **`datePosted` kaynaktan kopyalanıyor** | P3 | JSON-LD tarihleri kaynakla birebir; Jobs zengin sonuç tazeliği sinyali zayıf. |

### 2.3 NOT FOUND (aranan ama sorun bulunmayan)

- **Cloaking:** Googlebot ↔ tarayıcı görünür metin **birebir** (11.902 karakter, içerik eşit). ✅ temiz
- **robots.txt hatası:** `Allow: /`, doğru `Host`, doğru `Sitemap`. ✅ temiz
- **Sitemap hatası:** 183 `<loc>`, örneklenen sayfalar 200 + canonical eşleşiyor. ✅ temiz
- **Canonical / hreflang hatası:** tek-dil canonical doğru; hreflang setleri doğru; `/tr/*`,
  `www`, trailing-slash hepsi **308**. ✅ temiz
- **Yanlış robots meta:** indekslenebilir sayfalarda hatalı meta yok. ✅ temiz
- **Render/indexlenebilirlik:** ana sayfa + ilan sayfaları **sunucu-render**, başlık/canonical/h1/JSON-LD doğru. ✅ temiz

### 2.4 NOT APPLICABLE (istenen/doğru davranış)

- **`noindex` kovası (83):** auth/dashboard + boş facet → bilinçli politika. ✅
- **404 (58), Yönlendirmeli (48), Alternatif (31), 4xx (23):** normal yaşam döngüsü / güvenlik / tasarım. ✅

---

## 3. Her doğrulanmış sorun için EN KÜÇÜK GÜVENLİ DÜZELTME

> Repo konvansiyonu gereği **kod değişiklikleri onaya tabidir**; bu turda **hiçbir kod
> değiştirilmedi** (yalnız ölçüm + rapor). Aşağıdakiler uygulanmaya hazır önerilerdir.

| Sorun | En küçük güvenli düzeltme | Tip | Risk |
|---|---|---|---|
| **C1** kopya içerik | **(a)** Her içe aktarılan ilanın altına **görünür "Kaynak: iskibris.com" bağlantısı** + `JobPosting.isBasedOn` ekle → "başkasının metnini yayınlayan" sinyali kırılır. **(b)** Gövdeyi **kendi cümlelerimizle özetle** + özgün bağlam (ilçe/ücret/benzer ilan) ekle. | (a) kod, (b) içerik kararı | Düşük / Yüksek etki |
| **C2** ikiz domain | İkisinden birini seç: **`isbulkibris.com` → 301 → `isbulkktc.com`** (veya tersi) **ya da** iki siteyi **ayrı marka** olarak netleştir (isim/logo/`alternateName` çakışmasını kaldır). | DNS/ürün kararı | **En yüksek kaldıraç** |
| **C3** `no-store` | Public HTML için `Cache-Control: public, s-maxage=<N>, stale-while-revalidate=<M>`; anonim GET'te `Set-Cookie` üretme (locale'i URL/`Accept-Language` ile çöz). | kod | Orta |
| **C4** public fork + Vercel | `isbulkktc-amber.vercel.app` dağıtımını **sil** veya `X-Robots-Tag: noindex`; kaynak repoyu **private** yap. | ayar | Düşük |
| **L1** otorite | `Organization.sameAs`'i doldur (Instagram/GBP/LinkedIn); KKTC dizinlerine kaydol; kurumsal atıf topla. | pazarlama | Yüksek etki, yavaş |
| **L2** marka belirsizliği | C2 ile çözülür; tek domain + tek tutarlı `name`/`alternateName` bırak. | — | — |
| **L3** ince sayfalar | Boş facet `noindex` (zaten var) + dolu facet/şehir sayfalarına **özgün 150–300 kelime** içerik. | içerik | Orta |
| **L4** `datePosted` | `datePosted` = kaynağın `created_at`, `dateModified` = kendi doğrulama tarihimiz. | kod | Düşük |

---

## 4. Kullanıcının şikâyeti → kök neden zinciri

```
"Site çıkmıyor tam domain yazmadan"
        │
        ├─ Yeni alan adı (~2 ay) + ~sıfır dış bağlantı          [L1]
        ├─ %100 kopya içerik → Google kaynağı tercih ediyor     [C1]
        ├─ Marka iki domainde bölünmüş (ikisi de "İşbul KKTC")  [C2]
        │        └─ marka sorgusunda entity net değil →
        │           hemen ardında public GitHub repo'su çıkıyor [L2]
        └─ (yardımcı) no-store ile CDN önbelleği kapalı         [C3]
```

**"GitHub sayfası öne geçiyor" neden oluyor:** Site **dış atıf/bağlantı toplamadığı** için
Google/Bing marka varlığına dair güvenilir bir "sahip" sinyali bulamıyor; bir public repo
(ve Instagram) ise birkaç atıf taşıdığı için aynı marka sorgusunda siteye yetişiyor.
Bu **indeksleme** sorunu değil, **otorite + varlık netliği** sorunudur.

---

## 5. Öncelik sırası (etki × emek)

1. **C2** — İkiz domaini birleştir (301) **veya** markaları ayır. *Tek en yüksek kaldıraç.*
2. **C1a** — Kaynak atıfı + `isBasedOn` (küçük kod işi, kopya sinyalini hemen zayıflatır).
3. **C1b** — Özgün özet/bağlam üretimi (içerik; kopya filtresini kırar).
4. **L1** — `sameAs` + dizin kayıtları (otorite; yavaş ama kalıcı).
5. **C3 / C4 / L3 / L4** — hijyen düzeltmeleri.

---

## 6. Sınırlar ve izlenecekler

- **Google doğrudan testi yapılamadı** (bot engeli + OAuth yok). Google tarafı **GSC
  coverage** ile kanıtlı; mekanizma (kopya dedupe + varlık bölünmesi) **Bing'de doğrudan
  gözlemlendi** ve Google'da da geçerli olan evrensel sinyallerdir.
- **Doğrulama planı:** C2 uygulanınca 2–4 hafta içinde marka sorgusunda GitHub'ın **gerisine
  düşmesi** ve genel sorguda **ilk 20'ye girmesi** beklenir; C1 sonrası GSC "Tarandı —
  eklenmedi" kovasının **küçülmesi** beklenir.
- GSC coverage CSV'si paylaşıldığında **birebir kova triyajı** (bu rapordaki C5 ile
  eşleştirilerek) yapılacaktır.

---

## 7. Bu turda uygulanan düzeltmeler (C1 kökü — kopya kaynağını kes)

C1'in kökü (kelimesi kelimesine kopya, kaynak alan adına işaret eden içerik) **veri katmanında**
kesildi. Kod, veri ve test birlikte güncellendi:

1. **İthalat hattı durduruldu.** `Refresh source jobs` GitHub Actions iş akışı
   `disabled_manually` yapıldı. Aksi halde günde iki kez (04:17 / 16:17) çalışıp silinen
   kaynak ilanları geri getiriyordu.
2. **İthal ilanlar silindi (tek transaction).** 21 ilan + 21 `job_source_imports` kaydı +
   21 kaynak şirket kaldırıldı. Kalan durum: **0 ilan, 0 import, 3 yerli şirket, 0 kaynak
   şirket, 0 başvuru.** FK davranışı doğrulandı (`job_source_imports.job_id` CASCADE,
   `applications.job_id` RESTRICT ve 0 satır).
3. **Boş katalogda `/jobs` artık `noindex,follow`.** `src/app/[locale]/(public)/jobs/page.tsx`
   `generateMetadata` boş board için `noindex` üretir → boş liste "soft 404" olarak
   indekslenmez (mevcut boş district/type `noindex` deseniyle tutarlı).
4. **Sitemap tutarlılığı.** `src/app/sitemap.ts` `hasPublishedJobs` koşuluyla boşken `/jobs`
   girişini düşürür → sitemap artık `noindex` ile çelişmez.
5. **Regresyon testi.** `tests/integration/empty-board-indexing.test.ts` (4 test): boş board
   sitemap'ten düşer/ilanlı board yeniden eklenir; boş board `noindex`, ilanlı board
   indekslenebilir.

**Not:** Bu, C1'i *besleyen kaynağı* keser; **C1a/C1b (kaynak atıfı + özgün içerik)** ve
**C2 (ikiz domain birleştirme/ayırma)** hâlâ açık ve en yüksek kaldıraçlı işler olarak
§5'te duruyor. Yerli içerik (`directory_companies`, 911 firma) halka açıldığında
`/jobs` boş kalmaz ve noindex otomatik kalkar.
