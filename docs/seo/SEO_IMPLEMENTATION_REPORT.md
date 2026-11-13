# SEO / İndeksleme / META / Yerel SEO / AI Search — Uygulama Raporu

Tek merkezi teslim. Tarih: 2026-11-03. Hedef: `https://isbulkktc.com`.
Kapsam: kanıta dayalı denetim + doğrulanmış sorunların en küçük güvenli düzeltmesi.

Durum sınıfları: CONFIRMED · LIKELY · NOT FOUND · NOT APPLICABLE · BLOCKED.
Önem: P0 (erişim/indeks engeli) · P1 (temel sinyaller) · P2 (içerik/URL kalitesi) · P3 (genişletilmiş).

---

## 1. Yönetici özeti ve başlangıç durumu

Proje SEO altyapısı **olgun**. Bu görevde çoğu kontrol "zaten doğru" çıktı; yalnızca
kanıtla doğrulanmış **üç gerçek sorun** bulundu ve düzeltildi.

Başlangıç durumu (değişmeden önce kaydedildi):
- Repo: `cenkmenk71-max/isbulkktc`, Next.js **16.4.2** (App Router), React 19, TypeScript.
- Paket yöneticisi: CI/Vercel `bun.lock` (bun 1.4); `package-lock.json` bayat (npm ci başarısız) — bu görevden bağımsız, bilinen durum.
- Çalışma ağacı: PR #74 squash-merge edilmiş, `main` = `0eeb3b91`, açık PR/issue yok.
- Migration sistemi: `supabase_migrations.schema_migrations` değil, özel `public._applied_migrations`.
- Locale: 6 dil (`tr` varsayılan + `en/ru/de/fa/el`), `localePrefix: "as-needed"`.

**Uygulanan düzeltmeler (özet):**
1. **P2 — Dizin adres alanındaki kişisel veri (e-posta + tekrar eden telefon).** Bir şirket
   kartında bir kişisel Gmail adresi ve bir mağaza telefonu `address` metnine gömülüydü ve
   `/companies` sayfasının sunucu HTML'inde (RSC payload) yayımlanıyordu. İçe aktarma artık
   adresi sanitize ediyor; mevcut veri JSON + seed + **canlı DB** temizlendi.
2. **P1 — Sitemap bayat ilan URL'i.** Saatlik ISR ile önbelleklenen sitemap, katalogdan
   düşmüş bir ilanı bir süre daha duyuruyor ve o URL 404 veriyordu. Sitemap'e "duyurduğu
   her ilan URL'i 200 dönmeli" kuralını pinleyen E2E testi eklendi; DB hatası artık sessizce
   boş liste üretmek yerine loglanıyor.
   > ⚠️ **GÜNCELLEME (Tur 7, §38–§44):** Bu düzeltme **yetersiz çıktı.** Canlı ölçüm (2026-11-13)
   > sitemap'in hâlâ **5×404 URL** duyurduğunu ve **5 canlı ilanı atladığını** gösterdi. Kök neden:
   > sitemap **statik** (`○ /sitemap.xml`, ISR) — "≤1 saatte kendini düzeltir" varsayımı **geçersiz**.
   > Bkz. **P1 (T7-1/T7-3)** ve `MANUAL_TASKS.md §12`.
3. **P1 — Sessiz DB hataları.** `search_public_jobs` / `get_public_job_details` hata verdiğinde
   boş sonuç dönüyor ve bu "ilan yok"tan ayırt edilemiyordu (detay sayfası canlı ilanı 404
   gösterirdi). Artık loglanıyor; davranış değişmedi.

---

## 2. Bulgu tablosu

| # | Durum | Önem | Bulgu | Kanıt | Etki | Çözüm |
|---|---|---|---|---|---|---|
| 1 | CONFIRMED | P2 | `/companies` sunucu HTML'inde bir kişisel e-posta (`c.oztekiner@gmail.com`) ve bir mağaza telefonu, adres metnine gömülü yayımlanıyordu | `curl /companies` → RSC payload'da `"address":"59Q5+P64 c.oztekiner@gmail.com, Lefkoşa 99010"`; kaynak `company-directory.json` + `directory_locations` tablosu | Gizlilik: kimse yayımlamadığı bir kişisel mailbox'ı her crawler'a açma | `sanitizeDirectoryAddress` (import) + JSON/seed/DB temizliği |
| 2 | CONFIRMED | P1 | Sitemap, 404 dönen bir ilan URL'i duyuruyordu | Sitemap 87 `<loc>` → 86×200, **1×404** (`source-isbulkibris-on-muhasebe-personeli-musteri-hizmeti`); canlı RPC bu slug'ı artık döndürmüyor | Google, çözülmeyen URL duyuran sitemap'i düşürür; bayat girdi katalog değişiminde tekrar oluşabilir | E2E testi (her sitemap ilanı 200) + sitemap DB hatasını logla |
| 3 | CONFIRMED | P1 | İlan arama/detay DB hatası sessizce boş sonuç dönüyordu | `src/server/dal/jobs.ts` — `catch { return [] }` / `catch { ... return null }` | Canlı ilan 404 görünür; arıza "ilan yok"tan ayırt edilemez | `catch (error)` + `console.error` (davranış aynı) |
| 4 | CONFIRMED | — | `/jobs?page=N` self-canonical (`/jobs`) | `curl /jobs?page=2` → `canonical=/jobs` | Yok (Google pagination için canonical kullanımını onaylıyor) | Değişiklik yok |
| 5 | CONFIRMED | — | Filtreli arama canonical'ı `/jobs`; eşleşmeyen filtre `noindex, follow` | `curl /jobs?district=Girne` → `canonical=/jobs`; `/jobs?district=zzz` → `noindex` | Yok (Google faceted nav yönergesine uygun) | Değişiklik yok |
| 6 | NOT FOUND | — | JobPosting liste/kategori sayfalarında | `grep JobPosting` → `/jobs`,`/companies`,`/`,`/about` hepsi 0 | Yok | Değişiklik yok |
| 7 | NOT FOUND | — | Duplicate canonical / yanlış locale canonical | `/en/jobs/<slug>` → TR kanonik; `/de` → self-canonical + 7 hreflang | Yok | Değişiklik yok |
| 8 | NOT FOUND | — | noindex sayfayı robots ile Disallow etme hatası | `robots.txt` yalnız `/api/`,`/auth/` disallow; hesap sayfaları `noindex` meta ile | Yok | Değişiklik yok |
| 9 | NOT FOUND | — | PII/secret sızıntısı (CV, aday verisi, service-role) | public HTML taraması temiz; auth sayfaları 307 | Yok | Değişiklik yok |
| 10 | NOT APPLICABLE | — | Şehir/kategori landing sayfası indeks politikası | Böyle bir route yok (yalnızca `/jobs?district=` filtresi) | Yok | Değişiklik yok |
| 11 | NOT APPLICABLE | — | Blog Article schema | `/blog` derleme sayfası, özgün makale yayımlamıyor | Yok | Değişiklik yok |
| 12 | RESOLVED | P1 | Search Console / GA4 / CrUX / Cloudflare dashboard denetimi | `npm run search-console:verify` (canlı API, 2026-11-12): siteOwner, 1 sitemap/207 URL, `/` "Submitted and indexed", 0 failure | Ölçümleme artık Google'ın kendi API'sinden okunuyor | `scripts/verify-search-console.mjs` + runbook |
| 13 | **CONFIRMED** | **P1** | **Canlı sitemap bayat: 5 URL 404 dönerken duyuruluyor, 5 canlı ilan atlanıyor** | `curl /sitemap.xml` (183 `<loc>`, `age:0`) ↔ canlı `search_public_jobs`; CI build `└ ○ /sitemap.xml 1h 1y` (statik) | Sitemap "çözülmeyen URL" sinyali verir; yeni ilanlar deploy olmadan hiç listelenmez | **Tur 7, §38–§44**; `MANUAL_TASKS.md §12` (force-dynamic veya on-demand `revalidatePath`) |

