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
   > **ÇÖZÜM (2026-11-13):** `export const dynamic = "force-dynamic"` — **PR #657** birleştirildi
   > (squash `cd77606`); route artık `ƒ /sitemap.xml`. Bkz. **P1 (T7-1/T7-3)** ve `MANUAL_TASKS.md §12`.
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
| 13 | **CONFIRMED → DÜZELTİLDİ** | **P1** | **Canlı sitemap bayat: 5 URL 404 dönerken duyuruluyor, 5 canlı ilan atlanıyor** | `curl /sitemap.xml` (183 `<loc>`, `age:0`) ↔ canlı `search_public_jobs`; CI build `└ ○ /sitemap.xml 1h 1y` (statik) | Sitemap "çözülmeyen URL" sinyali verir; yeni ilanlar deploy olmadan hiç listelenmez | **Tur 7, §38–§44**; **DÜZELTİLDİ:** `dynamic="force-dynamic"` — **PR #657** (squash `cd77606`), route artık `ƒ /sitemap.xml`; `MANUAL_TASKS.md §12` |
| 14 | **CONFIRMED** | **P1** | **Katalogdaki 21/21 ilan kaynak siteden birebir kopya; özgün (platform) ilan yok** — ölçülen 16/16 eşleşme %99,6–100 kelimesi kelimesine aynı | §51 tablosu; `curl /sitemap.xml` 21 ilan; `/jobs` 20/20 `source-*`, 0 yerli; bağımsız bigram kapsaması örnek ilanda **%100** | Google kopya/aynayı indeksler ama jenerik sorgularda sıralamaz → "site çıkmıyor" şikâyetinin kod-düzeyi kök nedeni | **Tur 9, §50–§55**; düzeltme **ürün/içerik kararı** (özgün içerik), `MANUAL_TASKS.md §14` |

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

- `Kritik olmayan sorunlar.csv` → **yalnız başlık satırı var, veri satırı yok** (işaretli kritik
  olmayan sorun yok).
- `Meta Veri.csv` → **Site haritası = "Bilinen tüm sayfalar"** (tek satır).
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
| T6-6 | Site haritası durumu "Bilinen tüm sayfalar" | **NOT APPLICABLE** | P3 | Google'ın toplu etiketi; gerçek ölçüm URL Inspection (`sc-domain` + sitemap doğrulandı, §2) |
| T6-7 | "Kritik olmayan sorunlar" veri satırı yok | **NOT FOUND** (sorun yok) | P3 | CSV yalnız başlık satırı içerir |
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

> **✅ UYGULANDI — Seçenek A (2026-11-13).** Kullanıcı onayı ("A'yı uygula") üzerine 1. madde
> uygulandı: `src/app/sitemap.ts` artık `export const dynamic = "force-dynamic";`. Regresyon
> testi `tests/unit/sitemap-dynamic.test.ts` eklendi (mutasyonla doğrulandı: `revalidate`'a dönüş
> KIRMIZI). Üretim build route tablosu `○ /sitemap.xml 1h 1y` → **`ƒ /sitemap.xml`**. Birleştirildi:
> **PR #657**, squash **`cd77606`**. Deploy sonrası canlı sitemap her istekte katalogu okur → T7-1/T7-3
> kapanır. Ayrıntı: `MANUAL_TASKS.md §12.1`.
>
> **✅ DEPLOY SONRASI CANLI DOĞRULAMA (2026-11-13, ~20:03 UTC).** Deploy tamamlandı
> (`/api/build-info` = `cd77606`). Canlı `curl` sonucu — düzeltme **üretimde etkin**:
> - Sitemap'te 404 dönen **5 URL artık YOK** (temizlik-personeli, tecrubeli-kadindogum-tup-bebek-doktoru-asistani,
>   halkla-iliskiler-elemani, satis-personeli-finans-sirketi-call-center, magaza-satis-temsilcisi-mehmet-dogru-ticaret-ltd).
> - Sitemap'te eksik olan **5 canlı ilan artık VAR** ve hepsi **HTTP 200** döner
>   (`source-iskibris-dagitimci`, `-uluslararasi-ofis-temsilcisi`, `-ticari-pazarlama-yoneticisi`,
>   `-insan-kaynaklari-sorumlusu`, `-girne-bolgesi-magaza-satis-personeli`).
> - `x-vercel-cache: MISS` + `age: 0` → sitemap **istek başına** üretiliyor (dinamik).
> - Ölü URL'ler `/jobs/<ölü-slug>` → **gerçek 404** (soft 404 değil); sitemap artık onları duyurmaz.
>
> T7-1 ve T7-3 **canlıda kapandı**.

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

- Tur 7'nin **ilk yarısı** kod değişikliği yapmadı (onay beklenir, §42); yalnız kanıt toplandı.
  **Onay sonrası** Seçenek A uygulandı ve **PR #657** ile birleştirildi (bkz. §42 güncellemesi).
- Canlı sitemap cache **purge edilmedi** (T7-5, BLOCKED — `VERCEL_TOKEN` yok); `force-dynamic`
  deploy sonrası bunu gereksiz kılar.
- Düzeltme seçimi (force-dynamic vs on-demand revalidate) `MANUAL_TASKS.md §12`'de kullanıcıya
  sunuldu; **Seçenek A** seçildi.

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


## EK — Tur 8: "Site arama sonuçlarında neden çıkmıyor?" — yeni alan adı + otorite, teknik engel DEĞİL (2026-11-12)

> Bu ek §1–§45'e **eklenir**. Tetik: kullanıcı geri bildirimi — *"isbulkktc.com yazmadıkça asla
> listelenmiyor; GitHub proje dosyası bile sergileniyor ama website sayfaları asla."*
> Sınıflar: CONFIRMED · LIKELY · NOT FOUND · NOT APPLICABLE · BLOCKED. Önem: P0–P3. **P0 yok.**

### §46. Kullanıcının gözlemi ve ilk hipotezler

Kullanıcı, siteyi **marka/alan adı ile aratmadıkça** Google'da bulamıyor; buna karşılık **GitHub
repo sayfası** (ör. `github.com/cenkmenk71-max/isbulkktc`) görünüyor. Bu, tipik olarak iki kök
nedenden biridir ve **ikisi teknik değildir**:

1. **Yeni alan adı ("sandbox") + otorite yokluğu** — Google yeni alan adına bir "deneme süresi"
   uygular; düşük otoriteli/az içerikli yeni site jenerik sorgularda **sıralanmaz** (indekslense
   bile alt sıralarda kalır).
2. **Teknik indeksleme engeli** (robots, noindex, canonical hatası, bot engelleme, cloaking).

Tur 8 bu iki hipotezi **canlı `curl` + RDAP** ile ayırdı. Sonuç: **hipotez 2 ELENDİ**, kök neden
**hipotez 1**.

### §47. Canlı kanıt (2026-11-12, `curl` / RDAP)

| Kontrol | Komut | Sonuç | Yorum |
|---|---|---|---|
| Alan adı kaydı | `rdap.verisign.com` | **2026-09-19** | ≈**54 gün** — çok yeni |
| Site ilk commit | `git log --reverse` | **2026-10-27** | ≈**16 gün** canlı geçmiş |
| robots.txt | `GET /robots.txt` | `Allow: /`; yalnız `/api/ /cdn-cgi/ /auth/*` disallow; Sitemap + Host bildirili | **Engel yok** |
| Googlebot erişimi | `curl -A "Googlebot"` | **200**, normal UA ile **birebir aynı HTML** (280.040 bayt) | **Cloaking/bot engeli YOK** |
| `X-Robots-Tag` | `curl -D -` | **Yok** | Gizli noindex yok |
| Ana sayfa | `GET /` | canonical + **6 hreflang** + WebSite/Organization/SearchAction JSON-LD | Sağlıklı |
| İş sayfası | `GET /en/jobs/source-iskibris-dagitimci` | 200, canonical = TR kanonik | Sağlıklı (tasarım) |
| Sitemap | `GET /sitemap.xml` | 183 `<loc>`, istek başına, `x-vercel-cache: MISS` | Sağlıklı |
| GSC Grafik | `Grafik.csv` | gösterim **0 → 142** (yükseliyor); dizine eklenen ~195–201 | **Görünürlük artıyor** |

**Yorum:** Site Google'da **görünüyor** — GSC "gösterim" eğrisi 0'dan 142'ye çıkmış; yani Google
sayfaları **sunuyor**, ancak **düşük sırada**. "Hiç listelenmiyor" algısı, jenerik sorgularda
("kktc iş ilanları") ilk sayfada çıkmamaktan kaynaklanır; bu **normaldir** ve **yaşla** düzelir.

### §48. Bulgular ve sınıflandırma (Tur 8)

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T8-1 | Alan adı **çok yeni** (~54 gün), site ~16 gün → yeni-alan-adı "sandbox"ı ve düşük otorite | **CONFIRMED** | **P2** | RDAP 2026-09-19; `git log` 2026-10-27 |
| T8-2 | Dış bağlantı / otorite profili zayıf (yeni alan adı) | **LIKELY** | P2 | Yeni alan adı; backlink profili bu turda ölçülmedi |
| T8-3 | **Teknik indeksleme engeli YOK** (robots/Googlebot/cloaking/noindex/canonical/hreflang/sitemap temiz) | **CONFIRMED** (negatif bulgu) | P3 | §47 canlı `curl` tablosu |
| T8-4 | "GitHub sayfası listeleniyor, site listelenmiyor" algısı | **NOT APPLICABLE** | P3 | GitHub **yüksek otoriteli** kök alan adı; site yeni → domain-otoritesi farkı, hata değil |
| T8-5 | GSC "Önemli sorunlar" 301 kovasının **299'u beklenen** (Tur 6) | **CONFIRMED** | P3 | §34 kova triyajı; gerçek hata yok |
| T8-6 | Manuel işlem (manual action) var mı? | **BLOCKED** (okuma) | P2 | OAuth yok; **panelde** Güvenlik ve Manuel İşlemler kontrol edilmeli |

**Özet:** Görünürlüğün düşük olması **teknik arıza değil**; **yeni alan adı + otorite** etkisidir.
Kod tarafında düzeltilecek bir şey **yok** (T8-3 negatif bulgu). İyileştirme **zaman + içerik +
otorite** işidir.

### §49. Yanlış-pozitif riski ve kapsam sınırı

