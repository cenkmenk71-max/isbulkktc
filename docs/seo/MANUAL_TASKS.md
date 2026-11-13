# Manuel Yapılacaklar — harici platformlar

Bu dosya, **repo dışında** yapılması gereken ve bu ortamdan erişilemeyen/uygun olmayan
işleri listeler. Kod tarafı tamamlandı; aşağıdakileri son olarak elle yapacaksın.

Son güncelleme: 2026-11-12. Hedef: `https://isbulkktc.com`.

---

## 1. ✅ TAMAM — DNSSEC aktif (elle iş YOK)

**Durum: yayında ve doğrulanıyor.** Alan adı **Cloudflare Registrar'da** kayıtlı
(RDAP: `registrar = Cloudflare, Inc.`), bu yüzden DNSSEC açıldığında Cloudflare DS kaydını
registry'ye **otomatik** yayınlıyor — ayrı bir registrar adımı gerekmiyor.

Doğrulandı (2026-11-03, üç bağımsız kaynak):

| Kaynak | Sonuç |
|---|---|
| Cloudflare API `/dnssec` | `status: active` |
| Cloudflare DoH (`DS isbulkktc.com`) | DS döndü, **`AD: true`** (doğrulanmış) |
| Google DoH (`DS isbulkktc.com`) | DS döndü, **`AD: true`** |
| Registry RDAP (Verisign + rdap.org) | `delegationSigned: true`, DS yayınlanmış |
| DNSKEY | 2 kayıt yayında, `AD: true` |

Yayınlanan DS kaydı (bilgi amaçlı):
```
isbulkktc.com. 3600 IN DS 2371 13 2 36E054F2B3F7EC415B0BE85C8CB301DBB439CF7FA010AE82AAE106C3C583775B
```

> Not: Denetimin ilk anında Cloudflare API `pending` dönüyordu ve DS registry'de henüz
> görünmüyordu — bu, yayılımın ortasıydı. Kısa süre sonra `active` oldu ve DS registry'ye
> yayıldı. **Kullanıcı adımı gerekmiyor.**

---

## 2. ✅ Search Console (Google) — doğrulama + sitemap + denetim

**Durum:** DOĞRULANDI (2026-11-12, canlı API koşusu). Property `sc-domain:isbulkktc.com`
**siteOwner** erişiminde; sitemap gönderilmiş ve Google indirmiş; örnek URL'ler
"Submitted and indexed"; canonical uyuşuyor. Artık okuma **elle dashboard'a bağlı değil**:
`scripts/verify-search-console.mjs` Google'ın kendi API'sinden okuyor.

```bash
npm run search-console:verify
```