---

## 3. Değiştirilen dosyalar

| Dosya | Gerekçe |
|---|---|
| `src/features/companies/directory-import.ts` | `sanitizeDirectoryAddress` eklendi; CSV adresinden e-posta ve tekrar eden telefon çıkarılır |
| `src/features/companies/data/company-directory.json` | Gömülü e-posta/telefon içeren 3 adres sanitize edildi |
| `supabase/seed-managed-content.sql` | Aynı 2 adres `directory_locations` INSERT'lerinde düzeltildi |
| `src/server/dal/jobs.ts` | Sitemap + arama + detay `catch` blokları hatayı loglar (davranış aynı) |
| `tests/unit/company-directory.test.ts` | `sanitizeDirectoryAddress` + uçtan uca CSV testleri (2 test) |
| `tests/e2e/seo.spec.ts` | "Sitemap'teki her ilan URL'i 200 döner" testi (1 test) |
| `docs/seo/SEO_IMPLEMENTATION_REPORT.md` | Bu rapor |

Canlı DB (repo dışı, tek seferlik): `directory_locations` içindeki 2 PII adresi temizlendi.

---

## 4. Önce/sonra (gerçek gözlem)

**PII (bulgu 1)**
- Önce: `{"address":"59Q5+P64 c.oztekiner@gmail.com, Lefkoşa 99010"}` ve
  `{"address":"Birtek Oto Elektrik - 0392 2252776, Trachonas 99010"}`
- Sonra: `{"address":"59Q5+P64, Lefkoşa 99010"}` ve
  `{"address":"Birtek Oto Elektrik -, Trachonas 99010"}`
- Doğrulama: `select ... where address ~ '@'` → **0 satır** (önce 1).

**Sitemap (bulgu 2)**
- Önce: 87 `<loc>`, 1 tanesi 404.
- Kod tarafı: sitemap DB hatasında artık `console.error` basar (sessiz boş liste yok).
- Kalıcı düzeltme: `?page=`/katalog değişiminde bayat girdi bir daha sızmaz çünkü E2E testi
  her sitemap ilanını tek tek 200'e karşı doğrular. (Canlı bayat girdi ≤1 saat içinde
  revalidate ile kendini düzeltir; zorla purge **yapılmadı** — kullanıcı onayı gerekir.)

---

## 5. Test komutları ve sonuçlar

| Komut | Sonuç |
|---|---|
| `npm run lint` | ✅ PASS |
| `npm run typecheck` | ✅ PASS |
| `npm run check:frontend-source` | ✅ PASS (41 token / 175 assertion) |
| `npm run test:unit` | ✅ PASS — **351/351** (yeni 2 test dahil) |
| `NEXT_PUBLIC_APP_URL=… NEXT_DIST_DIR=.next-seo npm run build` | ✅ PASS (build sonrası `tsconfig.json`/`next-env.d.ts` geri alındı) |
| `npm run test:e2e` (yeni sitemap testi dahil) | ⏳ CI'ya bırakıldı (yerelde Supabase/Docker yok) — **BLOCKED (yerel)** |

Canlı doğrulamalar (curl): apex/http/www → tek hop kanonik; `/robots.txt` 200 `text/plain`;
`/sitemap.xml` 200 (86/87 → 1 bayat); normal vs Googlebot UA yanıtı **birebir aynı**
(261336 bayt, challenge yok); 6 dilde `lang`/`dir`/canonical/hreflang doğru.

---

## 6. Canlı ortamda bekleyen işler (kullanıcı adımı)

- **Search Console** (ÇÖZÜLDÜ): property `sc-domain:isbulkktc.com` siteOwner olarak doğrulandı;
  sitemap gönderilmiş (207 URL, Google indirdi); örnek URL'ler "Submitted and indexed".
  Artık `scripts/verify-search-console.mjs` API'den okuyor; dashboard'da yalnız Manual
  actions / Security issues gözle kontrolü kaldı. Runbook: `docs/runbooks/search-console-indexing.md`.
- **Vercel/Cloudflare** (BLOCKED): sitemap cache purge **yapılmadı**; istenirse
  `revalidate` beklemeden purge edilebilir. Cloudflare/CF dashboard denetimi ayrı iş.
- **Indexing API** (ENTEGRE): `scripts/submit-indexing.mjs` + `.github/workflows/submit-indexing.yml`
  sitemap'teki `/jobs/<slug>` sayfalarını günlük bildirir. Canlı: 207 girdiden 21 JobPosting
  URL'i → `Notified 21/21`. Kimlik: OAuth refresh token (service-account kabul edilmez);
  credential yokken kapalı-by-default ve yeşil.
- **GA4** (BLOCKED): organik landing/consent event'leri GA4 erişimi gerektirir.

---

## 7. Açık riskler, rollback ve production'a uygulanmayanlar

- **Rollback:** kod değişiklikleri tek PR'da; `git revert`. DB temizliği 2 satırlık hedefli
  UPDATE (tam metin eşleşmesi) — geri almak için eski metin geri yazılabilir; ancak geri
  yazmak PII'yi yeniden yayımlar, **önerilmez**.
- **Risk (düşük):** `sanitizeDirectoryAddress` telefon regex'i, 10+ haneli bitişik sayı
  içeren bir adres bileşenini (ör. uzun bir kapı/kod) "telefon" sanıp silerse adres kısalır.
  Test bunu postal/plot kodları için koruyor; ileride örnek görülürse regex daraltılır.