- **"Site hiç indekslenmemiş" değil:** GSC "Dizine eklenen" ≈195–201 ve **gösterim artıyor**.
  Sorun **sıralama/görünürlük**, indeksleme değil.
- **Backlink/otorite ölçülmedi** (T8-2, LIKELY): Ahrefs/Semrush/Majestic erişimi yok. Doğrulama
  için GSC "Bağlantılar" raporu kullanılmalı (panel işi).
- **Manuel işlem** panelde kontrol edilmedi (T8-6, BLOCKED). Kod tarafından doğrulanamaz.
- Arama motoru sorguları bu turda **tarayıcıyla** teyit edilemedi (DuckDuckGo bot kontrolü, Bing
  önbellekli/alakasız yanıt); bu **kanıt boşluğu** olarak kayda geçer, bulgu değildir.


## EK — Tur 9: **Katalog %100 kaynak sitesinden kopya** — sıralama değil, **özgün içerik yokluğu** (2026-11-12)

> Bu ek §1–§49'a **eklenir**. Tetik: kullanıcının asıl şikâyeti — *"site, tam alan adı yazmadan
> Google'da çıkmıyor; GitHub proje sayfası bile öne geçiyor."* Tur 8 ("yeni alan adı + otorite")
> bu şikâyetin **zamanla** düzeltilecek kısmını açıkladı. Bu tur, **koddan ölçülebilen** ve
> Google'ın jenerik sorgularda siteyi **sıralamama** kararını doğrudan besleyen ikinci kök nedeni
> ortaya çıkardı: **katalogdaki her ilan başka bir siteden birebir kopyadır.**
> Sınıflar: CONFIRMED · LIKELY · NOT FOUND · NOT APPLICABLE · BLOCKED. Önem: P0–P3.

### §50. Yönetici özeti (bu turun tek cümlesi)

**Yayındaki 21 ilanın 21'i de iki rakip siteden (`iskibris.com`, `isbulkibris.com`) içe
aktarılmıştır; ölçülebilen 16 eşleşmenin tamamı kaynak metnin %99,6–100'ünü kelimesi kelimesine
taşımaktadır; sitede tek bir özgün (platform) ilan yoktur.** Google, jenerik sorgularda aynı
metni zaten yayınlayan, daha eski ve daha otoriter kaynak siteyi tercih eder; bu nedenle kopya
sayfalar **indekslenip gösterim alsa bile** ("Dizine eklenen" ≈195) **asıl sorgularda
sıralanmaz.** Bu, Tur 8'in "teknik engel yok, sorun otorite/zaman" bulgusunu **çürütmez, tamamlar**:
indekslenmeyi engelleyen teknik bir arıza yok; **sıralanmayı** engelleyen şey **özgün değer
yokluğudur.**

### §51. Kanıt (canlı, 2026-11-12, `curl` + kaynak API)

Ölçüm yöntemi: bizim sayfamızın görünür metni ile **kaynak sitenin kendi API'sinden** alınan
ilan `body`/`description` metni, **kelime ikili-örgü (bigram) kapsaması** ile karşılaştırıldı
(`% = kaynak metnin bizim sayfada birebir bulunan kısmı`). Sayfa şablonu (menü, altbilgi)
çıkarıldı; yalnız ilan gövdesi ölçüldü. Eşleşme, aynı **başlık + şirket** ile doğrulandı
(aynı başlıklı farklı şirket ilanları yanlış eşleşmesin diye).

**Kaynak API'leri (bizim importer'ın da okuduğu uçlar):**
- `https://api.iskibris.com/api/v2/jobs/paginated?page=N&per_page=100` (liste) + `…/api/jobs/{id}` (detay)
- `https://api.isbulkibris.com/api/jobs?page=N&pageSize=100` (liste) + `…/api/jobs/{id}` (detay)

**Sonuç tablosu — sitemap'teki her ilan (21/21):**

| # | Bizim URL (`/jobs/…`) | Kaynak | Kaynak canlı mı? | Kaynak kelime | **Birebir kapsama** |
|---|---|---|---|---|---|
| 1 | `source-iskibris-front-desk-agent-on-buro-gorevlisi` | iskibris #26355 (Baştaşlar) | ✅ | 754 | **%99,6** |
| 2 | `source-iskibris-satin-alma-sorumlusu` | iskibris #26359 (İlkay Genç) | ✅ | 726 | **%100** |
| 3 | `source-iskibris-yonetici-asistani` | iskibris #26358 (SENER TRADE) | ✅ | 346 | **%100** |
| 4 | `source-iskibris-insaat-muhendisi` | iskibris #26356 (Panah Constructions) | ✅ | 338 | **%100** |
| 5 | `source-iskibris-on-buro-vardiya-sorumlusu` | iskibris #26346 (Acapulco Resort) | ✅ | 254 | **%100** |
| 6 | `source-iskibris-yazilim-destek-uzmani` | iskibris #26353 (Fonet Bilgi Tek.) | ✅ | 210 | **%100** |
| 7 | `source-iskibris-ticari-pazarlama-yoneticisi` | iskibris #26360 (Vodafone Mobile) | ✅ | 183 | **%100** |
| 8 | `source-iskibris-uluslararasi-ofis-temsilcisi` | iskibris #26369 (Levent Sanayi) | ✅ | 144 | **%100** |
| 9 | `source-iskibris-dagitimci` | iskibris #26367 (Mehmet Doğru Tic.) | ✅ | 134 | **%100** |
| 10 | `source-iskibris-girne-bolgesi-magaza-satis-personeli` | iskibris #26365 (Niyazi Ziya Kozmetik) | ✅ | 132 | **%100** |
| 11 | `source-iskibris-insan-kaynaklari-sorumlusu` | iskibris #26368 (Parvistamare) | ✅ | 129 | **%100** |
| 12 | `source-iskibris-magaza-personeli` | iskibris #26352 (POPART DORMS) | ✅ | 114 | **%100** |
| 13 | `source-iskibris-magaza-satis-temsilcisi` | iskibris #26363 (Renoir Home) | ✅ | 114 | **%100** |
| 14 | `source-iskibris-kimyasal-uretim-personeli` | iskibris #26357 (MEDEF DEFENCE) | ✅ | 85 | **%100** |
| 15 | `source-iskibris-satis-personeli` | iskibris #26263 (H A B L S) | ✅ | 84 | **%100** |
| 16 | `source-iskibris-sekreter-diger` | iskibris #26361 (Tetik & Öztoprak) | ✅ | 21 | **%100** |
| 17 | `source-isbulkibris-ekskavator-operatoru` | isbulkibris (`ekskavator-operatoru`) | ✅ | 139 | **%100** |
| 18 | `source-isbulkibris-musteri-kabul-on-muhsebe-satis-temsilcisi` | isbulkibris | ❌ **kaynakta yok (bayat)** | — | — |
| 19 | `source-iskibris-idari-isler-satin-alma-sorumlusu` | iskibris | ❌ **kaynakta yok (bayat)** | — | — |
| 20 | `source-iskibris-musteri-kabul-on-muhsebe-satis-temsilcisi` | iskibris | ❌ **kaynakta yok (bayat)** | — | — |
| 21 | `source-iskibris-satis-pazarlama-personeli` | iskibris | ❌ **kaynakta yok (bayat)** | — | — |

- **Ölçülebilen 16 eşleşmenin 16'sı ≥ %99,6** (ortanca **%100**, ortalama **%100**).
- **21/21 ilan içe aktarılmış** (`publication_source = "source_site"`); **özgün (`platform`) ilan: 0.**
- Kalan 5 ilan, kaynak sitede artık bulunmayan **bayat** kayıtlar; buna rağmen bizim sitemizde
  **tam metinle** yayında (§53).

**Doğrulama betiği** (yeniden üretilebilir; `curl` + Python, depo dışı):

```bash
# 1) Kaynak listesini al (iskibris)
curl -s "https://api.iskibris.com/api/v2/jobs/paginated?page=1&per_page=100" -o isk.json
# 2) Bir ilanın kaynak gövdesini al
curl -s "https://api.iskibris.com/api/jobs/26356" | python3 -c "import sys,json,re,html; \
  b=json.load(sys.stdin)['body']; print(re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',b))).strip())"
# 3) Bizim sayfamızın görünür metniyle kelime-ikili kapsamasını karşılaştır → %100
curl -s "https://isbulkktc.com/jobs/source-iskibris-insaat-muhendisi"
```