Site sahipliği **iki yolla** zaten kanıtlanmış durumda (kod hazır):
- Meta etiketi yayında: `<meta name="google-site-verification" content="1zuidCsJ2y0GCfp_g-AmsYuagg_fIDDCo36POZr0wSM">`
- DNS TXT kaydı mevcut: `google-site-verification=7YbjG-3INgSrdkIKFG0inLGNgD0BX4P8mf1oIDtJehU`
  (CF DNS'te.)

**Canlı ölçüm (2026-11-12):**
```
PASS properties  sc-domain:isbulkktc.com (siteOwner); 1 propert(y/ies) readable
PASS sitemaps    1 sitemap(s), 207 submitted URL(s), last downloaded 2026-11-12T12:56:40Z
PASS inspect     / — Submitted and indexed; canonical https://isbulkktc.com/
INFO analytics   100 quer(y/ies) in the last 28 day(s): 23 click(s), 266 impression(s), CTR 8.6%
0 failure(s)
```

**Kalan (dashboard'da gözle, API dışı):**
1. **Manual actions** ve **Security issues** → boş olmalı (API bunları okumaz).
2. **Generative AI performance** raporu bu property için açıksa ölçüme ekle.
3. `/is-ilanlari/lefke` gibi yeni şehir sayfaları henüz "Discovered - currently not
   indexed" olabilir — bu normaldir; aracı Indexing API (§6), kırmızı build değil.

> Not: `site:` sorgusu yalnızca kaba bir sinyaldir; gerçek indeks durumu URL Inspection ve
> Pages raporundan doğrulanır. Ayrıntı: `docs/runbooks/search-console-indexing.md`.

---

## 3. 🟡 GA4 — doğrulama + ölçümleme

**Durum:** BLOCKED. `NEXT_PUBLIC_GA_MEASUREMENT_ID` Vercel'de tanımlı (production+preview),
kod consent-gate ile çalışıyor.

**Yapılacak:** GA4'te organic landing page ve dönüşüm (başvuru, kayıt) event'lerini gözden
geçir; consent (çerez onayı) koşullarının korunduğunu doğrula. Gizlilik politikasıyla tutarlı
kalmalı.

---

## 3b. 🟡 GA4 — dönüşümleri "conversion" olarak işaretle

Kod artık dört iş dönüşümünü GA4'e gönderiyor (`sign_up`, `apply_to_job`,
`company_registered`, `sales_lead`). Bunların raporlarda **dönüşüm** sayılması için
GA4 arayüzünde bir kez işaretlenmeleri gerekir:

1. GA4 → **Admin → Events** (Events bölümü).
2. Listede `sign_up`, `apply_to_job`, `company_registered`, `sales_lead` görünene kadar bekleyin.
   Event'ler yalnızca ilgili akış **ilk kez** gerçekleştiğinde listeye düşer; hiç kimse
   kayıt/başvuru yapmadıysa görünmezler. Doğrulamak için `?ga_debug=1` ile DebugView kullanın.
3. Her birinin yanındaki **"Mark as conversion"** anahtarını açın.
4. İsteğe bağlı: **Admin → Conversions**'tan öncelik sırası verin (ör. `apply_to_job` en üst).
5. Sonuç: **Reports → Engagement → Conversions** ve **Advertising → Attribution** raporlarında
   hangi kanaldan gelen kaç kişinin kayıt/başvuru yaptığını görürsünüz.

> Not: `sign_up` GA4'ün önerilen adıdır; diğer üçü özel addır ve **işaretlenmeden**
> dönüşüm sayılmaz. Event adları kodda sabittir (`src/lib/analytics/conversion.ts`).

---

## 4. 🟡 Vercel — eksik doğrulama env değişkenleri (opsiyonel)

**Durum:** Kod hazır, değerler yok.
- `NEXT_PUBLIC_BING_SITE_VERIFICATION` — Vercel'de **yok** (kontrol edildi).
- `NEXT_PUBLIC_YANDEX_SITE_VERIFICATION` — Vercel'de **yok**.
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` — **var** (yayında).

**Yapılacak (istenirse):** Bing Webmaster Tools ve Yandex Webmaster'dan doğrulama kodlarını al,
Vercel → Settings → Environment Variables'a (production+preview) ekle, yeniden deploy et.
Kod bunları otomatik `<meta>` olarak yayınlar (`src/app/[locale]/layout.tsx`).

> Not: `www.isbulkktc.com` Vercel'de `isbulkktc.com`'a redirect'li (doğrulandı); apex + www
> tek hop kanonik hedefe gidiyor. Değişiklik gerekmiyor.

---

## 5. 🟢 Cloudflare — DENETLENDİ, değişiklik GEREKMİYOR

Bu ortamdan CF API ile tam denetim yapıldı (token yazma yetkisine sahip, doğrulandı).
**Yapılandırma doğru; yıkıcı değişiklik yapılmadı** (CF kuralı: onay önce).

Doğrulananlar:
- **DNS:** `A isbulkktc.com → 76.76.21.21` (proxied), `www` → `cname.vercel-dns.com` (proxied),
  CAA (pki.goog + letsencrypt), MX (Cloudflare email routing), SPF/DKIM/DMARC mevcut.
- **SSL/TLS:** `ssl = strict`, `min_tls_version = 1.2`, `tls_1_3 = on`,
  `always_use_https = on`, HSTS (`max-age=31536000; includeSubDomains; preload`).
- **WAF:** Custom 5 kural + Managed Free Ruleset (38 kural). Negatif test:
  **9 saldırı yolu → 403**, **17 meşru yol → 200**. Sitemap/robots için crawler skip kuralı var.
- **Rate limit:** 1 kural — auth brute-force koruması (login/register/reset POST) — doğru yere harcanmış.
- **Bot Fight Mode:** **AÇIK** (`fight_mode: true`). Bilinçli güvenlik tercihi. Googlebot/Bingbot/
  YandexBot/GPTBot/ClaudeBot/PerplexityBot UA'ları **200** alıyor. GH runner egress'i engellenir —
  bu yüzden `push-dispatch` Vercel alias'ını kullanacak şekilde düzeltildi (kod tarafı, PR #74).
  **Değiştirme.**
- **Cache:** dinamik HTML `private, no-cache, no-store`; yalnız `robots.txt` ve görseller edge-cached.
  `/sitemap.xml` `public, max-age=3600` (ISR revalidate ile uyumlu). Doğru.
- **Email obfuscation:** `on` (destek e-postası CF tarafından gizleniyor). Doğru.

**CF ile ilgili açık iş yok.** DNSSEC de tamam (§1).

> **Güncelleme (2026-11-12):** DMARC zaten `p=reject`'e çekildi (Cloudflare DNS,
> hizalı gönderim teyit edildi) ve MTA-STS/TLS-RPT kayıtları CF API ile eklendi.
> Bu turda CF API yeniden yazma için kullanıldı: `_dmarc` TXT `p=reject`, yeni
> `mta-sts` CNAME (proxy kapalı) + `_mta-sts`/`_smtp._tls` TXT. Ayrıntı:
> `docs/runbooks/email-deliverability.md` §6–§7.

---

## 6. ✅ Google Cloud — Indexing API (entegre edildi)

**Durum:** **ENTEGRE** (2026-11-12). `scripts/submit-indexing.mjs` sitemap'teki
`/jobs/<slug>` sayfalarını günlük olarak Indexing API'ye bildirir; zamanlanmış iş
`.github/workflows/submit-indexing.yml`. Google bu API'yi yalnız **JobPosting**
(ve BroadcastEvent) için belgeliyor — araç başka hiçbir URL'e kota harcamaz.

```bash
npm run indexing:submit -- --dry-run   # ne bildirileceğini göster
npm run indexing:submit                # bildir (Actions ile aynı iş)
```

**Canlı ölçüm (2026-11-12):** sitemap'teki 207 girdiden 21 JobPosting URL'i seçildi →
`Notified 21/21 job URL(s).` → `EXIT 0`. Bir ilan detayı (`/jobs/<slug>`) sonrasında
Google'da "Submitted and indexed" oldu (önce bilinmiyordu).

**Kimlik bilgisi:** servis-account JSON yerine **OAuth refresh token** kullanılıyor
(`GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN`), çünkü Indexing API
service-account'u kabul etmez. Anahtarlar yalnız GitHub Actions secret'larında; credential
yokken iş **yeşil kalır ve `::warning` basar** (kapalı-by-default).

**Sahibin yapması gereken (bir kez):** Google Cloud'da Indexing + Search Console API'yi
etkinleştir, OAuth consent scope'larını ekle, Desktop client oluştur, refresh token üret,
üç secret'ı Actions'a ekle. Adım adım:
`docs/runbooks/search-console-indexing.md` (§ "Sahibin yapması gereken").

---

## 7. 🟡 GA4 — kod hazır, ölçüm ID'si üretimde EKSİK (2026-11-12 bulgusu)

Site tarafı **consent-gated** GA4 içeriyor ve GDPR uyumlu:
`src/components/analytics/google-analytics.tsx` — consent-mode varsayılanı **her
kategori için `denied`**, tag yalnız ziyaretçi analitik izni verince yüklenir
(`analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`).
Çerez paneli + geri çekme butonu (`ManageConsentButton`) mevcut.

**Eksik olan tek şey ölçüm kimliği:** `NEXT_PUBLIC_GA_MEASUREMENT_ID` Vercel
`production` env'inde **tanımlı değil** (20 env anahtarı denetlendi; GA/GTM yok).
Bu yüzden üretimde GA4 tag'i hiç yüklenmiyor. Yapılacak: GA4'te bir Web data
stream oluştur, `G-XXXXXXXXXX` ölçüm ID'sini Vercel'e `NEXT_PUBLIC_GA_MEASUREMENT_ID`
olarak ekle (`production`+`preview`), yeniden dağıt. Consent akışı zaten doğru;
ek kod gerekmez.

---

## 8. ⚪ İçerik/URL iyileştirmeleri (gelecekte, onay ister)

Bunlar bu denetimde "eksik" değil; mevcut mimari bilinçli olarak bunları içermiyor. Eklemek
istersen gerçek veri + özgün içerik şartıyla değerlendirilebilir:

- **Şehir/ilçe landing sayfaları** (`/jobs/lefkosa` gibi) — şu an yok; yalnızca `/jobs?district=`
  filtresi var. Yalnızca gerçek ilan verisi + diğer sayfalardan ayrışan içerik varsa üret.
- **Şirket profil detay sayfası** — şu an şirket kartları `/jobs?query=<ad>`'a gidiyor; ayrı
  profil URL'i yok. Gerçek, özgün içerikli profiller değerlendirilebilir.
- **Blog/özgün rehber** — `/blog` derleme sayfası; özgün KKTC iş piyasası rehberleri
  (kaynak + yöntem + tarih ile) yazılırsa `Article` schema eklenebilir.

---

## Özet — kullanıcı yapılacakları

| # | Platform | İş | Öncelik |
|---|---|---|---|
| 1 | Registrar | DNSSEC — **zaten aktif**, elle iş yok (§1) | ✅ Tamam |
| 2 | Search Console | Doğrula, sitemap gönder, Pages/Inspection denetle | ✅ Doğrulandı (§2) |
| 3 | GA4 | Organic + consent ölçümü gözden geçir | 🟡 Önerilir — **ölçüm ID'si üretim env'inde yok** (§7) |
| 4 | Vercel | Bing/Yandex doğrulama env (opsiyonel) | 🟡 Opsiyonel |
| 5 | Cloudflare | Denetlendi — **iş yok** | 🟢 Tamam |
| 6 | Google Cloud | Indexing API — **entegre edildi** (§6) | ✅ Tamam |
| 7 | E-posta | DMARC `p=reject` + MTA-STS/TLS-RPT | ✅ Tamam (2026-11-12) |
| 8 | İçerik | Şehir/şirket sayfaları (onay ister) | ⚪ İsteğe bağlı |
| 9 | Search Console | Boş landing "Soft 404" → **Validate fix** (fix yayında; ekran-ekran §11) | 🔴 P1 — panelde, hazır |
| 10 | IndexNow | Sitemap küçülünce **yeniden ping** (otomatik, elle iş yok, §9.7) | 🟢 Otomatik |
| 11 | Search Console | "Kullanıcı seçili canonical olmadan kopya" (1 URL) → URL'yi ilet (§11.5) | 🟡 P2 — bilgi gerekli |
| 12 | Google Cloud | GSC/Indexing API OAuth secret'ları (§6) — okumayı otomatiğe bağlar | 🟡 P2 — opsiyonel |

---

## 9. 🔁 Tur 4 güncellemesi — 2026-11-03 (Coverage anlık görüntüsü)

Kullanıcı GSC **Coverage** CSV'lerini paylaştı; her kova kod + canlı `curl` kanıtıyla eşleştirildi.
Tam analiz: `SEO_IMPLEMENTATION_REPORT.md` §20–§26. **Özet:** 301 "dizine eklenmedi" kovasının
**243'ü (%81) beklenen/istenen**; yalnız **58'i** iyileştirme alanı. **Yeni kod hatası yok**; iki
gerçek düzeltme **bu turda hazır ve deploy bekliyor** (soft 404 + push hedefi).

### 9.1 🔴 P1 — Merge sonrası GSC'de "Soft 404" doğrula (elle iş)
Bu PR **merge edilince** Vercel `main`'i otomatik yayına alır. Yayın sonrası:
1. Canlı doğrula:
   ```bash
   curl -s https://isbulkktc.com/is-ilanlari/lefke | grep -o '<meta name="robots"[^>]*>'
   # beklenen: <meta name="robots" content="noindex, follow">
   curl -s https://isbulkktc.com/is-turleri/yari-zamanli | grep -o '<meta name="robots"[^>]*>'
   ```
2. GSC → **Pages → "Soft 404"** → **Validate fix** (örnek: `/en/is-ilanlari/iskele`, `/en/is-ilanlari/lefke`).
   > Fix deploy edilince bu landing'ler "noindex ile hariç tutuldu" kovasına geçer — **normal**;
   > soft 404 kovası boşalır.

### 9.2 🟡 P2 — "Kullanıcı seçili canonical olmadan kopya" (1 URL) — panelden al
Bu tek URL, Tur 3'ün 225-URL taramasında **yok**.
1. GSC → **Pages → "Duplicate without user-selected canonical"** → satırı aç, örnek **URL'yi kopyala**.
2. URL'yi iletince kod karşılığını (canonical/hreflang) doğrulayıp gerekirse en küçük düzeltmeyi yaparım.

### 9.3 🟡 P2 — "Keşfedildi / Tarandı, eklenmedi" için hızlandırma
- Sitemap'teki yeni ilan `/jobs/<slug>` URL'leri için **Request indexing** (elle) veya
  **#646** ile gelen günlük iş zaten bildiriyor: `npm run indexing:submit` /
  Actions → *Submit job URLs to Google Indexing API* (21/21 JobPosting).
- Boş landing'ler fix sonrası `noindex` olup bu kovalardan düşer.

### 9.4 ✅ #646 ile ÇÖZÜLDÜ — GSC okuma + Indexing API
Bu turdan önce "GSC erişimi yok" diye **BLOCKED** olan madde, #646 ile çözüldü:
`scripts/verify-search-console.mjs` Google'ın kendi API'sinden okuyor (`npm run search-console:verify`),
`scripts/submit-indexing.mjs` günlük JobPosting bildiriyor. Kimlik: GitHub Actions secret'ları
(`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REFRESH_TOKEN`). Runbook:
`docs/runbooks/search-console-indexing.md`.

### 9.5 ⚪ Bilgi — kova triyajı (aksiyon GEREKMEZ)
| GSC kova | Adet | Neden aksiyon yok |
|---|---:|---|
| "noindex" ile hariç tutuldu | 83 | Bilinçli tasarım (auth/dashboard). Fix deploy edilince **artacak — normal.** |
| Bulunamadı (404) | 58 | Kapanan ilan / eski URL; sitemap yalnız 200 URL yayıyor |
| Yönlendirmeli sayfa | 48 | `www`→apex, `/tr/*`→prefixsiz, trailing-slash **308** — doğru |
| Doğru standart etiketli alternatif | 31 | hreflang/canonical doğru birleşmiş (186 tam set) — sağlıklı |
| Başka 4xx ile engellendi | 23 | Güvenlik URL'leri (`/.env`, `/wp-login.php` …) → **403 + noindex** |

> **Kritik olmayan sorunlar:** CSV **boş** → işaretli sorun yok. **Site haritası:** canlıda 200,
> **207 `<loc>`**.

---

## 10. 🔁 Tur 5 güncellemesi — 2026-11-12 (sitemap ↔ noindex çelişkisi)

Bu turda **sitemap'in `noindex` dönen boş landing sayfalarını ilan etmesi** çelişkisi kapatıldı
(kod: PR #651). Tam analiz: `SEO_IMPLEMENTATION_REPORT.md` §27–§32. Özet: sitemap artık bir
ilçe/tür sayfasını yalnız **en az bir canlı ilan** varsa yayınlar; boş sayfa `200 + noindex, follow`
döner ama sitemap'ten düşer. İki sinyal tek kaynaktan türediği için bir daha çelişmez.

**Canlı kanıt (deploy öncesi, 2026-11-12):** sitemap 207 `<loc>`; boş yüzeyler
`/is-ilanlari/lefke` + `/is-turleri/{yari-zamanli,sozlesmeli,gecici}` sitemap'te duruyor ve
robots meta'sız (soft 404 adayı). Dolu yüzeyler (`/is-ilanlari/guzelyurt` 1 ilan,
`/is-turleri/tam-zamanli` 19 ilan) sitemap'te **kalmalı**.

### 10.1 🔴 P1 — Fix YAYINDA; panelde doğrula (elle, ekran-ekran rehber: §11)

PR #651 `84c8012` merge edildi ve Vercel `main`'i yayına aldı (**canlı doğrulandı, 2026-11-12**):

```bash
# 1) Boş landing artık noindex mi?
curl -s https://isbulkktc.com/is-ilanlari/lefke | grep -o '<meta name="robots"[^>]*>'
#    CANLI: <meta name="robots" content="noindex, follow"> ✅
curl -s https://isbulkktc.com/is-turleri/yari-zamanli | grep -o '<meta name="robots"[^>]*>'
#    CANLI: <meta name="robots" content="noindex, follow"> ✅

# 2) Sitemap küçüldü mü? (207 → 183)
curl -s https://isbulkktc.com/sitemap.xml | grep -c '<loc>'                    # CANLI: 183 ✅
curl -s https://isbulkktc.com/sitemap.xml | grep -c 'is-ilanlari/lefke'        # CANLI: 0 ✅

# 3) Tek komutluk sağlık kontrolü (çelişki = failure)
npm run indexing:verify
#    CANLI: 0 failure, 0 warning ✅
```

**Kalan tek adım panelde:** **GSC → Sayfalar → "Soft 404" → Düzeltmeyi doğrula.** Ayrıntılı,
ekran-ekran anlatım **§11**'de.

> Neden elle: GSC **yazma** (Validate fix, Request indexing) API'den yapılamaz; bu ortamda GSC
> OAuth kimliği de yok (`npm run search-console:verify` → `Credential: unconfigured`). Okuma ve
> JobPosting bildirimi kod tarafında otomatik (§2, §6).

### 10.2 🟢 IndexNow / sitemap ping — elle iş YOK

Boş landing'ler sitemap'ten düşünce **yeni** sitemap'ı bildirmek gerekir; bu **zaten otomatik**:
`submit-indexnow.yml` günde bir (`37 5 * * *`) canlı sitemap'i Bing/Yandex'e (IndexNow) gönderir,
`submit-indexing.yml` `/jobs/<slug>` JobPosting'lerini Google Indexing API'ye bildirir. Deploy
sonrası ek bir ping gerekmez; elle hızlandırmak istersen:

```bash
node scripts/submit-indexnow.mjs https://isbulkktc.com     # Bing/Yandex
npm run indexing:submit -- --dry-run                       # ne bildirileceğini göster
```

### 10.3 ⚪ Bilgi — bu turda değişen kovalar (aksiyon GEREKMEZ)

| GSC kova | Değişim | Neden |
|---|---|---|
| Soft 404 | **↓ ~24 → 0** | Boş landing'ler artık `noindex, follow` |
| "noindex" ile hariç tutuldu | **↑ ~24** | Aynı sayfalar bu kovaya geçer — **istenen** |
| Doğru standart etiketli alternatif / Yönlendirmeli / 4xx | **değişmez** | Bu turda dokunulmadı (§21 ile aynı) |

---

## 11. 🖱️ EKRAN-EKRAN REHBER — "Soft 404 → Düzeltmeyi doğrula" (senin yapacağın adım)

Bu, **senin tek elle adımın**. Kod tarafı bitti ve yayında; burada Google'a "sorunu düzelttim,
tekrar kontrol et" diyorsun. Toplam **~3 dakika**; Google'ın kontrolü arka planda **2 haftaya kadar**
sürebilir (beklemen gereken bir şey değil, sadece bilgi).

> **Başlamadan (10 saniye):** Gizli/incognito pencerede değil, **normal** pencerede ol;
> `info@isbulkktc.com` (ya da GSC'ye erişimi olan hesabın) ile giriş yap.

---

### Adım 0 — Panelin dili (Türkçe mi İngilizce mi?)

Google panelini İngilizce kullanıyorsan menü adları farklıdır. İkisini birlikte veriyorum:

| Türkçe panel | İngilizce panel |
|---|---|
| **Dizin oluşturma** (sol menü, bölüm başlığı) | **Indexing** |
| **Sayfalar** | **Pages** |
| **Düzeltmeyi doğrula** (buton) | **Validate fix** |
| **Ayrıntıları göster** | **Show details** (bazı sürümlerde **View details**) |

> Not: GSC bazen "Dizin oluşturma"yı sol menüde **katlanmış** tutar. Görünmüyorsa sol menünün
> **en altındaki** `⌄` / "Daha fazla" okuna bas.

---

### Adım 1 — Panelin doğru property'de olduğunu doğrula

1. Sol üstteki **mülk seçici** (domain yazan açılır liste) → tıkla.
2. **`isbulkktc.com`** (başında `sc-domain:` olan, yani **Domain** mülkü) seçili olmalı.
   - Listedeki **iki** kaydı görürsen (biri `https://…`, biri `isbulkktc.com`), **Domain** olanı seç
     (bu, hem `http/https` hem `www` varyantlarını kapsar).

### Adım 2 — Sayfalar raporunu aç

1. Sol menüden **Dizin oluşturma**'yı bul → altındaki **Sayfalar**'a tıkla.
2. Rapor açılınca üstte **iki grafik** görürsün:
   - **Dizine eklenmedi** (gri)
   - **Dizine eklenen** (yeşil)
3. Grafiğin **altında bir tablo** var. Başlığı **"Sayfaların dizine eklenmeme nedenleri"**
   (İngilizce: *Why pages aren't indexed*). **Senin aradığın satır bu tabloda.**

> **Menüde "Sayfalar" görmüyorsan:** Sol menüde **Dizin oluşturma** başlığının yanındaki oka bas;
> altında **Sayfalar** ve **Site haritaları** açılır.

### Adım 3 — "Soft 404" satırını bul ve aç

1. Tabloda satırları tara; **"Soft 404"** yazan satırı bul.
   - Satırın sağındaki **sütunlar:** `Sebep` (neden) · `Kaynak` (Web sitesi / Google) ·
     `Doğrulama` · `Sayfa sayısı`.
   - Senin CSV'nde bu satır **2 sayfa** gösteriyor.
2. **"Soft 404" satırına tıkla.**
3. Açılan **detay sayfasında**:
   - Üstte **"Düzeltmeyi doğrula"** (Validate fix) butonu.
   - Altında **örnek URL listesi** — burada `/en/is-ilanlari/lefke`, `/en/is-ilanlari/iskele`
     gibi **boş ilçe/tür sayfaları** görünür. **Bunlar artık `noindex, follow` dönüyor** (fix
     yayında) — yani sorun kaynağında kapandı.

> **Not (önemli):** GSC'deki bu örnek liste **eski tarama anını** gösterir; fix'ten **önce**
> taranan hali. Panik yok — Google tekrar tarayınca bu URL'ler bu kovadan düşecek.

### Adım 4 — "Düzeltmeyi doğrula" butonuna bas

1. Detay sayfasının üstündeki **"Düzeltmeyi doğrula"** butonuna bas. (İngilizce: **Validate fix**.)
2. Açılan onay kutusunda **"Doğrula"** / **"Onayla"**'yı seç. Buton artık **"Doğrulama başlatıldı"**
   durumuna geçer ve **sarı/amber** görünür.
3. **Tekrar basma.** Google, doğrulama **başarılı ya da başarısız olana kadar** butonu tekrar
   kullanmanı istemez (basarsan yeni talep açmaz, sadece bekler).
4. Ekran görüntüsü / not (isteğe bağlı): butonun **"Başlatıldı"** yazdığını gör — bu "tamam" demektir.

### Adım 5 — Doğrulamanın gidişatını izle (beklemeli, günlük bakma)

1. Aynı **Soft 404** detay sayfasında **"Geçmiş"** / **"Doğrulama geçmişi"** bölümü var.
2. Orada **iki aşamalı** durum görürsün:
   - Önce **"Doğrulama başlatıldı"** (Google sıraya aldı).
   - Sonra **"Doğrulama başarılı"** (kova boşaldı) **veya** **"Doğrulama başarısız"** (kalan bir
     örnek buldu).
3. Süre: **genelde 2 hafta kadar.** Bu sürede **hiçbir şey yapmana gerek yok**; Google bitince
   **e-posta** gönderir.
4. **Başarılı olursa:** "Soft 404" satırı **sıfır** olur ve tablonun **en altına** taşınır. Aynı
   sayfalar **"noindex etiketi tarafından hariç tutuldu"** satırına geçer — **bu istenen
   davranıştır** (sayfa canlı kalır, sitemap'te yoktur, arama sonuçlarına girmez).

### Adım 6 — Başarısız olursa (nadir)

1. Detay sayfasında **"Ayrıntıları göster"** → hangi URL doğrulamayı bozdu görünür.
2. O URL'i bana ilet (aşağıdaki tabloya ekle). Muhtemel neden: sayfa **o an** hâlâ 200 + boş
   dönüyordur ya da yeni bir URL eklenmiştir.
3. Ben kod tarafında canonical/noindex karşılığını doğrular, gerekirse en küçük düzeltmeyi yaparım;
   sonra **tekrar "Düzeltmeyi doğrula"** dersin.

---

### 11.5 🟡 P2 — İkinci küçük iş: "Kullanıcı seçili canonical olmadan kopya" (1 URL)

Aynı **Sayfalar** tablosunda **"Kullanıcı tarafından seçilen standart sayfa olmadan kopya"**
(İngilizce: *Duplicate without user-selected canonical*) satırı **1 sayfa** gösteriyor.

1. O satıra tıkla → detay sayfasında **örnek URL**'i kopyala.
2. URL'yi bana yaz. Ben canonical/hreflang karşılığını canlı `curl` ile doğrular, gerçek bir
   kopyaysa en küçük düzeltmeyi yaparım. (Tur 3'ün 225-URL taramasında bu URL **yoktu**;
   yeni bir sayfa olabilir.)

---

### 11.6 🟡 P2 — (Opsiyonel, kalıcı çözüm) GSC okumasını otomatiğe bağla

Şu an **okuma** da panelden yapılıyor çünkü bu ortamda Google kimliği yok
(`npm run search-console:verify` → `Credential: unconfigured`). Bir kez secret eklersen
`npm run search-console:verify` ve günlük JobPosting bildirimi **tam otomatik** çalışır.
Adım adım: **§6** ve `docs/runbooks/search-console-indexing.md`.

> **Not:** GSC **yazma** (Düzeltmeyi doğrula / Dizinlemeyi iste) **API'den yapılamaz** — bu adım
> her zaman panelden, elle kalır. Yani §11.6 sadece *okumayı* kolaylaştırır.

---

### 11.7 Özet kontrol listesi (bu adım için)

- [ ] Normal pencerede `info@isbulkktc.com` ile GSC'ye girdim.
- [ ] Mülk = **`isbulkktc.com`** (Domain mülkü).
- [ ] **Dizin oluşturma → Sayfalar** açıldı.
- [ ] **"Soft 404"** satırı bulundu (2 sayfa).
- [ ] Satır açıldı → **"Düzeltmeyi doğrula"**'ya basıldı → **"Başlatıldı"** göründü. ✅
- [ ] (İkincil) **"Kullanıcı seçili canonical olmadan kopya"** URL'i kopyalandı → bana iletildi.
- [ ] Gerisi otomatik: ~2 hafta içinde Google "başarılı" der; ekstra iş yok.