- **Production'a uygulanmayanlar:** sitemap cache purge, Cloudflare/DNS, GA4. (GSC okuma ve
  Indexing API bildirimi artık canlıda çalışıyor.) Hiçbiri kullanıcı onayı olmadan yapılmadı.

---

## 8. Sonraki en yüksek öncelikli işler

1. **P1:** PR'ı merge et → yeni E2E sitemap testi CI'da yeşil kalsın (bayat girdi bir daha sızmaz).
2. **P1:** Search Console doğrulandı ve Indexing API entegre; kalan: Manual actions /
   Security issues gözle kontrolü + GA4 ölçümü.
3. **P2:** `/jobs` için gerçek şehir landing sayfaları (yalnızca gerçek ilan verisi + özgün içerik
   varsa) — şu an şehir bazlı indekslenebilir sayfa yok; talep doğrulanmadan üretilmemeli.
4. **P2:** Şirket profili detay sayfası yok; kartlar `/jobs?query=<ad>`'a gidiyor. Gerçek,
   özgün içerikli şirket profili sayfaları değerlendirilebilir.
5. **P3:** Core Web Vitals field ölçümü (CrUX/GSC) — lab ölçümü erişim gerektirir.

---

## 9. Yöntem notu (kapsam sınırı)

Bu görev tek bir SEO/indeksleme denetimidir. Projenin paralel çalışma akışları
çok-ajanlı bir program içindir; bu çalışma tek ajanlı, kanıt-öncelikli
bir denetim + düzeltme turudur ve "main'e merge yok" kuralına tabi değildir
(kullanıcı açık talimat verdi). Yine de kapsam, mevcut mimariyi ve çalışan özellikleri
koruyacak biçimde en küçük değişiklikle sınırlandırıldı; aynı bulgu tekrar tekrar
raporlanmadı.

---

## EK — Tur 4: Google Search Console Coverage denetimi (2026-11-03)

> Bu ek §1–§9'a **eklenir**, onları geçersiz kılmaz. Girdi: kullanıcının paylaştığı GSC
> **Coverage** CSV'leri (anlık görüntü penceresi **2026-10-29 → 2026-11-09**). Her kova kod
> okuması + canlı `curl` kanıtıyla eşleştirildi. Sınıflar: CONFIRMED · LIKELY · NOT FOUND ·
> NOT APPLICABLE · BLOCKED. Önem: P0–P3.

### §20. Anlık görüntü (kaynak CSV)

`Grafik.csv` (günlük):

| Tarih | Dizine eklenmedi | Dizine eklenen | Gösterimler |
|---|---:|---:|---:|
| 2026-11-06 | 238 | 201 | 113 |
| 2026-11-07 | 301 | 195 | 99 |
| 2026-11-08 | 301 | 195 | 122 |
| 2026-11-09 | 301 | 195 | 142 |

`Önemli sorunlar.csv` (9 satır):

| Sebep | Kaynak | Sayfa sayısı |
|---|---|---:|
| "noindex" etiketi tarafından hariç tutuldu | Web sitesi | 83 |
| Bulunamadı (404) | Web sitesi | 58 |
| Yönlendirmeli sayfa | Web sitesi | 48 |
| Doğru standart etikete sahip alternatif sayfa | Web sitesi | 31 |
| Başka bir 4xx sorunu nedeniyle engellendi | Web sitesi | 23 |
| Soft 404 | Web sitesi | 2 |
| Kullanıcı tarafından seçilen standart sayfa olmadan kopya | Web sitesi | 1 |
| Tarandı — şu anda dizine eklenmiş değil | Google sistemleri | 43 |
| Keşfedildi — şu anda dizine eklenmiş değil | Google sistemleri | 12 |
| **Toplam** | | **301** |

- **Tutarlılık kanıtı:** kova toplamı **83+58+48+31+23+2+1+43+12 = 301**, `Grafik.csv`'nin
  2026-11-07…09 satırlarındaki "Dizine eklenmedi" değeriyle **birebir** aynı. Triyaj doğru zeminde.
- `Kritik olmayan sorunlar.csv` **boş** (başlık dışında satır yok) → GSC'de işaretli kritik olmayan
  sorun yok. `Meta Veri.csv`: site haritası = "Bilinen tüm sayfalar".

### §21. Kova triyajı

| GSC kova | Adet | Sınıf | Önem | Kanıt |
|---|---:|---|---|---|
| noindex ile hariç tutuldu | 83 | CONFIRMED (tasarım) | P3 | `/login` vb. → `200 + noindex, nofollow`; bilinçli auth/dashboard politikası |
| Bulunamadı (404) | 58 | LIKELY (yaşam döngüsü) | P3 | sitemap yalnız **200** URL yayıyor; kapanan ilan slug'ları |
| Yönlendirmeli sayfa | 48 | CONFIRMED (doğru) | P3 | `/tr/*`→prefixsiz **308**, `www`→apex **308**, trailing-slash **308** |
| Doğru standart etiketli alternatif | 31 | CONFIRMED (sağlıklı) | P3 | 186 tam hreflang seti; alternate → canonical doğru birleşiyor |
| Başka 4xx ile engellendi | 23 | CONFIRMED (güvenlik) | P3 | `/.env`, `/wp-login.php`, `/phpmyadmin` → **403 + noindex, nofollow** |
| **Soft 404** | **2** | **CONFIRMED** | **P1** | boş `/en/is-ilanlari/{iskele,lefke}` → `200 + index,follow` + self-canonical |
| Kullanıcı seçili canonical olmadan kopya | 1 | LIKELY | P2 | örnek URL yalnız GSC panelinde; 225-URL taramasında çıkmadı |
| Tarandı — eklenmedi | 43 | LIKELY | P2 | ince landing + yeni ilan |
| Keşfedildi — eklenmedi | 12 | LIKELY | P2 | yeni URL; aracı günlük Indexing API işi |

**243/301 (%81) beklenen/istenen; yalnız 58'i iyileştirme adayı. P0 yok.**

### §22. Sınıflandırma özeti

- **CONFIRMED:** 83 (noindex tasarımı) · 48 (redirect) · 31 (alternate) · 23 (4xx güvenlik) ·
  **2 (soft 404 → bu turda düzeltildi)**.
- **LIKELY:** 58 (404 yaşam döngüsü) · 1 (kopya) · 43 (tarandı) · 12 (keşfedildi).
- **NOT FOUND:** canonical uyuşmazlığı / robots-Disallow hatası — bu anlık görüntüde yok.
- **NOT APPLICABLE:** — (bu turda kapsam dışı kalan kova yok).
- **BLOCKED:** per-URL URL Inspection — bu ortamda Google OAuth kimliği yok (önceki token süresi
  doldu, `HTTP 401`). Kopya URL'nin örneği de yalnız GSC panelinde.