### §52. Bulgular ve sınıflandırma (Tur 9)

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T9-1 | **Katalogdaki tüm ilanlar (21/21) kaynak siteden birebir kopya; özgün ilan yok** | **CONFIRMED** | **P1** | §51 tablosu; `publication_source="source_site"`; `/jobs` 20/20 bağlantı `source-*` |
| T9-2 | Ölçülen eşleşmelerin **16/16'sı %99,6–100 kelimesi kelimesine aynı** | **CONFIRMED** | **P1** | Bigram kapsaması; kaynak API `body`/`description` |
| T9-3 | Sayfada **kaynak atıf bağlantısı yok** (`iskibris.com`/`isbulkibris.com` metinde 0 kez) | **CONFIRMED** | P2 | `grep -i 'iskibris'` → 0; sayfa şablonunda "kaynak ilan" bağlantısı yok |
| T9-4 | `JobPosting` **datePosted/validThrough = kaynak ilanın tarihleri**, `dateModified` = kaynak `updated_at`; logo kaynağın S3 URL'i | **CONFIRMED** | P3 | JSON-LD ↔ `api.iskibris.com/api/jobs/26356` birebir eşit; `src/features/jobs/job-posting-structured-data.ts:85` |
| T9-5 | Kaynakta **kalkmış (bayat) 5 ilan** bizim sitede tam metinle yayında (importer temizlemiyor) | **CONFIRMED** | P2 | §51 satır 18–21; kaynak listesinde yok |
| T9-6 | Kopya, **jenerik sorgularda sıralamama**nın kod-düzeyi kök nedeni (Tur 8'in tamamlayıcısı) | **LIKELY** | **P1** | Google kopya/kalitesiz sayfayı indeksleyip düşük sıralar; kaynak site daha eski+otoriter |
| T9-7 | Rakip site bizim sayfamızdan **daha iyi sıralanıyor** ("GitHub bile öne geçiyor" algısının içeriği) | **LIKELY** | P1 | T9-1/T9-2; canlı SERP ölçümü bu turda yapılamadı (bot kontrolü) |

**Neden bu, "site çıkmıyor" şikâyetinin merkezindedir:** Google, aynı ilanı hem kaynak sitede
hem bizde gördüğünde **kaynağı** tercih eder (daha eski, daha çok bağlantı, ilanın gerçek
sahibi). Bizim sayfa bir "ayna"dır; Google onu **indeksler** (bu yüzden GSC'de ~195 "Dizine
eklenen" görünür) ama **jenerik sorgularda göstermez** — çünkü sayfa **yeni bilgi** sunmaz.
Bu davranış hata değil, **kopya içerik filtresinin** normal işleyişidir. Bu yüzden Tur 8'deki
"teknik engel yok" sonucu doğrudur; eksik olan **özgün içerik**tir.

### §53. Bayat (kaynakta kalkmış) ilanlar — P2 ayrı bulgu

Importer (`scripts/import-source-jobs.ts` → `purgeSourceData`) her çalıştırmada eski kaynak
ilanları **silip yeniden yazar** (tam yenileme). Ancak bu **yalnız importer'ın çalıştığı anda
kaynak listede olan** ilanları getirir. İki durum oluşur:

1. Kaynak site bir ilanı **kaldırır** (süresi dolmadan) → bizim kopyamız **kalır** (bayat).
2. Kaynak API o sayfayı **sayfalamada göstermez** (liste 20 sayfayla sınırlı, `page<=20`) → ilan
   "yenilenmez" ve eski kopya yayında kalır.

**Sonuç:** 21 ilanın **5'i** kaynakta artık yok ama sitemizde tam metinle duruyor. Bu, hem
**kullanıcı güveni** (ölü ilan) hem **kalite sinyali** (Google "soft 404"/kopya) açısından
kötüdür. **Düzeltme önerisi** (kod, kullanıcı onayı sonrası): importer, kaynak listede
bulunmayan `source_site` ilanları **pasife almalı** (silme yerine `unpublished`) veya
`expires_at` geçenleri gizlemeli. Ayrıntı: `MANUAL_TASKS.md §14`.

### §54. Önerilen düzeltmeler (öncelik sırası, kod — onay ister)

| # | Öneri | Önem | Etki | Risk |
|---|---|---|---|---|
| 1 | **Özgün içerik üretimi:** içe aktarılan ilanlara **özgün özet/analiz** ekle (ör. "Bu pozisyon için KKTC ortalaması", bölge/ücret bağlamı, benzer ilanlar) — kaynak gövdesini **birebir kopyalamak yerine** kendi cümlelerimizle özetle | **P1** | Kopya filtresini kırar; sayfa **yeni değer** sunar | Orta (içerik/ürün kararı) |
| 2 | **Kaynak atıfı (attribution):** her ilanın altına "Kaynak: `<site>`" **bağlantısı** ekle; `JobPosting`'e `sameAs`/`isBasedOn` ver | P2 | Şeffaflık + E-E-A-T; kopya algısını azaltır | Düşük |
| 3 | **Bayat ilanları gizle** (T9-5): importer kaynakta olmayan ilanları pasife alsın; sitemap'ten de düşsün | P2 | Ölü ilan/kalite sinyali temizlenir | Düşük |
| 4 | **`datePosted` düzeltmesi** (T9-4): kaynak tarihini `datePosted` olarak taşımak "yeni ilan" izlenimi verir; `dateModified`'i kendi doğrulama tarihimiz yapmayı değerlendir | P3 | Jobs zengin sonuç tutarlılığı | Düşük |
| 5 | **Native (platform) ilan teşviki:** işverenlerin **doğrudan** ilan vermesini sağlayacak akış/teşvik → özgün içerik tabanı | P1 (ürün) | Uzun vadede kopya oranını düşürür | Yüksek (ürün) |

> **Not:** Öneri 1 ve 5 **ürün/içerik kararıdır**, tek başına kod değişikliği değildir; kullanıcı
> onayı ister. Öneri 2–4 kod ile yapılabilir ve onaya sunulmuştur. **Bu turda hiçbir kod
> değiştirilmedi** (yalnız ölçüm + rapor).

### §55. Yanlış-pozitif riski ve kapsam sınırı

- **"Kopya" ölçümü gövde metniyledir**, sayfa şablonu hariç. Bu, Google'ın gördüğü **ana içerik**
  ile örtüşür; yine de Google'ın tam algoritması bilinemez → T9-6 **LIKELY**, kanıtlı kesin değil.
- **Canlı SERP karşılaştırması yapılmadı** (arama motorları bot kontrolü); "rakip öne geçiyor"
  (T9-7) **LIKELY**'dir, kanıt değil çıkarımdır.
- **16/16** sonucu, kaynak API'de **eşleşen** ilanlar içindir. Kalan 5 ilan kaynakta yok; onlar
  için kopya ölçümü yapılamaz (zaten bayat).
- **Kaynak API erişilebilirliği:** iskibris listesi o an **279** ilan döndürdü (sayfalı); bizim
  yayında tuttuğumuz 21, importer'ın **son başarılı çalışmasının** anlık görüntüsüdür. Sayılar
  kaynağa göre oynar; **nitelik (kopya oranı) kararlıdır**.
- **`publication_source="platform"` ilanı 0** — bu, canlı `/jobs` listesinin 20/20'sinin ve
  sitemap'in 21/21'inin `source-*` olmasıyla doğrulandı; ileride native ilan eklenirse oran değişir.

---

## EK — Tur 10: `llms.txt` ↔ sitemap **facet çelişkisi** — DÜZELTİLDİ (kod) (2026-11-14)

> Bu tur, Tur 5'in (sitemap ↔ noindex) **kardeş** bulgusudur: aynı çelişki, bu kez
> `llms.txt` / `llms-full.txt` makine dosyalarında. Tur 5 sitemap'i düzeltmişti; **Tur 10
> brief'leri düzeltir.**

### §56. Bulgu — `llms.txt` boş facet sayfalarını reklam ediyordu

**Canlı ölçüm (2026-11-14, `curl`):**

| Kontrol | Sonuç |
|---|---|
| `/sitemap.xml` | **200**, 183 temiz `<loc>` (çift-slash yok — Tur 5 kanıtı geçerli) |
| `/llms.txt` | **200**, 4980 bayt |
| `/llms-full.txt` | **200**, 23522 bayt |
| `/robots.txt` | **200** |
| `llms.txt`'teki facet bağlantıları | **12** (`/is-ilanlari/*` + `/is-turleri/*`) |
| `sitemap.xml`'teki facet `<loc>`'ları | **8** |

**Çelişki (CONFIRMED):** `llms.txt` şu **4 facet'i** reklam ediyor, ama sitemap onları
**listelemiyor** (Tur 5'te doğru biçimde dışlandı) ve sayfaları canlı olarak `noindex` dönüyor:

| Facet | Canlı durum | Sitemap'te | `llms.txt`'te (önce) |
|---|---|---|---|
| `/is-ilanlari/lefke` | 200 + `noindex, follow` | ❌ yok | ✅ **var (çelişki)** |
| `/is-turleri/yari-zamanli` | 200 + `noindex, follow` | ❌ yok | ✅ **var (çelişki)** |
| `/is-turleri/sozlesmeli` | 200 + `noindex, follow` | ❌ yok | ✅ **var (çelişki)** |
| `/is-turleri/gecici` | 200 + `noindex, follow` | ❌ yok | ✅ **var (çelişki)** |
| `/is-ilanlari/girne` | 200 + robots meta **yok** | ✅ var | ✅ var |
| `/is-turleri/tam-zamanli` | 200 + robots meta **yok** | ✅ var | ✅ var |

**Neden önemli:** `llms.txt`, AI cevap motorlarına (ChatGPT, Perplexity, Gemini) "şu sayfaları
alıntıla" der. Bir facet boşken sayfa `noindex` döner (Google onu Soft 404 saymasın diye).
Brief o URL'i reklam ederse, motoru **site kendi crawler'ına "atla" dediği bir sayfaya** yönlendirir:
sitemap'in Tur 5'te kaçındığı çelişkinin **birebir aynısı**, farklı dosyada.

### §57. Kök neden

`sitemap.ts` facet listesini **canlı** `computeLandingAvailability(jobs)` projeksiyonundan
türetiyordu (Tur 5). `llms-brief.ts` ise **statik** `servedDistricts` / `jobTypeKeys` üzerinden
**tüm** facet'leri yazıyordu — hangi facet'te ilan olduğunu sormuyordu. İki üretici **farklı
kaynak** okuyunca ayrıştı: sitemap "ilanı olan facet", brief "tüm facet".

### §58. Düzeltme (Fix A — kod, bu turda uygulandı)

1. **`buildLlmsBrief(baseUrl, availability)`** ve **`buildLlmsFullBrief(baseUrl, availability)`**
   artık `LandingAvailability` alır; facet bağlantıları `availableDistricts` / `availableJobTypes`
   ile **sitemap'le aynı** projeksiyondan süzülür (`primaryPageLines`).
2. **Rota işleyicileri** (`/llms.txt`, `/llms-full.txt`) `listPublicJobSitemapEntries()` →
   `computeLandingAvailability()` çağırıp sonucu builder'a geçirir; `force-static` yerine
   **`force-dynamic`** oldu (sitemap ile aynı gerekçe: facet canlılığı önbelleğe alınamaz).
3. **Prose gerçekleri korunur:** ilçe listesi ve posta kodları (marka bilgisi) tüm altı ilçe
   için kalır — **yalnız bağlantı listesi** süzülür. Yapılandırılmış-veri prose'u rota *şeklini*
   (`/is-ilanlari/{ilçe}`) anmaya devam eder; bu reklam edilen bir URL değildir.

### §59. Bulgular ve sınıflandırma (Tur 10)

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T10-1 | `llms.txt` 4 boş facet'i reklam ediyordu (lefke, yari-zamanli, sozlesmeli, gecici) | **CONFIRMED** | **P2** | `curl` sayımı: llms 12 facet / sitemap 8 facet |
| T10-2 | Bu facet'ler canlı `noindex, follow` dönüyor; sitemap onları doğru dışlıyor | **CONFIRMED** | **P2** | `curl -s …/lefke` → `<meta name="robots" content="noindex, follow">` |
| T10-3 | Kök neden: brief statik facet listesi, sitemap canlı projeksiyon okuyordu | **CONFIRMED** | P2 | `llms-brief.ts` (eski) vs `sitemap.ts` |
| T10-4 | Çelişki **kapatıldı**: brief artık `computeLandingAvailability` okuyor | **CONFIRMED** | P2 | `geo-audit.test.ts` "omits a facet page that has no vacancy" |
| T10-5 | Fix henüz **canlıda değil** (deploy bekliyor) | **CONFIRMED** | P3 | Canlı `llms.txt` hâlâ 12 facet (fix branch merge + deploy öncesi) |

### §60. Test kanıtı

- `src/content/ai-visibility/geo-audit.test.ts` — **2 yeni regresyon testi**:
  - *"the brief omits a facet page that has no vacancy, like the sitemap"*: yalnız `Girne` +
    `full_time` mevcutken brief o ikisini reklam eder, diğer 5 ilçe + 5 tür **hiç geçmez**.
  - *"an empty catalogue advertises no facet link, only the static pages"*: hiç ilan yokken
    hiç facet bağlantısı yok; statik sayfalar kalır.
- `tests/unit/llms-brief-dynamic.test.ts` — **yeni**: iki rota da `force-dynamic` ve `GET`
  ihraç ediyor (sitemap'in dinamiklik testinin kardeşi).
- Mevcut testler `ALL_FACETS` fixture'ıyla güncellendi (şekil testleri tüm listeyi görsün).
- **Sonuç:** `test:unit` **1076/1076**, `test:security` **215/215** (0 fail), `tsc --noEmit` **0**,
  `eslint` **0**. `scripts/verify-indexing.test.mjs` **41/41**.

### §61. Kapsam sınırı / yanlış-pozitif riski

- Fix, **bağlantı listesini** süzer; brief'in **anlattığı gerçekler** (ilçe adları, posta kodları,
  yapılandırılmış-veri haritası) kasıtlı olarak tüm ilçeler için kalır — bunlar "hizmet verilen
  bölge" bilgisidir, "şu URL'i al" değil.
- `noindex` durumu **canlı** okundu; fix **deploy edilene kadar** canlı çelişki sürer (T10-5).
  Doğrulama, deploy sonrası `llms.txt` facet sayısının sitemap'le **eşitlenmesiyle** yapılır.

### §62. Canlı yeniden ölçüm — çelişki birebir doğrulandı (2026-11-14)

Fix **henüz deploy edilmedi**; bu turda canlı durum bağımsız olarak yeniden okundu ve Tur 10
bulgusu birebir teyit edildi:

| Ölçüm (canlı, `curl`) | Değer |
|---|---|
| `/llms.txt` HTTP | 200, **4980** bayt |
| `/llms-full.txt` HTTP | 200, **23522** bayt |
| `/sitemap.xml` HTTP | 200, **183** `<loc>` |
| `llms.txt`'teki facet bağlantısı | **12** |
| `sitemap.xml`'teki facet `<loc>` (localesiz, benzersiz) | **8** |
| Canlı `build-info` commit | `39dbf41` (= `origin/main`) |

**Fazlalık tam olarak 4 boş facet** ve bu dördü canlı **`noindex, follow`** döner; sitemap'te
olan 8 facet'in hiçbirinde robots meta yok:

| Facet | Sitemap'te | Canlı `robots` | `llms.txt`'te |
|---|---|---|---|
| `/is-ilanlari/lefke` | ❌ | **noindex, follow** | ✅ (çelişki) |
| `/is-turleri/gecici` | ❌ | **noindex, follow** | ✅ (çelişki) |
| `/is-turleri/sozlesmeli` | ❌ | **noindex, follow** | ✅ (çelişki) |
| `/is-turleri/yari-zamanli` | ❌ | **noindex, follow** | ✅ (çelişki) |
| `/is-ilanlari/girne` · `guzelyurt` · `iskele` · `lefkosa` · `magusa` | ✅ | (yok) | ✅ |
| `/is-turleri/serbest-calisma` · `staj` · `tam-zamanli` | ✅ | (yok) | ✅ |

**Yorum:** `llms.txt`'in reklam ettiği 12 facet'ten 4'ü, sitenin kendi crawler'ına
"bu sayfayı dizine ekleme" dediği sayfalardır. Sitemap bunları **doğru biçimde** dışlar;
brief (fix öncesi) dışlamaz. Fix A, brief'i sitemap'le **aynı** `computeLandingAvailability`
projeksiyonuna bağlar; deploy sonrası beklenen: `llms.txt` facet sayısı **12 → 8**,
fazlalık 4 URL tamamen çıkar. Doğrulama komutu:

```bash
diff <(curl -s https://isbulkktc.com/llms.txt \
  | grep -oE '/is-(ilanlari|turleri)/[a-z-]+' | sort -u) \
     <(curl -s https://isbulkktc.com/sitemap.xml \
  | grep -oE '<loc>[^<]*/is-(ilanlari|turleri)/[a-z-]+</loc>' \
  | sed -E 's#</?loc>##g; s#https://isbulkktc.com##; s#^/[a-z]{2}/#/#' | sort -u) \
  && echo "FACET PARITY OK"
```

Fix öncesi çıktı (canlı, bu turda çalıştırıldı) tam olarak 4 satırlık fazlalığı verir:
`/is-ilanlari/lefke`, `/is-turleri/gecici`, `/is-turleri/sozlesmeli`, `/is-turleri/yari-zamanli`.

### §63. Nüks koruması — `llms.txt` ↔ sitemap facet paritesi artık canlı doğrulanıyor (Tur 10)

Fix A, çelişkiyi **kapatır** ama tekrarını **engellemez**: biri ileride `llms.txt`'e yeni bir
facet listesi eklerse (ya da sitemap'in projeksiyonundan saparsa) iki dosya yeniden ayrışır.
Bu yüzden çelişki **kural hâline** getirildi — `scripts/verify-indexing.mjs` (canlı denetçi)
artık iki makine dosyasını **karşılaştırıyor**:

- **`facetPaths(urls)`** — bir belgenin bağlantı verdiği facet yollarını (yerel ayar öneki
  sıyrılmış, tekilleştirilmiş, sıralı) döner: `/is-ilanlari/*` ve `/is-turleri/*`.
- **`compareFacetParity(llmsText, sitemapLocs)`** — `llms.txt`'in reklam ettiği facet kümesiyle
  sitemap'in `<loc>` facet kümesini karşılaştırır; **iki yönlü** farkı (`onlyInLlms`,
  `onlyInSitemap`) ve `ok` bayrağını döner. Saf fonksiyonlar, bu yüzden birim testle sabitlendi.
- **`checkFacetParity(parsed)`** — canlı `llms.txt`'i çeker, sitemap'i `checkSitemap`'in zaten
  indirdiği belgeden alır, uyuşmazlıkta **`fail facets`** yazar. Ölçülemezse (challenge / kapalı
  deployment) `skip`, sahte kırmızı yok.

**Kanıt (bu turda canlı, fix deploy edilmeden çalıştırıldı):**

```
  PASS sitemap   183 URLs, all on-origin canonical; ...
  FAIL facets    llms.txt and sitemap disagree on facet pages
                 (llms.txt-only: /is-ilanlari/lefke, /is-turleri/gecici,
                  /is-turleri/sozlesmeli, /is-turleri/yari-zamanli)
1 failure(s), 0 warning(s), 0 skipped
```

Denetçi, çelişkiyi **tam olarak 4 boş facet** olarak yakaladı — yani §56 bulgusunun birebir
kendisi. Fix deploy edildikten sonra bu satır **`PASS facets  8 facet pages advertised by both
llms.txt and sitemap.xml`** olmalı; tekrar sapma olursa `indexing:verify` (CI) kırmızıya döner.

**Test:** `scripts/verify-indexing.test.mjs` **+6 test** (32/32): `facetPaths` iki aileyi okur ve
yerel-ayar kopyalarını tekilleştirir (default `/tr` dahil); `compareFacetParity` eşleşmede `ok`,
brief-fazlası'nda `onlyInLlms`, sitemap-fazlası'nda `onlyInSitemap`, facetsiz-belgede simetrik.
**Toplam:** `test:unit` **1082/1082** (önceki 1076 + 6).

## EK — Tur 11: Googlebot `<head>` metadata'sını kaybediyor — canonical `<body>`'ye düşüyor (P0) (2026-11-12)

### §64. Yönetici özeti (bu turun tek cümlesi)

**`force-dynamic` sayfalarda Next.js, Googlebot'a `<head>` metadata'sını "streaming" yolluyor;
React bu etiketleri `<head>`'e taşımakta **aralıklı olarak başarısız oluyor** ve
`<link rel="canonical">` sayfanın **en üst düzey `<body>` çocuğu** olarak kalıyor.** Google
`rel="canonical"`'i **yalnızca `<head>` içinde** kabul eder; yani Googlebot'un bir kısım
fetch'inde canonical, robots, OpenGraph ve hreflang etiketleri **hiç görünmüyor**. Bu,
"site tam domain yazmadan çıkmıyor" şikayetini **canlı ölçümle doğrulanan** teknik bir
kök-nedenle açıklar: yinelenen katalog (Tur 9) + kayıp canonical → Google hangi URL'nin
kanonik olduğunu tahmin eder, sinyalleri başka bir URL'de (ya da kaynak sitede) birleştirir.
Bu turda **düzeltildi** (`next.config.ts`, `htmlLimitedBots`).

### §65. Bulgu (canlı, 2026-11-12)

`isbulkktc.com/is-ilanlari/girne` (bir facet sayfası, `export const dynamic = "force-dynamic"`)
Googlebot UA'sıyla **6 kez** ham `curl` ile çekildi; **2/6** yanıtta `<head>` bölümünde
`<title>`, `rel="canonical"`, `rel="alternate"` **yoktu** — bu etiketler `</head>`'ten sonra,
`<body>` içinde geliyordu. `/jobs` (aynı davranışı paylaşan kardeş sayfa) aynı 6 denemede
**6/6** doğru verdi; yani sorun **kararlı bir eksiklik değil, bir yarış (race)**.

### §66. Kök neden (CONFIRMED — Next.js kaynağı + canlı kanıt)

Next.js, `<head>` metadata'sını yalnızca **"HTML-limited"** user agent'lara **bloklayarak**
(render'ı bekletip `<head>`'e basarak) verir; geri kalanına **streaming** verir ve React'in
sonradan `<head>`'e taşımasını (hoist) bekler:

- `node_modules/next/dist/server/lib/streaming-metadata.js` — `shouldServeStreamingMetadata(ua, htmlLimitedBots)`:
  UA, `htmlLimitedBots` desenine uyuyorsa `false` (bloklayan), uymuyorsa `true` (streaming).
- `node_modules/next/dist/shared/lib/router/utils/html-bots.js` — Next'in **varsayılan** deseni:
  `/[\w-]+-Google|Google-[\w-]+|…|Bingbot|…/i`. Bu desen `Mediapartners-Google`,
  `AdsBot-Google`, `Google-InspectionTool` gibi **Google servis** crawler'larını yakalar;
  **düz `Googlebot`'u yakalamaz.**
- `node_modules/next/dist/shared/lib/router/utils/is-bot.js` — Next bunu **bilerek** yapar:
  `HEADLESS_BROWSER_BOT_UA_RE = /Googlebot(?!-)|Googlebot$/i` yorumu — *"Only the main Googlebot
  search crawler executes JavaScript"*. Yani ana Googlebot, JS çalıştırabildiği için **streaming**
  tarafa konur ve React'in hoist etmesi beklenir.
- `node_modules/next/dist/lib/metadata/metadata.js` (satır ~102–113) — `MetadataWrapper`
  yorumu: *"Metadata tags are hoisted out, so this hidden wrapper remains empty."* **Niyet
  budur; canlı davranış bunu çürütüyor.**
- `node_modules/next/dist/server/config.js` (satır ~1051) — `htmlLimitedBots` config'te
  verilmezse varsayılan desen zorla atanır. Override **mümkün ve resmî**dir
  (Next dokümanı: `htmlLimitedBots`, v15.2.0).

**Doğrulama (yerel, Node):** varsayılan desenle `shouldServeStreamingMetadata(GooglebotUA, undefined)`
→ **`true`** (streaming); `Bingbot` → **`false`** (bloklayan). Canlı ölçümle birebir uyuşuyor.

### §67. Canlı kanıt

**(a) Ham `curl` — Googlebot UA, `<head>` içinde canonical var mı?**

| URL | Deneme | `<head>`'de canonical | `<body>`'de canonical |
|---|---|---|---|
| `/is-ilanlari/girne` | 6 | 4 | **2** |
| `/jobs` | 6 | 6 | 0 |

Yakalanan başarısız örnekte `<head>` **yalnızca** şunları içeriyor:
`<meta charSet>`, `<meta viewport>`, bir `<link rel="preload" as="image">`, iki stylesheet ve
script preload'ları — **`<title>`, canonical, robots, og:*, hreflang YOK**. Bu etiketler
`<body>` içinde (React'in streamed `<div hidden>` şablonu + body düzeyinde) geliyor.

**(b) Gerçek tarayıcı — Chromium, Googlebot UA, JS çalıştırıldıktan sonra (Playwright):**

| Ölçüm | Sonuç |
|---|---|
| `/is-ilanlari/girne`, 12 tam sayfa yükleme (hidrasyon + 4 sn bekleme) | **6 `<head>` / 6 `<body>`** |
| Canonical'ın DOM zinciri (10 yükleme) | 5/10 **doğrudan `<body>` çocuğu** (`link<body<html`), 5/10 `<head>` |
| Hidrasyon öncesi vs sonrası | **Birebir aynı** — JS düzeltmiyor, taşımıyor |
| Konsol/sayfa hatası | **Yok** (sessiz başarısızlık) |

**Kritik:** Bu, "JS çalışınca düzelir" varsayımını **çürütür**. Tarayıcı hidrasyonu tamamlar,
hiçbir hata vermez, ama canonical **kalıcı olarak** `<body>`'de kalır.

**(c) Bot karşılaştırması (aynı anda, aynı URL):**

| UA | `serveStreamingMetadata` | Canlı `<head>` davranışı |
|---|---|---|
| `Googlebot` | **true** | kararsız (yarış) → bazen body |
| `Bingbot` | false | 10/10 kararlı `<head>` |
| `Google-InspectionTool` | false | kararlı `<head>` |
| Chrome / curl | true | kararsız |

**Google'ın kendi dokümanı:** *"The `rel="canonical"` link element is only accepted if it
appears in the `<head>` section of the HTML."*
(`developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls`). Yani
`<body>`'ye düşen canonical **Google tarafından yok sayılır** — bir tercih sinyali değil,
hiç sinyal değildir.

### §68. Bu, "site tam domain yazmadan çıkmıyor" şikayetini neden açıklar

Üç kök neden **üst üste biniyor**:

1. **Yeni alan adı + otorite yok** (Tur 8) — yeni domain güven kazanana kadar geride kalır.
2. **Katalog %100 kaynak siteden kopya** (Tur 9) — özgün sinyal yok; Google'ın "hangi kopya
   kanonik?" sorusu tekrarlanır.
3. **Bu tur: Googlebot'un bir kısım fetch'inde canonical `<head>`'de YOK** — Google, bizim
   beyan ettiğimiz kanonik URL'yi görmez; yinelenen kopyalar arasında **kendi seçimini** yapar.

(2) ve (3) birleşince Google, sayfalarımızın sinyalini başka bir URL'de (kaynak site dahil)
birleştirebilir — bu tam olarak "tam domain yazmadan çıkmıyor, hatta GitHub projesi öne
geçiyor" gözleminin crawler düzeyindeki mekanizmasıdır. **Bu, (1) ve (2)'yi tek başına
açıklamaz; ama üçüncü ve düzeltilebilir teknik engeldir.**

### §69. Bulgular ve sınıflandırma (Tur 11)

| ID | Bulgu | Sınıf | Önem | Kanıt |
|---|---|---|---|---|
| T11-1 | **Googlebot `force-dynamic` sayfalarda `<head>` metadata'sını (canonical, robots, og, hreflang) aralıklı olarak kaybediyor; etiketler üst düzey `<body>` çocuğu oluyor** | **CONFIRMED** | **P0** | §66 kaynak; §67 ham curl 2/6 + tarayıcı 6/12 body; Next varsayılan deseni Googlebot'u yakalamıyor |
| T11-2 | `scripts/verify-indexing.mjs` Googlebot UA'sıyla başlık/head yerleşimini **ölçmüyor** → denetçi yeşilken bu kusur görünmez | **CONFIRMED** | P2 | §67; `indexing:verify` bu turda **0 failure** verdi (UA `Googlebot/2.1 (+http://www.google.com/bot.html)`, ama yalnız 200/robots/canonical değeri kontrol ediliyor, head-vs-body konumu değil) |
| T11-3 | `/jobs` sayfa başlığı yazım hatası: **"Münhaller"** (doğrusu "İlanlar" ya da "Münhaller"≠Türkçe) | **CONFIRMED** | P3 | `src/messages/tr.json:224` → `<title>KKTC Güncel Münhaller · İşBul KKTC</title>` |
| T11-4 | Çıplak `/is-ilanlari` ve `/is-turleri` **404** (facet hub sayfası yok) | **CONFIRMED** | P3 | `curl` → 404; yalnız `/[district]` ve `/[type]` alt yolları var |
| T11-5 | İçerik boşluğu / %100 yinelenen katalog | **CONFIRMED** (Tur 9) | P1 | §51; bu turda değişmedi |
| T11-6 | Canlı deployment `f5367cb`, origin `main` ile **aynı** | **NOT A DEFECT** | — | `git ls-remote` + `/api/build-info` = `f5367cb`; "150 geride" yalnızca **farklı** bir repoyla (`LBCron/isbulkktc`) kıyaslamadan çıkan yanılgıydı |
| T11-7 | İş ilanı sayfalarında "metadata hreflang boşluğu" | **FALSE POSITIVE** | — | §70 not: body'deki 6 `hrefLang` = dil menüsü `<a hrefLang>` bağlantıları; `contentLocale: routing.defaultLocale` gereği iş sayfası bilinçli olarak metadata hreflang üretmez |
| T11-8 | GA4 (ölçüm) eksik | **NOT A DEFECT** | — | `G-HNM3KEX9VD` prod JS chunk'ında; `google-analytics.tsx` consent sonrası yükler |

### §70. Düzeltme (Fix B — kod, bu turda uygulandı)

`next.config.ts`'e Next 16'nın varsayılan listesi **birebir** kopyalanıp sonuna **`Googlebot`**
eklendi; böylece ana Googlebot da bloklayan (blocking) metadata alır ve canonical **her
zaman** `<head>`'de olur:

```ts
htmlLimitedBots:
  /[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Googlebot/i,
```

**Neden bu düzeltme:** (1) Next'in **resmî** mekanizmasıdır (`htmlLimitedBots`, v15.2.0);
(2) varsayılan listeyi birebir korur (mevcut davranışı daraltmaz, yalnız genişletir);
(3) yalnız **bir** crawler'ı hedefler — gerçek tarayıcılar ve diğer botlar streaming'e devam
eder (TTFB etkilenmez); (4) Googlebot için TTFB bir miktar artar (metadata senkron çözülür),
ama **doğruluk gecikmeden önce gelir** ve canonical'ın kaybolması artık **imkânsızdır**.

**Alternatif/tamamlayıcı (takip işi, bu turda yapılmadı):** facet sayfalarındaki
`export const dynamic = "force-dynamic"` yerine **ISR** (`revalidate`) kullanmak; hem bu
yarışı kaynağında kaldırır hem TTFB'yi düşürür. Kullanıcı onayı ister (davranış değişikliği).

### §71. Test kanıtı

Yeni birim testi: **`scripts/next-config-bots.test.mjs` (+4 test)**. Test, `htmlLimitedBots`
regex'ini **doğrudan `next.config.ts`'ten** okuyup Next'in **gerçek**
`shouldServeStreamingMetadata` fonksiyonuna verir (kopya değil, canlı fonksiyon):

- `Googlebot` → `false` (bloklayan) — düzeltmenin kendisi;
- `Googlebot-Image` → `false`;
- **regresyon koruması:** `htmlLimitedBots` **verilmezse** (`undefined`) `Googlebot` → `true`
  — yani "Next varsayılanı gerçekten streaming yapıyor" iddiası teste bağlandı; varsayılan
  düzelirse test bunu **yüksek sesle** söyler;
- Next'in varsayılan listesindeki botlar (`Mediapartners-Google`, `AdsBot-Google`,
  `Google-InspectionTool`, `Bingbot`, `Twitterbot`, `Slackbot`, `facebookexternalhit`,
  `YandexBot`) hâlâ bloklayan;
- JS çalıştıran UA'lar (Chrome, curl, GPTBot) hâlâ streaming.

**Komutlar:**
```bash
npx tsx --test scripts/next-config-bots.test.mjs   # 4/4 pass
npm run test:unit                                   # 1082/1082 pass
npm run typecheck                                   # temiz
npm run indexing:verify                             # 0 failure (canlı, fix deploy öncesi)
```

### §72. Kapsam sınırı / yanlış-pozitif riski

- **Düzeltme bu turda DEPLOY EDİLMEDİ.** Canlı site hâlâ `f5367cb` (fix öncesi). Doğrulama
  için deploy sonrası şu komut **6/6 `<head>`** vermeli:
  ```bash
  for i in $(seq 1 6); do
    curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
      https://isbulkktc.com/is-ilanlari/girne \
      | sed -n 's/.*<head[^>]*>\(.*\)<\/head>.*/\1/p' | grep -c 'rel="canonical"'
  done
  ```
- **Oran kesin değil, aralık:** ölçülen body-oranı ~%33–%50 (ham curl 2/6; tarayıcı 6/12).
  Bu bir **olasılık**, garanti değil — ama Googlebot sayfayı **tek kez** çeker ve o çekim
  yanlış olursa kararı o yanlışa göre verir; bu yüzden **herhangi** bir oran P0'dır.
- **"Tek başına sıralamayı açıklar" DENMEZ:** Tur 8 (otorite) ve Tur 9 (kopya) da etkendir.
  T11-1, üçüncü ve **düzeltilebilir** teknik engeldir.
- **T11-2 bir kapsam boşluğu, kod hatası değil:** `verify-indexing` canonical'ın **değerini**
  doğru ölçer; **konumunu** (head vs body) ölçmez. Takip işi: denetçiye Googlebot-UA'lı bir
  "head placement" kontrolü eklemek.

### §73. Not — `hrefLang` yanlış-pozitifi (önceki notun düzeltmesi)

Önceki notta "iş ilanı sayfalarında hreflang boşluğu" diye işaretlenen şey **yanlış-pozitifti**:
iş ilanı sayfalarında `<body>`'de görünen 6 `hrefLang`, **dil menüsündeki** `<a hrefLang>`
bağlantılarıdır (metadata alternates değil). Sayfa,
`src/app/[locale]/(public)/jobs/[slug]/page.tsx:38`'deki `contentLocale: routing.defaultLocale`
gereği **bilinçli olarak** metadata hreflang üretmez ve Türkçe URL'ye canonical verir. Bu,
"içe aktarılan ilanlar her dilde Türkçe" kararıyla **tutarlıdır** — kusur değil. (Next
`hrefLang`'i büyük `L` ile yazar; önceki grep küçük `l` aradığı için yanılgı oluştu.)

## EK — Tur 12: GSC Coverage (kapsam) — **birleşik nihai sınıflandırma** + P0 kapanış (2026-11-12)

> Bu ek §1–§73'e **eklenir**. Girdi: kullanıcının Google Search Console'dan attığı dört CSV
> (`Önemli sorunlar`, `Kritik olmayan sorunlar`, `Meta Veri`, `Grafik`) + **yeniden canlı ölçüm**
> (2026-11-12). Amaç: tüm bulguları **tek yerde**, tek sınıflandırmayla (CONFIRMED · LIKELY ·
> NOT FOUND · NOT APPLICABLE · BLOCKED) ve **P0–P3** önceliğiyle kapatmak; ayrıca **P0 kök nedenin
> kapanışını** ve bir **yeni bulguyu** kayda geçirmek.

### §74. Yönetici özeti (bu turun tek cümlesi)

**GSC "Önemli sorunlar" kovalarının ezici çoğunluğu bilinçli tasarımdır; yalnız iki gerçek
teknik bulgu vardı — biri (P0, Googlebot canonical'ı `<head>`'de kaybediyor) bu turda
kaynak+canlı kanıtla doğrulandı ve kodda düzeltildi, diğeri (P1, `%100 kopya katalog)
zaten biliniyordu.** Kalan tüm kovalar (83 noindex, 58 404, 48 308, 31 hreflang, 23 403,
43+12 "eklenmedi") **beklenen/istenen** davranıştır. Ayrıca bu turda **yeni bir otorite
bulgusu** kayda geçti: **genel arama GitHub profilini ve bir `vercel.app` ayna host'unu
`isbulkktc.com`'un önüne koyuyor.**

### §75. Kapsam kovalarının nihai sınıflandırması (tek tablo)

| GSC kovası (TR) | Sayfa | Sınıf | Önem | Neden / canlı kanıt |
|---|---:|---|---|---|
| "noindex" etiketi tarafından hariç tutuldu | 83 | **NOT APPLICABLE** (istenen) | P3 | auth/dashboard + boş landing + **filtreli arama**. Canlı: `/is-ilanlari/lefke`, `/is-turleri/yari-zamanli` → `noindex, follow`; `/jobs?query=zzzz` → `noindex, follow`. Sayı **artacak** — normal. |
| Bulunamadı (404) | 58 | **NOT APPLICABLE** (istenen) | P3 | Kapanan ilan + **hub sayfası olmayan** `/is-ilanlari`, `/is-turleri` (canlı: ikisi de **404**), `/auth/login` **404** (doğru URL `/login`). Sitemap yalnız 200 URL yayar. |
| Yönlendirmeli sayfa | 48 | **NOT APPLICABLE** (istenen) | P3 | `www`→apex **308**, `/tr/...`→prefixsiz **308**, trailing-slash **308**. Canlı: `/tr/jobs` → **308** `/jobs`; `/tr` → **308** `/`. |
| Doğru standart etikete sahip alternatif sayfa | 31 | **CONFIRMED** (sağlıklı) | P3 | hreflang/canonical birleşmesi — Google'ın **doğru** davranışı. Canlı: `/en/jobs` canonical = kendisi (200). |
| Başka bir 4xx sorunu nedeniyle engellendi | 23 | **NOT APPLICABLE** (güvenlik) | P3 | `/.env`, `/wp-login.php`… → **403**; bot/kötü-niyetli yollar. |
| Soft 404 | 2 | **CONFIRMED → düzeltildi (P1)** | P1 | Tur 5 fix'i canlıda: boş facet → `noindex, follow` + sitemap'ten çıkarıldı. Google'ın yeniden taraması bekleniyor. |
| Kullanıcı tarafından seçilen kanonik olmadan kopya | 1 | **LIKELY** (kendi kendine çözülür) | P2 | Tek URL; canonical+hreflang zaten yayında. Panelden URL alınmadan kesinleşmez. |
| Tarandı – şu anda dizine eklenmiş değil | 43 | **NOT APPLICABLE** (normal gecikme) | P2 | **İçerik/otorite** sinyali; P0+P1 düzeltmeleri + özgün içerik ile iyileşir. |
| Keşfedildi – şu anda dizine eklenmiş değil | 12 | **NOT APPLICABLE** (normal gecikme) | P3 | Yeni ilan/şehir URL'leri; günlük `indexing:submit` zaten bildiriyor. |
| "Kritik olmayan sorunlar" | 0 | **NOT FOUND** (sorun yok) | P3 | CSV yalnız başlık satırı içerir. |
| Site haritası durumu "Bilinen tüm sayfalar" | — | **NOT APPLICABLE** | P3 | Google'ın toplu etiketi; gerçek ölçüm URL Inspection (panel). |
| GSC **yazma** (Validate fix / Request indexing / Manuel işlem) | — | **BLOCKED** | P2 | OAuth yok (`Credential: unconfigured`); **panelden** yapılır. |

**Sonuç:** 301 "dizine eklenmedi" kovasının **299'u (%99) beklenen/istenen**. Gerçek iş:
**P0** (§77) + **P1** (kopya katalog, Tur 9) + **P2** (otorite, §79).

### §76. Gerçek bulgu envanteri — kod tarafı (P0–P2)

| ID | Bulgu | Sınıf | Önem | Durum | Kanıt |
|---|---|---|---|---|---|
| **T11-1** | Googlebot `force-dynamic` sayfalarda canonical'ı **`<head>` yerine `<body>`**'de alıyor → Google canonical'ı **yok sayar** | **CONFIRMED** | **P0** | **Düzeltildi (kod)** | §77: Next kaynağı + canlı 3/12 body; fix `next.config.ts` |
| T11-2 | `verify-indexing` canonical'ın **değerini** ölçüyor, **konumunu** (head/body) ölçmüyordu → denetçi yeşilken P0 görünmez | **CONFIRMED** | P2 | **Düzeltildi (kod)** | §78: `canonicalInHead` + `checkPages` kapısı + testler |
| T9-1 | Katalog **%100 kaynak sitesinden kopya** → özgün sinyal yok | **CONFIRMED** | P1 | Açık (onay ister) | §51: kaynak gövdeyle kelime-ikili kapsaması %100 |
| T9-2 | Kaynakta **kalkmış (bayat)** ilanlar | **CONFIRMED** | P2 | Açık | §53 |
| T8-1 | Alan adı **çok yeni** (~54 gün) + otorite yok → yeni-alan-adı "sandbox"ı | **CONFIRMED** | P2 | Zaman+içerik işi | §47 RDAP 2026-09-19 |
| T8-2 | Backlink/otorite profili zayıf | **LIKELY** | P2 | Ölçülmedi | §49 (Ahrefs/Semrush yok) |
| T12-1 | **Genel arama, GitHub profilini ve `vercel.app` aynasını site önüne koyuyor** | **CONFIRMED** | P2 | Açık (yeni) | §79 |
| T11-3 | `/jobs` başlık yazım hatası: **"Münhaller"** (Türkçe kelime değil) | **CONFIRMED** | P3 | **Düzeltildi (kod)** | §80 |
| T11-4 | Çıplak `/is-ilanlari`, `/is-turleri` **404** (hub sayfası yok) | **CONFIRMED** | P3 | Tasarım (bilinçli) | Canlı: ikisi de 404; yalnız `/[district]`, `/[type]` var |
| T11-7 | İş ilanı sayfalarında "hreflang boşluğu" | **FALSE POSITIVE** | — | Kapatıldı | §73: body'deki `hrefLang` = dil menüsü `<a>` |
| T11-6 | Canlı deployment `main`'in gerisinde | **NOT A DEFECT** | — | Kapatıldı | `f5367cb` = origin/main |
| T11-8 | GA4 ölçüm eksik | **NOT A DEFECT** | — | Kapatıldı | `G-HNM3KEX9VD` prod chunk'ta |

### §77. P0 kapanışı — Googlebot `<head>` metadata'sını kaybediyor (yeniden doğrulandı)

**Kaynak (CONFIRMED):** Next'in `shouldServeStreamingMetadata(ua, htmlLimitedBots)` fonksiyonu,
UA `htmlLimitedBots` desenine uyuyorsa metadata'yı **bloklayarak** `<head>`'e basar; uymuyorsa
**streaming** yapar ve React'in hoist etmesini bekler. Next'in **varsayılan** deseni
`/[\w-]+-Google|Google-[\w-]+|…/i` **`Google-*` servis crawler'larını** yakalar ama **düz
`Googlebot`'u yakalamaz** (`next/dist/shared/lib/router/utils/is-bot.js` bunu bilerek yapar:
"Only the main Googlebot search crawler executes JavaScript"). Sonuç: `force-dynamic` sayfalarda
`generateMetadata` asenkron çözülür ve etiketler **aralıklı olarak `</head>`'ten sonra**,
üst düzey `<body>` çocuğu olarak kalır. Google `rel="canonical"`'i **yalnızca `<head>` içinde**
kabul eder.

**Canlı yeniden ölçüm (2026-11-12, `curl`, Googlebot UA):**

| URL | `<head>`'de canonical | `<body>`'de canonical | Oran |
|---|---:|---:|---|
| `/is-ilanlari/girne` (12 fetch) | 9 | **3** | **%25 body** |
| `/is-ilanlari/girne` (6 fetch, tur 12 kapanış teyidi) | 3 | **3** | **%50 body** |
| `/jobs` (10 fetch) | 10 | 0 | kararlı |
| `/` (10 fetch) | 10 | 0 | kararlı |

`/is-ilanlari/girne` = `export const dynamic = "force-dynamic"` (facet sayfası) → yarış
**canlı olarak sürüyor**; `/` ve `/jobs` bu turda kararlı çıktı (yarış olasılıksal, sayfaya ve
ana bağlı). **Herhangi** bir oran P0'dır: Googlebot sayfayı **tek kez** çeker.

**Düzeltme (uygulandı, `next.config.ts`):** Next 16'nın varsayılan `htmlLimitedBots` listesi
**birebir** korunup sonuna **`Googlebot`** eklendi → ana Googlebot artık **bloklayan** metadata
alır, canonical **her zaman** `<head>`'de. Yalnız **bir** crawler hedeflenir; gerçek tarayıcılar
ve diğer botlar streaming'e devam eder (TTFB etkilenmez).

**Deploy sonrası kabul kriteri** (fix canlıya çıkınca 6/6 `<head>` vermeli):
```bash
for i in $(seq 1 6); do
  curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
    https://isbulkktc.com/is-ilanlari/girne \
    | sed -n 's/.*<head[^>]*>\(.*\)<\/head>.*/\1/p' | grep -c 'rel="canonical"'
done
```

### §78. T11-2 kapanışı — denetçi artık canonical'ın **konumunu** da ölçüyor

`scripts/verify-indexing.mjs`'e **`canonicalInHead(html)`** (saf, test edilebilir) eklendi;
`checkPages` artık örneklediği her sayfada canonical'ın `<head>` içinde olduğunu da doğrular.
Canonical'ın **değeri** doğru ama **konumu** yanlışsa (tam olarak P0'ın kendisi) artık
`fail pages` verir. `findCanonical`, tam etiketi döndüren yeni **`findCanonicalTag`** üzerinden
yazıldı (davranış aynı). Testler: `canonicalInHead` (head/body/belirsiz), `findCanonicalTag`.
Böylece fix **deploy edilmeden** bile `npm run indexing:verify` bu kusuru **yakalar**.

### §79. Yeni bulgu T12-1 — genel arama GitHub profilini ve `vercel.app` aynasını öne koyuyor

**CONFIRMED · P2 · yeni.** Kullanıcının şikayeti ("GitHub proje dosyası bile sergileniyor ama
website sayfaları asla") bu turda **canlı kanıtla** doğrulandı:

| Varlık | Host | Google'ın gördüğü | Neden öne geçiyor |
|---|---|---|---|
| **GitHub repo** | `github.com/LBCron/isbulkktc` (public) | repo **public**, `homepage = isbulkktc-amber.vercel.app` | GitHub **kök alan adı** yüksek otorite; repo metadata'sı siteyi temsil ediyor |
| **Vercel ayna** | `isbulkktc-amber.vercel.app` | **200**, `<link rel="canonical" href="https://isbulkktc.com">` | Aynı içerik, canonical ile **doğru** birleşiyor (hata yok) — ama **ikinci bir host** Google'a sunuluyor |
| **Asıl site** | `isbulkktc.com` | canonical doğru (fix sonrası `<head>`'de) | Yeni alan adı → düşük otorite |

- **İkinci public repo:** `cenkmenk71-max/isbulkktc` — `homepage = https://isbulkktc.com`.
- **`vercel.app` aynası kusur DEĞİL:** canonical'ı `isbulkktc.com`'a veriyor, yani doğru
  birleşiyor. **Ama** iki public GitHub repo + bir ikinci canlı host, marka sorgusunda
  **isbulkktc.com dışındaki** yüzeyleri besliyor — "site değil, GitHub çıkıyor" algısının
  mekanizması budur.
- **Düzeltilebilir kaldıraçlar (onay ister):** (1) public repo'ların **description/homepage**
  alanını **`https://isbulkktc.com`** yapıp site adını öne çıkarmak; (2) `isbulkktc-amber.vercel.app`
  için Vercel'de **`X-Robots-Tag: noindex`** veya deployment protection → ayna host indeksten
  çıkar, tek kanonik host kalır; (3) marka otoritesi için **tutarlı NAP + backlink** (P2, §8).
- **Sınır:** Google'ın bu turda hangi sonucu gösterdiği **birebir ölçülmedi** (arama tarayıcıyla
  teyit edilemedi — §49'daki kanıt boşluğu); bu bulgu **varlık envanteri** kanıtına dayanır.

### §80. P3 kapanışı — `/jobs` başlık yazım hatası düzeltildi

`src/messages/tr.json` → `JobsMeta.title`: **"KKTC Güncel Münhaller"** (Münhaller = Türkçe
kelime değil) → **"KKTC Güncel İş İlanları"**. E2E beklentisi (`tests/e2e/jobs.spec.ts`)
güncellendi; `src/i18n/message-catalogs.test.ts`'e **nüks koruması** eklendi (başlık
"Münhaller" içeremez ve iş ilanı adını içermeli). Deploy sonrası canlı başlık:
`KKTC Güncel İş İlanları · İşBul KKTC`.

### §81. Doğrulama (bu tur, yerel)

```
npm run test:unit        → 1089/1089 pass (yeni: 4 bot testi + 2 verify-indexing + 1 mesaj koruması)
npm run typecheck        → temiz
npm run lint             → temiz
npm run check:frontend-source → 41 design token, 6-locale routing — pass
NEXT_PUBLIC_APP_URL=https://isbulkktc.com NEXT_DIST_DIR=.next-seo-verify npx next build → başarılı (BUILD_EXIT=0)
```

**Not — prod build `NEXT_PUBLIC_APP_URL` ister:** ilk koşu env olmadan `/.well-known/security.txt`
prerender'ında `getAppBaseUrl()` throw'uyla **başarısız** oldu (`NEXT_PUBLIC_APP_URL (or APP_URL)
must be configured in production`). Bu bir kusur değil, `src/server/config/app-url.ts`'in bilinçli
"yüksek sesle başarısız ol" davranışıdır (yoksa `localhost` canonical'ları yayardı); Vercel bu
değişkeni sağlar. Yerel prod-build doğrulaması **her zaman** `NEXT_PUBLIC_APP_URL` ile koşulmalı.

### §82. Kapsam sınırı / yanlış-pozitif riski

- **P0 fix bu turda DEPLOY EDİLMEDİ.** Canlı hâlâ `f5367cb` (fix öncesi); §77 kabul kriteri
  deploy sonrası koşulmalı. Fix, gerçek tarayıcı/curl/GPTBot için TTFB'yi **etkilemez**.
- **Oran kesin değil, aralık:** ölçülen body-oranı ~%25–%50 (tur 11: 2/6 + 6/12; tur 12: 3/12).
  Olasılıksal bir yarış — ama tek çekim yeter.
- **"Tek başına sıralamayı açar" DENMEZ:** T8 (otorite) + T9 (kopya) da etkendir; P0 **üçüncü ve
  düzeltilebilir** teknik engeldir.
- **T12-1 varlık envanteridir**, Google'ın gösterdiği birebir sonuç değil (§79 sınırı).
- **`/is-ilanlari`, `/is-turleri` 404'ü kusur değil:** hub sayfası **bilinçli yok**; iç bağlantılar
  `/[district]` ve `/[type]` alt yollarına gider. İstenirse P3 "facet hub" sayfası eklenebilir
  (onay ister).


---

## EK — Tur 13: P0 düzeltmesi **deploy edilmedi** + Tur 12 artıklarının kapanışı (2026-11-12)

> Bu ek §1–§82'ye **eklenir**. Girdi: **yerel git durumu** + **canlı yeniden ölçüm**
> (Googlebot UA, `curl`) + GitHub API (repo metadata ve kimlik yetkisi). Amaç: Tur 12'de
> "düzeltildi" denen P0'ın **canlıya çıkıp çıkmadığını** kesinleştirmek ve Tur 12'den
> devreden üç artığı (kaynak linki önerisi, `vercel.app` aynası, GitHub metadata) kapatmak.

### §83. P0 düzeltmesi **commit'lendi ama DEPLOY EDİLMEDİ** (yeni, P0-OPERASYONEL)

**CONFIRMED · P0-OPERASYONEL · BLOCKED (yetki bekliyor).** Tur 12'de P0 için yazılan kod
düzeltmesi (`next.config.ts` `htmlLimitedBots` regex'ine `Googlebot`) **yerel `main`'de
commit'li** (`deec7c5`) ama **hiçbir remote branch'e gönderilmedi**. Bu turda birebir ölçüldü:

| Kontrol | Değer |
|---|---|
| Yerel `HEAD` | `deec7c5` (fix) |
| `origin/main` | `f5367cb` (fix YOK) |
| `git rev-list --left-right --count origin/main...HEAD` | `0  1` → **1 commit ileride, push edilmemiş** |
| `git branch -r --contains deec7c5` | **boş** → hiçbir remote'ta değil |
| Canlı `https://isbulkktc.com/api/build-info` | `{"commit":"f5367cb…"}` → prod **fix'siz** |

**Sonuç:** §77'de tanımlanan P0 yarışı **canlıda hâlâ aktif**. Bu turda Googlebot UA ile
`/is-ilanlari/girne` 12 kez çekildi (canlı, fix öncesi build):

```
/is-ilanlari/girne -> head=8 body=4 none=0 (n=12)   ← %33 canonical <body>'de
/jobs              -> head=8 body=0 none=0 (n=8)
/                  -> head=6 body=0 none=0 (n=6)
```

Yani düzeltmenin kabul kriteri (§77: 6/6 `<head>`) **canlıda hâlâ BAŞARISIZ**. Fix'in kendi
testleri yerelde **yeşil** (38/38: `scripts/next-config-bots.test.mjs` +
`scripts/verify-indexing.test.mjs`), yani iş **bitti ama yayınlanmadı**.

**Neden deploy edilmedi (BLOCKED):** depo `origin = cenkmenk71-max/isbulkktc` ve **`main`'e her
push, Vercel Git entegrasyonuyla production'ı otomatik yayınlar**
(`.github/workflows/verify-production-deployment.yml` bu mekanizmayı doğrular). Bu, "kullanıcı
açıkça istemedikçe `main`'e push etme" kuralına girer. `git push --dry-run origin main`
**başarılı** (teknik engel yok, yetki var) ama anlamı **production'a yayın** → **açık onay
gerekir**. `gh auth` kimliği (`orijinus1997-sudo`) her iki repo'da yalnız `pull:true` verir,
`gh pr create` **çalışmaz** → "PR aç, sahip merge etsin" alternatifi de kapalı.

**Onaylanırsa yapılacak (tek komut):**
```bash
git push origin main        # deec7c5 → origin/main → Vercel main'i yayınlar
# sonra §77 kabul kriteri: /is-ilanlari/girne 6/6 head olmalı
```

### §84. T12-1 kaldıraç 2 — `vercel.app` aynası **zaten noindex** (kapandı)

§79'da "onay ister" olarak açık bırakılan 2. kaldıraç bu turda **zaten uygulanmış ve canlı**
bulundu. `next.config.ts` `headers()` içinde `host = .*\.vercel\.app` için
`X-Robots-Tag: noindex, nofollow` kuralı var (commit `613dec0`, "noindex the Vercel deployment
aliases"). Canlı kanıt:

```
curl -sI https://isbulkktc-amber.vercel.app/ | grep -i x-robots-tag
→ x-robots-tag: noindex, nofollow
```

İkinci host Google'a **açıkça noindex** diyor; canonical da apex'e gidiyor → **çift host sorunu
kapanmış**. §79'daki "onay ister (2)" maddesi **artık geçersiz**.

### §85. T12-1 kaldıraç 1 — GitHub repo metadata **düzeltilemedi (BLOCKED, yetki yok)**

`LBCron/isbulkktc` (public) `homepage` alanı **hâlâ** aynayı gösteriyor
(`https://isbulkktc-amber.vercel.app`; o ayna artık noindex). İdeal: `https://isbulkktc.com`.
Ancak bu sandbox'ın GitHub kimliği (`orijinus1997-sudo`) her iki repo'da da yalnız
`permissions: {pull: true}` — **admin/push yok** → description/homepage **güncellenemedi**:

| Repo | description | homepage | Kimlik yetkisi |
|---|---|---|---|
| `LBCron/isbulkktc` | (boş) | `https://isbulkktc-amber.vercel.app` | `pull` → **düzenlenemez** |
| `cenkmenk71-max/isbulkktc` | (boş) | `https://isbulkktc.com` (**doğru**) | `pull` → **düzenlenemez** |

**Aksiyon (repo sahibi):** `LBCron/isbulkktc` → Settings → homepage = `https://isbulkktc.com`,
description = "KKTC iş ve kariyer platformu — isbulkktc.com". İkinci repo zaten doğru.

### §86. T12-5 — "kaynak linki + `isBasedOn`" önerisi **NOT APPLICABLE (bilinçli tasarım)**

Tur 12'den devreden "iş ilanına görünür kaynak linki + `isBasedOn` ekle" önerisi **reddedildi**;
gerekçe iki bağımsız kanıt:

1. **Ürün kararı + test kilidi:** commit `8f0a753` ("stop sending visitors to competitors, and
   rewrite imported copy") kaynak-site linklerini **bilerek** kaldırdı; `tests/e2e/jobs.spec.ts`
   bunu **zorunlu kılıyor** (`aside.jobs-source-note` = 0; `a[href="https://www.iskibris.com/jobs"]`
   ve `a[href="https://isbulkibris.com/jobs"]` = 0). Yeniden eklemek, sahibin bilinçli kararını
   **test-kırıcı** biçimde geri almak (rakip ilana trafik sızdırmak) olurdu.
2. **Şema geçersizliği:** `schema:JobPosting` → `rdfs:subClassOf schema:Intangible`
   (**CreativeWork DEĞİL**); `isBasedOn` → `domainIncludes: schema:CreativeWork`. Yani
   `isBasedOn` **JobPosting için geçerli/belgelenmiş bir özellik değil**; Google'ın JobPosting
   belgelerinde de **yok** (mevcut ve doğru olanlar: `sameAs`, `identifier`, `directApply` —
   üçü de zaten `job-posting-structured-data.ts` içinde kullanımda).

**Sonuç:** Öneri ne gerekli ne geçerli → **NOT APPLICABLE**. Mevcut yapı korunur.

### §87. T12-6 — P3 başlık düzeltmesi **canlıda hâlâ eski** (deploy bekliyor)

`/jobs` canlı başlığı hâlâ **`KKTC Güncel Münhaller · İşBul KKTC`** — çünkü düzeltme `deec7c5`
içinde ve **deploy edilmedi** (§83). Doğru başlık `KKTC Güncel İş İlanları · İşBul KKTC`,
`deec7c5` yayınlanınca geçerli olur. §83 ile **aynı tek deploy** ile kapanır.

### §88. T12-7 — apex'te kazara site-geneli `noindex` YOK (NOT A DEFECT)

`vercel.app` noindex kuralının apex'e sızma riski kontrol edildi:

```
curl -sI https://isbulkktc.com/jobs | grep -i x-robots-tag   → (yok)
```

Apex'te `X-Robots-Tag` **yok**; `www`→apex **308** canlı; `/tr`→`/` **308** canlı;
`/en/jobs` canonical = kendisi (200). Yani noindex yalnız aynayı hedefliyor, **doğru**.

### §89. Tur 13 — nihai durum tablosu (tek bakışta)

| ID | Bulgu | Sınıf | Önem | Durum | Kanıt |
|---|---|---|---|---|---|
| **T11-1 / T12-2** | Googlebot canonical'ı `<body>`'de; **fix commit'li ama deploy edilmedi** | **CONFIRMED** | **P0** | **BLOCKED — onay bekliyor** | §83: canlı body=4/12; `deec7c5` push edilmemiş |
| T12-3 | `vercel.app` aynası noindex | **CONFIRMED** | P2 | **Kapandı (zaten canlı)** | §84: `X-Robots-Tag: noindex, nofollow` |
| T12-4 | GitHub repo `homepage` aynayı gösteriyor | **CONFIRMED** | P2 | **BLOCKED — yetki yok** | §85: `permissions.pull=true` |
| T12-5 | Kaynak linki + `isBasedOn` önerisi | **NOT APPLICABLE** | — | Bilinçli tasarım + şema dışı | §86: `8f0a753` + E2E kilidi; `isBasedOn`≠JobPosting |
| T12-6 | `/jobs` başlığı canlıda "Münhaller" | **CONFIRMED** | P3 | **Deploy bekliyor** | §87: canlı `<title>` hâlâ eski |
| T12-7 | Apex site-geneli noindex riski | **NOT A DEFECT** | — | Kapandı | §88: apex'te `X-Robots-Tag` yok |
| T9-1 / T9-2 / T8-1 / T8-2 | Kopya katalog, bayat ilan, yeni alan adı, zayıf otorite | **CONFIRMED / LIKELY** | P1–P2 | Açık (içerik + zaman) | §51 / §53 / §47 / §49 |

### §90. Tur 13 — tek cümle ve onay isteyen işler

**Tek cümle:** Teknik olarak kalan **tek P0**, Googlebot'un canonical'ı `<head>`'de
kaybetmesidir; düzeltme **yazıldı, test edildi ve commit'lendi** (`deec7c5`) ama
**production'a gönderilmedi**, bu yüzden yarış **canlıda sürüyor** (ölçüm: %33 body) — deploy
onayı bekliyor.

**Açık onay isteyen işler (öncelik sırası):**

1. **[P0] `git push origin main`** → `deec7c5` yayınlanır (Vercel `main`'i otomatik deploy eder).
   Sonra §77 kabul kriteri koşulur. Bu, "site çıkmıyor" şikayetinin **en somut teknik engelini**
   kaldırır.
2. **[P2] GitHub `LBCron/isbulkktc` homepage** → `https://isbulkktc.com` (repo sahibi; §85).
3. **[P1] Özgün içerik** (kopya katalog, Tur 9) ve **[P2] otorite** (backlink/NAP, Tur 8) —
   içerik + zaman işi; P0/P1 teknik düzeltmeler **tek başına sıralamayı açmaz**.
4. **[P2] GSC paneli**: P0 fix deploy edildikten **sonra** "Validate fix" + öncelikli URL'ler için
   "Request indexing" (OAuth yok → **panelden**; §75).

**Kapsam sınırı:** `deec7c5`'in prod build'i yerel olarak `NEXT_PUBLIC_APP_URL` ile **başarılı**
(§81); yine de asıl kanıt **deploy sonrası canlı ölçümdür** (§77). T12-4 yetki nedeniyle
**dışarıdan doğrulanamaz**; T12-5 **koda dokunulmadan** kapandı.
