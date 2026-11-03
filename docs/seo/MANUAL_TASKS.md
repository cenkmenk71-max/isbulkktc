# Manuel Yapılacaklar — harici platformlar

Bu dosya, **repo dışında** yapılması gereken ve bu ortamdan erişilemeyen/uygun olmayan
işleri listeler. Kod tarafı tamamlandı; aşağıdakileri son olarak elle yapacaksın.

Son güncelleme: 2026-11-03. Hedef: `https://isbulkktc.com`.

---

## 1. 🔴 ZORUNLU — DNSSEC DS kaydı (registrar)

**Durum:** Cloudflare tarafında DNSSEC **etkin** ama durum `pending`; üst bölgede (registrar)
DS kaydı **yok**. Kanıt: `dig DS isbulkktc.com` → boş; Cloudflare API `/dnssec` →
`status: "pending"`. DNSSEC, DS kaydı yayınlanana kadar **doğrulanmıyor**.

**Yapılacak:** Alan adı sağlayıcının (registrar) panelinde DNSSEC / DS kaydı ekranına
aşağıdaki DS kaydını gir. Cloudflare panelinde **DNS → Settings → DNSSEC** sayfası
bu kaydı zaten gösterir; oradan kopyala.

```
Key Tag:        2371
Algorithm:      13 (ECDSAP256SHA256)
Digest Type:    2 (SHA-256)
Digest:         36E054F2B3F7EC415B0BE85C8CB301DBB439CF7FA010AE82AAE106C3C583775B
```

Tam DS kaydı (bind biçimi):
```
isbulkktc.com. 3600 IN DS 2371 13 2 36E054F2B3F7EC415B0BE85C8CB301DBB439CF7FA010AE82AAE106C3C583775B
```

**Doğrulama:** Kaydı girdikten sonra `dig +short DS isbulkktc.com @1.1.1.1` çıktı vermeli ve
Cloudflare panelindeki DNSSEC durumu **Active** olmalı. DNS yayılımı 24 saate kadar sürebilir.

> Neden önemli: DNSSEC, alan adının DNS yanıtlarının sahte olmadığını kanıtlar. Arama motorları
> ve tarayıcılar için güven sinyalidir. SEO'yu doğrudan etkilemez ama domain güvenilirliği
> açısından önerilir. **Bu, CF tarafında yapılabilecek bir şey değil — registrar işidir.**

---

## 2. 🔴 Search Console (Google) — doğrulama + sitemap + denetim

**Durum:** BLOCKED (bu ortamda GSC hesabı/API yetkisi yok).

Site sahipliği **iki yolla** zaten kanıtlanmış durumda (kod hazır):
- Meta etiketi yayında: `<meta name="google-site-verification" content="1zuidCsJ2y0GCfp_g-AmsYuagg_fIDDCo36POZr0wSM">`
- DNS TXT kaydı mevcut: `google-site-verification=7YbjG-3INgSrdkIKFG0inLGNgD0BX4P8mf1oIDtJehU`
  (CF DNS'te; bu, **ikinci bir property** olabilir — ikisini de kontrol et.)

**Yapılacak:**
1. `https://search.google.com/search-console` → property seçili mi kontrol et
   (domain property: `isbulkktc.com`; URL-prefix property: `https://isbulkktc.com/`).
2. **Sitemaps** → `https://isbulkktc.com/sitemap.xml` gönderildi mi? Değilse gönder.
   (Sitemap canlıda 200, 87 `<loc>`, hepsi 200 dönüyor — doğrulandı.)
3. **Pages / Indexing** raporunu incele: her hariç tutma/hata nedenini URL örneğiyle aç.
4. **URL Inspection** ile şunları test et: `/`, `/jobs`, bir ilan detayı (`/jobs/<slug>`),
   `/companies`, `/en`, `/de`. "Seçilen canonical" Google'ın `/jobs/<slug>`'ı seçtiğini
   göstermeli (bizim canonical'ımızla aynı).
5. **Manual actions** ve **Security issues** → boş olmalı.
6. **Generative AI performance** raporu bu property için açıksa ölçüme ekle.

> Not: `site:` sorgusu yalnızca kaba bir sinyaldir; gerçek indeks durumu URL Inspection ve
> Pages raporundan doğrulanır.

---

## 3. 🟡 GA4 — doğrulama + ölçümleme

**Durum:** BLOCKED. `NEXT_PUBLIC_GA_MEASUREMENT_ID` Vercel'de tanımlı (production+preview),
kod consent-gate ile çalışıyor.

**Yapılacak:** GA4'te organic landing page ve dönüşüm (başvuru, kayıt) event'lerini gözden
geçir; consent (çerez onayı) koşullarının korunduğunu doğrula. Gizlilik politikasıyla tutarlı
kalmalı.

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
**Yapılandırma doğru; yıkıcı değişiklik yapılmadı** (CF lane kuralı: onay önce).

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

**Tek CF ile ilgili iş:** §1'deki DNSSEC DS kaydı — o da registrar'da yapılır.

> Opsiyonel (SEO dışı, riskli): DMARC `p=none` → `quarantine`/`reject` sıkılaştırması.
> Posta teslimini bozma riski taşır; ayrı bir karar. Şimdilik dokunulmadı.

---

## 6. ⚪ Google Cloud — Indexing API (opsiyonel, eklenmedi)

**Durum:** Repoda Indexing API entegrasyonu **yok**. Google bunu yalnızca JobPosting URL'leri
için öneriyor ve **indeksleme garantisi vermiyor**; sitemap'in yerine geçmez.

**Eklenirse gereken:** Google Cloud'da bir servis hesabı + Indexing API etkin + service-account
JSON anahtarı **yalnız secret manager'da** (asla repo/client/log içinde). Credential yokken
entegrasyon kapalı-by-default kalmalı.

**Karar:** Gereksiz bağımlılık ve gizli anahtar yönetimi gerektirdiği için **eklenmedi**.
İstersen ekleyebiliriz — onayını beklerim.

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
| 1 | Registrar | DNSSEC DS kaydını gir (§1) | 🔴 Zorunlu |
| 2 | Search Console | Doğrula, sitemap gönder, Pages/Inspection denetle | 🔴 Zorunlu |
| 3 | GA4 | Organic + consent ölçümü gözden geçir | 🟡 Önerilir |
| 4 | Vercel | Bing/Yandex doğrulama env (opsiyonel) | 🟡 Opsiyonel |
| 5 | Cloudflare | Denetlendi — **iş yok** (DNSSEC hariç, o registrar'da) | 🟢 Tamam |
| 6 | Google Cloud | Indexing API (opsiyonel, eklenmedi) | ⚪ İsteğe bağlı |
| 7 | İçerik | Şehir/şirket sayfaları (onay ister) | ⚪ İsteğe bağlı |