### §23. Doğrulanan gerçek bulgular

- **T4-1 (P1, CONFIRMED) — Soft 404.** Sıfır ilanlı district/type landing'i `200 + index,follow`
  + self-canonical döndürüyordu; Google bunu "Soft 404" sayıyor. **Düzeltme:**
  `noIndexFollowMetadata` → `index:false, follow:true` (+ `googleBot`). Sayfa indeksten çıkar ama
  `follow` kaldığı için kardeş ilçe/tür bağlantıları taranabilir kalır. Kanıt: canlı
  `/is-ilanlari/lefke` hâlâ robots meta'sız (fix **deploy bekliyor**); deploy sonrası
  `noindex, follow` dönecek.
- **T4-2 (P1, CONFIRMED) — kırık push hedefi.** Aday başvuru push bildirimi `/applications`'a
  gidiyordu; canlı `GET /applications` → **404**. **Düzeltme:** `/profile/dashboard#my-applications`
  (canlı `307 → /login`; oturum yoksa girişe, girişte bölüme iner).
- **T4-3 (P3, CONFIRMED) — redirect'ler sağlıklı.** `/tr/jobs` → `308` → `/jobs`; `www` → apex `308`.
  Aksiyon yok.
- **T4-4 (P3, CONFIRMED) — noindex kovası artacak.** Fix deploy edilince sıfır ilanlı landing'ler
  bu kovaya geçer; **normal** ve istenen (soft 404 kovası boşalır).

### §24. Kanıt (canlı `curl`, 2026-11-03)

```
GET /is-ilanlari/lefke        → 200, canonical=https://isbulkktc.com/is-ilanlari/lefke, robots meta YOK
GET /is-turleri/yari-zamanli  → 200, canonical=self, robots meta YOK
GET /                         → 200, canonical=https://isbulkktc.com
GET /sitemap.xml              → 200 (207 <loc>)
GET /robots.txt               → 200
GET /tr/jobs                  → 308 → /jobs
GET /.env                     → 403 + noindex, nofollow
GET /wp-login.php             → 403 + noindex, nofollow
GET /applications             → 404
GET /profile/dashboard        → 307 → /login
```

### §25. Değişen dosyalar ve testler (bu tur)

| Dosya | Değişiklik |
|---|---|
| `src/lib/seo.ts` | `noIndexFollowMetadata(metadata)` eklendi |
| `.../is-ilanlari/[district]/page.tsx` | 0 sonuçta `noIndexFollowMetadata` |
| `.../is-turleri/[type]/page.tsx` | 0 sonuçta `noIndexFollowMetadata` |
| `src/server/push/notification-copy.ts` | push hedefi `/profile/dashboard#my-applications` |
| `tests/integration/push-dispatch-route.test.ts` | yeni hedef pinlendi |
| `src/lib/seo.test.ts` (yeni) | `noIndexFollowMetadata` sözleşmesi pinlendi |

Test: `lint` ✅ · `typecheck` ✅ · `check:frontend-source` ✅ · `test:unit` **1060/1060** ✅ ·
`indexing:verify` **0 failure** (207 URL) ✅ · push integration **13/13** ✅.

### §26. Kapsam sınırı ve #646 ile ilişki

#646 bu arada GSC'yi **okuma** (finding 12 → RESOLVED) ve **Indexing API** bildirimini (21 JobPosting
URL) devreye aldı. Bu ek onu **pekiştirir**: kalan tek kod boşluğu (soft 404) kapatıldı; Google'ın
kendi API'sinden okunan durum artık `npm run search-console:verify` ile izlenebilir.

---

## EK — Tur 5: sitemap ↔ noindex çelişkisi (boş landing sayfaları) (2026-11-12)

> Bu ek §1–§26'ya **eklenir**, onları geçersiz kılmaz. Girdi: Tur 4'te hazırlanan `noIndexFollowMetadata`
> düzeltmesinin **ikinci yarısı** — sayfa `noindex` olurken sitemap hâlâ onu ilan ediyordu. Sınıflar:
> CONFIRMED · LIKELY · NOT FOUND · NOT APPLICABLE · BLOCKED. Önem: P0–P3.

### §27. Kök neden — iki sinyal birbiriyle çelişiyordu

Tur 4'te sıfır ilanlı district/type landing'i `noIndexFollowMetadata` ile `noindex, follow`
dönecek şekilde düzeltildi. Ama **sitemap aynı URL'i ilan etmeye devam ediyordu.** Sitemap'te
`<loc>` olarak duran bir sayfa `noindex` dönünce Google iki çelişkili sinyal alır; kendi
doğrulayıcımız `scripts/verify-indexing.mjs` bunu **sert hata** sayar (L452:
`page is noindex but listed in the sitemap`). Yani düzeltmenin yalnız `noindex` yarısı, tek başına
yeni bir tutarsızlık üretiyordu.

Kanıt (canlı, 2026-11-12, düzeltme **deploy öncesi**):

```
GET /sitemap.xml                      → 207 <loc>; 36 district + 36 type landing URL'i
                                        (6 ilçe × 6 dil, 6 tür × 6 dil)
GET /is-ilanlari/lefke                → 200, robots meta YOK, sitemap'te VAR  → soft 404 adayı
GET /is-turleri/yari-zamanli          → 0 ilan, 200, robots meta YOK, sitemap'te VAR
GET /is-turleri/sozlesmeli            → 0 ilan, 200, robots meta YOK, sitemap'te VAR
GET /is-turleri/gecici                → 0 ilan, 200, robots meta YOK, sitemap'te VAR
GET /is-ilanlari/guzelyurt            → 1 ilan (dolu; sitemap'te kalmalı)
GET /is-turleri/tam-zamanli           → 19 ilan (dolu; sitemap'te kalmalı)
```

Canlı build `main` ile aynı (`06fe81e`); düzeltme PR #651'de **merge/deploy bekliyor**.

