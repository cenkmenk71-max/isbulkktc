# Manuel Yapılacaklar — harici platformlar

Bu dosya, **repo dışında** yapılması gereken ve bu ortamdan erişilemeyen/uygun olmayan
işleri listeler. Kod tarafı tamamlandı; aşağıdakileri son olarak elle yapacaksın.

Son güncelleme: 2026-11-03. Hedef: `https://isbulkktc.com`.

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

> Opsiyonel (SEO dışı, riskli): DMARC `p=none` → `quarantine`/`reject` sıkılaştırması.
> Posta teslimini bozma riski taşır; ayrı bir karar. Şimdilik dokunulmadı.

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

## 7. ⚪ İçerik/URL iyileştirmeleri (gelecekte, onay ister)

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
| 3 | GA4 | Organic + consent ölçümü gözden geçir | 🟡 Önerilir |
| 4 | Vercel | Bing/Yandex doğrulama env (opsiyonel) | 🟡 Opsiyonel |
| 5 | Cloudflare | Denetlendi — **iş yok** | 🟢 Tamam |
| 6 | Google Cloud | Indexing API — **entegre edildi** (§6) | ✅ Tamam |
| 7 | İçerik | Şehir/şirket sayfaları (onay ister) | ⚪ İsteğe bağlı |
