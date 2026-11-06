# Cloudflare denetimi — isbulkktc.com

LANE-CLOUDFLARE (dalga 2) — **read-only** uç/edge denetimi. Bu dosya canlı
kanıtla doğrulanmış bulguları ve onay bekleyen değişiklikleri tutar.

- Alan: `isbulkktc.com`, `www.isbulkktc.com` — Cloudflare arkasında (NS: `lex.ns.cloudflare.com`, `serenity.ns.cloudflare.com`).
- Origin: Vercel; alias `isbulkktc-amber.vercel.app` (bu adres CF'yi **atlar**, bkz. F-08).
- Yöntem: her iddia canlı HTTP/DNS cevabıyla (`curl -D -`, `cf-ray`, `cf-cache-status`, DoH) doğrulandı. Yıkıcı hiçbir CF değişikliği yapılmadı.
- Tarih: 2026-11-05.

## Token durumu (API tarafı denetlenemedi)

Bu sandbox'ta **`CF_API_TOKEN` (veya `CLOUDFLARE_API_TOKEN`) tanımlı değil**
(`echo "[$CF_API_TOKEN]"` → `[]`). Bu yüzden zone-level API denetimi
(DNS kaydı CRUD, WAF ruleset listesi, cache rules, rate-limit kuralı, Bot
Management ayarları, Analytics/Logpush) **yapılamadı**; yalnızca herkese açık
uçtan okunabilen HTTP + DNS kanıtı toplandı. Brief'teki "çalışan token
`/user/tokens/verify` 1000 döner" notu, token bu ortama enjekte edilmediği için
burada uygulanamadı.

API tarafını kapatmak için gereken token scope'ları (tam ad):

| Kullanım | Gerekli scope |
|---|---|
| DNS kayıtlarını oku | `Zone → DNS → Read` |
| Zone ayarları (SSL/TLS, HSTS, Always Use HTTPS) | `Zone → Zone Settings → Read` |
| WAF custom + managed ruleset | `Zone → Zone WAF → Read` (Account `Account WAF → Read` managed için) |
| Cache Rules | `Zone → Cache Rules → Read` |
| Rate limiting kuralı | `Zone → Zone WAF → Edit` (rate limit kuralları WAF ailesinde) |
| Bot Management / Bot Fight Mode | `Zone → Bot Management → Read` |
| Analytics / Logpush | `Zone → Analytics → Read`, `Account → Logs → Read` |

Brief'teki "token `account.zone.analytics.read` istiyor" gözlemi bununla
uyuşuyor: **eksik olan tam scope `Zone → Analytics → Read`** (Logpush için ayrıca
`Account → Logs → Read`).

## Bulgu tablosu

Kanıt kısaltmaları: `HTTP` = `curl -D -` başlıkları, `DoH` = `cloudflare-dns.com/dns-query`.

| # | Nokta | Mevcut | Olması gereken | Kanıt |
|---|---|---|---|---|
| F-01 | Apex A kaydı | `104.21.29.3`, `172.67.171.53` — CF **proxied** | Proxied kalmalı | DoH A |
| F-02 | Apex AAAA | `2606:4700:3034::ac43:ab35`, `2606:4700:3036::6815:1d03` | Var (iyi) | DoH AAAA |
| F-03 | `www` | A → aynı CF IP'leri; `https://www` → **308** apex'e; `http://www` → **301** `https://www` | Zincir tek sıçrama; OK | `HTTP` |
| F-04 | `http` → `https` | `http://isbulkktc.com` → **301** `https://isbulkktc.com/` | Always Use HTTPS açık | `HTTP` |
| F-05 | Mail (CF Email Routing) | MX `route{1,2,3}.mx.cloudflare.net`; SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`; DKIM `cf2024-1._domainkey` (2048-bit) | OK | DoH MX/TXT |
| F-06 | DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1` | `p=none` izleme modunda — **zorlamaya geçiş planı yok** | DoH TXT |
| F-07 | CAA | `0 issue` comodoca/digicert/letsencrypt/pki.goog/ssl.com + `issuewild` aynıları | Geniş ama geçerli | DoH CAA |
| F-08 | **Origin doğrudan erişim** | `https://isbulkktc-amber.vercel.app` CF'yi **tamamen atlıyor**: `server: Vercel`, `cf-ray` yok, `.env`→404, `/api/devtools/`→404, rate-limit yok | Vercel Deployment Protection (Vercel Authentication / Protection Bypass) veya alias'ı public bırakma | `HTTP` alias |
| F-09 | TLS min sürüm | TLS 1.0/1.1 **reddediliyor** (`no protocols available`), 1.2 + 1.3 OK | Min TLS 1.2 — doğru | `openssl s_client` |
| F-10 | Sertifika | Let's Encrypt `YE2`, SAN `*.isbulkktc.com, isbulkktc.com`, geçerlilik 2026-09-19 → 2026-12-18 | OK (CF Universal SSL) | `openssl x509` |
| F-11 | HSTS | `max-age=31536000; includeSubDomains; preload` | Doğru | `HTTP` |
| F-12 | HSTS preload | `hstspreload.org` → **`status: pending`** | `preloaded` olana kadar bekle; kaydı geri çekme | hstspreload API |
| F-13 | DNSSEC | Açık — DS `2371 13 2 36e0…775b`, `AD=true` | Doğru | DoH DS + `AD` |
| F-14 | Cache — dinamik HTML | `/`, `/jobs`, `/companies`, tüm dil önekleri: `cache-control: private, no-cache, no-store…`, `cf-cache-status: DYNAMIC` | Dinamik asla cache'lenmemeli — **doğru, düzeltme gerekmez** | `HTTP` |
| F-15 | Cache — statik | `/_next/static/*`: `public, max-age=31536000, immutable`, `cf-cache-status: HIT`, `vary: accept-encoding` | Doğru | `HTTP` |
| F-16 | Cache — `robots.txt` | `public, max-age=2628000` (≈30 gün), `REVALIDATED` | Kabul; ama `noindex` kuralı **`Disallow` etmiyor** (SEO lane) | `HTTP` |
| F-17 | Cache — `sitemap.xml` | `public, max-age=3600`, `EXPIRED`/`REVALIDATED` | 1 saat TTL makul; `<lastmod>` tazeliği SEO lane'de | `HTTP` |
| F-18 | Cache — `/images/*` | `public, max-age=2628000`, `MISS`→`REVALIDATED`, ETag var | Görseller edge-cache'leniyor, OK | `HTTP` |
| F-19 | Cache — `manifest.webmanifest` | `public, max-age=0, must-revalidate`, `DYNAMIC` | Kabul | `HTTP` |
| F-20 | WAF — saldırı yolları | 11/12 yol **403** (CF "Attention Required!"): `/.git/config`, `/.env`, `/.svn/entries`, `/.aws/credentials`, `/wp-login.php`, `/wp-admin/`, `/phpmyadmin/`, `/xmlrpc.php`, `/vendor/phpunit/…/eval-stdin.php`, `/api/devtools/`, `/backup.sql`; `/config.json`→404 | 403 | `HTTP` |
| F-21 | WAF — metod | `TRACE` → **405**, `TRACK` → **403** | OK | `HTTP` |
| F-22 | WAF — büyük/küçük harf | `/.GIT/config`, `/WP-LOGIN.PHP`, `/API/DEVTOOLS/` → **403** | `lower()`/case-insensitive çalışıyor | `HTTP` |
| F-23 | WAF — kaçış (bypass) denemeleri | `/.git%2fconfig`, `/api/devtools%2f`, `/api/devtools` (slash yok) → **404** (WAF tetiklenmiyor ama origin de sunmuyor) | Savunma derinliği: origin 404 verdiği için istismar edilemez | `HTTP` |
| F-24 | WAF — yanlış pozitif | Meşru arama: `/jobs?q=o'brien`, `union+select`, `drop+table`, `<script>alert(1)</script>`, `../../etc/passwd` → hepsi **200** | Meşru trafiği engellemiyor — **iyi** | `HTTP` |
| F-25 | Bot koruması | Bot UA `sqlmap/1.7` → **403**; `curl` UA → 200 | Yönetilen bot koruması aktif | `HTTP` |
| F-26 | Rate limit | 30× hızlı `GET /` → hepsi **200**; 15× `/login` → hepsi **200**; hiç throttle yok | Free plan tek `http_ratelimit` kuralı leak-check'e harcanmış (brief) → auth brute-force **korumasız** | `HTTP` |
| F-27 | Analytics/Logpush | API scope yok → okunamadı | `Zone → Analytics → Read` ekle | — |

## WAF bypass / skip deliği değerlendirmesi

- **Kural içi delik:** case (`lower()`), nokta/eğik çizgi tekrarı (`/.git//config`, `/.git/./config`), `wp-login.php` son ekleri (`.`, `;`, `/`) **hepsi 403**. Kodlanmış `%2f` varyantları WAF'ı geçiyor ama origin **404** döndüğü için sömürülebilir bir yol yok (defense-in-depth origin'de tutuyor).
- **Kural dışı delik (asıl bulgu):** WAF/bot/rate-limit yalnızca CF edge'inde. `isbulkktc-amber.vercel.app` alias'ı CF'yi tamamen atlıyor (F-08). Edge korumalarını "atlatmanın" en kolay yolu bu adresi bilmek. **Öneri:** Vercel'de Deployment Protection'ı (Standard/Premium) aç, ya da alias'ı yalnızca CI servisleri için "Protection Bypass for Automation" ile sınırla. Bu, LANE-CLOUDFLARE alanı dışında (Vercel) olduğundan **sahibin/INFRA'nın onayına** sunulur.

## Onay bekleyen değişiklikler (uygulanmadı)