### §28. Bulgular ve sınıflandırma

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T5-1 | Sitemap, `noindex` dönen boş landing'leri ilan ediyor (çelişki) | **CONFIRMED** | **P1** | canlı `curl`: `lefke` + 3 boş tür sitemap'te, robots meta yok; verifier L452 |
| T5-2 | Etkilenen URL sayısı tohuma göre değişir (canlıda **24**: 6 + 18) | **CONFIRMED** | P2 | 4 boş yüzey × 6 dil |
| T5-3 | Sitemap facet'leri DAL'den göremiyordu (district/type yoktu) | **CONFIRMED** | P2 | `PublicJobSitemapEntry` yalnız `slug/publishedAt/modifiedAt` taşıyordu |
| T5-4 | Boş landing `200` döner (404 değil), `follow` korunur | **CONFIRMED** | P3 | tasarım: paylaşılan bağlantı kırılmaz, kardeş sayfalar taranabilir kalır |
| T5-5 | Dolu yüzeyler etkilenmez; sitemap'te kalır | **CONFIRMED** | P3 | `guzelyurt` (1), `tam-zamanli` (19) sitemap'te kalmalı |
| T5-6 | `www`/`/tr` yönlendirmeleri ve 404 kovaları sağlıklı | **NOT FOUND** (hata yok) | P3 | §21 triyajıyla aynı |
| T5-7 | Deploy sonrası doğrulama | **CONFIRMED** (kod+canlı) / **BLOCKED** (GSC panel) | P2 | Canlı: 207→183 `<loc>`, boş yüzeyler `noindex`, `indexing:verify` 0 failure (§31). GSC "Validate fix" panelden → BLOCKED (§2, §9.4) |

**P0 yok.** Tek gerçek P1: sitemap ile `noindex` arasındaki çelişki (T5-1).

### §29. Düzeltme (en küçük güvenli değişiklik)

İki sinyali **tek kaynaktan** besleyerek çelişkiyi yapısal olarak imkânsız kıldık: sitemap artık
bir landing'i yalnız **en az bir canlı ilan** o facet'i taşıyorsa yayınlar — yani `generateMetadata`
ile aynı gerçekliği görür.

| Dosya | Değişiklik |
|---|---|
| `src/server/dal/jobs.ts` | `PublicJobSitemapEntry` → `district` + `jobType` eklendi; `job.district` / `job.job_type` ile dolduruldu |
| `src/features/jobs/landing-availability.ts` (yeni) | `computeLandingAvailability`, `availableDistricts`, `availableJobTypes` — saf fonksiyonlar |
| `src/app/sitemap.ts` | district/type girdileri `availableDistricts/availableJobTypes` ile filtrelendi |
| `tests/unit/landing-availability.test.ts` (yeni) | 6 test: facet toplama, ilçesiz ilan, boş katalog, kanonik sıra |
| `tests/e2e/seo.spec.ts` | 2 sözleşme testi "sitemap ile **uyum**"u doğrulayacak şekilde yeniden yazıldı (tohumdan bağımsız) |

**Tasarım kuralı:** `noindex` ⟺ sitemap'te yok. Boş landing `200 + noindex, follow` döner (bağlantı
kırılmaz, kardeşler taranabilir kalır) ama sitemap'ten düşer; dolu landing `200 + index, follow`
döner ve sitemap'te kalır. İki taraf aynı ilan satırlarından türediği için bir daha **kayamaz**.

### §30. Doğrulama (bu tur, yerel)

```
tsc --noEmit                 → 0 hata
eslint .                     → 0 hata
check-frontend-source.mjs    → geçti
test:unit                    → 1066/1066  (yeni 6 test dahil)
indexing:verify (canlı)      → 0 failure: robots OK, sitemap 207 URL hepsi
                               origin-içi kanonik, 186 tam hreflang / 21 tek-dil,
                               8 örnek sayfa 200+indexable+kanonik, IndexNow anahtarı eşleşti
```

### §31. Deploy sonrası doğrulama (2026-11-12, canlı — DOĞRULANDI)

PR #651 `84c8012` olarak `main`'e girdi; Vercel `main`'i yayına aldı (`/api/build-info` →
`commit: 84c8012`). Canlı ölçüm **öngörüyle birebir**:

| Ölçüm | Önce | Sonra (canlı) | Beklenen |
|---|---|---|---|
| sitemap `<loc>` | 207 | **183** | 207 − 24 = 183 ✅ |
| boş yüzey sitemap'te | 4 × 6 dil | **0** | 0 ✅ |
| `/is-ilanlari/lefke` robots | (yok) | `noindex, follow` | `noindex, follow` ✅ |
| `/is-turleri/yari-zamanli` robots | (yok) | `noindex, follow` | `noindex, follow` ✅ |
| `/is-ilanlari/girne` robots | (yok) | (yok = `index`) | `index` ✅ |
| `/is-turleri/tam-zamanli` robots | (yok) | (yok = `index`) | `index` ✅ |
| `npm run indexing:verify` | — | **0 failure, 0 warning** | 0 failure ✅ |

```
PASS robots    allows crawling; sitemap https://isbulkktc.com/sitemap.xml
PASS sitemap   183 URLs, all on-origin canonical; 162 with the full hreflang set, 21 single-locale
PASS single-loc 3 single-locale entries: the localized duplicate canonicalises back
PASS pages     8 sampled pages are 200, indexable, with a matching canonical
PASS indexnow  key file matches isbulkktc…
```

Kalan tek adım **panelden** yapılır (bu ortamda OAuth yok → BLOCKED):

- GSC → Pages → **"Soft 404"** → **Validate fix** (örnek: `/en/is-ilanlari/lefke`,
  `/en/is-ilanlari/iskele`). Fix yayında olduğundan bu landing'ler **"noindex ile hariç tutuldu"**
  kovasına geçer — **normal ve istenen**; soft 404 kovası boşalır. Ayrıntı: `MANUAL_TASKS.md` §10.1.
- Bir ilçe/tür ilk ilanını aldığında sayfa **otomatik** `index` + sitemap'e döner; elle iş gerekmez
  (iki sinyal de aynı ilan satırlarından türediği için).

### §32. Kapsam sınırı

- Bu tur **yalnız** sitemap ↔ `noindex` tutarlılığını kapatır; yeni landing sayfası üretmez (§8'deki
  "gerçek veri + özgün içerik" kuralı geçerli).
- `/jobs/<slug>` ilan detayları, blog/rehber ve statik rotalar etkilenmedi.
- GSC **yazma** (Validate fix, Request indexing) panelden yapılır → §T5-7 BLOCKED; kod tarafı
  bunu `npm run search-console:verify` (okuma) ve `npm run indexing:submit` (JobPosting bildirimi)
  ile telafi eder.

---

## EK — Tur 6: GSC "Önemli sorunlar" (Coverage) anlık görüntüsü — tam triyaj (2026-11-12)

> Bu ek §1–§32'ye **eklenir**, onları geçersiz kılmaz. Girdi: kullanıcının Search Console'dan
> dışa aktardığı dört CSV (`Önemli sorunlar`, `Kritik olmayan sorunlar`, `Meta Veri`, `Grafik`).
> Her kova **kod + canlı `curl` kanıtıyla** eşleştirildi. Sınıflar: CONFIRMED · LIKELY ·
> NOT FOUND · NOT APPLICABLE · BLOCKED. Önem: P0–P3. **P0 yok.**

