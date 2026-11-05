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

- **`[auth.smtp]` yok (LANE-AUTH, #170 adım 6):** `supabase/config.toml`'da
  `[auth.smtp]` bloğu **yok**; auth e-postaları (confirmation, recovery,
  magic_link, email_change, invite, reauthentication) Supabase'in varsayılan
  SMTP'sinden gidiyor → bu postaların SPF/DKIM'i `isbulkktc.com` ile **hizasız**.
  Kanıt: `grep -niE 'smtp' supabase/config.toml` → boş (config'te yalnız
  `[auth.email]` + `[auth.email.template.*]` var, satır 79–122).
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
