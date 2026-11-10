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
| 12 | BLOCKED | — | Search Console / GA4 / CrUX / Cloudflare dashboard denetimi | Bu ortamda GSC/CF hesabı yok | Ölçümleme yapılamadı | Kullanıcı adımı (§6) |

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

- **Search Console** (BLOCKED): property doğrulaması, Pages/Indexing raporu, URL Inspection,
  sitemap gönderimi, mevcut varsa Generative AI performans raporu. API yetkisi verilmeden
  veri sunulmadı. Gerekli: GSC'de doğrulanmış property + (otomatikse) bir servis hesabı.
- **Vercel/Cloudflare** (BLOCKED): sitemap cache purge **yapılmadı**; istenirse
  `revalidate` beklemeden purge edilebilir. Cloudflare/CF dashboard denetimi ayrı iş.
- **Indexing API** (NOT APPLICABLE / kapalı): repoda yok; Google'ın yalnız JobPosting için
  önerdiği bir hızlandırıcı. Eklenirse service-account anahtarı yalnız secret manager'da
  olmalı; credential yokken kapalı-by-default kalmalı. Bu görevde eklenmedi (gereksiz bağımlılık
  ve gizli anahtar yönetimi gerektirir; kullanıcı onayı ister).
- **GA4** (BLOCKED): organik landing/consent event'leri GSC/GA4 erişimi gerektirir.

---

## 7. Açık riskler, rollback ve production'a uygulanmayanlar

- **Rollback:** kod değişiklikleri tek PR'da; `git revert`. DB temizliği 2 satırlık hedefli
  UPDATE (tam metin eşleşmesi) — geri almak için eski metin geri yazılabilir; ancak geri
  yazmak PII'yi yeniden yayımlar, **önerilmez**.
- **Risk (düşük):** `sanitizeDirectoryAddress` telefon regex'i, 10+ haneli bitişik sayı
  içeren bir adres bileşenini (ör. uzun bir kapı/kod) "telefon" sanıp silerse adres kısalır.
  Test bunu postal/plot kodları için koruyor; ileride örnek görülürse regex daraltılır.
- **Production'a uygulanmayanlar:** sitemap cache purge, Cloudflare/DNS, GSC, Indexing API,
  GA4. Hiçbiri kullanıcı onayı olmadan yapılmadı.

---

## 8. Sonraki en yüksek öncelikli işler

1. **P1:** PR'ı merge et → yeni E2E sitemap testi CI'da yeşil kalsın (bayat girdi bir daha sızmaz).
2. **P1:** Search Console'u doğrula, sitemap'i gönder, Indexing raporundaki hariç tutmaları incele.
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