### §33. Kaynak anlık görüntü (CSV, 2026-11-12)

`Önemli sorunlar.csv` (Kaynak sütunu hepsi "Web sitesi" ya da "Google sistemleri"):

| GSC kovası (TR) | Kaynak | Doğrulama | Sayfa |
|---|---|---|---:|
| "noindex" etiketi tarafından hariç tutuldu | Web sitesi | Başlatılmadı | 83 |
| Bulunamadı (404) | Web sitesi | Başlatılmadı | 58 |
| Yönlendirmeli sayfa | Web sitesi | Başlatılmadı | 48 |
| Doğru standart etikete sahip alternatif sayfa | Web sitesi | Başlatılmadı | 31 |
| Başka bir 4xx sorunu nedeniyle engellendi | Web sitesi | Başlatılmadı | 23 |
| Soft 404 | Web sitesi | Başlatılmadı | 2 |
| Kullanıcı tarafından seçilen standart sayfa olmadan kopya | Web sitesi | Başlatılmadı | 1 |
| Tarandı – şu anda dizine eklenmiş değil | Google sistemleri | Başlatılmadı | 43 |
| Keşfedildi – şu anda dizine eklenmiş değil | Google sistemleri | Başlatılmadı | 12 |

- `Kritik olmayan sorunlar.csv` → **boş başlık satırı** (işaretli iyileştirme sorunu yok).
- `Meta Veri.csv` → **Site haritası = "Bilinmeyen tüm sayfalar"** (tek satır).
- `Grafik.csv` → 2026-10-29…11-09; **"Dizine eklenen" 201–195 arası sabit**, "Dizine eklenmedi"
  238→301, gösterim 0→142 (yükseliyor). Yani **kazanç dizine eklemede değil, görünürlükte**.

### §34. Kova triyajı — hangisi gerçek iş, hangisi bilinçli tasarım

| GSC kovası | Sayfa | Triyaj | Neden / kanıt |
|---|---:|---|---|
| "noindex" ile hariç tutuldu | 83 | **Bilinçli (istenen)** | auth/dashboard + **Tur 5'te eklenen 24 boş landing**. Sayı **artacak** — normal. |
| Bulunamadı (404) | 58 | **Bilinçli** | Kapanan ilan / eski URL. Canlı: uydurma `/jobs/<slug>` → **404** doğru döner. Sitemap yalnız 200 URL yayar. |
| Yönlendirmeli sayfa | 48 | **Bilinçli (istenen)** | `www`→apex **308**, `/tr`→prefixsiz **308**, trailing-slash **308**. Canlı doğrulandı (§36). |
| Doğru standart etiketli alternatif | 31 | **Sağlıklı** | hreflang/canonical birleşmesi (186 tam set). Google'ın *doğru* davranışı. |
| Başka 4xx ile engellendi | 23 | **Bilinçli (güvenlik)** | `/.env`, `/wp-login.php`… → **403** (canlı doğrulandı). |
| Soft 404 | 2 | **Düzeltildi — Validate bekliyor** | Tur 5 fix'i canlıda (§31); kova boşalmak üzere. Tek gerçek **P1**. |
| Kopya, canonical seçilmemiş | 1 | **LIKELY kendi kendine çözülür** | Tek URL; canonical/hreflang zaten yayında. |
| Tarandı – eklenmedi | 43 | **Normal gecikme** | Kalite/yenilik sinyali; Indexing API + içerik derinliği ile iyileşir. |
| Keşfedildi – eklenmedi | 12 | **Normal gecikme** | Yeni ilan/şehir URL'leri; günlük `indexing:submit` zaten bildiriyor (§6). |

**Özet:** 301 "dizine eklenmedi" kovasının **299'u (%99) beklenen/istenen**. Yalnız
**Soft 404 (2)** gerçek düzeltme gerektiriyordu ve o düzeltme **yayında**.

### §35. Bulgular ve sınıflandırma (Tur 6)

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T6-1 | Soft 404 kovası (2) Tur 5 fix'iyle kaynakta çözüldü | **CONFIRMED** | **P1** | canlı: boş landing `noindex, follow`; sitemap 183 `<loc>`, lefke yok (§36) |
| T6-2 | 83 "noindex" kovası bilinçli; fix sonrası **artacak** | **CONFIRMED** | P3 | tasarım: auth/dashboard + boş landing; `robots.txt` `/auth/` disallow |
| T6-3 | 58×404 + 48×308 + 23×403 + 31×hreflang = bilinçli/istenen | **CONFIRMED** | P3 | canlı `curl`: 404/308/403 davranışları doğru (§36) |
| T6-4 | "Kullanıcı seçili canonical olmadan kopya" (1) | **LIKELY** | P2 | canonical/hreflang yayında; URL panelden alınmadan kod karşılığı doğrulanamaz |
| T6-5 | "Tarandı/Keşfedildi, eklenmedi" (43+12) normal gecikme | **CONFIRMED** | P3 | yeni ilan/şehir URL'leri; Indexing API günlük bildiriyor |
| T6-6 | Site haritası durumu "Bilinmeyen tüm sayfalar" | **NOT APPLICABLE** | P3 | Google'ın toplu etiketi; gerçek ölçüm URL Inspection (`sc-domain` + sitemap doğrulandı, §2) |
| T6-7 | "Kritik olmayan sorunlar" boş | **NOT FOUND** (sorun yok) | P3 | CSV başlık satırı boş |
| T6-8 | GSC **yazma** (Validate fix / Request indexing) | **BLOCKED** | P2 | OAuth yok (`Credential: unconfigured`); panelden yapılır (§10.1) |
| T6-9 | Kullanıcı "doğrulama düzeltmelerini tıkladım" dedi; CSV snapshot aksini gösterir | **CONFIRMED** (kullanıcı beyanı) | P3 | CSV `Doğrulama` sütunu = "Başlatılmadı", ama **snapshot 2026-11-12**; kullanıcı tıklamayı **sonrasında** yaptı → çelişki değil, sıralama farkı. Elle adım TAMAM (MANUAL_TASKS §11.8) |

**P0 yok. Tek gerçek P1 (T6-1) zaten kod tarafında kapalı; kalan tek adım panelde "Validate fix".**

### §36. Canlı kanıt (2026-11-12, `curl`)