1. **Rate limit kuralını yeniden tahsis et (F-26).** Free plan tek `http_ratelimit` harcıyor. Öneri: kuralı `/auth/*`, `/login`, `/signup`, `/api/*` üzerinde **auth brute-force** için kullan (örn. 60 sn'de 20 istek/IP → challenge/block). Leak-credential kontrolü zaten şifre sızıntısını yakalıyor; brute-force koruması daha yüksek getirili. **Değişiklik yıkıcı → sahibin onayı gerekli.**
2. **Origin doğrudan erişimi kapat (F-08).** Vercel Deployment Protection / alias kısıtı. CF dışı → Vercel/INFRA onayı.
3. **DMARC'ı güçlendir (F-06).** `p=none` → önce `p=quarantine`, raporları izledikten sonra `p=reject`. Mail akışı CF Email Routing + Resend üzerinden; geçiş planı gerekir.
4. **HSTS preload (F-12).** Durum `pending`; preload listesine girene kadar bekle, DNS/TLS'i değiştirme.

## Denetlenen dosyalar

```
git ls-files 'docs/cloudflare.md' 'docs/lanes/02-cloudflare.md'
→ docs/lanes/02-cloudflare.md (mevcut)
→ docs/cloudflare.md          (bu PR ile eklendi)
```

Bu lane'in repo içi sahipliği yalnızca bu iki dokümandır (kod dosyası yok; CF
yapılandırması API/dashboard'dadır). Denetimin geri kalanı **canlı uç** üzerinden
yapıldı: DNS (DoH), TLS (`openssl s_client`), HTTP başlıkları (`curl -D -`).

## Kapılar

Kod değişmediği için `lint`/`typecheck`/`check:frontend-source`/`test:unit`
etkilenmez; yine de PR öncesi çalıştırılıp sonucu rapora yazılır.

## Sonraki lane için notlar

- **LANE-SEO:** `robots.txt` `Disallow: /api/` + `Disallow: /auth/` yalnızca tarama
  bütçesi içindir; `noindex` sayfaları `Disallow` **etmemeli** (AUDIT kuralı).
  `robots.txt` 30 gün cache'leniyor — kural değişince purge gerekebilir.
- **LANE-INFRA:** `submit-indexnow.yml` ve `push-dispatch.yml` CF challenge'ı
  bildiği için Vercel alias'ından okuyor (F-08 ile aynı kök). Alias kısıtlanırsa
  bu workflow'lar için "Protection Bypass for Automation" token'ı gerekir.

---

## Bulunabilirlik denetimi — issue #163 (2026-11-05)

Issue #163 ("site arama motorlarında çıkmıyor") zincirinin **Cloudflare halkası**
ölçüldü. Soru: CF bot koruması arama motoru botlarını engelliyor mu? **Cevap:
hayır.** Bu halka kopuk değil; kanıt aşağıda.

### Yöntem

- Egress: `34.136.162.246` (AS396982 Google LLC) — **datacenter IP**, yani AGENTS.md'de
  `cf-mitigated: challenge` beklenen tam sınıf. Ağustos 2026'da GH runner'ları bu yüzden
  engelleniyordu; aynı sınıftan ölçüm yapıldı.
- Her istek canlı uca: `curl -A "<bot UA>"`, başlıklar `-D -`, gövde ayrı okundu.

### Bulgular

| # | Test | Sonuç | Kanıt |
|---|---|---|---|
| C-01 | `site:` sitemap'teki **207 URL**, Googlebot UA | **207/207 → 200** | `curl` sweep, `/tmp/codes.txt` |
| C-02 | Googlebot, `/ /robots.txt /sitemap.xml /jobs /companies /en` | hepsi 200, `server: cloudflare` | `HTTP` |
| C-03 | bingbot / YandexBot / GPTBot / ClaudeBot / AhrefsBot `/` | hepsi **200** | `HTTP` |
| C-04 | `sqlmap/1.7` `/` | **403** (bot koruması yalnız kötü niyetli UA'yı kesiyor) | `HTTP` |
| C-05 | `cf-mitigated` başlığı (tüm probe'lar) | **hiç yok** (`count=0`) | `HTTP` |
| C-06 | Googlebot gövdesi gerçek sayfa mı | `<title>KKTC İş İlanları…</title>`, 279 KB; `just a moment`/`cf-chl` yok | `HTTP` |
| C-07 | `robots.txt` / `sitemap.xml` Googlebot vs varsayılan UA | **birebir aynı** (`diff` boş) | `HTTP` |
| C-08 | Derin ilan sayfası (Googlebot) | 200, `<title>…Depo Sorumlusu…</title>`, `JobPosting` JSON-LD var, canonical doğru | `HTTP` |
| C-09 | `www.isbulkktc.com` (her yol) | 308 → apex (doğru) | `HTTP` |
| C-10 | `http://` → `https://` | 301 (doğru) | `HTTP` |
| C-11 | `X-Robots-Tag` (/, /jobs, /companies, /en, robots, sitemap) | **yok** (site geneli noindex yok) | `HTTP` |
| C-12 | `<meta name="robots">` (/, /jobs, /en) | yok = varsayılan index,follow | `HTTP` |
| C-13 | `google-site-verification` meta (üretim HTML) | **var** — `1zuidCsJ2y0GCfp_g-AmsYuagg_fIDDCo36POZr0wSM` | `HTTP` |
| C-14 | Yandex doğrulama | DNS TXT `yandex-verification: 556993cbb856e57b` **var** | DoH |
| C-15 | **Bing doğrulama** | HTML'de `msvalidate.01` **yok**; `/BingSiteAuth.xml` **404**; DNS TXT'te Bing kaydı **yok** | `HTTP`+DoH |
| C-16 | Vercel alias `/` (CF'yi atlar) | 200 ama `x-robots-tag: noindex, nofollow` + canonical apex → **duplike içerik riski yok** | `HTTP` |
| C-17 | WAF temeli (regresyon) | `/.env`, `/.git/config`, `/wp-login.php`, `/api/devtools/` → 403 | `HTTP` |

### Ölçülen indeks durumu (dış gözlem)

- Bing `site:isbulkktc.com` → **1 sonuç** (yalnız ana sayfa). Sahibin şikâyetiyle uyumlu.
- `IndexNow` günlük çalışıyor ve **207 URL'yi `api.indexnow.org`'a HTTP 200 ile
  gönderiyor** (workflow run `41981082862`, 2026-11-05 06:32). Yani "bildirim"
  halkası da sağlam.
- (Bu ölçüm datacenter IP'sinden yapıldı; kişiselleştirilmiş/residential bir
  tarayıcı daha fazla sonuç gösterebilir. Kesin sayı için Search Console / Bing
  Webmaster Tools gerekir — token bu sandbox'ta yok.)

### Sonuç: kopuk halka Cloudflare değil

CF, arama motoru botlarının **tamamına** gerçek içeriği 200 ile veriyor; hiçbir
yolda `cf-mitigated` yok; site geneli `noindex` yok; `robots.txt`/`sitemap.xml`
bot-bağımsız aynı; WAF yalnız `sqlmap` gibi kötü niyetli UA'yı kesiyor. Yani
"sıralanmama"nın nedeni **bot engeli değil**.

En güçlü kalan adaylar (bu lane'in dışı → handoff):
1. **Bing doğrulama artefaktı yok** (C-15) — `msvalidate.01` meta, `BingSiteAuth.xml`
   ve Bing DNS TXT'inin üçü de eksik. Bing indeksinin 1 sayfada kalması bununla
   açıklanır: IndexNow URL *bildirir* ama mülk sahipliği doğrulanmadan Bing
   güvenilir biçimde tarayıp indekslemiyor. → **LANE-SEO** (handoff issue açıldı).
2. İçerik derinliği / iç bağlantı / benzersiz meta → #126, #127 (LANE-SEO).
3. Search Console kapsam raporu — panel erişimi gerekir.

Bu bölümü ekleyen PR: bkz. PR gövdesi. Yıkıcı CF değişikliği yapılmadı; C-15 için
handoff issue'su `lane:seo` + `agent:handoff` ile açıldı.

---

## E-posta kimlik doğrulama denetimi — issue #170 (2026-11-05)

Issue #170 ("e-postalar spam'e düşüyor") teşhisindeki **DNS iddiaları canlı
sorguyla doğrulandı**. Sonuç: Resend kayıtları **eksik değil, tam**; sorunun kökü
issue'nun işaret ettiği yer değil. Aşağıda ölçüm, düzeltme ve kanıt var.

### Ölçüm — canlı DNS (DoH, 2026-11-05)

| # | Kayıt | Gözlenen | Değerlendirme |
|---|---|---|---|
| E-01 | Kök SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` | CF Email Routing için doğru |
| E-02 | Kök SPF nested | `_spf.mx.cloudflare.net` → `v=spf1 ip4:104.30.0.0/19 ip6:2405:8100:c000::/38 ~all` | 1 include = 1 lookup |
| E-03 | **Resend SPF (return-path)** | `send.isbulkktc.com TXT "v=spf1 include:amazonses.com ~all"` | ✅ **mevcut ve doğru** |
| E-04 | Resend return-path MX | `send.isbulkktc.com MX 10 feedback-smtp.eu-west-1.amazonses.com` | ✅ Resend `send.` kuralı |
| E-05 | DKIM | `resend._domainkey.isbulkktc.com TXT "p=MIGf…"` | ✅ mevcut — ama bkz. E-10 |
| E-06 | DMARC | `_dmarc.isbulkktc.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1"` | 🟠 izleme; `ruf` yok, alignment tag yok |
| E-07 | Kök MX | Cloudflare Email Routing (inbound) | ✅ |
| E-08 | MTA-STS | `_mta-sts` TXT **yok** | 🟡 eksik (opsiyonel) |
| E-09 | TLS-RPT | `_smtp._tls` TXT **yok** | 🟡 eksik (opsiyonel) |
| **E-10** | **DKIM anahtar uzunluğu** | `openssl pkey -pubin` → **`Public-Key: (1024 bit)`** | 🔴 **zayıf** (Resend bugün 2048 önerir) |
| E-11 | DKIM selector adı | `resend._domainkey` (Resend standardı) | ✅ |
| E-12 | `send.` DKIM / DMARC | yok | ℹ️ beklenen (return-path DKIM'siz; DMARC kökte) |

### Ana bulgu: issue'nun SPF teşhisi yanlış

Issue "SPF Resend'i yetkilendirmiyor" diyor ve kök SPF'e `include:amazonses.com`
eklenmesini istiyor. **Bu gereksiz** — çünkü Resend'in **envelope/Return-Path
domaini kök değil, `send.isbulkktc.com`**'dir. Resend resmî dokümanı:

> "Return-Path defaults to `send.example.com`" — `resend.com/docs/add-a-domain`
> "custom return path is used for SPF authentication, DMARC alignment" —
> `resend.com/docs/api-reference/domains/create-domain`
> "its return-path domain is different since it operates through a subdomain …
> formatted as `send.yourdomain.tld` … for MX and SPF records" —
> `resend.com/docs/knowledge-base/sending-apple-private-relay`

Alıcı sunucu SPF'i **envelope (MAIL FROM) domainine** uygular; o da `send.isbulkktc.com`,
ve orada `include:amazonses.com` **zaten var** (E-03) → **SPF pass**. Kök SPF
(E-01) bu akışta hiç okunmaz. DKIM `d=isbulkktc.com` (E-05) ve DMARC kökte (E-06)
olduğundan, Resend varsayılan kurulumunda **SPF + DKIM + DMARC zaten hizalı ve
geçer** durumda. Yani spam'in nedeni "kök SPF" değil.

**Doğrulama yöntemi (sahip, 5 dakika):** Resend'den bir test e-postası gönder,
alıcıda `Authentication-Results` başlığını oku:
- `spf=pass smtp.mailfrom=…@send.isbulkktc.com` → return-path `send.`, kök SPF konu dışı.
- `dkim=pass header.d=isbulkktc.com` ve `dmarc=pass` → kimlik doğrulama tam.
Bu çıktı, "kök SPF'e include ekle" adımının gereksiz olduğunu kanıtlar.

### Gerçek iyileştirme fırsatları (onay bekleyen, uygulanmadı)

1. **DKIM'i 2048-bit'e yükselt (E-10) — yeni bulgu.** Mevcut anahtar 1024-bit RSA.
   1024-bit günümüzde zayıf kabul edilir ve bazı sağlayıcılar skoru düşürür.
   Resend paneli → domain → DKIM anahtarını yenile (2048), yeni
   `resend._domainkey` TXT'i yayınla. **DNS değişikliği → sahibin onayı gerekli.**
2. **DMARC'i güçlendir (E-06).** Önerilen:
   `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; ruf=mailto:dmarc@isbulkktc.com; fo=1; adkim=s; aspf=s`
   Raporları izledikten sonra `p=quarantine` → `p=reject`. `ruf` (forensic) ve
   sıkı alignment eklemek, hem görünürlük hem spoofing direnci sağlar.
3. **Kök SPF'e `include:amazonses.com` EKLEMEYİN** (gerekçe yukarıda). Yalnızca
   kök domainden (`@isbulkktc.com`) envelope ile mail gönderen bir kaynak
   (ör. CF Email Routing forward'ları) varsa gerekir; önce o senaryo ölçülmeli.
4. **MTA-STS + TLS-RPT (E-08/E-09) — opsiyonel.** `_smtp._tls` TXT
   (`v=TLSRPTv1; rua=mailto:tlsrpt@isbulkktc.com`) ve MTA-STS politikası eklemek
   aktarım güvenilirliğini artırır. Düşük öncelik.

### Bakılmadı / doğrulanamadı (dürüst işaret)

- **Resend paneli "domain verified" durumu:** bu sandbox'taki `RESEND_API_KEY`
  **geçersiz** (`GET /domains` → `400 API key is invalid`). Panel/API durumu
  okunamadı; yalnızca yayınlanmış DNS kayıtları doğrulandı.
- **Gerçek teslim testi (Gmail/Outlook gelen kutusu + `Authentication-Results`):**
  gönderim yapılmadı (canlıya dokunmama kuralı); bu adım sahibin/QA'nın.
- **Cloudflare zone API** (`CF_API_TOKEN` bu sandbox'ta yok): kayıtların panelde
  birebir eşleştiği varsayımı DNS cevabına dayanır.

### Bu lane dışına handoff

- **Auth SMTP bloğu (LANE-SUPABASE, #170 adım 6):** **Düzeltme (2026-11-05,
  LANE-SUPABASE PR #239):** doğru bölüm adı **`[auth.email.smtp]`**, `[auth.smtp]`
  **değil** — CLI şeması SMTP'yi `[auth.email]` altına koyar; `[auth.smtp]` bilinmeyen
  anahtardır ve CLI sessizce yok sayar. LANE-SUPABASE bloğu **yorumlu** olarak
  ekledi (`supabase/config.toml`), aktif değil (aktif edilirse yerel/CI auth
  postaları Mailpit'ten kopar). Üretim auth SMTP'si **zaten Resend'e bağlı**
  (sahip Auth dashboard'dan okudu). Kanıt: `supabase/config.toml` →
  `# [auth.email.smtp]` (yorumlu), `# The section is \`[auth.email.smtp]\` — NOT \`[auth.smtp]\``.
- **`List-Unsubscribe` / `Reply-To` eksik (LANE-URUN, #170 adımları 9, 11):**
  `src/server/email/mailer.ts:69-78` içindeki `resend.emails.send` çağrısı yalnız
  `from/to/subject/html/text` gönderiyor; `headers` (`List-Unsubscribe`,
  `List-Unsubscribe-Post`) veya `replyTo` yok. `sendEngagementEmail`
  (`mailer.ts:250-267`) promosyonel aile olduğu için `List-Unsubscribe` en çok
  burada gerekli (Gmail toplu gönderim şartı). `from` varsayılanı
  `no-reply@isbulkktc.com` (`mailer.ts:34`) — `Reply-To` gerçek kutuya çevrilmeli.
- **Not (düzeltme):** #170 adım 10'daki "her e-postada `text/plain` olsun" maddesi
  **zaten karşılanıyor** — `RenderedEmail` tipi `text`'i zorunlu kılıyor
  (`supabase/functions/_shared/email-render.ts:13`) ve mailer `text: email.text`
  gönderiyor (`mailer.ts:75`). Bu madde için iş yok.
- **DKIM 1024-bit (LANE-AUTH):** anahtar rotasyonu Resend panelinden yapılır; kod
  değil. `lane:auth` + `agent:handoff` ile issue açıldı.

Ayrıntılı kanıt ve komutlar bu bölümde; ölçüm tekrarı:
`curl -s -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=send.isbulkktc.com&type=TXT'`.

---

## Uç/edge güvenlik mikro-denetimi — 2026-11-05 (tur 4)

Bu turda canlı edge **cache-deception / cache-poisoning / origin-ifşası / WAF
regresyonu** eksenlerinde yeniden tarandı. Açık veren olmadı; bir **yeni yapılandırma
bulgusu (G-01)** var.

### Ölçüm tablosu

| # | Test | Gözlenen | Beklenen | Durum |
|---|---|---|---|---|
| **G-01** | **CF Email Obfuscation** | Footer e-posta linki `/cdn-cgi/l/email-protection#<hex>`'e çevriliyor; `__cf_email__` span + `email-decode.min.js` enjekte | HTML'de düz `mailto:` | 🔴 **yeni bulgu, onay bekliyor** |
| G-02 | Web cache deception (özel rota) | `/profile/dashboard`, `/company/dashboard` → **307 → /login**, `cf-cache-status: DYNAMIC`, `cache-control: private, no-store` | Cache'lenmemeli | ✔ |
| G-03 | WCD — statik uzantı | `/profile/dashboard.css\|.js\|.png\|.webp` → **404 `BYPASS`** | Cache'lenmemeli | ✔ |
| G-04 | WCD — traversal | `/images/../profile/dashboard` → **307 /login**, `DYNAMIC` | Özel veri cache'lenmemeli | ✔ |
| G-05 | Cache poisoning (unkeyed header) | `X-Forwarded-Host/Scheme/Proto/Original-URL/Rewrite-URL/Host/Server` → hepsi **200 `DYNAMIC`**, yansıma yok | Yansımamalı | ✔ |
| G-06 | Absolute-URI istek satırı | `--request-target https://evil.example/` → **403** | Reddet | ✔ |
| G-07 | Origin ifşası | 56 yaygın alt alan tarandı; yalnız `www` (proxied) + `send.` (Resend) var | Grey-cloud sızıntısı olmamalı | ✔ |
| G-08 | Güvenlik başlıkları | CSP / HSTS(preload) / XCTO / XFO / COOP / CORP / Referrer / Permissions — her rota sınıfında | Var | ✔ |
| G-09 | API cache | `/api/build-info` → `no-store`; `/api/qr` → `public, max-age=3600` (statik, kullanıcıya özel değil) | Uygun | ✔ |
| G-10 | WAF negatif (9 yol) | 9/9 → **403**; TRACE→405, TRACK→403 | 403 | ✔ |
| G-11 | WAF pozitif (17 rota) | 17/17 → **200** | 200 | ✔ |
| G-12 | `/api/qr` girdi yansıması | `data=` yok sayılıyor; `next=` (mutlak / `//` / traversal) QR'ı **değiştirmiyor** | Sömürü yok | ✔ |

### G-01 — Cloudflare Email Address Obfuscation (yeni bulgu)

**Kanıt:** `curl -s https://isbulkktc.com/` çıktısında:
```html
<a class="footer-support-card" href="/cdn-cgi/l/email-protection#8ae3e4…">
  <span class="__cf_email__" data-cfemail="2940474f…">[email&#160;protected]</span></a>
<script src="/cdn-cgi/scripts/5c5dd728/cloudflare-static/email-decode.min.js"></script>
```
Kaynakta footer destek linki `mailto:info@isbulkktc.com?subject=…`; CF bunu bir
`__cf_email__` span'ına çeviriyor, tarayıcıda `email-decode.min.js` geri `mailto:`'a
döndürüyor. (`/cdn-cgi/l/email-protection#…` doğrudan GET → **404 "Email Protection"**,
yani yalnız istemci-taraflı çözülüyor.)

**Etki (dürüst değerlendirme — küçük/orta):**
1. **Tutarsızlık:** JSON-LD `Organization`/`ContactPoint` içinde
   `"email":"info@isbulkktc.com"` **düz** duruyor (2 yerde); aynı sayfada hem düz
   makine-okunur e-posta hem obfuscated link var.
2. **No-JS:** decoder çalışmazsa kullanıcı `[email protected]` görür.
3. **CSP:** site `script-src 'self' …` uyguluyor; `/cdn-cgi/scripts/...` aynı origin
   olduğundan **kırılmıyor** — bu yüzden etki düşük. Yine de gereksiz bir inline
   decoder bağımlılığı.

**Öneri (CF paneli → sahibin onayı):** Scrape Shield → **Email Address Obfuscation → OFF**.
Kod değişmez; HTML düz `mailto:` döner ve JSON-LD ile tutarlı olur. Kapatılmak
istenmezse kabul edilebilir — o zaman yalnız tutarsızlık raporlanır.

### Bakılmayan

- **CF zone API** (Scrape Shield / Bot Fight Mode / rate-limit kuralı): `CF_API_TOKEN`
  bu sandbox'ta **yok** → panel durumu okunamadı; tüm ölçüm canlı HTTP/DNS ile.
- **Farklı ASN'lerden bot davranışı:** datacenter egress'im (`34.10.175.217`,
  AS396982) challenge **almadı**; başka ağlarda davranış aynı olmayabilir.

### İlgili issue

- **#209 doğrulandı:** `GET https://api.supabase.com/v1/projects` →
  `401 {"message":"JWT could not be decoded"}`; token 36 karakter, `sbp_` öneki yok ve
  `RESEND_API_KEY` ile **birebir aynı**. Ama sahipliği **env/secret → insan**; bu lane'in
  dosyası değil, bu yüzden handoff issue açılmadı (zaten açık: #209).

---

## DKIM sahiplik ayrımı — issue #227 (2026-11-05)

#195 iki parçaya ayrıldı; **LANE-CLOUDFLARE'e düşen** parça **DKIM 1024→2048
rotasyonu** (panel + yeni DNS TXT). #227'nin "bu sandbox'ta `dig`/DNS erişimi yok"
notu bizim için geçerli değil: DNS-over-HTTPS ile ölçüm yapabiliyoruz.

### Ölçüm (canlı DoH, 2026-11-05)

| # | Kayıt | Gözlenen | Değerlendirme |
|---|---|---|---|
| K-01 | `resend._domainkey` DKIM | `openssl pkey -pubin` → **`Public-Key: (1024 bit)`** | 🔴 zayıf — rotasyon onay bekliyor |
| K-02 | DKIM selector | **yalnız** `resend` (11 selector tarandı) | ℹ️ tek selector; rotasyonda yeni TXT **aynı** `resend._domainkey` adına yayınlanır |
| K-03 | Kök SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` | ✔ CF Email Routing |
| K-04 | Resend SPF (return-path) | `send.isbulkktc.com TXT "v=spf1 include:amazonses.com ~all"` | ✔ SES |
| K-05 | Resend return-path MX | `send.isbulkktc.com MX 10 feedback-smtp.eu-west-1.amazonses.com` | ✔ |
| K-06 | DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1` | 🟠 `ruf`/alignment yok |
| K-07 | MTA-STS / TLS-RPT / BIMI | `_mta-sts` / `_smtp._tls` / `default._bimi` **yok** | 🟡 opsiyonel |
| K-08 | CAA | 5 CA + `issuewild` | ✔ |

### LANE-CLOUDFLARE aksiyonu: DKIM rotasyonu (onay bekliyor)

`resend._domainkey` **1024-bit** — Resend paneli → domain → DKIM anahtarını yenile
(2048-bit) → panelin verdiği yeni `resend._domainkey` **TXT**'ini Cloudflare DNS'e
yayınla. Aynı ad olduğundan (K-02) tek kayıt güncellenir. **DNS yazma → sahibin
onayı gerekli; uygulanmadı.**

Resend resmî dokümanı rotasyon prosedürünü panelde tanımlar; bu lane repo dosyası
tutmaz, yalnız **yayınlanacak kaydı ve doğrulamayı** belgeler. Doğrulama:
`dig +short TXT resend._domainkey.isbulkktc.com` → yeni anahtar;
`openssl pkey -pubin` → **2048 bit**; sonra bir Resend test postasında
`dkim=pass header.d=isbulkktc.com`.

### Repo dışı / başka lane

- **Auth SMTP bloğu (K-09):** **Düzeltme:** doğru bölüm adı **`[auth.email.smtp]`**,
  `[auth.smtp]` değil (CLI şeması SMTP'yi `[auth.email]` altına koyar; `[auth.smtp]`
  bilinmeyen anahtar → sessizce yok sayılır). LANE-SUPABASE bloğu **yorumlu** ekledi
  (PR #239); aktif değil. Sahibi **LANE-SUPABASE** (`supabase/**`). Bu doğrulama
  **repo okumasıyla** yapıldı, yazma yok. (#227 parça 1)
- **`RESEND_API_KEY` geçersiz (#186):** panel doğrulaması bu anahtarla yapılamıyor;
  sahibi **insan** (env).

### Bakılmayan

- **Resend paneli:** `RESEND_API_KEY` bu sandbox'ta geçersiz → "domain verified"
  durumu ve rotasyon UI'ı okunamadı; ölçüm yayınlanmış DNS ile.
- **`CF_API_TOKEN`:** yok → DNS kaydını ben yayınlayamam; rotasyon sonrası TXT'i
  sahip yayınlar, ben yalnız doğrularım.

### Bu turda ayrıca taranan (temiz)

CORS (preflight + simple GET, `Origin: https://evil.example`) → hiçbir `/api/*`
uç noktası yansıtmıyor; yalnız `/api/build-info` statik `ACAO: *` (sır yok).
Set-Cookie bayrakları → yalnız `NEXT_LOCALE=…; Path=/; SameSite=lax` (tercih
çerezi, hassas veri yok). Yani edge/CORS/çerez eksenlerinde bulgu yok.

---

## DMARC `p=quarantine` dağıtımı — issue #170 (2026-11-05)

Sahip #170'te teşhisi düzeltti ve bu lane'e **açık görev** verdi:
> "DMARC'i `p=quarantine`'a yükselt (LANE-CLOUDFLARE)"

Aşağıda **uygulamadan önce** yapılan doğrulama ve önerilen kayıt var. DNS yazma
sahibin onayında (brief kuralı) → bu turda **değişiklik yapılmadı**.

### Neden şimdi güvenli — hizalama ön-kontrolü (canlı DoH)

`p=quarantine` yalnız **DMARC fail** eden postaları etkiler; meşru akışlar fail
etmemeli. Üç gönderici ekseni de `isbulkktc.com` ile hizalı:

| Gönderici | Return-Path / zarf domaini | SPF | Alignment |
|---|---|---|---|
| Resend (Amazon SES) | `send.isbulkktc.com` → `v=spf1 include:amazonses.com ~all` | pass | **relaxed** ✓ |
| Resend Forge | `rsend.isbulkktc.com` CNAME → `send.forge.rmta.net` → `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all` | pass | **relaxed** ✓ |
| DKIM imzası | `d=isbulkktc.com` (`resend._domainkey`) | dkim pass | **relaxed** ✓ |

DMARC relaxed (varsayılan) modda organizational domain eşleştiği için SPF **ve**
DKIM ikisi de align olur. Kök MX (Cloudflare Email Routing) yalnız **inbound**,
gönderim yapmaz → etkilenmez. **Sonuç: `p=quarantine` güvenli.**

### Önerilen kayıt (sahibin onayıyla, Cloudflare DNS)

Mevcut:
```
_dmarc.isbulkktc.com  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1"
```
**Faz 1 (önerilen, hemen):**
```
"v=DMARC1; p=quarantine; rua=mailto:dmarc@isbulkktc.com; ruf=mailto:dmarc@isbulkktc.com; fo=1; adkim=r; aspf=r; pct=100"
```
**Faz 2 (2–4 hafta rapor izlemeden sonra, temizse):**
```
"v=DMARC1; p=reject; rua=mailto:dmarc@isbulkktc.com; ruf=mailto:dmarc@isbulkktc.com; fo=1; adkim=r; aspf=r"
```
Notlar: `adkim`/`aspf` = `r` (relaxed) — alt alan adlı return-path'lerle uyum için
gerekli; `s` (strict) seçilirse `send.`/`rsend.` **fail** eder, seçilmemeli.
`pct=100` faz 1'de tam uygula; riskli bulunursa geçici `pct=25` ile başlanabilir.

### Doğrulama (yayın sonrası)

```bash
dig +short TXT _dmarc.isbulkktc.com
# bir Resend test postasında:
#   Authentication-Results: ... spf=pass dkim=pass dmarc=pass
```
`dmarc=pass` görülene kadar `p=reject`'e geçilmez.

### Bağlı görevler (başka lane)

- **#187 (LANE-VERIFY):** mail-tester.com 10/10 + 3 gerçek adreste yerleşim.
- **#171 (LANE-AUTH):** auth şablonlarına logo/satır içi stil.
- **#195 / #227:** auth SMTP üretimde **zaten** Resend'e bağlı (sahip doğruladı);
  yerel config bloğu LANE-SUPABASE tarafından **yorumlu** eklendi (PR #239), doğru
  bölüm adı **`[auth.email.smtp]`**.

### Ayrıca bu turda doğrulananlar (drift yok)

- **`rsend.isbulkktc.com`** (sahibin "send.forge.rmta.net" iddiası): `rsend` →
  **CNAME** `send.forge.rmta.net`; hedefte TXT SPF + MX `10 feedback.forge.rmta.net`
  var. **Dangling CNAME değil** — Resend Forge return-path'i, geçerli.
- **G-01 (Email Obfuscation):** hâlâ açık (1× `email-decode.min.js`); önceki öneri
  geçerli.
- **DKIM:** hâlâ **1024-bit** (K-01) — rotasyon hâlâ onay bekliyor.
- Cache (dinamik `private/no-store`, `/_next` immutable), WAF (6/6 saldırı → 403,
  meşru → 200), DNSSEC (DS mevcut), CAA, TLS/HSTS — **değişmedi**.

---

## Edge mikro-denetim tur 7 — cache-key / hata yolu / TLS (2026-11-05)

Yeni atanmış `agent:infra` issue'ı yok (#218 LANE-INFRA otomasyonu, #209 env/secret
→ insan). Bu yüzden brief'in 3. (cache rules) ve 2. (SSL/TLS) maddeleri tazelendi
ve hata-yolu boyutu eklendi. **Yeni açık yok; bir doküman düzeltmesi var.**

### Ölçüm

| # | Boyut | Test | Gözlenen | Durum |
|---|---|---|---|---|
| T-01 | Cache-key | `/robots.txt`, `/sitemap.xml` — `Accept-Encoding: gzip` vs `identity` | `Vary: accept-encoding` var; gzip'te `content-encoding: gzip`, identity'de gzip yok → **iki varyant ayrı cache'leniyor** | ✔ doğru |
| T-02 | Cache-key | `/_next/static/*` | `immutable` + `HIT`; `vary: accept-encoding` | ✔ |
| T-03 | Kişiselleştirme sızıntısı | `/robots.txt`, `/sitemap.xml` — `Cookie: NEXT_LOCALE=de/fa`, `Accept-Language: de` | gövde md5 **değişmiyor**, `REVALIDATED` | ✔ sızıntı yok |
| T-04 | Hata yolu | `GET /definitely-not-a-page-xyz123` | **404**, `private, no-store`, `DYNAMIC`; gövdede stack/`node_modules`/`/home/`/`eyJ` **yok** | ✔ |
| T-05 | Hata yolu | `POST /api/push/dispatch` (token yok/yanlış) | **401** JSON, `cache-control: public, max-age=0, must-revalidate`, `DYNAMIC`, gövde 26 B | ✔ |
| T-06 | Hata yolu | `GET /api/email/unsubscribe` (param yok) | **400** `text/plain`, `max-age=0`, `DYNAMIC` | ✔ |
| T-07 | TLS | min sürüm | TLS 1.0/1.1 **reddedilir**, 1.2/1.3 çalışır | ✔ |
| T-08 | TLS | sertifika SAN | `*.isbulkktc.com, isbulkktc.com` — tüm alt alanları kapsıyor | ✔ |
| T-09 | HTTP/3 | `alt-svc` | `h3=":443"; ma=86400` | ✔ |
| T-10 | IPv6 | AAAA var; bu sandbox'tan v6 | **çözümlenemedi** (ortamda v6 çözümleyici yok) | **bakılmadı** |

**T-01 önemli:** `/robots.txt` ve `/sitemap.xml` gzip/identity varyantları ayrı
tutuluyor — `Vary: accept-encoding` doğru. Aksi halde gzip gövdesi bir identity
istemciye servis edilir ve bozuk içerik dönerdi.

### Doküman düzeltmesi

Önceki bölümlerde `[auth.smtp]` yazıyordu; **doğrusu `[auth.email.smtp]`**
(LANE-SUPABASE PR #239 kanıtı: CLI şeması SMTP'yi `[auth.email]` altına koyar,
`[auth.smtp]` bilinmeyen anahtardır ve sessizce yok sayılır). Bu dosyadaki üç
referans düzeltildi.

### Bakılmayan

- **IPv6 (T-10):** sandbox'ta v6 çözümleyici yok → doğrulanamadı.
- **CF zone API** (`CF_API_TOKEN` yok) ve **Resend paneli** (`RESEND_API_KEY`
  geçersiz) — panel durumu okunamadı.

---

## Yönlendirme / host kanonikleştirme denetimi — tur 8 (2026-11-05)

Brief 1. maddesi (DNS + `www` yönlendirmesi) ve AUDIT "yönlendirme zinciri"
boyutu tazelendi. **Bir yeni bulgu (R-01)** var; gerisi temiz.

### Ölçüm

| # | Test | Gözlenen | Beklenen | Durum |
|---|---|---|---|---|
| R-01 | `https://isbulkktc.com./` (sondaki nokta, apex) | **404** (`x-matched-path: /[locale]/[...rest]`) — `/jobs`, `/companies` de 404; ama `/en` 200 | 301/308 apex'e | 🟠 **yeni bulgu (düşük)** |
| R-02 | `https://www.isbulkktc.com./` | **308** → `https://isbulkktc.com/` | Kanonik | ✔ (tutarsız: www çalışıyor, apex çalışmıyor) |
| R-03 | `http://` → `https://` (yol + sorgu) | 301, `Location: https://isbulkktc.com/jobs?q=kktc&page=2` | Yol+sorgu korunur | ✔ |
| R-04 | `https://www` → apex (yol + sorgu) | 308, yol+sorgu korunur | Korunur | ✔ |
| R-05 | Zincir: `http://www.../jobs?q=x` | 301 → `https://www...` → 308 → apex; **2 hop** | ≥3 hop olmamalı | ✔ |
| R-06 | Host case: `ISBULKKTC.COM`, `IsbulkKtc.com` | **200**, apex içerik | 200 | ✔ |
| R-07 | **Açık yönlendirme** | `//evil.com` → **`/evil.com`** (göreli, aynı origin); `/\evil.com`, `/%5Cevil.com`, `/%2F%2Fevil.com`, `/jobs/../../evil.com` → 404 | Asla harici host | ✔ **sızıntı yok** |
| R-08 | `/https://evil.com` | 308 → `/https:/evil.com` (yol içinde) | Harici değil | ✔ |
| R-09 | `/jobs//` | 308 → `/jobs/` | Kabul | ✔ |
| R-10 | HSTS düz `http://` üzerinden | **gönderilmiyor** (RFC: yalnız TLS) | Gönderilmemeli | ✔ |
| R-11 | Canonical ↔ servis edilen URL | `/`→`…/` , `/jobs`→`…/jobs` (sorgu düşer, doğru) | Tutarlı | ✔ |
| R-12 | `hreflang` | 6 dil + `x-default` | Tam | ✔ |
| R-13 | WAF / cache regresyon | 5/5 saldırı → 403; dinamik `DYNAMIC`, `_next` `HIT` | Değişmemeli | ✔ drift yok |

### R-01 — sonlu noktalı apex host (yeni bulgu, düşük önem)

**Kanıt:**
```
curl -sSI https://isbulkktc.com./      → HTTP/2 404   (x-matched-path: /[locale]/[...rest])
curl -sSI https://isbulkktc.com./jobs  → HTTP/2 404
curl -sSI https://isbulkktc.com./en    → HTTP/2 200
curl -sSI https://www.isbulkktc.com./  → HTTP/2 308 → https://isbulkktc.com/
```
3/3 tekrarda **404**. TLS el sıkışması başarılı (SNI `isbulkktc.com.` sertifikayla
eşleşir), CF 404'ü **origin'e** iletir (`x-vercel-id` dolu) → hata **Vercel/Next
host eşleştirmesinde**, CF'de değil.

**Etki (düşük):** `example.com.` geçerli bir FQDN'dir (RFC 1034/3986). Apex için
404 dönerken `www` sürümü 308 yapıyor → **tutarsızlık**; DNS/SNI/redirect
bekleyen istemciler veya bazı tarayıcı/HTTP-istemci kombinasyonları 404 görür.
Yaygın değildir (çoğu istemci sondaki noktayı kırpar), bu yüzden öncelik düşük.

**Öneri:** `next.config.ts`'te `trailingSlash`/host yönlendirmesi yerine, apex
host'u sondaki nokta ile de normalize et — ya da Vercel domain ayarında
`isbulkktc.com.` varyantını `www`/apex'e yönlendir. **CF dışı** (Vercel/app) →
`lane:urun` (veya INFRA) handoff.

### Açık yönlendirme — temiz (kanıt)

`//evil.com` → `Location: /evil.com` **göreli** (tarayıcı `https://isbulkktc.com/evil.com`'a
gider, harici host'a **değil**). Bu, `sanitizeNextPath`'in (bkz. #101) proxy
katmanında da tutarlı olduğunu gösterir. CF ile Vercel alias'ı aynı davranıyor.

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): yönlendirme kuralı (Redirect Rules) panel
  durumu okunamadı; ölçüm canlı HTTP ile.

---

## Edge vs origin başlık karşılaştırması — tur 9 (2026-11-05)

Yeni yöntem: **aynı isteği hem Cloudflare üzerinden (`isbulkktc.com`) hem
origin'den (`isbulkktc-amber.vercel.app`, CF bypass) yapıp başlıkları diff'lemek.**
Bu, CF'nin origin başlıklarını **ezip ezmediğini** doğrudan gösterir. İki gerçek
bulgu (H-01, H-02) çıktı; ikisi de **CF zone ayarı** (bu lane'in alanı).

### Ölçüm — başlık diff'i

| Başlık | Edge (CF) | Origin (Vercel) | Durum |
|---|---|---|---|
| **Strict-Transport-Security** | `max-age=**31536000**` | `max-age=**63072000**` | 🔴 **H-01 eziliyor** |
| **Cache-Control (statik)** | `/robots.txt` `2628000`, `/sitemap.xml` `3600`, `/images/*` `2628000` | hepsi `max-age=0` | 🟠 **H-02 yükseltiliyor** |
| Content-Security-Policy | aynı | aynı | ✔ |
| X-Frame-Options / XCTO / Referrer / Permissions / COOP / CORP / X-Permitted / X-DNS-Prefetch | aynı | aynı | ✔ |
| X-Robots-Tag | yok | `noindex, nofollow` (yalnız `*.vercel.app`) | ✔ beklenen |
| cf-ray / cf-cache-status / nel / report-to / alt-svc | var | yok | ✔ CF'e özgü |

### H-01 — CF, HSTS `max-age`'i eziyor (yeni bulgu)

`next.config.ts:36-37` HSTS'i `max-age=63072000` (2 yıl) olarak tanımlar; origin
bunu **birebir** gönderir (`isbulkktc-amber.vercel.app` → `63072000`). Ama edge
`isbulkktc.com` → **`31536000`** (1 yıl) gönderir; 2/2 ölçümde tekrarlanır.

**Etki (ölçülü, abartısız):** CF origin'in **2 yıllık** politikasını **1 yıla
düşürüyor** → yapılandırılan daha güçlü ömür teslim edilmiyor. HSTS preload
`pending`; resmî asgari **1 yıl** (`hstspreload.org`: "The max-age must be at least
31536000 seconds (1 year)") olduğundan **preload engellenmez** — ama örnek/kabul
edilen kayıt 2 yıldır ve `includeSubDomains` + `preload` birlikte istenir. Yani
etki **düşük**: 1 yıl geçerli, ama config'in dediği 2 yıl değil.

**Düzeltme (CF paneli → sahibin onayı):** SSL/TLS → Edge Certificates →
**Enable HSTS**'i kapat (origin zaten gönderiyor) **veya** CF'deki `max-age`'i
`63072000` + `includeSubDomains` + `preload` yap → config ile edge **tutarlı** olur.
Kod değişmez.

### H-02 — CF Browser Cache TTL, origin `max-age=0`'ı yükseltiyor (yeni bulgu)

Origin statik varlıklar için `cache-control: public, max-age=0, must-revalidate`
gönderir; edge bunu **yükseltir**: `/robots.txt` ve `/images/*` → `2628000` (≈30
gün), `/sitemap.xml` → `3600` (1 saat). Bu, CF'nin **Browser Cache TTL** ayarının
origin'de `max-age` yokken/0 iken devreye girmesindendir.

**Etki:** Genelde **istenen** (edge cache'i besler), ama **tazelik** riski taşır:
`robots.txt`'i 30 gün, `sitemap.xml`'i 1 saat istemci tarayıcıda tutar. `robots.txt`
kuralı değişirse purge gerekir; `sitemap.xml` `revalidate=3600` (bkz.
`src/app/sitemap.ts:17`) ile uyumlu.

**Öneri (CF paneli → onay):** Caching → **Browser Cache TTL** = `Respect Existing
Headers` yap → origin'in `max-age=0`'ı korunur; ya da bilinçli olarak 30 gün
bırakılıp `robots.txt` değişiminde purge planı yazılır. **Kod değişmez.**

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): Edge Certificates (HSTS) ve Caching
  (Browser Cache TTL) panel durumu okunamadı; ölçüm edge↔origin diff ile.
- **WAF/cache regresyon:** 5/5 saldırı → 403, meşru → 200; dinamik HTML `DYNAMIC`
  + `private, no-store` — **drift yok**.

---

## Edge mikro-denetim tur 10 — HTTP semantiği / cache-key / istek kaçakçılığı (2026-11-05)

Yeni atanmış `agent:infra` issue'ı yok (#218 LANE-INFRA otomasyonu, #209 env/secret
→ insan). Brief 3 (cache), 4 (WAF), 5 (bot) + AUDIT sınır-girdi/hata-yolu
boyutları daha derin tarandı. **Yeni açık yok; önceki bulgular (H-01, H-02, R-01,
G-01) hâlâ açık.**

### Ölçüm

| # | Boyut | Test | Gözlenen | Durum |
|---|---|---|---|---|
| U-01 | Cache | Koşullu istek (`If-None-Match`, `If-Modified-Since`) | `/images/*`, `/sitemap.xml`, `/robots.txt` → **304** | ✔ |
| U-02 | Cache | `Range: bytes=0-99` | **206** + `content-range` + `accept-ranges: bytes` | ✔ |
| U-03 | Cache | `HEAD` | 200, `content-length` doğru | ✔ |
| U-04 | Cache-key | Statik varlıkta sorgu dizesi (`?v=1`, `?x=abc`) | her varyant **ayrı** girdi (`MISS`) | ✔ |
| U-05 | Cache-key | `Accept-Encoding` (`gzip`/`br`/`*`/`gzip;q=0`/`identity;q=0`) | `Vary: accept-encoding`; doğru kodlama | ✔ |
| U-06 | Cache | RSC/prefetch (`?_rsc=`, `RSC: 1`, `Next-Router-Prefetch: 1`) | **DYNAMIC** + `private, no-store` (kişisel veri cache'lenmiyor) | ✔ |
| U-07 | Cache | Cacheable yolda `Set-Cookie` var mı | yalnız `NEXT_LOCALE`; cacheable statiklerde yok | ✔ |
| U-08 | Yetki | Özel rotalar **tüm metodlarda** | `PUT/POST/DELETE /profile/dashboard` → **307 /login** (içerik yok) | ✔ |
| U-09 | WAF | Kodlanmış yol kaçışları (`/.%2eenv`, `/%2e%65nv`, `/.env..;/`, `/.env%00`) | 403 (veya güvenli 404/400) | ✔ |
| U-10 | Metod | `X-HTTP-Method-Override`, `OPTIONS`, `PUT/DELETE/PATCH /` | Next.js sayfa rotası her metoda 200 döner (normal; sayfa içeriği, mutasyon yok) | ✔ bilgi |
| U-11 | Güvenlik | Sahte proxy başlıkları (`X-Forwarded-Proto/Host`, `Forwarded`) | canonical **değişmiyor** (`https://isbulkktc.com`), redirect göreli | ✔ |
| U-12 | Güvenlik | İstek kaçakçılığı göstergeleri (CL+TE, TE:chunked, çift `Host`, absolute-form) | absolute-form → **403**; diğerleri Next tarafından normal işlenir | ✔ |
| U-13 | Sınır girdi | `/%00` / `%0a%0d` yol ve sorgu | `%00` → **400**; CRLF **yansımıyor**, canonical `/jobs` | ✔ |
| U-14 | Cache | Cacheable statik yola `PUT/POST/DELETE` | **405** `DYNAMIC` (zehirleme yok) | ✔ |
| U-15 | Analitik | CF Web Analytics beacon (`cloudflareinsights`) | **yok** | ℹ️ bilgi |
| U-16 | Güvenlik | `security.txt` (RFC 9116) | geçerli: Contact/Expires(2027-09-01)/Canonical/Preferred-Languages | ✔ |
| U-17 | TLS | OCSP stapling | `no response sent` (OCSP düşürülüyor; beklenen) | ℹ️ |
| U-18 | Bilgi | `/cdn-cgi/trace` | **kendi** bağlantı bilgini yansıtır (CF standardı, sızıntı değil) | ℹ️ |
| U-19 | Bot | UA testleri (Googlebot/bingbot/curl/HeadlessChrome/Semrush/sqlmap) | yalnız `sqlmap` → **403**; gerisi 200, `cf-mitigated` yok | ✔ |

### Değerlendirme

- **Cache-key bütünlüğü doğru:** koşullu (304), aralık (206), HEAD, sorgu-dizesi
  varyantı ve `Accept-Encoding` ayrımı — hepsi beklenen. Kişisel RSC yanıtları
  `DYNAMIC` + `private, no-store` ile korunuyor (cache-deception'a kapalı).
- **Yöntemler:** Next.js sayfa rotaları (`/`, `/jobs`) her metoda sayfa döner; bu
  **mutasyon yapmaz** (form action'ları ayrı server action). Özel rotalar tüm
  metodlarda **307 /login** → içerik sızmıyor. Cacheable statiklere yazma → **405**.
- **Sahte başlıklar etkisiz:** `X-Forwarded-*`/`Forwarded` canonical veya redirect'i
  değiştirmiyor (trust edilmiyor).
- **Kaçakçılık/CRLF:** absolute-form reddediliyor (403), `%00` → 400, CRLF yol/sorgu
  **yansımıyor**.

### Önceki bulgular — hâlâ açık (drift yok)

| Bulgu | Durum (tur 10) |
|---|---|
| **H-01** CF HSTS `max-age` eziyor | edge `31536000` vs origin `63072000` — **açık** |
| **H-02** CF Browser Cache TTL yükseltiyor | `/robots.txt` edge `2628000` vs origin `0` — **açık** |
| **R-01** trailing-dot apex 404 | `https://isbulkktc.com./` → **404** — **açık** (#261) |
| **G-01** CF Email Obfuscation | 1× `email-decode` — **açık** |
| DMARC `p=quarantine` | hâlâ `p=none` — onayda (#170) |
| DKIM 1024-bit | hâlâ 1024 — onayda (#227) |
| HSTS preload | `pending` |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): Edge Certificates / Caching / Bot Fight Mode
  panel durumu okunamadı; ölçüm canlı HTTP ile.
- **IPv6:** sandbox'ta v6 çözümleyici yok.

---

## Edge mikro-denetim tur 11 — `/_next/image` beklenmeyen içerik eşlemesi (2026-11-05)

Brief 3 (cache) kapsamında görsel optimizasyon uç noktasını (`/_next/image`)
incelerken **öngörülmeyen bir davranış** bulundu (A-01). Düşük etkili; düzeltme
bu lane'in dosyasında değil → `lane:guvenlik`'e handoff.

### A-01 — `/_next/image?url=<göreli aynı-origin yol>` bazı rotaların içeriğini döndürüyor

Normalde `/_next/image` yalnız **görsel** döndürmeli; görsel olmayan bir hedefte
`400 INVALID_IMAGE_OPTIMIZE_REQUEST` vermeli. Ama `url` parametresi **göreli bir
aynı-origin yol** olduğunda, bir dizi rota kendi içeriğini **döndürüyor**:

| `url=` | Edge yanıtı | İçerik tipi |
|---|---|---|
| `/blog` | **200** | `text/html` |
| `/about` | **200** | `text/html` |
| `/contact` | **200** | `text/html` |
| `/api/build-info` | **200** | `application/json` |
| `/llms.txt` | **200** | `text/plain` |
| `/feed.xml` | **200** | `application/rss+xml` |
| `/.well-known/security.txt` | **200** | `text/plain` |
| `/`, `/jobs`, `/en` | 400 | — |
| `/profile/dashboard`, `/company/dashboard`, `/login` | 400 | — |
| `/robots.txt`, `/sitemap.xml` | 400 | — |
| `/.env`, `/.git/config`, `/wp-login.php` | 400 | — |

**Tetikleyici:** yalnız **göreli** yol. Mutlak URL (`https://isbulkktc.com/blog`)
→ **400**. Yani `/_next/image?url=/blog&w=64&q=75` → 200 `text/html`.

**Kanıt (canlı, 2026-11-05):**
```
curl -sS -D - -o /dev/null 'https://isbulkktc.com/_next/image?url=%2Fblog&w=64&q=75'
# HTTP/2 200 · content-type: text/html · x-vercel-cache: HIT
# x-matched-path: /tr/blog · CSP: script-src 'none'; frame-src 'none'; sandbox;
# <title>Kuzey Kıbrıs iş ve kariyer gündemi · İşBul KKTC</title>
```
3/3 taze istekte (benzersiz `cb=`) tekrarlandı; **Vercel alias'ında da aynı**
(`isbulkktc-amber.vercel.app/_next/image?url=%2Fblog`) → **Vercel/Next**, CF değil
(`cf-cache-status: DYNAMIC`; yanıt origin'den geliyor).

### Etki (ölçülü — düşük)

- **Sır/PII sızıntısı yok:** erişilebilen tüm yollar **zaten public ve
  prerender**. Oturum gerektiren rotalar (`/profile/dashboard`,
  `/company/dashboard`, `/login`), WAF-bloklu yollar (`/.env`, `/.git/config`,
  `/wp-login.php`) ve `/robots.txt`/`/sitemap.xml` **400** döner.
- **XSS/script yok:** yanıt katı bir CSP taşır —
  `Content-Security-Policy: script-src 'none'; frame-src 'none'; sandbox;` —
  ve `X-Content-Type-Options: nosniff`. Sayfanın normal CSP'si yerine bu geçer.
- **SEO zararı yok:** yanıtta `X-Robots-Tag` yok ama HTML doğru canonical'ı taşır
  (`<link rel="canonical" href="https://isbulkktc.com/blog"/>`).
- **Kalan risk:** beklenmeyen **URL → içerik** eşlemesi (görsel uç noktası HTML/JSON
  döndürüyor). Yanlış yapılandırılmış bir alt sistemde içerik-tipi karışıklığına
  zemin olabilir; normal sayfa CSP'si yerine "sandbox" CSP'si uygulanır. Bu yüzden
  **kapatılması önerilir**, ama öncelik **düşük**.

### Nerede düzeltilir

`next.config.ts` (hiçbir lane'in sahiplik tablosunda yok; `lane:guvenlik` onu
`tests/security/security-headers.test.ts` ile denetliyor) ve/veya Vercel platform
davranışı. Bu lane repo dosyası tutmaz → **`lane:guvenlik` + `agent:handoff`**
issue açıldı.

### Bu turda ayrıca doğrulananlar (temiz)

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| A-02 | Optimizer remote allowlist (`images.remotePatterns`) | allowlist dışı host → **400**; `pathname` kısıtı (`/api/employer/logo/**` dışı → 400); `http://` → 400; `:8080` port → 400 | ✔ |
| A-03 | Optimizer parametre kirliliği (çift `url`/`w`/`q`) | hepsi **400** | ✔ |
| A-04 | Optimizer `w`/`q` sınırları | `w` ∈ {0,1,-1,99999,abc} → 400; `q` yalnız {75,85,90,95,100} → diğerleri 400 (`qualities` config'i) | ✔ |
| A-05 | WAF bypass (optimizer üzerinden bloklu yollar) | `/.env` vb. → **400**; `/phpmyadmin/`,`/api/devtools/` → 308 (yalnız trailing-slash normalizasyonu, final istek yine WAF'a girer → 403/404) | ✔ bypass yok |
| A-06 | Cookie/auth/XFF ile cache varyansı (`/robots.txt`, `/images/*`) | gövde md5 **değişmiyor** | ✔ |
| A-07 | `/images/*` `Accept` varyansı | hep `image/webp`, aynı girdi | ✔ |
| A-08 | Optimizer yerel görsel yolu | 200 `image/jpeg` + `content-disposition` + `vary: Accept` | ✔ |
| A-09 | WAF/cache regresyon | 3/3 saldırı → 403; `/` `DYNAMIC` | ✔ drift yok |
| A-10 | Önceki bulgular (H-01, H-02, R-01, G-01) | hepsi hâlâ açık | ℹ️ |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok) ve **Vercel platform davranışı** (A-01
  origin'de oluşuyor) — panel/ayar okunamadı; ölçüm canlı HTTP ile.
- **IPv6:** sandbox'ta v6 çözümleyici yok.

---

## Edge mikro-denetim tur 12 — `/_next/static/*` 404'ü 1 yıl cache'leniyor (2026-11-05)

Brief 3 (cache rules) kapsamında **negatif cache** (404'lerin cache'lenmesi)
incelendi. Bir yeni bulgu (N-01) çıktı; etkisi **düşük** ama düzeltmesi net.

### N-01 — `/_next/static/*` altındaki 404'ler 1 yıl edge-cache'leniyor

`/_next/static/**` altında **var olmayan** bir dosya istendiğinde origin
`404` + `cache-control: public, max-age=0, must-revalidate` döner; ama **Cloudflare
bunu `max-age=31536000` (1 yıl) olarak cache'ler** ve sonraki istekleri `HIT` ile
servis eder.

**Kanıt (canlı):**
```
curl -sS -D - -o /dev/null 'https://isbulkktc.com/_next/static/chunks/nope-xyz.js'
# 1. istek: HTTP/2 404 · cache-control: public, max-age=31536000, must-revalidate
#           cf-cache-status: MISS · x-matched-path: /_next/static/not-found.txt
# 2. istek: HTTP/2 404 · cf-cache-status: HIT   ← edge'den
# 3. istek: HTTP/2 404 · cf-cache-status: HIT
```

**Kaynak — origin değil, Cloudflare:**
```
origin (Vercel alias, CF bypass):
  /_next/static/chunks/nope.js → 404 · cache-control: public, max-age=0, must-revalidate
edge (CF):
  /_next/static/chunks/nope.js → 404 · cache-control: public, max-age=31536000, must-revalidate · cf-cache-status: HIT
```
Yani origin `max-age=0` derken CF **1 yıla yükseltiyor** — bu, H-02'de bulunan
**Browser Cache TTL** ayarının bir yansıması. Ama burada `max-age`'i **başarılı bir
statik varlıkla aynı** (gerçek chunk: `public, max-age=31536000, immutable`).

**Kapsam (yalnız bu önek):**
| Yol | 404 cache-control | cf-cache-status |
|---|---|---|
| `/_next/static/**` | `public, max-age=31536000` | **MISS → HIT** (cache'leniyor) |
| `/_next/**` (static dışı) | `private, no-cache, no-store` | BYPASS |
| `/_next/image/**` | `private, no-cache, no-store` | DYNAMIC |
| `/images/**`, `/logos/**`, `/favicon*.ico` | `private, no-cache, no-store` | BYPASS |

**Etki (düşük):**
- **Doğruluk/tazelik:** bir `/_next/static/**` yolu bir kez 404 dönerse, aynı yol
  1 yıl boyunca edge'den **404** olarak servis edilir. Aynı ada sahip bir varlık
  sonradan yayınlanırsa **purge** edilene kadar 404 kalır. Next.js chunk adları
  içerik-hash'li olduğundan pratikte aynı yol yeniden kullanılmaz → **etki düşük**;
  ama insan eliyle eklenen `public/_next/static/**` varlıkları (varsa) risk altında.
- **Sızıntı yok:** gövde 9 baytlık `Not Found`; başlıklarda sır yok.
- **200 akışı etkilenmiyor:** gerçek chunk yine `immutable` + `HIT`.

**Öneri (CF paneli → sahibin onayı):** Caching → **Browser Cache TTL** = `Respect
Existing Headers` (H-02 ile aynı düzeltme). Böylece origin'in `max-age=0`'ı
404'lerde korunur. Alternatif: Cache Rules'ta `/_next/static/**` için
`Edge TTL = Respect origin` + statiklerde origin `immutable` başlığını koru.

### Bu turda doğrulananlar (temiz)

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| N-02 | Negatif cache — diğer önekler | `/images/**`, `/logos/**`, `/_next/**`, `/favicon*.ico` 404 → `private, no-store`/BYPASS | ✔ |
| N-03 | Gerçek statik varlık | `/_next/static/chunks/*.js` → 200 `immutable` + `HIT` | ✔ |
| N-04 | Sorgu-dizesi varyantı (cache'li yollar) | `/robots.txt?x=1` ayrı girdi (`MISS`), gövde **aynı** | ✔ |
| N-05 | Hata yolu cache'i | 404/307 (dinamik) → `private, no-store`, `DYNAMIC` | ✔ |
| N-06 | Yönlendirme cache'i | `www→apex` 308, `max-age=0`; `http→https` 301 | ✔ |
| N-07 | WAF/cache regresyon | 3/3 saldırı → 403; gerçek chunk `immutable`+`HIT` | ✔ drift yok |
| N-08 | Önceki bulgular (H-01, H-02, R-01, G-01, A-01) | hepsi hâlâ açık | ℹ️ |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): Caching (Browser Cache TTL) / Cache Rules
  panel durumu okunamadı; ölçüm edge↔origin diff ile.
- **IPv6:** sandbox'ta v6 çözümleyici yok.

---

## Edge mikro-denetim tur 13 — `images.localPatterns` çift-kodlama ile atlatılıyor (2026-11-06)

Tur 11'de bulunan **A-01** (`/_next/image?url=<göreli yol>` görsel olmayan içerik
döndürüyor) `next.config.ts`'e `images.localPatterns` eklenerek **düzeltildi**
(PR #333, issue #324 kapandı). Bu tur düzeltmenin **eksiksiz olup olmadığı**
sınandı; **hâlâ atlatılabilir** olduğu bulundu (A-01b). Düzeltme `next.config.ts`
+ `tests/security/**` içinde → **LANE-GÜVENLİK** alanı; bu lane dokunmaz, devreder.

### A-01b — çift-kodlanmış nokta segmenti allowlist'i atlıyor

Allowlist eşleşmesi **kodlanmış** yolu görür; ama optimizer içerik için yolu
**çözüp** (decode + normalizasyon) origin'e fetch eder. Araya bir fazla
yüzde-kodlama konunca matcher `true` der, fetch ise hedef rotaya gider:

| İstek (query `url=`) | Gözlenen | Beklenen |
|---|---|---|
| `/images/blog` | **400** | 400 |
| `/images/../blog` | **400** | 400 |
| `/images/%2e%2e/blog` | **400** | 400 |
| `/images/%252e%252e/blog` | **200 `text/html`** | 400 |
| `/images/%25252e%25252e/blog` | **200 `text/html`** | 400 |

Yalnız **nokta kodlaması** değişiyor; eğik çizgiler ham. `%25` = `%` olduğundan
tek fazla kodlama, `%2e`'yi matcher'a `%2e` (sabit, `**` ile eşleşir) olarak
bırakıp fetch'te gerçek `..`'ye çeviriyor.

**Kanıt (canlı, `isbulkktc.com`, 2026-11-06):**
```
# 400 — çift nokta kodlaması yok
curl -sS -o /dev/null -w '%{http_code}\n' --path-as-is \
  'https://isbulkktc.com/_next/image?url=/images/%2e%2e/blog&w=64&q=75'          # 400
# 200 — bir fazla kodlama
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' --path-as-is \
  'https://isbulkktc.com/_next/image?url=/images/%252e%252e/blog&w=64&q=75'      # 200 text/html
# gövde gerçek blog sayfası
curl -sS --path-as-is \
  'https://isbulkktc.com/_next/image?url=/images/%252e%252e/blog&w=64&q=75' \
  | grep -oE '<title>[^<]*'   # <title>Kuzey Kıbrıs iş ve kariyer gündemi · İşBul KKTC
```
`/images/%252e%252e/rehber` → **200** (blog + rehber, prerender HTML). Oturum
rotaları (`/profile/dashboard`), WAF-bloklu yollar (`.env`, `.git/config`,
`wp-login.php`) ve `robots.txt`/`sitemap.xml` yine **400** — yani **yeni
erişilebilir yüzey yok**, yalnız A-01'in kapattığı yüzey geri açılıyor.

**Kök neden — Next matcher'ı (yerelde doğrulandı):**
```
node_modules/next/dist/shared/lib/match-local-pattern.js
  hasLocalMatch(patterns, urlPathAndQuery):
    const url = new URL(urlPathAndQuery, 'http://n');   // pathname NORMALİZE eder
    localPatterns.some(p => matchLocalPattern(p, url))  // picomatch(pattern.pathname, url.pathname)

bun ile matcher'a doğrudan girdi:
  "/images/%252e%252e/blog"  -> hasLocalMatch = true   (URL.pathname = "/images/%252e%252e/blog")
  "/images/%2e%2e/blog"      -> hasLocalMatch = false  (URL.pathname = "/blog")
  "/images/../blog"          -> hasLocalMatch = false  (URL.pathname = "/blog")
```
Tek fazla kodlama `URL.pathname`'i değiştirmiyor → `**` eşleşiyor; optimizer'ın
fetch katmanı ise yolu çözünce `/blog`'a gidiyor. Yani **matcher ile fetch aynı
girdiyi farklı yorumluyor** (asimetri).

**Etki (düşük–orta):** A-01 ile aynı sınıf — görsel uç noktası keyfî (prerender)
rotanın HTML'ini, sayfa CSP'si yerine `sandbox` CSP'siyle döndürüyor. Sır/PII/XSS
yok; ama **düzeltmenin kapattığı sanılan yüzey açık** ve regresyon testi
(`tests/security/security-headers.test.ts` → `hasLocalMatch`) bu varyantı
kapsamıyor, o yüzden CI yeşil kalıyor.

**Düzeltme (LANE-GÜVENLİK):** `url` parametresini matcher'a vermeden **önce
çöz/normalize et** ve öyle eşleştir; ya da Next sürümünde düzeltilmiş
`match-local-pattern` (normalize edilmiş `url.pathname` + kod çözme) var mı
kontrol et. Regresyon testine `%252e%252e` ve `%25252e` varyantlarını ekle
(matcher girdisi olarak; kırmızıdan yeşile kanıtla).

### Önceki bulgular — drift tablosu (tur 13)

| Bulgu | Durum | Kanıt (bu tur) |
|---|---|---|
| **A-01** optimizer göreli yolu döndürüyor | **DÜZELTİLDİ** (#333) — ama **A-01b** ile hâlâ atlatılabilir | `%2Fblog`→400, `%252e%252e`→200 |
| **N-01** `/_next/static/**` 404'ü 1 yıl cache'leniyor | **açık** | 404 `max-age=31536000`, 2. istek `HIT` |
| **H-01** CF HSTS `max-age`'i eziyor | **açık** | edge `31536000` vs origin `63072000` |
| **H-02** CF Browser Cache TTL yükseltiyor | **açık** | `/images/*` edge `2628000` vs origin `0` |
| **R-01** trailing-dot apex 404 | **açık** (#261) | `isbulkktc.com./` → 404; `www…./` → 308 |
| **G-01** CF Email Obfuscation | **açık** | `email-decode.min.js` + `__cf_email__` 1× |
| DMARC `p=none` | **açık** (#170 onay) | `_dmarc` TXT |
| DKIM `resend._domainkey` 1024-bit | **açık** (#227 onay) | DER 162 B ≈ 1024-bit |
| HSTS preload | **`pending`** | hstspreload API |

### Bu turda doğrulananlar (temiz — regresyon yok)

| # | Boyut | Test | Gözlenen | Durum |
|---|---|---|---|---|
| T-01 | WAF | 11 saldırı yolu (`/.env`, `/.git/config`, `wp-login.php`, `phpmyadmin`, `xmlrpc`, `/api/devtools/`, `backup.sql` …) | **403** (config.json 404) | ✔ |
| T-02 | WAF | Normalizasyon/kaçış (`/.ENV`, `/.env.`, `/.env%20`, `//.env`, `/.git//config`, `%2f` varyantları) | 403 (veya güvenli 404/400) | ✔ |
| T-03 | WAF | Yanlış pozitif: `q=o'brien`, `union select`, `drop table`, `<script>`, `../../etc/passwd`, `1 or 1=1` | hepsi **200** | ✔ |
| T-04 | WAF | Kodlanmış traversal **query**'de (`%2e%2e%2f`, `%252e%252e%252f`) | 200 (origin işler, yansıtmaz) | ✔ bilgi |
| T-05 | Cache | Dinamik HTML `/`, `/jobs`, `/companies`, `/en`… | `private, no-store`, `DYNAMIC` | ✔ |
| T-06 | Cache | `/_next/static/**` gerçek varlık | `immutable` + `HIT` | ✔ |
| T-07 | Cache | `/robots.txt` gzip/identity/br + `Vary: accept-encoding` | ayrı girdi, doğru kodlama | ✔ |
| T-08 | Cache | `/sitemap.xml` gzip/identity | `Vary: accept-encoding`, 4027 vs 153112 B | ✔ |
| T-09 | Cache | `/_next/image` gerçek görsel | 200 `image/jpeg`, `immutable`, `vary: Accept` | ✔ |
| T-10 | Cache | Negatif cache — diğer önekler (`/images/**`, `/_next/**` 404) | `no-store`/`BYPASS` | ✔ |
| T-11 | Yetki | `/profile/dashboard`, `/company/dashboard` tüm metodlarda | 307 `/login` | ✔ |
| T-12 | Cache-key | RSC/prefetch (`RSC: 1`, `Next-Router-Prefetch`) | `DYNAMIC` + `private, no-store` | ✔ |
| T-13 | Zehirleme | `Host: evil.com` / `X-Forwarded-Host: evil.com` | **403** / canonical değişmiyor | ✔ |
| T-14 | Zehirleme | `/robots.txt` `Host: isbulkktc.com` | 200 `REVALIDATED` | ✔ |
| T-15 | TLS | min sürüm | TLS 1.0/1.1 `no protocols available`; 1.2+1.3 OK | ✔ |
| T-16 | TLS | ALPN + sertifika | `h2`, `CN=isbulkktc.com`, SAN `*.isbulkktc.com`, LE `YE2` | ✔ |
| T-17 | HTTP/3 | `alt-svc: h3=":443"; ma=86400` + AAAA | var | ✔ |
| T-18 | Yönlendirme | `http apex`→301, `http www`→301, `https www`→308 apex (yol+sorgu korunur) | tek sıçrama, sızıntı yok | ✔ |
| T-19 | Bot | UA: curl/python/Googlebot/HeadlessChrome/Chrome → 200; `sqlmap` → **403**; `cf-mitigated` yok | ✔ |
| T-20 | Rate limit | 30× `/`, 20× `/login`, 15× optimizer bypass | hepsi 200 — throttle yok (F-26) | ℹ️ |
| T-21 | E-posta | SPF lookup bütçesi: apex `include:_spf.mx.cloudflare.net` = **1**, `send` `include:amazonses.com` = **1** (limit 10) | ✔ |
| T-22 | E-posta | `rsend` → CNAME `send.forge.rmta.net` (**dangling değil**), MX `feedback.forge.rmta.net` çözülür | ✔ |
| T-23 | DNS | CAA (comodo/digicert/letsencrypt/pki.goog/ssl.com), DNSSEC `AD=true`, `security.txt` RFC 9116 | ✔ |
| T-24 | Bilgi | `/api/build-info` = `1b1bf26…` = `main` HEAD → **#319 donması bu turda yok** | ✔ |
| T-25 | Sızıntı | `/_next/image` allowlist dışı host / `http:` / port / sorgu | 400 | ✔ |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` bu sandbox'ta tanımlı değil; `/user/tokens/verify`
  → `1000 Invalid API Token`): WAF ruleset, Cache Rules, Browser Cache TTL, Edge
  Certificates (HSTS), Bot Management, Rate limit, Analytics/Logpush panel durumu
  okunamadı. Tüm ölçüm **canlı uçtan** (HTTP/DNS) yapıldı.
- **IPv6:** sandbox'ta v6 çözümleyici yok (AAAA DoH ile doğrulandı, bağlantı denenmedi).
- **`next.config.ts` / `tests/security/**`:** bu lane'in dosyası değil → **A-01b**
  düzeltmesi yapılmadı, LANE-GÜVENLİK'e devredildi (issue açıldı).