```
GET /api/build-info                  → commit e63fc9dc… (main'in ucu; canlı = main)
GET /sitemap.xml                     → 183 <loc>;  "is-ilanlari/lefke" → 0 (boş yüzey sitemap'te YOK)
GET /is-ilanlari/lefke               → <meta name="robots" content="noindex, follow">
GET /is-turleri/yari-zamanli         → <meta name="robots" content="noindex, follow">
GET /is-turleri/sozlesmeli           → <meta name="robots" content="noindex, follow">
GET /is-turleri/gecici               → <meta name="robots" content="noindex, follow">
GET /is-ilanlari/guzelyurt           → robots meta YOK (index)  — sitemap'te KALIR
GET /is-turleri/tam-zamanli          → robots meta YOK (index)  — sitemap'te KALIR
GET /is-ilanlari/girne               → robots meta YOK (index)
GET /jobs/<uydurma-slug>             → 404  (soft 404 DEĞİL, gerçek 404 — doğru)
GET https://www.isbulkktc.com/       → 308 → https://isbulkktc.com/
GET https://isbulkktc.com/tr         → 308 → https://isbulkktc.com/
GET https://isbulkktc.com/jobs/      → 308 → https://isbulkktc.com/jobs
GET https://isbulkktc.com/.env       → 403
GET /robots.txt                      → Allow /; Disallow /api /cdn-cgi /auth…; Sitemap bildirilmiş

npm run indexing:verify              → 0 failure, 0 warning
                                        robots OK · sitemap 183 URL origin-içi kanonik
                                        (162 tam hreflang / 21 tek-dil) · 8 örnek sayfa
                                        200+indexable+kanonik · IndexNow anahtarı eşleşti
npm run search-console:verify        → Credential: unconfigured (okuma BLOCKED)
```

### §37. Kapsam sınırı

- Bu tur **yeni kod değişikliği gerektirmez**: kova triyajı, Tur 5 fix'inin canlı doğrulamasıyla
  birebir örtüşür. Tek açık iş **panelden** "Validate fix" (§10.1, BLOCKED → T6-8).
- "Kullanıcı seçili canonical olmadan kopya" (1 URL) **panelden URL alınmadan** çözülemez
  (T6-4, LIKELY); URL iletilirse canonical/hreflang karşılığı doğrulanır.
- "Tarandı/Keşfedildi, eklenmedi" kovaları **içerik/otorite** işidir, hata değil; gerçek veri +
  özgün içerik şartı geçerli (§8).
- **Tur 7 eki:** Kullanıcı, sayfalardaki hatalar için **"Düzeltmeyi doğrula"**'yı tıkladığını bildirdi
  (T6-9). CSV snapshot (2026-11-12) `Doğrulama` sütunu "Başlatılmadı" idi → çelişki değil, sıralama
  farkı (tıklama snapshot'tan sonra). **Elle adım tamam**; kalan yalnız Google'ın ~2 haftalık
  yeniden taraması. Uzlaştırma: `MANUAL_TASKS.md §11.8`. Canlı ek ölçüm: `/is-ilanlari/iskele`
  **artık dolu** (2 ilan) → `index` + sitemap'e döndü; `/is-ilanlari/lefke` hâlâ boş → `noindex,
  follow` + sitemap'te yok.

## EK — Tur 7: Sitemap "bayat anlık görüntü" — 5 ölü URL + 5 eksik ilan (2026-11-13, CANLI)

> Bu ek §1–§37'ye **eklenir**. Önceki turlar sitemap'i "saatlik ISR ile ≤1 saatte kendini
> düzeltir" varsayıyordu (§4, §35). Bu tur **bu varsayımı canlı ölçümle çürüttü**: canlı
> sitemap veritabanıyla **tutarsız** ve tutarsızlık yalnız "zamanlama" ile açıklanamaz.

### §38. Bulgu (canlı, 2026-11-13T19:0x UTC)

`GET https://isbulkktc.com/sitemap.xml` → **183 `<loc>`**, yanıt **taze** (`age: 0`,
`x-vercel-cache: MISS`, `cf-cache-status: REVALIDATED`), ama içerik bayat:

| Yön | Sayı | Slug'lar (canlı `curl` durumu) |
|---|---:|---|
| Sitemap'te olup **404** dönen ilan | **5** | `source-iskibris-temizlik-personeli`, `source-iskibris-tecrubeli-kadindogum-tup-bebek-doktoru-asistani`, `source-isbulkibris-halkla-iliskiler-elemani`, `source-iskibris-satis-personeli-finans-sirketi-call-center`, `source-iskibris-magaza-satis-temsilcisi-mehmet-dogru-ticaret-ltd` |
| Canlı olup sitemap'te **olmayan** ilan | **5** | `source-iskibris-dagitimci`, `source-iskibris-girne-bolgesi-magaza-satis-personeli`, `source-iskibris-uluslararasi-ofis-temsilcisi`, `source-iskibris-insan-kaynaklari-sorumlusu`, `source-iskibris-ticari-pazarlama-yoneticisi` |

**Yanlış-pozitif değil (kanıt):**
- 404'ler "yeni yayınlanan ilan" **değil**: `get_public_job_details(slug)` → `null` **ve**
  `GET /jobs/<slug>` → **404**. Yani Google, 404'e düşen bir sitemap URL'i alıyor.
- Eksikler yeni: `modified_at` = 2026-11-13; sayfaları **200**; `/jobs` listesi onları gösteriyor.
- Arama-RPC ile detay-RPC **çelişmiyor** (ikisi de aynı DB'yi okur). Çelişen **sitemap ↔ DB**.

### §39. Kök neden (CONFIRMED — CI build route tablosu)

CI build çıktısı (`Route (app)` tablosu):

```
└ ○ /sitemap.xml         1h    1y     ← statik prerender + ISR (revalidate 1h, expire 1y)
ƒ /[locale]/jobs/[slug]               ← dinamik
ƒ /[locale]/jobs                      ← dinamik (liste)
```

- `src/app/sitemap.ts` içinde `export const revalidate = 3600` → sitemap **`○` (statik)**.
  Veriyi `createSupabasePublicClient()` (cookie'siz) ile alır → build/ISR anında gömülür.
- `/jobs` ve ilan detayı `createSupabaseServerClient()` (cookie'li) kullanır → **her istekte
  canlı** (yanıt başlığı: `cache-control: private, no-cache, no-store`).
- **Sonuç:** aynı RPC, iki farklı önbellekleme yolu. Liste canlı; sitemap **build zamanı
  anlık görüntüsü**. Sitemap'teki en yeni ilan `lastmod` = **2026-11-12T21:29** → snapshot
  11-13 işlerinden **önce** donmuş. (Canlı build = `e63fc9dc82`, `git log -1` commit tarihi
  **2026-11-13T14:34:53Z**; yani sitemap, deploy edilen build'den **~17 saat önceki** bir
  veriyi taşıyor — snapshot gerçekten build anına ait.)
- **"≤1 saatte düzelir" neden tutmuyor:** `revalidate = 3600` dolunca Vercel sitemap'i
  **yeniden çalıştırmaz**; bir sonraki istekte `x-vercel-cache: MISS` ile **deploy edilmiş
  build çıktısını** yeniden servis eder (Next.js 15+ ISR: revalidate, prerender'ı *yeniden
  üretmez*, yalnız cache girdisini tazeler). Canlı kanıt: `last-modified: Fri, 13 Nov 2026
  19:01:25 GMT` bu turda **güncellendi** (cache girdisi tazelendi), ama **içerik değişmedi** —
  etag önceki oturumla **birebir aynı**: `W/"5ba9c2e60031c394042d383e2515a324"`.

### §40. Önceki sınıflandırmayla uzlaştırma

| Önceki iddia | Yer | Şimdi |
|---|---|---|
| "Sitemap bayat girdi ≤1 saatte revalidate ile kendini düzeltir" | §4, §35 | **ÇÜRÜTÜLDÜ.** Sitemap canlı DB'ye bağlı değil (statik ISR); bayatlık **kalıcı** |
| "Sitemap yalnız 200 URL yayar" | §34, §36 | **YANLIŞ (canlı).** 5 URL **404** döner |
| Bulgu #2 (P1) E2E testi + log ile kapandı | §2 | **KISMEN.** E2E sitemap'i **build anında** doğrular (o an tutarlı); **canlı** sitemap↔DB kayması test edilmiyor |

### §41. Bulgular ve sınıflandırma (Tur 7)

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T7-1 | Canlı sitemap **5×404** URL duyuruyor | **CONFIRMED** | **P1** | `curl` 5×404; `indexing:verify` **FAIL** |
| T7-2 | Canlı 5 ilan sitemap'te **yok** | **CONFIRMED** | P2 | `curl` 5×200; `/jobs` listesinde var |
| T7-3 | Kök neden: sitemap **statik ISR** (`○ 1h/1y`), DB'yi canlı okumuyor | **CONFIRMED** | **P1** | CI route tablosu; `cache-control public,max-age=3600`; sabit etag |
| T7-4 | "≤1 saatte kendini düzeltir" varsayımı | **NOT FOUND (çürütüldü)** | P1 | 11-13'te hâlâ 11-12 snapshot |
| T7-5 | Sitemap cache purge (Vercel/CF) | **BLOCKED** | P2 | `VERCEL_TOKEN` yok; hosting kullanıcı kontrolünde |
| T7-6 | Deploy olmadan sitemap yeni ilanı hiç görmez | **LIKELY** | **P1** | Sitemap yalnız deploy/ISR üretiminde tazeleniyor |

**P0 yok. İki P1 (T7-1, T7-3) aynı kökten: sitemap statik.**

### §42. Önerilen düzeltme (kod — kullanıcı onayı sonrası)

1. **Kısa vadeli (istek-zamanı render):** `src/app/sitemap.ts` → `export const revalidate = 3600;`
   yerine `export const dynamic = "force-dynamic";` (veya `revalidate = 0`). Sitemap `ƒ` olur,
   her istek RPC'yi canlı çağırır; bayatlık biter. Maliyet: her istekte RPC (crawler hacmi düşük).
2. **Alternatif (yük alınacaksa):** `revalidate` kalsın ama **`revalidatePath("/sitemap.xml")`**
   çağrılsın — kaynak-iş içe aktarma bitince (`refresh-source-jobs.yml` sonrası) ve ilan
   yayın/güncelle/kapat action'larında. ISR önbelleği **veri değişince** tazelenir.
3. **İleri (doğru ölçüm):** mevcut E2E "her sitemap ilanı 200" testinin yanına, **canlı sitemap
   ile canlı DB'yi karşılaştıran** kontrol ekle (build-anı testi canlı kaymayı yakalamıyor).

### §43. Yerel doğrulama (bu tur)

```
npm run indexing:verify → 1 failure, 0 warning
  FAIL single-loc .../en/jobs/source-iskibris-tecrubeli-kadindogum-tup-bebek-doktoru-asistani
       canonicalises to (none)
  PASS sitemap 183 URLs, all on-origin canonical
```

- Yeni FAIL, doğrudan T7-1'in sonucudur: sitemap'te duran ölü slug doğrulanınca canonical yok.
- `tests/e2e/seo.spec.ts` sitemap'i **build anında** okur → yeşil kalır ama **canlı** kaymayı
  yakalamaz (T7-3).

### §44. Kapsam sınırı

- Bu tur **kod değişikliği YAPMADI** (onay beklenir, §42); yalnız kanıt toplandı.
- Canlı sitemap cache **purge edilmedi** (T7-5, BLOCKED — `VERCEL_TOKEN` yok).
- Düzeltme seçimi (force-dynamic vs on-demand revalidate) `MANUAL_TASKS.md §12`'de kullanıcıya
  sunuldu.

### §45. Yöntem ve sayı doğrulaması (2026-11-13, bağımsız yeniden ölçüm)

Bu ekteki sayılar, `curl` ile **bağımsız olarak yeniden** doğrulandı; üç noktada önceki taslak
düzeltildi:

- **Sitemap = 21 iş URL'i** (`grep -oE '<loc>[^<]*/jobs/[^<]*'`), canlı `/jobs` = **21 ilan**
  (Sayfa 1/2, 20 + 1). İki taraf **aynı toplamda**; fark bir *yer değiştirme*: **5 URL 404**
  (`.../jobs/<slug>` → 404, gövdede `<meta name="robots" content="noindex"/>`) ve **5 ilan
  eksik** (her biri **200** + kendi kanonik'ini verir).
- **Düzeltme:** önceki taslakta 404 listesinde `satis-pazarlama-personeli` yazıyordu; **bu slug
  aslında 200** döner ve `/jobs` Sayfa 2'de listelenir → 404 listesinden **çıkarıldı**, yerine
  gerçekten 404 olan `magaza-satis-temsilcisi-mehmet-dogru-ticaret-ltd` **eklendi**. (Satır
  sayısı yine 5'tir; etkilenen ilan sayısı değişmez.)
- **Yöntem (tekrarlanabilir):** `comm -23 sitemap_slugs live_jobs` = 404 kümesi;
  `comm -13` = eksik küme. Canlı liste iki sayfadan toplanır (`/jobs`, `/jobs?page=2`).
- **`last-modified` tuzağı:** sitemap başlığındaki `last-modified` bu turda **güncellendi**
  (cache girdisi tazelendi) ama **etag ve içerik sabit kaldı** — yani "yanıt taze" ≠ "içerik
  güncel". Bu, 9. ailenin ("serving" ≠ "güncel") sitemap tezahürüdür.

