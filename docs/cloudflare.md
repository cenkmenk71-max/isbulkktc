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

### Bulgu kimliği şeması

Her bulgu `ÖNEK-NN` biçiminde kalıcı bir kimlik taşır; rapor blokları, drift
tabloları ve issue'lar bu kimlikle atıf yapar. **Yeni bulgu eklemeden önce ailenin
kullanılmış aralığını `grep` ile doğrula.** Aynı kimliği iki farklı bulguya vermek
atıfları belirsizleştirir; bu dokümanda iki kez yaşandı: tur 18'de `V-01`
çakışması (`D-03`), tur 26/27'de `N-01..N-06` kümesinin negatif-cache aralığıyla
çakışması — ikincisi bu turda `N-11..N-16` olarak ayrıldı.

| Önek | Kapsam | Tanımlandığı yer |
|---|---|---|
| `F-` | Ana bulgu tablosu (DNS, TLS/HSTS, cache, WAF, bot, rate-limit, analytics) | `## Bulgu tablosu` |
| `A-` | `/_next/image` optimizer denetimi (allowlist/normalizasyon) | tur 11–14 |
| `E-` | E-posta kimlik doğrulama (SPF/DKIM/DMARC/MTA-STS) | issue #170 |
| `K-` | DKIM anahtar/selector denetimi | issue #227 |
| `G-` | Edge genel bulgular (ör. CF Email Obfuscation) | tur 4 |
| `C-` | Bulunabilirlik / crawler erişimi | issue #163 |
| `H-` | Edge ↔ origin başlık karşılaştırması (HSTS, Browser Cache TTL) | tur 9 |
| `R-` | Yönlendirme / host kanonikleştirme | tur 8 |
| `T-` | Tur bazlı ölçüm/denetim tabloları (kontrol listesi) | tur 7+ |
| `U-` | HTTP semantiği (304 / Range / HEAD / koşullu istek) | tur 10 |
| `V-` | İstek kaçakçılığı / method semantiği + bot doğrulama | tur 10+ |
| `W-` | **İki kapsam:** `W-01` WAF bulgusu; `W-18`/`W-19`/`W-20` tur-bazlı canlı ölçüm tabloları (tur 18/19/20, sonuncusu HSTS preload) | tur 10+ |
| `N-` | **Üç aralık:** `N-01..N-08` negatif-cache (tur 12–25); `N-11..N-16` WAF `%2F` kümesi (tur 26+); `N-17` bilgi, `N-18..N-22` WAF kaçış/kapsama + bot UA, `N-23` `/_next/static` 404 1-yıl cache (tur 34) | tur 12+ |
| `D-` | Doküman düzeltmeleri / drift kayıtları | tur 14+ |
| `O-` | Canlı kesinti / origin erişilebilirliği (ör. `O-01` Vercel `402 DEPLOYMENT_DISABLED`) | tur 29 |
| `M-` | Panel/manuel gözlemler + meta kayıtlar | tur 25 |
| `P-` | Kapanan kayıtlar (ör. `P-01` prerender cache) | tur 22 |
| `SW-` | Service worker cache | tur 14 |
| `SR-` | Speed Brain / `speculation-rules` | tur 22+ |

- `-NN` iki hanelidir. Küçük `r` soneki **aynı bulgunun yeniden ölçümü/düzeltmesidir**
  (`H-01r`, `N-11r`, `SR-01r`); `W-18-1` gibi üçüncü parça bir alt satırdır.

| # | Nokta | Mevcut | Olması gereken | Kanıt |
|---|---|---|---|---|
| F-01 | Apex A kaydı | `104.21.29.3`, `172.67.171.53` — CF **proxied** | Proxied kalmalı | DoH A |
| F-02 | Apex AAAA | `2606:4700:3034::ac43:ab35`, `2606:4700:3036::6815:1d03` | Var (iyi) | DoH AAAA |
| F-03 | `www` | A → aynı CF IP'leri; `http://www` → **301** `https://www` (CF); **`https://www` → apex YÖNLENDİRMESİ YOK** — tam gövdeyi **200** servis ediyor | Apex'e **301** olmalı (tek sıçrama) | `HTTP` — **H-03 (tur 36)** |
| F-04 | `http` → `https` | `http://isbulkktc.com` → **301** `https://isbulkktc.com/` | Always Use HTTPS açık | `HTTP` |
| F-05 | Mail (CF Email Routing) | MX `route{1,2,3}.mx.cloudflare.net`; SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`; DKIM `cf2024-1._domainkey` (2048-bit) | OK | DoH MX/TXT |
| F-06 | DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1` | `p=none` izleme modunda — **zorlamaya geçiş planı yok** | DoH TXT |
| F-07 | CAA | `0 issue` comodoca/digicert/letsencrypt/pki.goog/ssl.com + `issuewild` aynıları | Geniş ama geçerli | DoH CAA |
| F-08 | **Origin doğrudan erişim** | `https://isbulkktc-amber.vercel.app` CF'yi **tamamen atlıyor**: `server: Vercel`, `cf-ray` yok, rate-limit yok (`POST /login` 12/12 200, apex'te aynı seri 429). **tur 24 nüansı:** alias'ın **kendi** koruması var — `x-vercel-mitigated: challenge` (Vercel Security Checkpoint) **saldırı-yolu taraması** ile tetiklenir, hacimle değil; challenge **IP'ye özel** (temiz egress → 200) ve tetikleyen IP'de **en az 6 dk** kalıcı (D-14) | Vercel Deployment Protection (Vercel Authentication / Protection Bypass) veya alias'ı public bırakma | `HTTP` alias |
| F-09 | TLS min sürüm | **SSL Labs (tur 17): 4/4 endpoint grade `A+`, yalnız TLS 1.2 + 1.3 sunuluyor** (1.0/1.1 yok). Sandbox `openssl`'de 1.0/1.1 istemci tarafı da yok, o yüzden "`no protocols available`" **sunucu reddi kanıtı DEĞİL** (bkz. tur 17 düzeltmesi) | Min TLS 1.2 — doğru | SSL Labs API + Python `ssl` |
| F-10 | Sertifika | Let's Encrypt `YE2`, SAN `*.isbulkktc.com, isbulkktc.com`, geçerlilik 2026-09-19 → 2026-12-18 | OK (CF Universal SSL) | `openssl x509` |
| F-11 | HSTS | `max-age=31536000; includeSubDomains; preload` | Doğru | `HTTP` |
| F-12 | HSTS preload | `hstspreload.org` → **`status: pending`** | `preloaded` olana kadar bekle; kaydı geri çekme | hstspreload API |
| F-13 | DNSSEC | Açık — DS `2371 13 2 36e0…775b`, apex+çoğu alt alan `AD=true`; **`rsend` CNAME'i `rmta.net`'e gidiyor (DS yok) → `AD=false`** (bkz. tur 18, D-01) | Apex doğru; kısmi kapsam bilinmeli | DoH DS + `AD` |
| F-14 | Cache — dinamik HTML | `/`, `/jobs`, `/companies`, tüm dil önekleri: `cache-control: private, no-cache, no-store…`, `cf-cache-status: DYNAMIC`. **Prerender** rotalar (`/blog`, `/contact`, `/freelance`, `/about`, `/privacy`, `/terms` + dil-önekli varyantlar) da artık `private, no-cache, no-store, max-age=0, must-revalidate` (tur 22 — P-01 #403 ile **kapandı**) | Dinamik ve prerender asla cache'lenmemeli — **doğru** | `HTTP` |
| F-15 | Cache — statik | `/_next/static/*`: `public, max-age=31536000, immutable`, `cf-cache-status: HIT`; **metin varlıklarında (CSS/JS) edge `vary: accept-encoding` ekler, fontta eklemez** (tur 21, D-07; **ölçüm yöntemi:** yalnız GET'te görünür, `curl -I` göstermez — tur 22, D-10) | Doğru | `HTTP` |
| F-16 | Cache — `robots.txt` | `public, max-age=2628000` (≈30 gün), `REVALIDATED` | Kabul; ama `noindex` kuralı **`Disallow` etmiyor** (SEO lane) | `HTTP` |
| F-17 | Cache — `sitemap.xml` | `public, max-age=3600`, `EXPIRED`/`REVALIDATED` | 1 saat TTL makul; `<lastmod>` tazeliği SEO lane'de | `HTTP` |
| F-18 | Cache — `/images/*` | `public, max-age=2628000`, `MISS`→`REVALIDATED`, ETag var | Görseller edge-cache'leniyor, OK | `HTTP` |
| F-19 | Cache — `manifest.webmanifest` | `public, max-age=0, must-revalidate`, `DYNAMIC` | Kabul | `HTTP` |
| F-20 | WAF — saldırı yolları | 11/12 yol **403** (CF "Attention Required!"): `/.git/config`, `/.env`, `/.svn/entries`, `/.aws/credentials`, `/wp-login.php`, `/wp-admin/`, `/phpmyadmin/`, `/xmlrpc.php`, `/vendor/phpunit/…/eval-stdin.php`, `/api/devtools/`, `/backup.sql`; `/config.json`→404 | 403 | `HTTP` |
| F-21 | WAF — metod | `TRACE` → **405**, `TRACK` → **403** | OK | `HTTP` |
| F-22 | WAF — büyük/küçük harf | `/.GIT/config`, `/WP-LOGIN.PHP`, `/API/DEVTOOLS/` → **403** | `lower()`/case-insensitive çalışıyor | `HTTP` |
| F-23 | WAF — kaçış (bypass) denemeleri | `/.git%2fconfig`, `/api/devtools%2f`, `/api/devtools` (slash yok) → **404** (WAF tetiklenmiyor ama origin de sunmuyor) | Savunma derinliği: origin 404 verdiği için istismar edilemez | `HTTP` |
| F-24 | WAF — yanlış pozitif | Meşru arama: `/jobs?q=o'brien`, `union+select`, `drop+table`, `<script>alert(1)</script>`, `../../etc/passwd` → hepsi **200** | Meşru trafiği engellemiyor — **iyi** | `HTTP` |
| F-25 | Bot koruması | Bot UA `sqlmap/1.7` → **403**; `curl` UA → 200 | Yönetilen bot koruması aktif — **düzeltme (tur 33, N-22): yalnız `sqlmap/`-önekli UA'da; çıplak `sqlmap` ve diğer scanner'lar atlıyor** | `HTTP` |
| F-26 | Rate limit | **tur 23 — önceki iddia çürütüldü.** CF auth **POST**'larını limitliyor: `POST /login` hızlı seri → ~10 istekte **429** (`error code: 1015`, `retry-after: 10`), kova `/login`+`/register`+`/forgot-password`+`/reset-password` arasında **paylaşımlı**; `GET /login` ve `POST /` limite **girmez**. `isbulkktc-amber.vercel.app` alias'ı (CF'siz) aynı seride 12/12 **200** → limit **CF'ye ait** | Auth brute-force edge'de **korumalı**. Eski "hiç throttle yok" iddiası **yalnız GET** ölçtüğü için yanlıştı (D-12) | `HTTP` |
| F-27 | Analytics/Logpush | API scope yok → okunamadı | `Zone → Analytics → Read` ekle | — |
| F-28 | `103 Early Hints` | HTTP/2'de apex, `200`'den önce aynı `Link` ön-yükleme kümesini `103` ile gönderir; origin'de ve HTTP/1.1'de yok (tur 24, D-13) | Doğru — `curl -D -`'nin "çift `link:`"i budur, bug değil | `HTTP` |
| F-29 | Sıkıştırma | HTML/CSS `br`/`gzip`/**`zstd`**/`identity` istemciye göre; `content-encoding` birebir, `vary: accept-encoding` (tur 24, D-16) | Doğru — cache-key encoding-duyarlı | `HTTP` |

## WAF bypass / skip deliği değerlendirmesi

- **Kural içi delik:** case (`lower()`), nokta/eğik çizgi tekrarı (`/.git//config`, `/.git/./config`), `wp-login.php` son ekleri (`.`, `;`, `/`) **hepsi 403**. Kodlanmış `%2f` varyantları WAF'ı geçiyor ama origin **404** döndüğü için sömürülebilir bir yol yok (defense-in-depth origin'de tutuyor).
- **Kural dışı delik (asıl bulgu):** WAF/bot/rate-limit yalnızca CF edge'inde. `isbulkktc-amber.vercel.app` alias'ı CF'yi tamamen atlıyor (F-08). Edge korumalarını "atlatmanın" en kolay yolu bu adresi bilmek. **Öneri:** Vercel'de Deployment Protection'ı (Standard/Premium) aç, ya da alias'ı yalnızca CI servisleri için "Protection Bypass for Automation" ile sınırla. Bu, LANE-CLOUDFLARE alanı dışında (Vercel) olduğundan **sahibin/INFRA'nın onayına** sunulur.

## Onay bekleyen değişiklikler (uygulanmadı)

1. ~~Rate limit kuralını yeniden tahsis et (F-26).~~ **tur 23'te geçersiz — premise yanlıştı.** CF auth POST'larını zaten limitliyor (~10 istek/~10 sn, `error code: 1015`); kural "leak-check'e harcanmış, brute-force korumasız" değil. Geriye kalan **doğrulama** işi (acil değil): (a) eşik yeterli mi (10/~10 sn makul ama gevşek; sıkılaştırma istenirse `Zone → WAF → Rate limiting` panelinden), (b) limit **yalnız POST** olduğundan GET tabanlı hesap-numaralandırma açık kalır (brute-force değil, keşif). **Yıkıcı değişiklik yok; mevcut koruma yeterli.**
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
| C-04 | `sqlmap/1.7` `/` | **403** (bot koruması yalnız kötü niyetli UA'yı kesiyor) — **tur 33/N-22: `sqlmap/1.7` 403 ama çıplak `sqlmap` 404; eşleşme `sqlmap/` literaline sabitli** | `HTTP` |
| C-05 | `cf-mitigated` başlığı (tüm probe'lar) | **hiç yok** (`count=0`) | `HTTP` |
| C-06 | Googlebot gövdesi gerçek sayfa mı | `<title>KKTC İş İlanları…</title>`, 279 KB; `just a moment`/`cf-chl` yok | `HTTP` |
| C-07 | `robots.txt` / `sitemap.xml` Googlebot vs varsayılan UA | **birebir aynı** (`diff` boş) | `HTTP` |
| C-08 | Derin ilan sayfası (Googlebot) | 200, `<title>…Depo Sorumlusu…</title>`, `JobPosting` JSON-LD var, canonical doğru | `HTTP` |
| C-09 | `www.isbulkktc.com` (her yol) | **200**, apex ile bayt-özdeş (yönlendirme YOK) | Apex'e 301 olmalı — **H-03 (tur 36)** | `HTTP` |
| C-10 | `http://` → `https://` | 301 (doğru) | `HTTP` |
| C-11 | `X-Robots-Tag` (/, /jobs, /companies, /en, robots, sitemap) | **yok** (site geneli noindex yok) | `HTTP` |
| C-12 | `<meta name="robots">` (/, /jobs, /en) | yok = varsayılan index,follow | `HTTP` |
| C-13 | `google-site-verification` meta (üretim HTML) | **YOK** — `grep -c site-verification` = **0** (6 dilde, 2026-11-10). Eski "var" kaydı **yanlıştı** → **V-01** (tur 38) | `HTTP` |
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
| **G-01** | **CF Email Obfuscation** | Footer e-posta linki `/cdn-cgi/l/email-protection#<hex>`'e çevriliyor; `__cf_email__` span + `email-decode.min.js` enjekte — **ama aynı yanıtta adres JSON-LD + RSC payload'da düz (7×)** (tur 21) | HTML'de düz `mailto:` | 🔴 **yeni bulgu, onay bekliyor** |
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
  var ama **A/AAAA yok** → hedef adreslenemiyor. SPF/DKIM MX+SPF üzerinden
  çalışır, HTTP gerekmez; ancak "dangling değil" iddiasının kanıtı yanlıştı
  (tur 18'de A kaydı MX hedefinden okunmuştu). Bkz. tur 20, D-06.
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
| T-01 | Cache-key | `/robots.txt`, `/sitemap.xml` — `Accept-Encoding: gzip`/`br` vs `identity` | **`/sitemap.xml` `Vary: accept-encoding` döner; `/robots.txt` dönmez** (10/10 örnek + cache-bust `?cb=`). Yine de kodlama doğru: identity 228 B düz, gzip 124 B ve `gunzip` ile birebir açılıyor, br ayrı → **gözlenen bozulma yok** (tur 21, D-08) | ✔ kodlama doğru; `Vary` iddiası yanlıştı |
| T-02 | Cache-key | `/_next/static/*` | `immutable` + `HIT`; edge `Vary` **metin varlıklarında** `accept-encoding`, **fontta yok** (tur 21, D-07) | ✔ |
| T-03 | Kişiselleştirme sızıntısı | `/robots.txt`, `/sitemap.xml` — `Cookie: NEXT_LOCALE=de/fa`, `Accept-Language: de` | gövde md5 **değişmiyor**, `REVALIDATED` | ✔ sızıntı yok |
| T-04 | Hata yolu | `GET /definitely-not-a-page-xyz123` | **404**, `private, no-store`, `DYNAMIC`; gövdede stack/`node_modules`/`/home/`/`eyJ` **yok** | ✔ |
| T-05 | Hata yolu | `POST /api/push/dispatch` (token yok/yanlış) | **401** JSON, `cache-control: public, max-age=0, must-revalidate`, `DYNAMIC`, gövde 26 B | ✔ |
| T-06 | Hata yolu | `GET /api/email/unsubscribe` (param yok) | **400** `text/plain`, `max-age=0`, `DYNAMIC` | ✔ |
| T-07 | TLS | min sürüm | **SSL Labs: 4/4 `A+`, yalnız 1.2+1.3** (sandbox istemcisinde 1.0/1.1 derlenmemiş → `no protocols available` **sunucu kanıtı değil**; bkz. tur 17 düzeltmesi) | ✔ |
| T-08 | TLS | sertifika SAN | `*.isbulkktc.com, isbulkktc.com` — tüm alt alanları kapsıyor | ✔ |
| T-09 | HTTP/3 | `alt-svc` | `h3=":443"; ma=86400` | ✔ |
| T-10 | IPv6 | AAAA var; bu sandbox'tan v6 | **çözümlenemedi** (ortamda v6 çözümleyici yok) | **bakılmadı** |

**T-01 önemli (tur 21 düzeltmesi):** önceki tur `/robots.txt` **ve**
`/sitemap.xml` için "`Vary: accept-encoding` var" diyordu. Canlı ölçüm (tur 21)
bunu **ayırıyor**: `/sitemap.xml` `vary: accept-encoding` döner, `/robots.txt`
**dönmez**. Her ikisinde de kodlama doğrudur (identity düz gövde, gzip açılıyor),
yani bugün gözlenen bozulma yok — ama `Vary`'siz `/robots.txt` teoride paylaşımlı
bir önbelleğin gzip gövdesini identity istemciye servis etme riskini taşır.
`/sitemap.xml`'in `Vary`'si origin'den değil **edge**'den gelir (origin ikisinde
de `Vary` yok); CF metin yanıtlarında `Vary`'yi tutarsız ekliyor. İzlenmeli.

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
| R-02 | `https://www.isbulkktc.com./` | **404** (yönlenmiyor) — tur 36 teyidi | Kanonik | ⚠️ **H-03** |
| R-03 | `http://` → `https://` (yol + sorgu) | 301, `Location: https://isbulkktc.com/jobs?q=kktc&page=2` | Yol+sorgu korunur | ✔ |
| R-04 | `https://www` → apex (yol + sorgu) | **yönlendirme YOK (200)**, sorgu www'de kalır | 301, sorgu korunur | ❌ **H-03** |
| R-05 | Zincir: `http://www.../jobs?q=x` | 301 → `https://www...` → **200** (apex'e varmıyor); **2 hop, son durak www** | ≥3 hop olmamalı, apex'te bitmeli | ❌ **H-03** |
| R-06 | Host case: `ISBULKKTC.COM`, `IsbulkKtc.com` | **200**, apex içerik | 200 | ✔ |
| R-07 | **Açık yönlendirme** | `//evil.com` → **`/evil.com`** (göreli, aynı origin); `/\evil.com`, `/%5Cevil.com`, `/%2F%2Fevil.com`, `/jobs/../../evil.com` → 404 | Asla harici host | ✔ **sızıntı yok** |
| R-08 | `/https://evil.com` | 308 → `/https:/evil.com` (yol içinde) | Harici değil | ✔ |
| R-09 | `/jobs//` | 308 → `/jobs/` | Kabul | ✔ |
| R-10 | HSTS düz `http://` üzerinden | **gönderilmiyor** (RFC: yalnız TLS) | Gönderilmemeli | ✔ |
| R-11 | Canonical ↔ servis edilen URL | `/`→`…/` , `/jobs`→`…/jobs` (sorgu düşer, doğru) | Tutarlı | ✔ |
| R-12 | `hreflang` | 6 dil + `x-default` | Tam | ✔ |
| R-13 | WAF / cache regresyon | 5/5 saldırı → 403; dinamik `DYNAMIC`, `_next` `HIT` | Değişmemeli | ✔ drift yok |
| R-14 | `http://www` → **301** `Location: https://www/...` (host **www** kalıyor) | Yalnız **şema** yükselir, host apex'e kanonikleşmez → `www` 200 tam gövde | Host da apex'e 301 olmalı | ❌ **H-03r (tur 37)** |

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
| U-16 | Güvenlik | `security.txt` (RFC 9116) | geçerli: Contact/Expires(2027-09-06)/Canonical/Preferred-Languages | ✔ |
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
| T-07 | Cache | `/robots.txt` gzip/identity/br | ayrı girdi, doğru kodlama; **`Vary` yok** (tur 21/T-01 düzeltmesi — bu satır önce yanlışlıkla `Vary: accept-encoding` diyordu) | ✔ |
| T-08 | Cache | `/sitemap.xml` gzip/identity | `Vary: accept-encoding`, 4027 vs 153112 B | ✔ |
| T-09 | Cache | `/_next/image` gerçek görsel | 200 `image/jpeg`, `immutable`, `vary: Accept` | ✔ |
| T-10 | Cache | Negatif cache — diğer önekler (`/images/**`, `/_next/**` 404) | `no-store`/`BYPASS` | ✔ |
| T-11 | Yetki | `/profile/dashboard`, `/company/dashboard` tüm metodlarda | 307 `/login` | ✔ |
| T-12 | Cache-key | RSC/prefetch (`RSC: 1`, `Next-Router-Prefetch`) | `DYNAMIC` + `private, no-store` | ✔ |
| T-13 | Zehirleme | `Host: evil.com` / `X-Forwarded-Host: evil.com` | **403** / canonical değişmiyor | ✔ |
| T-14 | Zehirleme | `/robots.txt` `Host: isbulkktc.com` | 200 `REVALIDATED` | ✔ |
| T-15 | TLS | min sürüm | **SSL Labs: 4/4 `A+`, yalnız 1.2+1.3** (sandbox istemcisinde 1.0/1.1 yok → `no protocols available` **sunucu kanıtı değil**) | ✔ (tur 17 düzeltmesi) |
| T-16 | TLS | ALPN + sertifika | `h2`, `CN=isbulkktc.com`, SAN `*.isbulkktc.com`, LE `YE2` | ✔ |
| T-17 | HTTP/3 | `alt-svc: h3=":443"; ma=86400` + AAAA | var | ✔ |
| T-18 | Yönlendirme | `http apex`→301, `http www`→301; **`https www`→200 (apex'e yönlenmiyor)** | tek sıçrama, sızıntı yok | ❌ **H-03** |
| T-19 | Bot | UA: curl/python/Googlebot/HeadlessChrome/Chrome → 200; `sqlmap` → **403**; `cf-mitigated` yok | ✔ |
| T-20 | Rate limit | 30× `/`, 20× `/login` (**GET**) | GET'te 200 — **ama** tur 23'te CF'nin auth **POST**'larını ~10 istekte 429'ladığı bulundu (F-26); bu satırın ölçümü yalnız GET'i kapsıyordu | ⚠️→ℹ️ (tur 23) |
| T-21 | E-posta | SPF lookup bütçesi: apex `include:_spf.mx.cloudflare.net` = **1**, `send` `include:amazonses.com` = **1** (limit 10) | ✔ |
| T-22 | E-posta | `rsend` → CNAME `send.forge.rmta.net`; hedefte MX+TXT var ama **A/AAAA yok** (adres kaydı yalnız MX hedefi `feedback.forge.rmta.net`'te, `3.231.87.173`) — bkz. tur 20, D-06 | ⚠️ hedef adreslenemiyor |
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

---

## Edge mikro-denetim tur 14 — #359 düzeltme denetimi + WAF normalizasyon + SW-01 (2026-11-06)

Tur 13'te bulunan **A-01b** (`/_next/image` allowlist'i çift-kodlama ile
atlatılıyor) için **LANE-GÜVENLİK** PR #359'u açtı (issue #356) — kod `main`'de
düzeltildi ama **canlıya deploy edilmedi**. Bu turda (a) canlı build'in gerçekten
düzeltilip düzeltilmediği saldırgan gözüyle sınandı, (b) WAF'ın
kodlama/normalizasyon davranışı yeniden tarandı ve (c) canlı Cloudflare edge
yeniden ölçüldü.

### A-01c — #359 kod düzeltmesi (**canlıda KAPANDI** — tur 14.1'de doğrulandı)

Tur 13'te bulunan **A-01b** için **LANE-GÜVENLİK** PR #359'u açtı (issue #356):
yerel desenler artık bir **görsel uzantısı** şart koşuyor
(`/images/**/*.@(webp|png|jpg|jpeg|avif|svg)`, `next.config.ts:79-82`). Ama
**canlı production hâlâ eski, savunmasız build'i servis ediyor** — çift-kodlanmış
nokta-segmenti allowlist'i atlayıp **ön-render edilmiş rotanın gövdesini** döndürüyor.

**Kanıt — canlı build kimliği:** `/api/build-info` → `commit: ee58dad6…` (#359
`main`'de `97afb54`'ten sonra; deploy edilen sürüm #359'u **içermiyor**).

**Kanıt — canlı atlatma (edge):**
```
# tek-kodlama: matcher normalleştirir → reddedilir
curl -sS 'https://isbulkktc.com/_next/image?url=%2Fimages%2F%2e%2e%2Fblog&w=256&q=75'
→ 400 text/plain

# çift-kodlama: matcher kodlanmış görür, optimizer bir kez daha çözer → GEÇER
curl -sS 'https://isbulkktc.com/_next/image?url=%2Fimages%2F%252e%252e%2Fblog&w=256&q=75'
→ 200 text/html · 142604 bayt · <title>Kuzey Kıbrıs iş ve kariyer gündemi · İşBul KKTC</title>
→ cache-control: public, max-age=0, must-revalidate · cf-cache-status: DYNAMIC
→ content-security-policy: script-src 'none'; frame-src 'none'; sandbox;
→ x-content-type-options: nosniff
```

**Sızdırılan hedef kapsamı (canlı):** çift-kodlamalı traversal, `isValidRoute`
filtresini geçen **statik/ön-render HTML rotalarında** içerik döndürüyor:

| Hedef | Canlı sonuç |
|---|---|
| `/blog`, `/about`, `/contact`, `/rehber`, `/packages`, `/freelance`, `/sss` | **200 text/html** |
| `/blog/<slug>` (ör. `kktc-is-piyasasi-guncel-gorunum`) | **200 text/html** |
| `/jobs`, `/companies`, `/is-ilanlari`, `/jobs/<slug>` | 400 (ön-render değil / filtre) |
| `/api/build-info`, `/llms.txt`, `/robots.txt`, `/login`, `/profile/dashboard`, `/api/email/unsubscribe` | 400 |

Üçlü kodlama (`%25252e`) da aynı şekilde 200 veriyor (matcher literal görür, fetch
tek çözer). Yani **canlı atlatma açık**; düzeltme yalnızca kodda.

**Kod tarafı (main, post-#359) — düzeltme doğru ve test edilmiş:**
- `next.config.ts:79-82` uzantı koşulu; `tests/security/security-headers.test.ts:267-292`
  "her yerel desen görsel uzantısı şart koşar" **self-test**'i ile ratchet'lenmiş
  (yeni desen eklenirse kırmızı olur).
- 344 yerel görselin uzantısı `webp/png/jpg/jpeg` (hepsi küçük-harf) → sıkılaştırma
  hiçbir gerçek görseli düşürmüyor (regresyon yok, doğrulandı).
- Matcher↔fetch decode farkı (`match-local-pattern.js` `URL.pathname` vs
  `image-optimizer.js` `parseReqUrl`) **kök neden olarak duruyor**; #359 bunu
  yalnızca **uzantı koşuluyla** sınıf olarak kapatıyor — yeni bir desen eklenirse
  tuzak geri gelir.

**Etki (düşük):** sızan içerik **herkese açık, ön-render edilmiş HTML** (gizli
veri/PII yok); yanıt `sandbox` + `script-src 'none'` + `nosniff` taşır, `DYNAMIC`
(cache'lenmez). Yine de bir "içerik karıştırma / optimizer üzerinden rota okuma"
yüzeyi ve **canlı↔main sapması**.

**Yerleşim:** kod `next.config.ts` + `tests/security/**` = **LANE-GÜVENLİK** (PR
#359 açık/kapalı, kod hazır); **deploy** = LANE-TESLİMAT/INFRA (#319 donması).
Bu lane yalnızca **canlı kanıtı** kaydeder; kod düzeltmesi yapmaz. Eylem: #359
build'i **canlıya alınmalı** (donma çözülünce) — aksi hâlde canlı açık kalır.

**✅ GÜNCELLEME (2026-11-06, aynı gün, tur 14.1): A-01c canlıda KAPANDI.** Deploy
donması çözülüp canlı build ilerledi: `/api/build-info` → **`1d804b6`** (#359'u
içerir). Aynı PoC'ler yeniden ölçüldü — **hepsi 400**:
`blog`,`about`,`contact`,`rehber`,`packages`,`freelance`,`sss`,`jobs`,`login`,
`llms.txt`,`api/build-info` → **400 text/plain**. Yani canlı↔main sapması
kapandı, #359 artık üretimde. (SW-01 için bkz. aşağıdaki #365 güncellemesi.)

### SW-01 — `/sw.js` CF edge'de 30 gün cache'leniyor (yeni bulgu, orta)

Service worker `/sw.js` origin'de `cache-control: public, max-age=0,
must-revalidate` dönerken **Cloudflare edge `max-age=2628000` (30 gün)** ile
cache'liyor. Kayıt `updateViaCache: "none"` kullanıyor ama CF edge'i origin'in
`max-age=0`'ını ezip 30 güne yükselttiği için "none" **edge katmanını**
atlayamaz; tarayıcı `REVALIDATED` ile etag alır, ama edge her seferinde origin'e
gider (aşağıda kanıt).

**Kanıt (canlı):**
```
edge  : curl -sSI https://isbulkktc.com/sw.js
        cache-control: public, max-age=2628000, must-revalidate   ← CF yükseltiyor
        cf-cache-status: REVALIDATED (her istekte)
origin: curl -sSI https://isbulkktc-amber.vercel.app/sw.js
        cache-control: public, max-age=0, must-revalidate          ← origin doğru
```
- `age: 0` + `REVALIDATED` → CF origin'e revalidate ediyor ama edge kopyasını
  **30 güne kadar** `max-age`'li tutuyor.
- `/robots.txt` (origin `max-age=0`) ve `/images/*.webp` (origin `max-age=0`) da
  aynı 30 gün edge TTL'ini alıyor → **H-02** (Browser Cache TTL) sınıfının aynısı.
- `/offline.html` (origin `max-age=0`) ise **DYNAMIC** (cache'lenmiyor) → kural
  uzantı tabanlı (`*.js`, `*.webp`), `/offline.html`'i kapsamıyor.

**Etki (orta):** `sw.js` bir gün edge'den `max-age`'i **taze** sayılıp origin
kontrolü atlanırsa, yeni bir SW sürümü (ör. `CACHE_VERSION` artışı) günlerce
yayılmaz; PWA kullanıcıları eski SW ile takılı kalır. Şu an `REVALIDATED` olduğu
için tazelik korunuyor, ama bu **kırılgan**: CF cache davranışı değişirse sessizce
eskiye döner.

**Devir:** issue **#364** (`lane:guvenlik` + `agent:handoff`) — repo-tarafı
`next.config.ts` `headers()` düzeltmesi.

**✅ GÜNCELLEME (tur 14.1): #364 → PR #365 ile DÜZELTİLDİ (merge).** LANE-GÜVENLİK
`next.config.ts` `headers()`'a `/sw.js` için `Cache-Control: no-cache, no-store,
must-revalidate` ekledi. Origin artık `no-cache` döndüğü için CF edge zone'un
Browser Cache TTL'inden bağımsız her istekte revalidate eder.

**✅ KAPANDI (tur 16, canlı doğrulama):** #365 artık **deploy edildi** (canlı build
`d154e44`, `/api/build-info`). Edge ölçümü düzeldi:
```
edge  : curl -sSI https://isbulkktc.com/sw.js
        cache-control: no-cache, no-store, must-revalidate   ← artık CF yükseltmiyor
        cf-cache-status: BYPASS   age: 0
origin: cache-control: no-cache, no-store, must-revalidate
```
`no-cache` origin başlığı CF'in Browser Cache TTL ezişini etkisiz kıldı →
SW-01 **kapandı**. (tur 14.1 notu: o an canlı build `1d804b6`'ydı ve #365 henüz
deploy edilmemişti; tur 16'da deploy doğrulandı.)

**Öneri (CF paneli → sahibin onayı):** H-02 ile aynı düzeltme — Caching →
**Browser Cache TTL = Respect Existing Headers**; ya da Cache Rules'ta
`/sw.js` (ve `/robots.txt`) için `Edge TTL = Respect origin`. Alternatif (repo
tarafı, `public/**` → LANE-INFRA): `/sw.js`'e `Cache-Control: no-cache`
origin başlığı eklemek.

### W-01 — WAF, yüzde-kodlanmış yolda nokta-yolu kuralını atlıyor (yeni bulgu, düşük)

Custom WAF 4. kuralı (VCS/dotfile/secret yolları) **kodlanmış** yol varyantlarını
tutmuyor; istek CF'yi geçip **Vercel origin'e** ulaşıyor (404 döner — origin'de
`.git` yok). WAF ve origin **aynı normalizasyonu** uygulamadığı için klasik
"WAF bypass" yüzeyi oluşuyor.

| İstek | Gözlenen | Not |
|---|---|---|
| `/.git/config` | **403** | WAF bloklar |
| `/.git%2fconfig` | **404** | CF geçti → origin 404 |
| `/api/devtools` (eğik çizgisiz) | **404** | WAF yalnız `/api/devtools/`'i tutuyor |
| `/api/devtools%2f` | **404** | CF geçti → origin 404 |
| `/.git/config%00` | **400** | origin reddediyor |
| `/telescope/requests`, `/_ignition/execute-solution` | **404** | kural bu imzaları hiç içermiyor |

**Kanıt (origin'e ulaştığının ispatı):** yanıt `x-vercel-id` + `x-vercel-cache:
MISS` + `<title>Sayfa bulunamadı</title>` taşır (CF'nin 403 sayfası değil).

**Etki (düşük — bu origin'de):** origin statik-only Vercel; `.git`/`.env` servis
etmiyor, `/api/devtools` **yok** (`git ls-files src/app/api` → yalnız
build-info/email/push/qr). Yani 404 ile sonuçlanıyor, veri sızmıyor. Risk,
**origin değişince** (yeni bir `/api/devtools`, panel ya da statik sunucu
eklenirse) artar.

**Öneri (CF paneli → sahibin onayı):** kural ifadesini normalizasyona duyarlı yap —
Free plan operatörleriyle `lower(http.request.uri.path) contains "/.git"` ve
`contains "/api/devtools"` (eğik çizgi koşulu olmadan) + `%2f`/`%00` varyantları
için `url_decode(http.request.uri.path)` üzerinden ikinci bir `matches`-benzeri
kontrol. (Free plan `matches` operatörünü reddediyor → `contains`/`in`/`lower()`
ile ifade edilmeli.) **WAF kuralı değişikliği yıkıcıdır → sahibin onayı.**

### Drift tablosu (tur 14)

| Bulgu | Durum | Kanıt |
|---|---|---|
| H-01 — CF HSTS `max-age`'i eziyor | **hâlâ açık** | edge `31536000` vs origin `63072000` |
| H-02 — CF Browser Cache TTL origin `max-age=0`'ı yükseltiyor | **hâlâ açık** | `/robots.txt`, `/images/*.webp` → `2628000` |
| R-01 — sonlu noktalı apex (`isbulkktc.com.`) | **hâlâ açık** | `404` |
| G-01 — Email Address Obfuscation açık | **hâlâ açık** | `/` ve `/contact` gövdesinde `cdn-cgi/l/email-protection` |
| A-01b — `/_next/image` çift-kodlama | **canlıda KAPANDI** (build `1d804b6`, #359 deploy edildi) | 11 hedef PoC → **400** (tur 14.1) |
| N-01 — `/_next/static` 404'ü 1 yıl cache | **hâlâ açık** | `MISS → HIT`, `max-age=31536000` |
| F-08 — Vercel alias CF'i atlıyor | **hâlâ açık** (tur 15: `Host` override → **421**) | alias doğrudan 200 (`noindex`) |
| DKIM — Resend `resend._domainkey` | **1024-bit** | `openssl rsa -pubin` → `Public-Key: (1024 bit)` |
| DMARC | `p=none` | `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1` |
| DNSSEC | açık | DoH `AD=true` |
| Apex A / AAAA | var | `104.21.29.3`, `172.67.171.53` / `2606:4700:3034::ac43:ab35` |
| SPF (apex + send) | tek include | apex `_spf.mx.cloudflare.net`, `send` `amazonses.com` |
| CAA / TLS | var / LE `YE2` | SAN `*.isbulkktc.com`, geçerlilik 2026-09-19 → 2026-12-18 |
| HTTP→HTTPS / www→apex | 301 / **yok (200)** | tek sıçrama **değil** — **H-03 (tur 36)** |

### Bu turda doğrulananlar (temiz)

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| T-30 | WAF negatif (saldırı yolları) | 26/33 → **403**; 7 istisna (bkz. W-01: `%2f`/`%00` kodlaması ve imzasız yollar) | ⚠️ |
| T-31 | WAF pozitif (meşru rotalar) | `/`,`/blog`,`/companies`,`/contact`,`/about`,`/sss`,`/rehber`,`/packages`,`/freelance`,`/login`,`/register` → **200**; `/tr` → 308 (`as-needed`), `/en`,`/de`,`/ru`,`/fa` → 200; `/ar` → 404 (desteklenmeyen dil, doğru) | ✔ yanlış pozitif yok |
| T-32 | Kötü UA | `sqlmap` → 403; `nikto`/`masscan`/`zgrab` → 200 (imza yok) | ℹ️ |
| T-33 | Bot UA | Googlebot/bingbot/GitHub-Hookshot → **200**, `cf-mitigated` yok | ✔ |
| T-34 | İçerik sayfası cache'i | `/blog/<slug>`,`/rehber/<slug>` → `cf-cache-status: DYNAMIC` (edge'de tutulmuyor), `age` sabit; iki ardışık fetch aynı uzunluk (143882 B) | ✔ |
| T-35 | Dinamik/kişisel rota cache'i | `/`,`/jobs`,`/login` → `private, no-cache, no-store`/`DYNAMIC`; `/profile/dashboard`→307 `/login`, `/company/dashboard`→307 `/login?audience=employer` | ✔ |
| T-36 | Negatif cache (statik) | `/images/missing.webp`, `/icons/missing.png`, `/videos/…/missing.mp4` → `BYPASS`, `private, no-store` | ✔ |
| T-37 | Sorgu-dizesi cache anahtarı | `/images/x.webp`, `?cb=1`, `?cb=2` → ayrı edge girdileri (farklı `age`), gövde aynı | ✔ |
| T-38 | Range isteği (cache'li) | `/images/Girne.webp` + `Range: bytes=0-99` → `206`, `content-range: bytes 0-99/1962250`, `cf-cache-status: REVALIDATED` | ✔ |
| T-39 | Accept-Encoding varyantı | `identity` vs `gzip, br` → aynı gövde; `Vary: accept-encoding` (önceki tur) | ✔ |
| T-40 | `/_next/image` Accept mutabakatı | `image/webp`→`image/webp`, `image/png`/`text/html`→`image/jpeg`, `Vary: Accept`, `DYNAMIC` | ✔ |
| T-41 | `/_next/image` allowlist dışı | tek-kodlama → **400**; **çift/üçlü-kodlama → 200 text/html** (canlı, bkz. A-01c) | ✖ canlıda açık |
| T-42 | Eğik-çizgi normalizasyonu | `/is-ilanlari/`→308 `/is-ilanlari`; `/jobs/`→308; `//blog`→308 `/blog` | ✔ |
| T-43 | İkon meta verisi | `icon-light/dark-32x32`, `apple-touch-icon`, `maskable-192/512` → **200** | ✔ |
| T-44 | Dotfile sızıntısı | origin 404; `git ls-files` yalnız `.env.example` (örnek) | ✔ |
| T-45 | `x-matched-path` | `/_next/static/chunks/nope-xyz.js` 404 → `x-matched-path: /_next/static/not-found.txt` | ✔ |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` bu sandbox'ta tanımlı değil): WAF ruleset
  (W-01 ifadesi panelde doğrulanamadı), Cache Rules, **Browser Cache TTL** (SW-01
  ve H-02'nin ayar adı panelden okunamadı), Edge Certificates (HSTS), Bot
  Management, Rate limit, Analytics/Logpush panel durumu okunamadı; ölçüm
  **edge↔origin diff** ile yapıldı.
- **IPv6:** sandbox'ta v6 çözümleyici yok; AAAA kaydı DoH ile doğrulandı,
  bağlantı **denenmedi**.
- **Gerçek tarayıcı ölçümü (SW-01):** SW güncelleme yayılımı canlı tarayıcıda
  sürülmedi; bulgu yalnızca edge/origin `cache-control` diff'i ile kanıtlandı.
- **`next.config.ts` / `tests/security/**` / `public/**` / `src/lib/pwa/**`:**
  bu lane'in dosyası değil → yalnız **doğrulama** yapıldı (A-01c), düzeltme
  yapılmadı. SW-01 repo-tarafı öneri **#364** (`lane:guvenlik`) ile devredildi.

---

## Edge mikro-denetim tur 15 — açık issue'ların canlı doğrulaması + F-08 netleştirmesi (2026-11-06)

**Amaç.** Lane'e açık üç issue (#163, #170, #227) çoğunlukla **DNS/panel** işi
(sandbox'ta CF token yok, panel erişimi yok). Bu turda hepsinin **canlı kanıtı
salt-okuma ile yeniden ölçüldü** — drift var mı, ve CF halkası gerçekten kopuk mu?

**Canlı kimlik:** `/api/build-info` → `1d804b6` (tur 14.1 ile aynı; #359 deploy
edildi, **A-01c canlıda kapalı**).

### Ölçüm (canlı, 2026-11-06)

| # | Test | Sonuç | Beklenen | Kaynak |
|---|---|---|---|---|
| V-19 | Googlebot/Bingbot/YandexBot/DuckDuckBot/AhrefsBot `/` | hepsi **200**, `cf-mitigated` **yok** | 200 | HTTP |
| V-02 | çıplak `curl/8.0` `/` | **103** (Early Hints), challenge değil | — | HTTP |
| V-03 | `sqlmap/1.7` `/` (WAF regresyon) | **403** | 403 | HTTP |
| V-04 | `google-site-verification` meta (üretim HTML) | **YOK** (`grep -c` = 0, 6 dil) | var | HTTP — **V-01** (tur 38; eski "var" yanlıştı) |
| V-05 | `msvalidate.01` meta + `/BingSiteAuth.xml` | meta yok · **404** | var | HTTP |
| V-06 | `www.` → apex | **200** (yönlendirme YOK; tur 36'da çürütüldü) | 301 | HTTP — **H-03** |
| V-07 | Vercel alias `/` (doğrudan) | 200 + `x-robots-tag: noindex, nofollow` | noindex | HTTP |
| V-08 | Vercel alias + `Host: isbulkktc.com` | **421 Misdirected** | — | HTTP |
| V-09 | kök SPF | `include:_spf.mx.cloudflare.net` (**amazonses yok**) | **ekleme** (return-path `send.`'de; bkz. E-03/tur 4) | DoH |
| V-10 | `_dmarc` | `p=none` | `quarantine` | DoH |
| V-11 | `resend._domainkey` | **1024-bit** RSA | 2048 | DoH |
| V-12 | `send.isbulkktc.com` TXT/MX | `spf include:amazonses.com` · `feedback-smtp.eu-west-1.amazonses.com` | doğru | DoH |

### Değerlendirme

- **#163 (bulunabilirlik):** CF halkası **hâlâ kopuk değil** (V-19/V-02/V-03/V-04
  tur-4/2026-11-05 bulgularıyla birebir aynı; drift **yok**). Kopuk halka **Bing
  mülk doğrulaması** (V-05, değişmedi) → **LANE-SEO**; sahibin aksiyonu panel.
- **#170 (spam) ve #227 (DKIM):** DNS tarafı **değişmedi** (V-09/V-10/V-11).
  DMARC `quarantine` + DKIM 2048-bit rotasyonu **hesap sahibinin panel/DNS onayına**
  bağlı (bu lane yıkıcı DNS değişikliği yapmaz). **Kök SPF'e `include:amazonses.com`
  EKLENMEZ** — return-path `send.isbulkktc.com` olduğundan gereksiz ve hatalıdır
  (E-03/tur 4; `docs/cloudflare.md` → "Ana bulgu: issue'nun SPF teşhisi yanlış").
  `[auth.smtp]` = **LANE-SUPABASE** (#227).
- **F-08 netleştirmesi (yeni kanıt):** Vercel alias doğrudan 200 ama
  `Host: isbulkktc.com` ile **421 Misdirected Request** döner (V-08). Bu, alias'ın
  CF zone'undan **geçmediğini** kesinleştirir: CF, `Host`'u tanımadığı için isteği
  yanlış origin'e yönlendirmiyor; Vercel da tanımadığı `Host`'u 421 ile reddediyor.
  Yani alias'a düşen `Host: isbulkktc.com` trafiği **hiçbir katmanda** CF/WAF
  denetiminden geçmez — ama alias `noindex` olduğu için SEO etkisi yok (V-07).

### Micro-denetim (sahip olunan dosyalar)

`git ls-files` ile LANE-CLOUDFLARE sahipliği: **2 dosya** —
`docs/cloudflare.md`, `docs/lanes/02-cloudflare.md`. İkisi de bu turda satır satır
tarandı; bakılmayan dosya yok (AUDIT.md boyutları).

| # | Dosya | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `docs/cloudflare.md` (tur 14) | Doğruluk | A-01b "canlıda AÇIK" | build `1d804b6` → 400 | yanlış durum | **düzeltildi** (tur 14.1) |
| 2 | `docs/cloudflare.md` (SW-01) | Tutarlılık | "#364 açık" | #365 düzeltmesi | sahip eylemi değişti | **düzeltildi** (tur 14.1) |
| 3 | her iki dosya | Link | 22 tekil `#NNN` | hepsi çözülür | kırık referans yok | **doğrulandı** |
| 4 | `docs/cloudflare.md` (tur 15) | Doğruluk | F-08 "alias CF'i atlıyor" gerekçesiz | V-08 `Host` override → 421 | kanıt eklendi | **düzeltildi** |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF/Cache Rules/Bot Management/Edge
  Certificates panel durumu okunamadı; ölçüm edge↔origin diff + DoH ile yapıldı.
- **Search Console / Bing Webmaster / Resend paneli:** erişim yok → indeks sayısı
  ve DKIM "verified" durumu panelden doğrulanamadı.
- **Gerçek e-posta teslimi (Gmail/Outlook):** gönderim yapılmadı (spam skoru
  yalnız SPF/DKIM/DMARC durumundan çıkarıldı).

---

## Edge mikro-denetim tur 16 — SW-01 kapandı + tam drift taraması (2026-11-06)

**Amaç.** Deploy ilerledi (`/api/build-info` → `d154e44`); tur 14/15'te "deploy
bekliyor" denen düzeltmelerin canlı durumu yeniden ölçüldü ve brief'in 1–7.
maddeleri (DNS, TLS, cache, WAF, bot, rate-limit, analytics) drift tablosuyla
tazelendi.

### ✅ Kapanan: SW-01 (tur 14'te açılmıştı)

`/sw.js` edge'de artık **`no-cache, no-store, must-revalidate`** + `BYPASS`
(önceden `max-age=2628000` + `REVALIDATED`). #365 (`next.config.ts` `headers()`)
deploy edildi. CF Browser Cache TTL ezişi `no-cache` origin başlığıyla etkisiz
kaldı. **Kapandı.**

### Drift tablosu (tur 16 — canlı)

| Bulgu | Durum | Canlı kanıt (2026-11-06) |
|---|---|---|
| **SW-01** — `/sw.js` edge 30 gün cache | ✅ **KAPANDI** | edge `no-cache, no-store, must-revalidate` + `BYPASS` |
| H-01 — CF HSTS `max-age`'i eziyor | ⚠️ **açık** | edge `31536000` vs origin `63072000` (`next.config.ts:36`) |
| H-02 — Browser Cache TTL origin `max-age=0`'ı yükseltiyor | ⚠️ **açık** | `/robots.txt` → `2628000`, `/sitemap.xml` → `3600`, `/images/*.webp` → `2628000` (origin hepsi `max-age=0`) |
| R-01 — sonlu noktalı apex (`isbulkktc.com.`) | ⚠️ **açık** | apex `/` → **404**; `www.` varyantı → 308 (tutarsız) |
| G-01 — Email Address Obfuscation açık | ⚠️ **açık** | `/` ve `/en` gövdesinde footer `mailto:` → `/cdn-cgi/l/email-protection#…` |
| N-01 — `/_next/static` var olmayan dosya 404'ü 1 yıl cache | ⚠️ **açık** | `/_next/static/<yok>.js` → 404 + `max-age=31536000` |
| W-01 — WAF kodlanmış yolda nokta-yolu kuralını atlıyor | ⚠️ **açık** | `/.git%2fconfig` CF'i geçip Vercel origin 404'üne düşüyor |
| F-08 — Vercel alias CF zone'unu atlıyor | ⚠️ **açık** | alias `/` → 200 (`noindex`); alias + `Host: isbulkktc.com` → **421** |
| A-01c — `/_next/image` çift-kodlama | ✅ **KAPALI** | `%2Fimages%2F%252e%252e%2Fblog` → **400** |
| DKIM — Resend `resend._domainkey` | ℹ️ 1024-bit | `p=MIGf…` (`openssl rsa -pubin` → 1024) |
| DMARC | ℹ️ `p=none` | `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1` |

### Bu turda doğrulananlar (temiz)

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| U-01 | Dinamik HTML asla edge-cache'lenmiyor | `/`,`/jobs`,`/companies`,`/en`,`/de`,`/ru`,`/fa` → `private, no-cache, no-store` + `DYNAMIC` | ✔ |
| U-02 | İçerik sayfaları edge'de tutulmuyor | `/rehber`,`/blog`,`/freelance`,`/packages`,`/sss` → `public, max-age=0` + `DYNAMIC` | ✔ |
| U-03 | Özel rotalar auth'a yönleniyor | `/profile/dashboard`,`/company/dashboard` → 307 + `private, no-store` | ✔ |
| U-04 | Desteklenmeyen dil | `/ar` → **404** (locales: `tr,en,ru,el,fa,de`) | ✔ |
| U-05 | Cacheable statikte yazma reddi | `/robots.txt` POST/PUT/DELETE → **405** | ✔ |
| U-06 | CORS kilitli | yalnız `/api/build-info` → `ACAO: *` (`OPTIONS, GET, HEAD`); `/api/qr`,`/api/email/unsubscribe`,`/api/push/*` → ACAO **yok** | ✔ |
| U-07 | `/.well-known/security.txt` | var; `Contact: mailto:info@…`, `Expires` 2027-09-06 | ✔ |
| U-08 | Yönlendirmeler | `/tr` → 308 → `/` (`as-needed`, tek sıçrama); **`www` → 200 (yönlenmiyor)** | ⚠️ **H-03** |
| U-09 | CF → Vercel zinciri | `server: cloudflare` + `cf-ray` + `x-vercel-id` aynı yanıtta | ✔ |
| U-10 | CAA | 5 issuer (`comodoca`,`digicert`,`letsencrypt`,`pki.goog`,`ssl.com`) + `issuewild` | ✔ |
| U-11 | DNSSEC | DoH apex+çoğu alt alanda `AD=true`; `rsend` (`rmta.net` CNAME, DS yok) `AD=false` | ⚠️ kısmi (tur 18) |
| U-12 | WAF saldırı UA'sı | `sqlmap` → 403 | ✔ |
| U-13 | Bot UA'ları | Googlebot/Bingbot/YandexBot/DuckDuckBot/AhrefsBot → 200, `cf-mitigated` yok | ✔ |

### DNS gözlemleri (tur 16, DoH)

- **Apex TXT** ikisi de `google-site-verification` olan **iki farklı token** taşıyor
  (`1zuidCsJ2…` ve `7YbjG-3INgSrdkIKFG0inLGNgD0BX4P8mf1oIDtJehU`) + `yandex-verification`
  + SPF. İkinci token **bayat olabilir** (hijyen, düşük etki) — sahibi hangisinin
  güncel olduğunu panelde teyit etmeli; **silmek yıkıcı DNS işi → onay bekler**.
- **Apex SPF** `include:_spf.mx.cloudflare.net` — Resend return-path'i `send.`
  subdomaininde olduğu için apex'e `amazonses` **gerekmiyor** (tur 4 teşhisi geçerli).
- **MTA-STS / TLS-RPT yok** (`_mta-sts`, `_smtp._tls` → NXDOMAIN): e-posta
  sertleştirme fırsatı (sahibin onayı; #170 kapsamı).

### Micro-denetim (sahip olunan dosyalar)

`git ls-files` ile LANE-CLOUDFLARE sahipliği **2 dosya**: `docs/cloudflare.md`,
`docs/lanes/02-cloudflare.md`. İkisi de bu turda satır satır tarandı; bakılmayan
dosya yok.

| # | Dosya | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `docs/cloudflare.md` (SW-01) | Doğruluk | "#365 deploy bekliyor" | canlı `d154e44` → `no-cache` | eski durum | **düzeltildi** |
| 2 | `docs/cloudflare.md` (tur 16) | Doğruluk | drift tablosu tazelendi | 12 madde canlı ölçüldü | güncel | **eklendi** |
| 3 | her iki dosya | Link | 22+ tekil `#NNN` | hepsi çözülür | kırık yok | **doğrulandı** |
| 4 | her iki dosya | Tutarlılık | tur 14/15 durumları | tur 16 ile uyumlu | çelişki yok | **doğrulandı** |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / **Browser Cache
  TTL** / Bot Management / Edge Certificates / Analytics panel durumu okunamadı;
  ölçüm edge↔origin diff + DoH ile yapıldı.
- **Gerçek tarayıcı ölçümü:** SW güncelleme yayılımı canlı tarayıcıda sürülmedi;
  SW-01 kapanışı yalnızca edge `cache-control`/`cf-cache-status` ile kanıtlandı.
- **IPv6 bağlantısı:** sandbox'ta v6 çözümleyici yok (AAAA DoH ile var).
- **E-posta teslimi (Gmail/Outlook):** gönderim yapılmadı.

---

## Edge mikro-denetim tur 17 — ölçüm doğruluğu düzeltmesi + tarayıcı-yolu WAF boşluğu (2026-11-06)

**Amaç.** Brief'in 1–7. maddeleri (DNS, TLS, cache, WAF, bot, rate-limit, analytics)
tam yeniden ölçüldü. Bu tur **bir ölçüm hatasını** ve **bir WAF kapsam boşluğunu**
ortaya çıkardı; ikisi de kanıtla kapatıldı.

### Düzeltme: F-09/T-15 "TLS 1.0/1.1 reddediliyor" kanıtı yanlıştı

Önceki turlarda TLS 1.0/1.1 için `openssl s_client -tls1_1` çıktısındaki
`no protocols available` **sunucu reddi** sanıldı. Aslında bu hata **istemci
tarafında**: sandbox'ın OpenSSL 3.x'i TLS 1.0/1.1 protokollerini artık derlemiyor,
bu yüzden istemci hiç ClientHello gönderemiyor. Python `ssl` ile doğrulandı — aynı
hata **istemci tarafında** (`ctx.minimum_version=TLSv1_1` → `NO_PROTOCOLS_AVAILABLE`).

**Gerçek kanıt (SSL Labs API, `api.ssllabs.com`):** 4/4 endpoint (2×IPv4 + 2×IPv6)
grade **`A+`**, sunulan protokoller yalnız **TLS 1.2 + 1.3** → "min TLS 1.2" sonucu
**doğru**, ama dayanağı `openssl s_client` değil SSL Labs. F-09 ve T-15 bu turda
düzeltildi. **Ders:** bir istemci bir protokolü *kendisi* desteklemiyorsa, o
protokolün sunucuda reddedildiği iddia edilemez; negatif iddiayı bağımsız bir
tarayıcıyla (SSL Labs) doğrula.

### Yeni bulgu: V-20 — WAF tarayıcı yollarında kapsam boşluğu (düşük)

Tur 14'te **W-01** yalnız `%2f` kodlamasına odaklanmıştı. Bu tur WAF'ın
**yüzde-kodlamasız** tarayıcı yollarını da kaçırdığını gösterdi:

| Yol | Sonuç | CF mi origin mi |
|---|---|---|
| `/.git/config`, `/.env`, `/wp-admin/`, `/phpmyadmin/`, `/.aws/credentials`, `/xmlrpc.php`, `/.htaccess`, `/composer.json` | **403** | CF (doğru) |
| `/config.php`, `/shell.php`, `/actuator/env`, `/server-status`, `/actuator`, `/phpinfo.php`, `/info.php`, `/settings.py`, `/Dockerfile` | **404** | **origin** (CF geçildi) |

`/debug.log`, `/.env.local`, `/web.config` ise 403 (CF). Yani kural deseni
uzantıya göre seçici. **Sızıntı yok:** origin 404'leri Next'in 404 sayfası
(7–102 KB HTML), `cf-cache-status: DYNAMIC`, `private, no-store`, `x-robots-tag`
yok; hiçbiri edge'de cache'lenmiyor. Etki **düşük** (origin statik/Vercel; PHP
yok, `.git` yok) — ama tarayıcı istekleri CF yerine Vercel'e ulaşıyor ve Vercel
edge'inde WAF yok. Düzeltme: W-01 ile aynı pakette WAF ifadesini genişlet
(`.php`, `actuator`, `server-status`, `Dockerfile`, `settings.py` desenleri) —
**yıkıcı CF değişikliği → sahibin onayı.**

### Drift tablosu (tur 17 — canlı, 2026-11-06)

Canlı build: `/api/build-info` → **`d154e44`**.

| Bulgu | Durum | Canlı kanıt |
|---|---|---|
| H-01 — CF HSTS `max-age`'i eziyor | ⚠️ **açık** | edge `31536000` vs origin `63072000` |
| H-02 — Browser Cache TTL `max-age=0`'ı yükseltiyor | ⚠️ **açık** | `/robots.txt`,`/images/*.webp`→`2628000`; `/sitemap.xml`→`3600` (origin hepsi `max-age=0`) |
| N-01 — `/_next/static` var olmayan dosya 404'ü 1 yıl cache | ⚠️ **açık** | `/_next/static/nope.js` → 404 + `max-age=31536000` |
| R-01 — sonlu noktalı apex | ⚠️ **açık** | `isbulkktc.com.` → **404**; `www.isbulkktc.com.` → 308 |
| G-01 — Email Address Obfuscation | ⚠️ **açık** | `/`, `/en`, `/contact` gövdesinde `cdn-cgi/l/email-protection` |
| W-01 — WAF kodlanmış nokta-yolu | ⚠️ **açık** | `/.git/config`→403 ama `/.git%2fconfig`→**404** (origin) |
| V-20 — WAF tarayıcı yolu (yeni) | ⚠️ **açık** | `config.php`,`shell.php`,`actuator/env`,`server-status` → **404 origin** |
| F-08 — Vercel alias CF zone'unu atlıyor | ⚠️ **açık** | alias `server: Vercel` (cf-ray yok); alias+`Host` → **421** |
| F-09/T-15 — TLS min kanıtı | ✅ **düzeltildi** | SSL Labs 4/4 `A+`, yalnız TLS 1.2+1.3 |
| A-01c — `/_next/image` çift-kodlama | ✅ **kapalı** | tur 14.1'de 11 PoC → 400 |
| SW-01 — `/sw.js` edge cache | ✅ **kapalı** | tur 16: `no-cache` + `BYPASS` |

### Bu turda doğrulananlar (temiz)

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| V-20 | WAF negatif (8 saldırı yolu) | 403 | ✔ |
| V-02 | WAF pozitif (17 meşru yol: 12 tr rotası + 5 dil öneki) | hepsi 200, yanlış pozitif yok | ✔ |
| V-03 | Bot UA'ları (Googlebot/bingbot/YandexBot/facebookexternalhit/Twitterbot) | 200, `cf-mitigated` yok | ✔ |
| V-04 | İmzasız istemciler (curl/python-requests/Go-http/boş UA) | 200 (agresif bot challenge yok) | ✔ |
| V-05 | Yönlendirme zinciri | `http`→`https` (301); **`www`→apex yok (200)**; `http://www`→ **2 hop, www'de biter** | ❌ **H-03** |
| V-06 | Açık yönlendirme | `//evil.com`,`/\`,`/%5C`,`/%2F%2F`,`/..//` → hep `isbulkktc.com` altında kalıyor | ✔ |
| V-07 | HTTP/3 | `alt-svc: h3=":443"` | ✔ |
| V-08 | Güvenlik başlıkları | CSP, COOP, Permissions-Policy, Referrer-Policy, HSTS, nosniff, XFO | ✔ |
| V-09 | Automatic HTTPS Rewrites | HTML'de `http://` referansı yok (mixed content yok) | ✔ |
| V-10 | `security.txt` | `Contact: mailto:info@…`, `Expires` 2027-09-06 | ✔ |
| V-11 | HSTS preload | hstspreload API → **`pending`** (değişmemiş) | ℹ️ |
| V-12 | DNSSEC | DS `2371 13 2 36e0…775b`; apex+çoğu alt alan `AD=true`, `rsend` `AD=false` (tur 18) | ⚠️ kısmi |
| V-13 | CAA | 5 issuer + `issuewild` (10 kayıt) | ✔ |
| V-14 | MX / CF Email Routing | `route{1,2,3}.mx.cloudflare.net` | ✔ |
| V-15 | CF Email Routing DKIM `cf2024-1._domainkey` | **2048-bit** RSA (`MIIBIjAN…`, `h=sha256`) | ✔ |
| V-16 | Resend DKIM `resend._domainkey` | **1024-bit** (220 B TXT) | ⚠️ #227 |
| V-17 | Apex TXT | yandex + SPF + **iki** `google-site-verification` | ℹ️ |
| V-18 | Gap-yolu cache | `config.php`,`actuator/env`,`Dockerfile` → `DYNAMIC` + `private, no-store` | ✔ |

### Rate-limit gözlemi (brief 6)

- `/login`'e 20 hızlı istek (**GET**) → **20/20 200**; CF katmanında görünür bir
  rate-limit **yok** ~~(tek `http_ratelimit` kuralı "leaked credential check"e
  harcanmış, brief doğrulandı)~~ — **bu satır geçersiz, aşağıdaki D-12'ye bak.**
- **tur 23 düzeltmesi (D-12):** bu gözlem **yalnız GET** ile yapılmıştı ve
  yanıltıcıydı. `POST /login` hızlı serisi ~10 istekte **429** (`error code: 1015`,
  `retry-after: 10`) döner; kova `/login`/`/register`/`/forgot-password`/
  `/reset-password` arasında paylaşımlı; `GET /login` ve `POST /` limite girmez.
  CF'siz alias aynı seride 200 → limit CF'nin. Yani auth brute-force edge'de
  **korumalı**; F-26 ve "onay bekleyen" 1. madde buna göre düzeltildi.
- `/api/email/unsubscribe` POST → **405** (anon; yöntem yok) → CF rate-limit'i
  tetikleyecek bir anon yüzey yok.

### Micro-denetim (sahip olunan dosyalar)

`git ls-files` ile sahiplik **2 dosya**: `docs/cloudflare.md`,
`docs/lanes/02-cloudflare.md`. İkisi de bu turda satır satır tarandı.

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| 1 | `docs/cloudflare.md:51` (F-09) | Doğruluk | "TLS 1.0/1.1 reddediliyor (`no protocols available`)" — istemci-taraflı hata, sunucu kanıtı değil | SSL Labs kanıtı | yanlış kanıt | **düzeltildi** |
| 2 | `docs/cloudflare.md:961` (T-15) | Tutarlılık | Aynı yanlış iddia özet tabloda | F-09 ile hizalı | çelişki | **düzeltildi** |
| 3 | `docs/cloudflare.md:994` (A-01c başlık) | Doğruluk | Başlık "canlı hâlâ savunmasız" | tur 14.1'de kapandı | eski durum | **düzeltildi** |
| 4 | `docs/cloudflare.md` (tur 17) | Doğruluk | V-20 yeni WAF boşluğu + SSL Labs kanıtı | eklendi | güncel | **eklendi** |
| 5 | `docs/lanes/02-cloudflare.md` | Tutarlılık | tur 16 son satır | tur 17 ile uyumlu | güncel | **eklendi** |

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / **Browser Cache
  TTL** / Bot Management / Edge Certificates / Analytics panel durumu okunamadı;
  ölçüm edge↔origin diff + DoH + SSL Labs ile yapıldı.
- **TLS 1.0/1.1 sunucu reddi** sandbox istemcisiyle doğrulanamaz (istemci o
  protokolleri desteklemiyor) → SSL Labs sonucuna dayanıldı.
- **Gerçek tarayıcı ölçümü:** SW güncelleme yayılımı ve CHIPS/`Set-Cookie`
  davranışı canlı tarayıcıda sürülmedi.
- **IPv6 bağlantısı:** sandbox'ta v6 yolu yok (`curl --resolve` v6 → 000); SSL Labs
  IPv6 endpoint'leri `A+` raporladı.
- **E-posta teslimi (Gmail/Outlook):** gönderim yapılmadı.
- **Analytics/Logpush (brief 7):** token yok → API ile doğrulanamadı.

---

## Edge mikro-denetim tur 18 — DNS kapsam taraması + doküman doğruluk düzeltmeleri (2026-11-06)

**Amaç.** Brief'in 1–7. maddeleri yeniden ölçüldü; bu tur daha önce bakılmamış
iki eksene odaklandı: **DNS kayıt-seti genişliği** (subdomain enumerasyonu,
SPF include-ağacı, CAA/DNSSEC, dangling kayıt) ve **kendi dokümanlarımın canlı
kanıta karşı doğruluğu** (AUDIT doğruluk/tutarlılık boyutları). İki doküman
düzeltmesi ve bir yeni bilgi bulgusu çıktı.

### Düzeltmeler (sahip olunan dokümanlarda)

| # | Dosya:satır | Boyut | Gözlenen (önce) | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| D-01 | `docs/cloudflare.md:55,1315,1428` (F-13/T-23/U-11/V-12) | Doğruluk | "DNSSEC `AD=true`" **tüm** kayıtlar için iddia ediliyordu | Yalnız imzalı kapsam için doğru | Abartılı iddia | **düzeltildi** — `rsend` `AD=false` |
| D-02 | `docs/cloudflare.md:57,485` (F-15/T-02) | Doğruluk | `/_next/static/*` için "`vary: accept-encoding`" | Edge'de `Vary` yok | Yanlış başlık iddiası | **düzeltildi** |
| D-03 | `docs/cloudflare.md` (ID çakışması) | Tutarlılık | İki farklı bulgu **aynı `V-01`** kimliğini taşıyordu (tur 15 bot-UA **ve** tur 17 WAF-boşluğu) | Benzersiz kimlik | Karışıklık / atıf belirsizliği | **düzeltildi** — tur 15 → `V-19`, tur 17 → `V-20` |

### D-01 — DNSSEC kısmi kapsam (bilgi, düşük)

`rsend.isbulkktc.com` bir **CNAME**'dir: `send.forge.rmta.net` (Resend Forge).
Zincirin uçtaki bölgesi **`rmta.net` DS kaydı yok → imzasız**; bu yüzden
`rsend` çözümü `AD=false` döner (Cloudflare DoH **ve** Google DoH aynı fikirde):

```
rsend.isbulkktc.com   A/CNAME → 5 send.forge.rmta.net.   AD=false
send.forge.rmta.net   A       → (yok; MX feedback.forge.rmta.net)
feedback.forge.rmta.net A     → 3.231.87.173, 98.83.16.149   AD=false
rmta.net              DS      → (yok)   net DS → var (37331 13 2 …)
isbulkktc.com         DS      → 2371 13 2 …   AD=true
```

Not: `rsend` için `TXT`/`MX` sorgularında dönen CNAME + hedef kayıtlar
**co-location DEĞİL** (RFC 2181 §10.1 ihlali yok) — yanıt zinciri CNAME hedefini
çözdüğü için öyle görünüyor; hedef bölgede (`send.forge.rmta.net`) yalnız TXT/MX
var, `rsend`'te A yok. `www`, `send`, `_dmarc`, DKIM selector'ları, `mta-sts`,
`autodiscover` hepsi `AD=true`.

**Etki (düşük):** apex ve birincil posta yolları imzalı; yalnız Resend Forge
CNAME zinciri uçtan imzasız. DNSSEC kapalı değil, **kısmi**. Aksiyon: gerekiyorsa
Forge CNAME'i yerine imzalı bir hedefe geç (sahip/panel); zorunlu değil.

### Tur 18 ölçümleri (canlı, 2026-11-06)

Canlı build: `/api/build-info` → **`7b0f7170`**.

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| W-18-1 | Subdomain enumerasyonu (32 yaygın ad) | yalnız `www` var (proxied CF); `api`,`admin`,`dev`,`staging`,`git`,`jenkins`… **NXDOMAIN** | ✔ takeover yüzeyi yok |
| W-18-2 | SPF include-ağacı | apex `include:_spf.mx.cloudflare.net` (2 lookup), `send` `include:amazonses.com` (2 lookup) → limit **10**'un çok altında | ✔ |
| W-18-3 | CAA | 5 issuer + 5 `issuewild` (10 kayıt) | ✔ |
| W-18-4 | DNSSEC | apex `AD=true`; **`rsend` `AD=false`** (bkz. D-01) | ⚠️ kısmi |
| W-18-5 | Dangling CNAME | `rsend`→`send.forge.rmta.net`; **hedefte A/AAAA yok** → adres kaydı yok (tur 18'deki "çözülüyor" iddiası yanlıştı; A kaydı MX hedefi `feedback.forge.rmta.net`'teydi) — bkz. tur 20, D-06 | ⚠️ |
| W-18-6 | WAF negatif (21 yol) | `/.git/config`,`/.env`,`/.svn/entries`,`/.aws/credentials`,`/wp-login.php`,`/xmlrpc.php`,`/composer.json`,`/.DS_Store`… → **403** | ✔ |
| W-18-7 | WAF pozitif (22 yol + 6 dil) | hepsi **200** (yalnız `/tr`→308 as-needed) | ✔ |
| W-18-8 | V-20 boşluğu (teyit) | `/config.php`,`/shell.php`,`/actuator/env`,`/server-status`,`/phpinfo.php`,`/Dockerfile` → **404 origin**, `DYNAMIC`+`no-store`, cache'lenmiyor | ⚠️ açık |
| W-18-9 | Kodlanmış kaçış (W-01) | `/.git%2fconfig`,`/api/devtools%2f` → **404 origin**; `/%2e%2e%2f…etc%2fpasswd` → **400** | ⚠️ açık |
| W-18-10 | Cache zehirlenmesi | `X-Forwarded-Host`/`X-Host`/`X-Forwarded-Server`/`X-Original-URL` gövdeyi/`Location`'ı değiştirmiyor | ✔ |
| W-18-11 | Cache-deception | `/jobs/x.css`,`/api/build-info.css`,`/profile/dashboard.css`,`/login.js` → `BYPASS`+`private,no-store` | ✔ |
| W-18-12 | Metod allowlist | `/` ve `/jobs` **tüm** metodlarda 200 (GET-özel içerik); `/api/build-info` yazma → 405; `TRACE` → 405 | ℹ️ |
| W-18-13 | `/_next/image` regresyon (A-01c) | çift-kodlama + düz `/blog` → **400** (kapalı kalıyor) | ✔ |
| W-18-14 | Bot UA'ları | Googlebot/bingbot/YandexBot/facebookexternalhit/AhrefsBot/GPTBot/ClaudeBot → 200, `cf-mitigated` yok | ✔ |
| W-18-15 | İmzasız istemciler | boş UA / `curl` / `python-requests` → 200 (agresif challenge yok) | ✔ |
| W-18-16 | Yönlendirme | `http`→`https` 301; **`www`→apex yok (200)**; `http://www` → 2 hop, www'de biter | ❌ **H-03** |
| W-18-17 | Açık yönlendirme | `//evil.com`,`/\`,`/%5C`,`/%2F%2F`,`/..//` hep `isbulkktc.com` altında | ✔ |
| W-18-18 | TLS | SSL Labs 4/4 `A+`, yalnız TLS 1.2+1.3; sertifika `*.isbulkktc.com` (LE `YE2`, 2026-09-19→12-18) | ✔ |
| W-18-19 | HSTS | edge `max-age=31536000; includeSubDomains; preload`; origin `63072000` → **H-01 teyit** | ⚠️ H-01 |
| W-18-20 | HSTS preload | hstspreload API → `pending` | ℹ️ |
| W-18-21 | Rate limit | `/login` 30× **GET** → 30/30 200; `/api/build-info` 30× → 200. **tur 23 düzeltmesi:** yalnız GET ölçülmüştü; `POST /login` serisi ~10'da 429 (`error code: 1015`) | ⚠️→✔ (CF POST'u limitliyor; F-26/D-12) |
| W-18-22 | `cdn-cgi` yüzeyi | `/cdn-cgi/trace` 200, `/cdn-cgi/robots/x` 404 | ℹ️ |
| W-18-23 | `X-Robots-Tag` | site genelinde yok | ✔ |
| W-18-24 | `security.txt` | `Contact`/`Expires 2027-09-06`/`Canonical`/`Preferred-Languages` tam | ✔ |
| W-18-25 | Sitemap host tutarlılığı | 207 `<loc>`, **tek** host `isbulkktc.com` | ✔ |

### Drift (tur 18 — değişmedi)

H-01, H-02, N-01, R-01, G-01, W-01, **V-20**, F-08 açık. Dinamik HTML hiç
edge-cache'lenmiyor; cacheable statiklere yazma 405; CORS yalnız
`/api/build-info`; DKIM: CF `cf2024-1` **2048-bit**, Resend `resend._domainkey`
**1024-bit**; DMARC `p=none`.

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / Browser Cache
  TTL / Bot Management / Analytics okunamadı.
- **TLS 1.0/1.1 sunucu reddi:** sandbox istemcisi bu protokolleri desteklemiyor →
  SSL Labs sonucuna dayanıldı.
- **Gerçek tarayıcı:** SW güncelleme yayılımı, CHIPS/`Set-Cookie` sürülmedi.
- **IPv6 bağlantısı:** sandbox'ta v6 yolu yok.
- **E-posta teslimi:** gönderim yapılmadı.
- **DNSSEC uçtan uca doğrulama:** yalnız DoH `AD` bayrağı okundu; bağımsız
  doğrulayıcı (Unbound/knot) koşturulmadı.

## Edge mikro-denetim tur 19 — TLS/cipher derinliği + prerender cache başlıkları (2026-11-06)

Canlı build: `/api/build-info` → **`7b0f7170`** (tur 18 ile aynı). Salt-okuma.

### Düzeltmeler

| # | Yer | Boyut | Gözlenen (önce) | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| D-04 | `docs/cloudflare.md:490` (T-07) | Doğruluk | "TLS 1.0/1.1 **reddedilir**" — tur 17'de F-09/T-15 için düzeltilen **istemci-taraflı** kanıt T-07'de kalmıştı | SSL Labs kanıtı (4/4 `A+`, yalnız 1.2+1.3) | Yanlış kanıt iddiası | **düzeltildi** |
| D-05 | `docs/cloudflare.md:56` (F-14) | Doğruluk | "tüm dinamik HTML `private, no-store` — düzeltme gerekmez" | **prerender** rotalar `public, max-age=0` + `Set-Cookie` (bkz. P-01) | Eksik kapsam | **düzeltildi** |

### P-01 — prerender rotalarda `public` + `Set-Cookie` (bilgi / orta)

`x-vercel-cache: HIT` dönen **prerender** rotalar (`/blog`, `/contact`,
`/freelance`, `/about`, `/privacy`, `/terms`) `cache-control: public, max-age=0,
must-revalidate` **ve** `set-cookie: NEXT_LOCALE=…` döner; dinamik rotalar (`/`,
`/jobs`, `/companies`, `/en`,`/de`,`/fa`, `/login`) ise `private, no-cache,
no-store`. Ölçüm: `set-cookie` her ikisinde de var (dil middleware'i), `cf-cache-status`
her ikisinde de `DYNAMIC`.

**Neden şimdilik zararsız (üç bağımsız bariyer):**

1. **CF edge cache'lemiyor.** `cf-cache-status: DYNAMIC` — Cloudflare HTML'i
   `cf-cache-status`/`Age` üretmeden origin'e geçiriyor; `public` burada edge
   cache'ini açmıyor. Ayrıca CF HTML'i yanıt başına yeniden yazıyor
   (`__CF$cv$params`, G-01 e-posta obfuscation) → gövde deterministik değil
   (aynı istekte bile md5 farklı), dolayısıyla paylaşımlı cache için uygun değil.
2. **Vercel cache'i cookie-ayrımlı.** Prerender gövdesi dil middleware'i
   (`NEXT_LOCALE`) ile **istek-başına farklı**: aynı cookie ile bile md5 değişiyor
   (`__CF$cv$params`); farklı cookie'de `<html lang>`/title gövdede birebir aynı
   (HTML sunucuda dil-nötr). Yani kullanıcıya özel veri sızmıyor.
3. **`must-revalidate` + `max-age=0`** paylaşımlı cache'te bayat yanıt riskini
   azaltır.

**Neden yine de izlenmeli:** `public` + `Set-Cookie` + `Vary`'da `Cookie` yok
kombinasyonu, HTML cache kuralı değişirse (ör. `Edge Cache TTL`, Cache Rule
genişlemesi) tek kullanıcının dil içeriğini başkasına servis etme riskine açılır.
Origin `Cache-Control`'ü prerender rotalarda da `private, no-store`'a çekilmeli
**veya** dil bilgisi `Vary: Cookie` ile bildirilmeli. Bu bir **origin/Next**
ayarıdır (`next.config.ts`, `lane:guvenlik` sahipliğinde) — CF panelinden
düzeltilemez. → **LANE-GÜVENLİK'e handoff.**

### Tur 19 canlı ölçümleri (yeni/derinleştirilmiş)

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| W-19-1 | SSL Labs tam analiz (4/4 EP) | hepsi `A+`, `isExceptional: true`, `hasWarnings: false` | ✔ |
| W-19-2 | Protokol | yalnız `TLS 1.2` + `TLS 1.3` | ✔ |
| W-19-3 | Sertifika anahtarı | **ECDSA** (`sigAlg: SHA384withECDSA`), LE `YE2`, SAN `*.isbulkktc.com, isbulkktc.com` | ✔ |
| W-19-4 | Forward secrecy | `forwardSecrecy: 4` (en yüksek sınıf), `supportsAead: true` | ✔ |
| W-19-5 | Zayıf kripto | `supportsRc4: false`, `compressionMethods: 0`, `ticketbleed`/`heartbleed` yok | ✔ |
| W-19-6 | Renegotiation | `renegSupport: 2` (güvenli/secure renegotiation) | ✔ |
| W-19-7 | Named group (PQC) | `X25519MLKEM768` (PQC hibrit) + x25519/secp256r1/384/521 | ✔ |
| W-19-8 | Canlı KEX | `/cdn-cgi/trace` → `kex=X25519MLKEM768`, `tls=TLSv1.3` | ✔ |
| W-19-9 | HTTP/3 | `curl --http3` → `http_version=3`, `200`; `alt-svc: h3=":443"; ma=86400` (apex + `www` + `/cdn-cgi/speculation`) | ✔ |
| W-19-10 | ALPN | `h2`, `http/1.1` | ✔ |
| W-19-11 | OCSP stapling | `no response sent` (CF Free'de beklenen; stapling yok) | ℹ️ |
| W-19-12 | HSTS preload | `hstspreload.org/api/v2/status` → **`pending`** | ℹ️ |
| W-19-13 | Prerender cache başlıkları | `/blog`…`/terms` → `public, max-age=0` + `Set-Cookie`, `DYNAMIC` | ⚠️ P-01 |
| W-19-14 | Dinamik cache başlıkları | `/`, `/jobs`, `/companies`, `/en`… → `private, no-store`, `DYNAMIC` | ✔ |
| W-19-15 | `Vary` kapsamı | HTML'de `rsc, next-router-*` + `accept-encoding`; `Cookie` **yok** | ℹ️ |
| W-19-16 | `/cdn-cgi/speculation` | `cf-speed-brain` prefetch kuralları (`eagerness: conservative`) | ℹ️ |
| W-19-17 | IPv6 bağlantısı | `curl -6` → `http_code=000` (sandbox'ta v6 yolu yok) | **bakılmadı** |

### Drift (tur 19 — değişmedi)

H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08 açık. Dinamik HTML edge-cache'lenmiyor;
cacheable statiklere yazma 405; DKIM CF `cf2024-1` 2048-bit, Resend `resend._domainkey`
1024-bit; DMARC `p=none`; HSTS preload `pending`.

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / Browser Cache
  TTL / Bot Management / Analytics okunamadı — ölçüm edge↔origin diff + DoH +
  SSL Labs ile yapıldı.
- **IPv6 bağlantısı:** sandbox'ta v6 yolu yok.
- **OCSP stapling uçtan uca:** yalnız "no response sent" gözlendi.
- **Gerçek tarayıcı:** HTTP/3 tarayıcı davranışı, SW güncellemesi sürülmedi.

## Edge mikro-denetim tur 20 — HSTS preload hazırlığı + CNAME hedef çözünürlüğü (2026-11-06)

Canlı build: `/api/build-info` → **`8de37c8`**. Salt-okuma. `CF_API_TOKEN` bu
sandbox'ta yok → zone API denetimi yine yapılamadı; ölçüm canlı HTTP + DoH +
hstspreload API ile.

### Düzeltmeler

| # | Yer | Boyut | Gözlenen (önce) | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| D-06 | `docs/cloudflare.md:968,1525,463` (T-22/W-18-5/§) | Doğruluk | "`rsend`→`send.forge.rmta.net` **çözülüyor** (feedback A `3.231.87.173`) → dangling değil" | Hedefin **kendi** A/AAAA'sı yok; `3.231.87.173` MX hedefi `feedback.forge.rmta.net`'in adresi | Yanlış kanıt iddiası | **düzeltildi** |

### D-06 — `send.forge.rmta.net` adreslenemiyor (bilgi / düşük)

DoH kanıtı (Cloudflare + Google aynı fikirde):

```
send.forge.rmta.net   A=[]  AAAA=[]  CNAME=[]  TXT=[v=spf1 ip4:52.3.252.119 …]  MX=[10 feedback.forge.rmta.net.]
rsend.isbulkktc.com   CNAME=send.forge.rmta.net.
feedback.forge.rmta.net  A=[3.231.87.173, 98.83.16.149]
```

Yani `rsend`'in hedefi **MX barındıran** bir isim ama **kendi adres kaydı yok**.
E-posta (Resend Forge return-path) MX + SPF üzerinden çalıştığı için işlevsel;
ama tur 18'de "dangling değil" savunusu, **başka** bir ismin A kaydını delil
gösteriyordu — geçersiz kanıt. Gerçek durum: CNAME hedefi adreslenemiyor.
Subdomain-devralma riski **yok** (hedef `rmta.net` sağlayıcının kendi bölgesi,
adres yayınlamıyor → ele geçirilecek kayıt yok). Bkz. W-20-4.

### W-20 — HSTS preload hazırlığı (yeni boyut)

`hstspreload.org` → **`status: pending`**. Preload iki şart arar: (1) HSTS
`includeSubDomains` + `preload` + `max-age ≥ 1 yıl`, (2) **alt alanların
tamamı HTTPS sunmalı**. Canlı ölçüm:

| # | Test | Gözlenen | Durum |
|---|---|---|---|
| W-20-1 | HSTS preload durumu | `pending` | ℹ️ |
| W-20-2 | HSTS başlığı (apex + `www`) | `max-age=31536000; includeSubDomains; preload` | ✔ |
| W-20-3 | `www` HTTPS | **200** (apex'e yönlenmiyor) — sertifika `CN=isbulkktc.com` (SAN kapsıyor) | ⚠️ **H-03** |
| W-20-4 | `includeSubDomains` HTTPS kapsamı | `send`, `rsend`, `autodiscover`, `mta-sts` → **HTTPS yok** (`000`, sertifika yok); bunlar mail-only (MX/TXT), A/AAAA yok | ✔ **kapsam dışı** (tur 25, M-06: kaydı olmayan isim preload denetimine girmez) |
| W-20-5 | Apex/`www` AAAA | ikisi de CF IPv6 (`2606:4700:…`) | ✔ |
| W-20-6 | IPv6 bağlantısı | sandbox'ta v6 yolu yok (`curl -6` → 000) | **bakılmadı** |
| W-20-7 | `http://www` → `https://www` → apex | 301 → **200** (apex'e varmıyor), yol+sorgu www'de korunur | ❌ **H-03** |
| W-20-8 | HTTP/3 + KEX | `curl --http3` → 200/3; `/cdn-cgi/trace` `kex=X25519MLKEM768`, `tls=TLSv1.3` | ✔ |
| W-20-9 | Güvenlik başlıkları (apex) | CSP, HSTS, COOP, CORP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` tam | ✔ |
| W-20-10 | `/_next/static/*` | `public, max-age=31536000, immutable`, `HIT`, `age=655020` | ✔ |
| W-20-11 | Root MX (inbound) | Cloudflare Email Routing `route1/2/3.mx.cloudflare.net`, `AD=true` | ✔ |
| W-20-12 | Apex TXT | 2× `google-site-verification` (yinelenen), `yandex-verification`, SPF | ℹ️ |
| W-20-13 | `cf-mitigated` | `/api/devtools/` → 403, `cf-mitigated` **yok** (WAF kuralı, challenge değil) | ✔ |

**Yorum (W-20-4).** Preload'un `includeSubDomains` şartı **her** alt alanın HTTPS
sunmasını ister; `send`/`rsend`/`autodiscover`/`mta-sts` yalnız e-posta için
yayınlanıyor ve HTTPS sunmuyor. Bu isimler **kullanıcı trafiği almıyor**
(adres kaydı yok), yani bugün **kırılma yok**; ama preload denetimi (Google)
bunları gördüğünde `pending`'de takılabilir. İki seçenek: (a) mail-only isimleri
`includeSubDomains` kapsamı dışına almak mümkün değil (HSTS alt-alan kapsamı
bölünemez) → HTTPS'i tüm isimlere açmak, ya da (b) preload'u bekletmek. `www`
dışında tarayıcıya çıkan alt alan olmadığından etki **düşük**.

> **Düzeltme (tur 25, M-06).** Yukarıdaki "preload'da takılabilir" çıkarımı
> **geçersiz**. hstspreload.org yalnız **DNS kaydı taşıyan** alt alanları denetler;
> `send`/`rsend` yalnız MX/TXT/CNAME, `mail`/`smtp`/`cdn` ise **hiç kayıt yok**
> (DoH `Status=0`, `Answer=[]`). Dört preload şartının tamamı canlı karşılanıyor →
> `pending` bir **kuyruk** durumu, engel değil. Detay: tur 25.

### Drift (tur 20 — değişmedi)

H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08 açık. WAF negatif 5/5 → 403
(`.git/config`, `.env`, `wp-login.php`, `.aws/credentials`, `xmlrpc.php`);
V-20 boşluğu (`config.php`,`shell.php`,`actuator/env`,`phpinfo.php`,`Dockerfile`)
→ 404 origin; bot UA'ları (Googlebot/Bingbot/GPTBot/curl) → 200, `sqlmap` → 403;
meşru rotalar + 6 dil → 200; dinamik HTML `DYNAMIC`+`private,no-store`; DMARC
`p=none`; Resend DKIM 1024-bit; CF Email Routing DKIM 2048-bit; CAA 10 kayıt;
DNSSEC apex `AD=true`, `rsend` `AD=false`.

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / Browser Cache
  TTL / Bot Management / Analytics okunamadı.
- **IPv6 bağlantısı:** sandbox'ta v6 yolu yok (yalnız AAAA DoH ile).
- **`includeSubDomains` alt alan tam envanteri:** crt.sh bu sandbox'ta yanıt
  vermedi; 32 yaygın ad + sahibin bilinen mail isimleri tarandı.
- **Gerçek tarayıcı:** HTTP/3 tarayıcı davranışı, SW güncellemesi sürülmedi.

---

## Edge mikro-denetim tur 21 — yeniden ölçüm + G-01 derinleştirme + `/robots.txt` `Vary` (2026-11-06)

Salt-okuma. Canlı build `/api/build-info` → **`838444a5`** (production).

### Düzeltmeler (sahip olunan dokümanlarda)

| # | Dosya:satır | Boyut | Gözlenen (önce) | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| D-07 | `docs/cloudflare.md:57,487` (F-15/T-02) | Doğruluk | "edge'de `Vary` **yok**" — tüm `/_next/static/*` için | Yalnız **font**ta yok | Eksik/yanlış genelleme | **düzeltildi** — metin (CSS/JS) `vary: accept-encoding` döner |
| D-08 | `docs/cloudflare.md:486,497` (T-01) | Doğruluk | "`/robots.txt` ve `/sitemap.xml` `Vary: accept-encoding` var" | `/robots.txt` **dönmez** | Yanlış başlık iddiası | **düzeltildi** |

### D-07 — `Vary` varlık tipine göre değişir (bilgi, düşük)

Origin (`isbulkktc-amber.vercel.app`) `/_next/static/*` için **hiç** `Vary`
göndermiyor; edge (CF) ekliyor:

| Varlık | Origin `Vary` | Edge `Vary` |
|---|---|---|
| `*.css` | yok | `accept-encoding` |
| `*.js` | yok | `accept-encoding` |
| `*.woff2` | yok | **yok** |

Yani tur 18'deki "edge'de `Vary` yok" düzeltmesi **font için doğru**, metin
varlıkları için fazla genellemeydi. Gözlenen bozulma yok (kodlama doğru); yalnız
doküman kanıtla hizalandı.

### D-08 — `/robots.txt` `Vary`'siz cache'leniyor (bilgi, düşük)

`/sitemap.xml` edge'de `vary: accept-encoding` döner; `/robots.txt` **dönmez**
(10/10 örnek + `?cb=` cache-bust, `MISS` yolunda da). Her ikisinde de gövde doğru
kodlanıyor:

```
/robots.txt  identity → 228 B düz gövde ; gzip → 124 B (gunzip birebir) ; br ayrı
/sitemap.xml identity/gzip → vary: accept-encoding
```

Gözlenen bozulma **yok**; risk teorik (paylaşımlı önbellek gzip gövdesini identity
istemciye servis edebilir). Origin ikisinde de `Vary` göndermiyor → `Vary`
**edge'den** geliyor ve CF metin yanıtlarında onu tutarsız ekliyor. İzlenmeli.

### G-01 derinleştirme — obfuscation pratikte etkisiz, adres aynı yanıtta 7× düz (bilgi/orta)

Tur 21'de ham HTML ayrıştırıldı; `info@isbulkktc.com` **tek** yanıtta **7 kez**
düz metin olarak geçiyor:

- 2× JSON-LD (`Organization.email` + `ContactPoint.email`)
- 5× RSC payload (`self.__next_f`) — `contactEmail`, JSON-LD kopyası (2×),
  footer `mailto:` ve `footer-support-value`

CF Email Obfuscation yalnız **görünür `mailto:`**'u `__cf_email__` span'ına
çeviriyor; JSON-LD ve RSC payload'daki düz adres olduğu gibi kalıyor → kazınabilir,
yani obfuscation'ın pratik etkisi **~sıfır**. Ayrıca `/cdn-cgi/l/email-protection`
doğrudan GET → **404** (yalnız istemci-taraflı çözülür). Öneri değişmedi:
Scrape Shield → Email Obfuscation **OFF** (kod değişmez; JSON-LD ile tutarlı olur).

### Bu turda yeniden doğrulananlar (temiz)

- **WAF negatif:** SQLi/UNION/XSS/LFI/RCE/SSRF/metadata/Log4Shell (15+ yol) →
  çoğu 200 (güvenli 404/405); VCS/dotfile/secret/CMS yolları → **403**.
- **WAF pozitif:** 6 dil × 6 rota → 200 (yalnız `/xx/` → 308 as-needed) → yanlış
  pozitif yok.
- **IP başlığı:** `CF-Connecting-IP` spoof → **403 `error code: 1000`**;
  `X-Forwarded-For`/`True-Client-IP`/`X-Real-IP` spoof → 200, yansıma yok.
- **Smuggling:** CL+TE → 200; yinelenen `Content-Length` → **400**; CONNECT → 400.
- **Header injection:** query/path `%0d%0a` → 404 + `set-cookie: NEXT_LOCALE`
  (yansıma yok).
- **Host başlığı:** `X-Forwarded-Proto: http` / `X-Forwarded-Host: evil.com` →
  canonical **sabit** `https://isbulkktc.com`.
- **Koşullu GET:** `If-None-Match` → **304**; `Range` → 200 (`accept-ranges` +
  `content-disposition`).
- **Meşru özel karakter:** Türkçe/`+`/`&`/tırnak içeren aramalar → 200.
- **Negatif cache:** `/_next/static/<yok>.js` → `MISS→HIT`, `max-age=31536000`
  (**N-01 teyit**); `/images/*` ve rastgele 404 → `BYPASS`/`DYNAMIC`.
- **`/cdn-cgi/trace`:** `colo=ORD, tls=TLSv1.3, kex=X25519MLKEM768`.
- **HSTS preload:** API → `pending`.
- **DKIM:** `cf2024-1` **2048-bit**, `resend._domainkey` **1024-bit** (K-01 teyit).
- **Mail DNS:** `autodiscover`/`mta-sts`/`_mta-sts` → **kayıt yok** (mail-only,
  A/AAAA yok); `send` MX `feedback-smtp.eu-west-1.amazonses.com`; apex+`www` AAAA
  CF; `rsend` CNAME `send.forge.rmta.net`; rastgele subdomain → NODATA (wildcard
  **değil**, `example.com` kontrolüyle teyit).

### OG / varlık doğrulaması (temiz)

- `og:image` = `https://isbulkktc.com/images/og-cover.webp`, **1200×630** (VP8
  lossy, 160 924 B); `og:image:width/height` 1200/630; `twitter:image` + `alt`
  var; her rota/dilde aynı görsel.
- Unicode varlık yolları URL-encode ile **200**: `Gazimağusa.webp`,
  `güzelyurt.jpg`, `lefkoşa.jpeg` (ham `grep` yanlışlıkla 404 gösteriyordu — yol
  kesilmesi, gerçek 404 değil).
- `/images/og-default.png` → **404**; ancak repoda (`src/`, `public/`, `docs/`)
  hiçbir yerde referans yok → var olmamış bir yol, ölü link değil.
- `/_next/image` yolu yok (`unoptimized`) — bilinen/kabul.

### Drift (tur 21)

H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08 **açık** (değişmedi). Canlı
`build-info` `838444a5`; issue #319'daki `c406b397`'den ileri (prod deploy
ilerlemiş) ama main HEAD `732d8ea` ≠ canlı → **drift sürüyor** (issue #319,
LANE-INFRA kapsamı).

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / Browser Cache
  TTL / Bot Management / Analytics okunamadı.
- **IPv6 bağlantısı:** sandbox'ta v6 yolu yok.
- **Gerçek tarayıcı:** `email-decode.min.js` çalışma-anı davranışı ve Turnstile
  iframe'i sürülmedi.

---

## Edge mikro-denetim tur 22 — P-01 canlı kapanışı + `Vary` ölçüm yöntemi + spec-rules (2026-11-06)

Salt-okuma. Canlı build `/api/build-info` → **`3f5a654`** = `main` HEAD (drift yok).

### Düzeltmeler (sahip olunan dokümanlarda)

| # | Dosya:satır | Boyut | Gözlenen (önce) | Beklenen | Etki | Durum |
|---|---|---|---|---|---|---|
| D-09 | `docs/cloudflare.md:56` (F-14) | Doğruluk | prerender rotalar `public, max-age=0` | `private, no-store` | Bayat bilgi | **düzeltildi** (P-01 kapandı) |
| D-10 | `docs/cloudflare.md:1744` (D-07) | Doğruluk | "edge metin varlıklarına `Vary` **ekler**" — yöntem belirsiz | Yalnız **GET + MISS**'te gözlenir; `curl -I` (HEAD) `Vary`'yi göstermez | Yanlış ölçüm yöntemi | **düzeltildi** (aşağıda) |
| D-11 | `docs/cloudflare.md:1774` (G-01) | Doğruluk | "2× JSON-LD + 5× RSC payload" | 2× JSON-LD + **1×** `contactEmail` + **2×** JSON-LD kopyası + `mailto:` href + footer değeri | Eksik/toplu sayım | **düzeltildi** (aşağıda) |

### P-01 canlıda KAPANDI (tur 19→22)

Tur 19'da `lane:guvenlik`e devredilen P-01 (`next.config.ts`), PR **#403** ile
main'e girdi ve canlıya alındı (`build-info` `3f5a654` = main HEAD). Ölçüm:

```
/blog /contact /freelance /about /privacy /terms /en/blog
→ cache-control: private, no-cache, no-store, max-age=0, must-revalidate
→ cf-cache-status: DYNAMIC   (Set-Cookie: NEXT_LOCALE hâlâ var — dil middleware'i)
```

Artık **prerender rotalar da `private, no-store`** döner; `public, max-age=0`
kalmadı. Paylaşımlı cache'e bayat/kullanıcı-özel içerik sızma yüzeyi kapandı.
`set-cookie` varlığı (dil middleware'i) ayrı ve bilinen bir durum; `Vary`'da
`Cookie` yokluğu **artık risk değil** (yanıt `no-store`).

### D-10 — `Vary` ölçümü yönteme bağlı: HEAD vs GET (bilgi, düşük)

D-07'nin "edge `Vary` ekliyor" gözlemi **doğru**, ama `Vary` yalnız **GET**'te ve
çoğunlukla **cache MISS**'te döner. `curl -I` (HEAD) aynı URL'de `Vary`'yi
**göstermez**:

| İstek | `cf-cache-status` | `vary: accept-encoding` |
|---|---|---|
| `HEAD /_next/static/chunks/275n0961ffgrc.css` | HIT | **yok** |
| `GET  /_next/static/chunks/275n0961ffgrc.css` | HIT | **var** |

MISS'te ise hem HEAD hem GET'te var (tur 21 bunu `?cb=` ile görmüş). Yani
`Vary`'nin varlığı **metod + cache durumu** ile değişir; `curl -I` ile ölçülen
"yok" sonucu yanıltıcıdır. **Kodlama yine de doğru**: HIT'te `Accept-Encoding:
identity` → düz gövde (11 767 B), `gzip`/`br` → sıkıştırılmış; yanlış kodlanmış
gövde gözlenmedi. Ders: başlık "var/yok" iddiasını **GET** ile ve cache
durumunu not ederek ölç.

### D-11 — G-01 adres bağlamları (bilgi/orta, öneri değişmedi)

`info@isbulkktc.com` tek yanıtta **7×** düz metin; bağlamlar (ham HTML, sırayla):

1. JSON-LD `Organization.email`
2. JSON-LD `ContactPoint.email`
3. RSC `contactEmail`
4. RSC JSON-LD kopyası (`Organization`)
5. RSC JSON-LD kopyası (`ContactPoint`)
6. RSC footer `mailto:` href (`href:"mailto:info@…"`)
7. RSC footer görünen değer (`footer-support-value`)

CF Email Obfuscation yalnız **görünür `mailto:` link metnini** `__cf_email__`
span'ına çevirir (sayfada 1 span); JSON-LD + RSC'deki 7 düz kopya kalır →
obfuscation'ın pratik etkisi **~sıfır**. Öneri: Scrape Shield → Email
Obfuscation **OFF** (kod değişmez). `/cdn-cgi/l/email-protection` doğrudan GET →
**404** (yalnız istemci-taraflı çözülür).

### Yeni gözlem — CF Speculation Rules enjeksiyonu (bilgi, düşük)

Edge, **origin'de olmayan** bir `speculation-rules: "/cdn-cgi/speculation"`
başlığı ekliyor (tüm HTML rotaları: `/`, `/jobs`, `/blog`, `/en`). İçerik:

```json
{"tag":"cf-speed-brain","prefetch":[{"eagerness":"conservative",
 "source":"document","where":{"and":[{"href_matches":"/*","relative_to":"document"}]}}]}
```

CF Speed Brain (spekulatif prefetch) **açık**. Etki düşük: `eagerness:
conservative` (yalnız işaretçi hover'ında), aynı-origin, `prefetch` (render
değil). Risk: gereksiz prefetch → origin'e ek trafik; `/login` gibi rotalar için
kullanıcı hover'ında ön-getirme. Öneri (panel, düşük öncelik): kullanılmıyorsa
Speed Brain'i kapat; kullanılıyorsa `/login`,`/auth/*` `where`'den hariç tut.
~~`speculation-rules` yalnız HTML yanıtlarında; JSON/`robots.txt`'te yok.~~
**DÜZELTİLDİ (tur 28):** bu iddia **yanlıştı** — başlık **her** içerik tipinde
geliyor (`text/plain`, `application/xml`, `application/json`, `image/webp`,
`text/css`, RSS) ve **403/404 hata yanıtlarında** da var. Kanıt: tur 28, SR-01r.

### Bu turda yeniden doğrulananlar (temiz)

- **WAF negatif:** 11/12 yol → **403**; `/config.json` → 404 (beklenen);
  `/.env%2f` → **403**; kodlanmış `/.git%2fconfig`,`/.git%252fconfig`,`/api/devtools%2f`
  → 404 (W-01 normalizasyon farkı, sızıntı yok).
- **WAF pozitif:** meşru SQLi-benzeri aramalar (`o'brien`,`union+select`,`drop+table`,
  `<script>`,`../../etc/passwd`), 5 dil öneki → **200**; yanlış pozitif yok.
- **Metodlar:** `TRACE` → **405**, `TRACK` → **403**, `CONNECT` → **400**;
  GET-özel yollara yazma 405.
- **Smuggling:** `CL+TE` (GET **ve** POST) → **400**; yinelenen `Content-Length`
  → **400**; yalnız `TE: chunked` → 200.
- **Başlık sahteleme:** `CF-Connecting-IP` spoof → **403 `error code: 1000`**;
  `X-Forwarded-For` spoof → 200 (yansıma yok); `Host: evil.com` → **403**;
  absolute-form `GET http://evil.com/` → **403**; `%0d%0a` → yansıma yok.
- **Yönlendirme:** `http`→apex **301**, `http www`→**301**, `https www`→apex
  **308**, yol+sorgu korunuyor; `//evil.com` → göreli `/evil.com`; `%5C`,`%2F%2F`
  → 404, `..%2F` → 400; locale `as-needed` (`/en/`→308 `/en`, `/tr`→308 `/`).
- **Trailing-dot (R-01 teyit):** `isbulkktc.com./jobs` → **404**; `www.…./jobs`
  → **308**; `isbulkktc.com./en` → 200 (Vercel host eşleştirme; `lane:infra`).
- **Cache-deception:** `/jobs/x.css`,`/api/build-info.css`,`/profile/dashboard.png`
  → **404** + `private,no-store` + `BYPASS`.
- **Negatif cache (N-01 teyit):** `/_next/static/<yok>.js` → **404**,
  `max-age=31536000`, `MISS→HIT` (origin `max-age=0`).
- **Header injection / cookie poisoning:** farklı `Cookie`/`Accept-Language`
  ile gövde boyutu **sabit** (278 012 B), `DYNAMIC`.
- **A-01c (kapalı):** `/_next/image` tek/çift-kodlama + `/blog` → **400**.
- **Bot UA:** `sqlmap` → 403; Googlebot/Bingbot/YandexBot/GPTBot/ClaudeBot/curl
  → 200; datacenter egress'imden (GCP `34.70.174.52`) `cf-mitigated` **yok**
  (bkz. "Bakılmayan" — bu gözlem brief'teki GH-runner challenge'ıyla çelişir).
- **TLS/sertifika:** HTTP/3 → 200 (`version=3`); cert `CN=isbulkktc.com`,
  Let's Encrypt `YE2`, SAN `*.isbulkktc.com, isbulkktc.com`, 2026-09-19→12-18.
- **DNS:** DMARC `p=none; rua=…; fo=1`; apex TXT 2× `google-site-verification`
  + `yandex-verification` + SPF; `_mta-sts`/`_smtp._tls` **yok**; DKIM
  `cf2024-1` 2048 / `resend` 1024; DNSSEC apex `AD=true`, `rsend` `AD=false`;
  CAA 10 kayıt.
- **`security.txt`:** 200, `Expires 2027-09-06`, canonical doğru.
- **Sitemap:** tek host `https://isbulkktc.com`; `robots.txt` `noindex`
  sayfaları `Disallow` **etmiyor** (AUDIT kuralı — doğru).
- **HSTS preload:** API → `pending` (değişmedi).

### Drift (tur 22)

H-01 (CF HSTS `max-age`), H-02 (Browser Cache TTL), N-01 (`_next/static` 404
cache), R-01 (trailing-dot), G-01 (email obfuscation), W-01/V-20 (WAF
normalizasyon/tarayıcı yolu), F-08 (alias CF'i atlıyor) **açık** — değişmedi.
**Kapandı:** P-01 (#403). **Yeni:** SR-01 (CF Speed Brain `speculation-rules`,
bilgi). Canlı `build-info` `3f5a654` = `main` HEAD → **prod drift YOK**.

> **tur 23 güncellemesi:** canlı `build-info` `b221f17` = `main` HEAD **değil**
> (3 commit geride; #319 deploy donması). F-26 ("rate limit yok") **çürütüldü**
> — CF auth POST'larını limitliyor (D-12). Açık küme: H-01, H-02, N-01, R-01,
> G-01, W-01/V-20, F-08, SR-01 (F-26 artık **kapalı**).

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / Browser Cache
  TTL / Speed Brain ayarı / Bot Management / Analytics okunamadı.
- **IPv6 bağlantısı:** sandbox'ta v6 yolu yok.
- **Gerçek tarayıcı:** `email-decode.min.js` çalışma-anı davranışı, Turnstile
  iframe'i ve Speed Brain prefetch davranışı sürülmedi.
- **GH-runner egress challenge (brief):** sandbox'ta GitHub Actions runner'ı
  çalıştırılamadı; kendi datacenter egress'imde (GCP) challenge **gözlenmedi** —
  brief'teki "her yolda `cf-mitigated: challenge`" gözlemi bu egress'te
  **yeniden üretilemedi** (drift veya IP-sınıfı farkı olabilir; panelden teyit
  gerekir).

---

## Edge mikro-denetim tur 23 — rate-limit iddiasının çürütülmesi (2026-11-06)

Salt-okuma. Canlı `build-info` `b221f17` = `main` HEAD **değil** (3 commit geride;
#319 deploy donması — lane dışı, LANE-INFRA).

**Amaç.** Brief 6. maddesi (tek `http_ratelimit` kuralının nereye harcanması
gerektiği) hâlâ "onay bekleyen" tek somut yapılandırma sorusuydu; önceki turlar
bu kararı **"CF'de throttle yok"** ölçümüne dayandırmıştı. Bu tur o ölçümü
**yöntem düzeyinde** yeniden ele aldı.

### D-12 (doğruluk, orta) — "rate limit yok" iddiası yalnız GET ile ölçülmüştü

**Gözlenen.** `POST /login` hızlı serisi ~10 istekte **429** döner:

```
HTTP/2 429
content-type: text/plain; charset=UTF-8
content-length: 17
retry-after: 10
server: cloudflare
cf-ray: a564ef45fcbcc88f-ORD
# gövde: error code: 1015
```

Kontroller:

| Ölçüm | Sonuç |
|---|---|
| `POST /login` hızlı seri (taze pencere) | ~**10** istek sonra 429 (10,13,7,9,6 → ~10) |
| `POST /` (ana sayfa) 12× | 12/12 **200** |
| `GET /login` 12× | 12/12 **200** |
| `POST /nonexistent-xyz` 10× | 10/10 **404** (limite girmez) |
| `POST /signup` 10× | 10/10 **404** (rota yok) |
| `POST /register`,`/forgot-password`,`/reset-password`,`/tr/login` | hepsi ~6'da 429 |
| `/login` tüket → `POST /register` | **429** (kova paylaşımlı) |
| `/login` tüket → `GET /login` | **200** (GET etkilenmez) |
| `POST /login` 12× **alias** (`isbulkktc-amber.vercel.app`, CF'siz) | 12/12 **200** |
| 429 sonrası 12 sn bekle → `POST /login` | **200** (pencere sıfırlanır) |

**Beklenen.** Önceki doküman "hiç throttle yok" diyordu (F-26, T-20, W-18-21,
"Rate-limit gözlemi", "onay bekleyen" 1).

**Etki.** (1) **Güvenlik açısından iyi haber:** auth brute-force edge'de zaten
limitli; "tek kuralı auth'a tahsis et" önerisinin **premise'i yanlıştı** ve
öneri gereksizdi. (2) **Doküman doğruluğu:** dört ayrı yerde yanlış iddia
düzeltildi. (3) **Kalan (düşük):** limit yalnız **POST**'ta; GET tabanlı
hesap-numaralandırma açık (brute-force değil, keşif). Eşik ~10/~10 sn — makul
ama istenirse panelden sıkılaştırılabilir.

**Kanıt yöntemi notu (D-10'un devamı).** Önceki ölçümler `GET`/`curl -I` ile
yapıldığı için CF'nin **metod-duyarlı** limitini göremedi. Bir throttle iddiasını
**her zaman ilgili metodun kendisiyle** (burada `POST`) ve mümkünse CF'siz
alias kontrolüyle ölç: iki yüzeyin farkı limitin sahibini (CF mi origin mi)
kesinleştirir.

### Bu turda yeniden doğrulananlar (temiz)

- **F-08:** alias `server: Vercel`, `x-vercel-id` var, `cf-ray` yok; `POST /login`
  12/12 200 → CF'yi atlıyor (tur 23 teyidi).
- **H-01 (açık):** edge HSTS `max-age=31536000` vs origin `63072000`.
- **G-01 (açık):** ana sayfada `email-protection` **1** span (görünür `mailto:`);
  JSON-LD/RSC'de düz e-posta değişmedi.
- **SR-01 (açık):** `speculation-rules: "/cdn-cgi/speculation"` tüm HTML'de.
- **R-01 (açık):** `isbulkktc.com./` → **404**.
- **N-01 (açık):** `/_next/static/<yok>.js` → 404 + `max-age=31536000` + `MISS`.
- **W-01/V-20 (açık):** `/config.php`,`/actuator/env`,`/Dockerfile` → **404**
  (CF 403 değil).
- **WAF pozitif:** `/.env`,`/.git/config`,`/wp-login.php` → **403**.
- **Cache:** `robots.txt` `max-age=2628000` `REVALIDATED` (`vary` yok);
  `sitemap.xml` `max-age=3600` `REVALIDATED` + `vary: accept-encoding` (D-08
  ayrımı sürüyor).
- **`cf-mitigated`:** ana sayfada **yok** (bu egress'ten challenge üretilemedi).

### Drift (tur 23)

**Kapandı:** F-26 (rate limit var — 429/`error 1015`). **Açık:** H-01, H-02,
N-01, R-01, G-01, W-01/V-20, F-08, SR-01. Canlı build `main`'in 3 commit
gerisinde (#319). Detay: F-26 satırı, "Onay bekleyen" 1, T-20, W-18-21,
"Rate-limit gözlemi".

---

## Edge mikro-denetim tur 24 — yerel teslim / sıkıştırma / cache-key + challenge sahibi (2026-11-06)

Brief'in 3. (Cache Rules) ve 5. (Bot koruması) maddeleri yeniden ölçüldü; tur
23'ün "alias CF'yi atlıyor" bulgusu derinleştirildi. **İki yeni bilgi bulgusu
(D-13, D-16) ve iki düzeltme (F-08 nüansı, D-14)** çıktı; hiçbiri yıkıcı değil.

### D-13 — `curl -D -`'deki "çift `link:`" bir bug değil, `103 Early Hints` (bilgi)

Tur 24 başında apex HTML'inde **iki `link:` başlığı** görüldü ve "CF başlık
enjekte ediyor" sanıldı. Yöntem ayrıştırması bunu çürüttü:

```
curl -s -o /dev/null -D - 'https://isbulkktc.com/'   # → 2 satır link:
# çünkü -D - hem 103 hem 200 başlıklarını basar
curl -s -o /dev/null --http2 -v 'https://isbulkktc.com/' 2>&1 | grep '^< HTTP'
# < HTTP/2 103   ← Early Hints (aynı Link kümesi)
# < HTTP/2 200   ← gerçek yanıt (aynı Link kümesi)
```

| Yüzey | `103` sayısı (3 örnek) | `link:` (200) |
|---|---|---|
| apex `HTTP/2` | **1 / 1 / 1** | aynı küme |
| origin `HTTP/2` | **0 / 0 / 0** | aynı küme |
| apex `HTTP/1.1` | **0 / 0 / 0** | tek başlık |

Yani `103`'ü **CF ekliyor** (origin'de yok), yalnız HTTP/2'de; `103`'ün `Link`
kümesi `200`'ünkiyle **birebir aynı** (önyükleme doğru). `103`'ü `-D -` ile
okumak "çift başlık" sanılır — bu bir **ölçüm tuzağı**, bug değil.

### D-16 — sıkıştırma istemciye göre müzakere ediliyor, `zstd` dahil (bilgi)

`Accept-Encoding` değiştikçe edge `content-encoding`'i birebir seçiyor ve
`vary: accept-encoding` ile anahtarlıyor:

| `Accept-Encoding` | `content-encoding` (HTML) |
|---|---|
| `br` | `br` |
| `gzip` | `gzip` |
| `br, gzip` | `br` |
| `zstd` | **`zstd`** |
| `identity` | (yok) |

Statik CSS'te de aynı: `br`/`gzip`/`identity` → ilgili `content-encoding`,
`cf-cache-status: HIT`, `vary: accept-encoding`. **Yeni bilgi:** edge **`zstd`**
sunuyor (önceden not edilmemişti) — istemci desteklerse `br`'den küçük. Cache-key
encoding-duyarlı olduğu için yanlış kodlama servis edilmiyor.

### D-14 — Vercel alias'ın kendi challenge'ı: **yol-taramaya duyarlı**, IP'ye özel (orta)

Tur 23 "alias CF'yi atlıyor, korumasız" diyordu. Doğru, **ama** alias'ın kendi
katmanı var ve tetikleyicisi **hacim değil, saldırı-yolu taraması**:

```
# Temiz durum: 25× hızlı GET / → 25/25 200 (hacim limiti YOK)
# Tek bir hassas-yol serisi (16 istek): /.env /.git/config /.aws/credentials …
#   → 13× 404, 3× 403 (/.DS_Store /actuator/env /web.config), ardından GET / → 403
#   → x-vercel-mitigated: challenge · retry-after: 30 · server: Vercel
```

- Challenge **IP'ye özel**: aynı saniyede temiz bir egress'ten (r.jina.ai) alias
  `/` → **200**, tam sayfa.
- Challenge **en az 6 dakika** tetikleyen IP'de kalıcı (tur 24'te 60/120/180/240 sn
  ölçüldü, hâlâ `challenge`); kesin TTL panelden görülmeli — "dakikalar içinde
  söner" iddiası bu egress'te **doğrulanmadı**.
- Hassas yollar alias'ta **karışık** döner: `/.env`, `/.git/config`, `/.ssh/id_rsa`,
  `/wp-config.php` → **404** (origin'de yok); `/.DS_Store`, `/actuator/env`,
  `/web.config` → **403** (Vercel'in kendi deny-listesi). Yani "her hassas yol
  404" (tur 23 notu) **yanlıştı** — Vercel'in kendi yapılandırması bazılarını
  403'ler.

**Sonuç:** alias yine de CF'yi atlıyor (WAF/bot/rate-limit apex'teki gibi değil),
ama "tamamen korumasız" değil — Vercel'in kendi Security Checkpoint'i saldırı-yolu
taramasını yakalıyor. Bu, F-08'in **şiddetini düşürür** (yine de Deployment
Protection önerilir), **kapatmaz**.

### D-15 — `#163` Cloudflare halkası: bot engeli **YOK** (teyit, halka kopuk değil)

Issue #163'ün "CF arama motoru botlarını engelliyor mu?" sorusu yeniden ölçüldü:

| Test | Sonuç |
|---|---|
| apex `GET /` Googlebot / bingbot / YandexBot / DuckDuckBot / GPTBot / ClaudeBot | **hepsi 200**, `cf-mitigated` **yok** |
| apex `GET /` `sqlmap/1.7` | **403** (yalnız kötü UA) |
| apex sitemap Googlebot UA | **200**, 153 093 B, `application/xml` |
| apex tüm yollar (`/`, `/jobs`, `/login`, `/sitemap.xml`, `/robots.txt`) | `cf-mitigated` **hiç yok** |
| apex 30× hızlı `GET /` | 30/30 **200** (bot/rate engeli yok) |

`/JOBS` (büyük harf) bile **200** döner (case-insensitive route). Yani **bot
engeli halkası kopuk değil**; #163'ün kök nedeni CF değil (doğrulama/indeks,
LANE-SEO). Bu, `docs/lanes/02-cloudflare.md`'nin önceki tespitiyle uyumlu.

### D-17 — case-insensitive rotalar + `NEXT_LOCALE` çerezi (bilgi, düşük)

- **`/JOBS`, `/Jobs`, `/LOGIN` → 200**, `/jobs` ile **birebir aynı** `<title>` ve
  canonical (`https://isbulkktc.com/jobs`). Duplike içerik riski **yok** (canonical
  doğru); edge `DYNAMIC` (cache'lenmiyor).
- `NEXT_LOCALE=de` çerezi gövdeyi ~değiştirir **ama yalnız `__cf_email__` /
  `challenge-platform` rastgele parçalarında** (mail obfuscation + CF challenge
  token'ı); `<html lang>` **değişmez** (`localeDetection: false`). Yani "çerez
  locale'i değiştiriyor" **değil** — gerçek içerik anahtarı değil. Dinamik HTML
  zaten `DYNAMIC` + `no-store`.

### Drift (tur 24)

**Yeni:** D-13 (103 bilgi), D-16 (zstd bilgi), D-14 (alias challenge nüansı —
F-08 şiddeti düştü), D-17 (case/çerez bilgi). **Değişmeyen açık küme:** H-01,
H-02, N-01, R-01, G-01, W-01/V-20, F-08 (hâlâ açık), SR-01. **Kapandı:** yok
(tur 24 bilgi + nüans turu). Kanıt yöntemi: tüm ölçümler canlı `curl`/DoH; CF
paneline/DNS'e **yazılmadı**.

### Sahibin yapması gerekenler (tur 24 eklemeleri)

1. **F-08 (öncelik düştü ama açık):** Vercel Deployment Protection aç. Alias'ın
   Vercel Security Checkpoint'i saldırı-yolu taramasını yakalıyor ama hacim
   limiti yok; asıl koruma apex'te.
2. **D-14 takip:** Vercel'de "Security Checkpoint" ayarının bilinçli mi açık
   olduğunu panelden teyit et (bu ölçüm yalnız HTTP'den görüldü).

### D-18 — `#227`/`#170` e-posta kimlik doğrulama (DNS) canlı teyidi (orta)

`lane:cloudflare` etiketli **#227** (DKIM sahiplik ayrımı) ve **#170** (spam)
DNS halkası yeniden ölçüldü (DoH, 2026-11-06):

| Kayıt | Canlı değer | Durum |
|---|---|---|
| DKIM `resend._domainkey` | RSA **1024-bit** (`openssl rsa -pubin … -text`) | 🔴 **#227 madde 2 — panelde 2048'e yenile** |
| DKIM `cf2024-1._domainkey` | RSA **2048-bit** | ✅ |
| SPF apex | `v=spf1 include:_spf.mx.cloudflare.net ~all` | 🟠 Resend/SES **yok** (ama aşağıya bak) |
| SPF `send.isbulkktc.com` | `v=spf1 include:amazonses.com ~all` | ✅ Resend dönüş-yolu alt alanı |
| MX `send.isbulkktc.com` | `10 feedback-smtp.eu-west-1.amazonses.com.` | ✅ |
| DMARC `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1` | 🟠 izleme |

**Kritik nüans (doğruluk):** #170 "apex SPF Resend'i yetkilendirmiyor → SPF fail"
diyor. Bu, **zarf (Return-Path) alanına bağlı**: Resend gönderimi
`send.isbulkktc.com` zarfından yaparsa SPF `send` kaydına bakar (`amazonses`
içerir → **pass**), DMARC **relaxed** hizalama (aynı kuruluş alanı) tutar. Yani
"apex SPF'te `amazonses` yok" **tek başına SPF fail kanıtı değil**; kesin karar
için gerçek bir gönderimin `Authentication-Results` başlığı gerekir (panel/Gmail
"show original"). Bu ölçümde üretim postası gönderilemedi → **doğrulanamadı**,
"bakılmadı" olarak işaretlendi.

**Sahibin (panel/DNS) yapması gerekenler:**

1. **#227/2:** Resend panelinden `resend._domainkey` → **2048-bit** yenile, yeni
   TXT'i yayınla (kod değişmez; LANE-AUTH + LANE-CLOUDFLARE panel işi).
2. **#170:** Gerçek kayıt postasının `Authentication-Results`'ını Gmail'de
   incele; `spf=` ve `dkim=` sonuçlarını **önce ölç**, sonra DMARC'ı
   `quarantine`'e al. `p=none` + SPF/DKIM `pass` spam'i açıklar, `fail` açıklar.

---

## Edge mikro-denetim tur 25 — origin başlık sahipliği + yöntem semantiği + HSTS preload blocker (2026-11-06)

Canlı build: `/api/build-info` → **`00c665b`** (`origin/main` = `7d5bb64`, yani
canlı build **1 commit geride** — teslimat, bu lane'in alanı değil). Salt-okuma;
`CF_API_TOKEN` bu sandbox'ta yine yok → zone API okunamadı. Ölçüm: canlı
`curl`/`openssl` + DoH + hstspreload API.

Bu turun odağı **origin başlık sahipliği** (hangi başlığı CF, hangisini origin
koyuyor) ve **HTTP yöntem semantiği** — ikisi de şimdiye dek nokta-noktasına
sorulmamıştı. Bulguların tamamı `next.config.ts` / `src/app/api/**` (repo) veya
CF paneli (onay bekleyen) tarafında; **hiçbiri CF edge'inde değil**.

### Özet

**Yeni bulgular (hepsi LANE-GÜVENLİK'e devredildi — #424 (devir issue)):**

| # | Dosya:satır | Boyut | Gözlenen | Beklenen | Etki |
|---|---|---|---|---|---|
| M-01 | `src/app/api/build-info/route.ts:1` (`force-static`) — **Vercel statik katmanı**, `next.config.ts` değil | Yetki/sızıntı | `force-static` olduğu için Vercel bu yanıtı **statik varlık** gibi sunar ve statik varlıklara platform düzeyinde `access-control-allow-origin: *` ekler → herhangi bir origin `fetch()` ile canlı commit SHA'sını okuyabilir (`{"commit":"00c665b…","environment":"production"}`). Aynı ACAO `/robots.txt`, `/sitemap.xml`, `/_next/static/*.css`'te de var; **HTML sayfalarında ve dinamik API'de yok** | Statik varlık için kabul edilebilir; ama build-info **bilinçli olarak** cross-origin okunabilir olmalı mı? Değilse `force-dynamic` + dar ACAO | Düşük hassasiyetli bilgi (commit SHA) herkese açık; asıl etki "sürüm parmak izi" |
| M-02 | `src/app/[locale]/**` catch-all (repo, `next.config` değil) | Mantık/tutarlılık | `/` , `/jobs` PUT/DELETE/PATCH → **200** (tam HTML gövdesi); ama `/api/build-info` PUT/DELETE → **405** (doğru) | Sayfa rotaları da yazma yöntemlerine **405** dönmeli | Tutarsız yöntem sözleşmesi; origin (Vercel alias) da aynı davranır → repo-tarafı, CF değil |
| M-03 | `src/app/api/**` hata yolları | Hata yolu / cache | 405/400/404 yanıtları `cache-control: public, max-age=0, must-revalidate` (`/api/push/subscriptions` 405, `/api/email/unsubscribe` 400, `/_next/static/<yok>` 404) | Hata yolları `no-store` (build-info'nun yaptığı gibi) | CF bugün `DYNAMIC`/`BYPASS` tuttuğu için sömürülemez; CF Cache Rule eklenirse N-01 sınıfı yinelenir |
| M-04 | `/_next/static/<yok>.js` | Cache | 404 → `public, max-age=31536000, must-revalidate` (N-01'in canlı teyidi) | 404'ler uzun TTL almamalı | `must-revalidate` sayesinde bayat-404 riski düşük; 1 yıl TTL gereksiz |
| M-05 | `src/app/[locale]/(auth)/**` redirect | Tutarlılık | `/profile/dashboard` 307 yanıtı **iki özdeş** `Set-Cookie: NEXT_LOCALE=tr; Path=/; SameSite=lax` (deterministik, bayt-özdeş, `Accept-Language: de` ile de aynı) | Tek çerez | İşlevsel etki yok (aynı değer); yine de çift yazım |
| M-06 | `docs/cloudflare.md:1698` (W-20-4) | Doğruluk | Tur 20 "preload `includeSubDomains` şartı `send`/`rsend`/`autodiscover`/`mta-sts`'i HTTPS'e zorlar → `pending`'de takılabilir" dedi | Bu isimler **DNS kaydı taşımıyor** → preload kapsamı **dışı** | Yanlış engel iddiası; aşağıda düzeltildi |

**Doğrulanan / kapanan:**

- **W-20-4 revizyonu (M-06):** hstspreload.org'un **dört şartı** da canlı karşılanıyor
  (tablo aşağıda). Subdomain engeli **yok**: `send` yalnız MX+TXT, `rsend` CNAME
  (`rmta.net`), `mail`/`smtp`/`cdn` **hiç kayıt yok** (DoH `Status=0`, `Answer=[]`)
  → preload yalnız **kaydı olan** alt alanı denetler, bunlar kapsam dışı. `pending`
  bir **kuyruk** durumudur (inceleme + Chrome sürümüne girme aylar sürer), başarısızlık
  değil.
- **F-07 CAA:** canlı 10 kayıt (`issue`+`issuewild`: comodoca, digicert,
  letsencrypt, pki.goog, ssl.com); CF Universal SSL sertifikası **Let's Encrypt
  `YE2`** → uyumlu, eksik değil.
- **Crawler erişimi (#163):** Googlebot/bingbot `/`, `/jobs`, `/sitemap.xml` →
  **200**, `cf-mitigated` **yok**, `X-Robots-Tag` yok → CF halkası yine **kopuk değil**.
- **Gerçek statik varlık:** `/_next/static/chunks/*.css` → `public, max-age=31536000,
  immutable`, `cf-cache-status: HIT`, `age≈678000` → edge cache çalışıyor.
- **HSTS preload blocker yok** (aşağıdaki tablo).

### M-06 — HSTS preload şartları, tek tek canlı (düzeltme)

hstspreload.org "Submission Requirements" (2026-11-06 alındı):

| Şart | Canlı ölçüm | Sonuç |
|---|---|---|
| Geçerli sertifika | `CN=isbulkktc.com`, LE `YE2`, SAN apex+`www`, geçerli | ✅ |
| HTTP→HTTPS aynı host (port 80) | `http://isbulkktc.com/` → **301** `https://isbulkktc.com/` | ✅ |
| **Tüm alt alanlar HTTPS** | Yalnız `www` gerçek kayıt taşıyor → HTTPS 308 ✔; `send`/`rsend`/`mail`/`smtp`/`cdn` **DNS kaydı yok** (kapsam dışı) | ✅ |
| Taban alan HSTS: `max-age ≥ 31536000` + `includeSubDomains` + `preload` | `max-age=31536000; includeSubDomains; preload` | ✅ |
| Ek HTTPS yönlendirmesi de HSTS taşımalı | `https://www` → 308, **HSTS başlığı var** | ✅ |

**Sonuç:** dört şart da karşılanıyor → `pending` **engel değil**, sıra durumu.
W-20-4'ün "mail-only isimler preload'u takar" yorumu **geçersiz** (o isimlerin
A/AAAA'sı yok). Panelde yapılacak yeni bir iş **yok**; yalnız **H-01** (aşağıda)
kapatılırsa apex `max-age` 2 yıla çıkar (asgari zaten karşılanıyor).

### M-01..M-05 — kanıt

```
# M-01: cross-origin okunabilirlik (statik katman — Vercel; HTML/dinamik API'de YOK)
curl -s -H 'Origin: https://evil.example' https://isbulkktc.com/api/build-info -D -
  -> 200  access-control-allow-origin: *   body={"commit":"00c665b…","environment":"production"}
curl -s -H 'Origin: https://evil.example' https://isbulkktc.com/robots.txt -D -   -> 200  ACAO: *
curl -s -H 'Origin: https://evil.example' https://isbulkktc.com/jobs -D -         -> 200  ACAO yok (HTML)
curl -s -H 'Origin: https://evil.example' https://isbulkktc.com/api/qr -D -       -> 200  ACAO yok (dinamik)

# M-02: yöntem semantiği
curl -X PUT    https://isbulkktc.com/             -> 200 (text/html, x-vercel-cache: MISS)
curl -X DELETE https://isbulkktc.com/jobs         -> 200
curl -X PUT    https://isbulkktc.com/api/build-info -> 405   # API doğru yapıyor
curl -X PUT    https://isbulkktc-amber.vercel.app/ -> 200    # origin de aynı → CF değil

# M-03/M-04: hata-yolu cache
curl -D - https://isbulkktc.com/api/push/subscriptions          -> 405 cache-control: public, max-age=0, must-revalidate
curl -D - https://isbulkktc.com/api/email/unsubscribe?token=abc -> 400 cache-control: public, max-age=0, must-revalidate
curl -D - https://isbulkktc.com/_next/static/<yok>.js           -> 404 cache-control: public, max-age=31536000, must-revalidate

# M-05: çift çerez
curl -D - https://isbulkktc.com/profile/dashboard | grep -ci '^set-cookie:'  -> 2
curl -D - https://isbulkktc.com/login             | grep -ci '^set-cookie:'  -> 1

# M-06: preload
curl https://hstspreload.org/api/v2/status?domain=isbulkktc.com -> {"status":"pending"}
DoH random-x9z7q.isbulkktc.com A -> Status=0 Answer=[]  (wildcard YOK)
```

### Drift (tur 25 — değişmedi)

**Açık:** H-01 (edge HSTS 1 yıl vs origin 2 yıl), H-02 (Browser Cache TTL),
R-01 (trailing-dot apex 404; `www` 308), G-01 (Email Obfuscation), N-01
(`/_next/static` 404 1 yıl), W-01 (`%2f` normalizasyon), V-20 (tarayıcı yolu WAF
boşluğu), F-08 (Vercel alias CF'i atlar), **W-20-4 → geçersiz (M-06)**.

**Yeni açık:** M-01, M-02, M-03, M-04 (repo; #424 ile LANE-GÜVENLİK'e devir).
M-05, M-06 bilgi/düzeltme.

### Sahibin (CF paneli) yapması gerekenler (değişmedi + yeni)

1. **H-01:** SSL/TLS → Edge Certificates → HSTS'i kapat (origin gönderiyor) **veya**
   `max-age=63072000` yap. *(Repo alternatifi: `next.config.ts`'te HSTS'i
   `/api/**` dışı tüm yollara tek-kaynak ver → edge origin'i ezmez — #424'te.)*
2. **H-02:** Caching → Browser Cache TTL = `Respect Existing Headers`.
3. **F-08:** Vercel Deployment Protection aç.
4. **G-01:** Scrape Shield → Email Obfuscation OFF.
5. **R-01:** `isbulkktc.com.` (trailing-dot) → apex 301/308 kuralı.

### Bakılmayan

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset / Cache Rules / Browser Cache
  TTL / Bot Management / Analytics okunamadı (M-01..M-04'ün "panelde var mı"
  yarısı ölçülemez).
- **IPv6 yolu:** sandbox'ta v6 yok (yalnız DoH AAAA).
- **Gerçek tarayıcı:** çift-çerez davranışı tarayıcıda (hangi değer kazanır) ve
  PUT sonrası ön-yüz etkisi sürülmedi.
- **Gerçek posta `Authentication-Results`:** #170 için hâlâ ölçülemedi.

---

## Edge mikro-denetim tur 26 — WAF `%2F` kaçışının izolasyonu + H-01'in imkânsızlığı + nokta-noktasına denetim (2026-11-06)

**Amaç.** Brief'in 1–7. maddeleri noktası noktasına yeniden ölçüldü; tur 14'ten
beri "açık" duran **W-01/V-20** WAF-boşluğu **hangi kodlamanın** kaçtığına kadar
izole edildi ve **H-01** düzeltmesinin CF tarafında **imkânsız** olduğu resmî
dokümanla kanıtlandı. Sahip olunan iki doküman AUDIT boyutlarıyla tarandı.

### Özet bulgu tablosu

| # | Bulgu | Boyut | Şiddet | Durum |
|---|---|---|---|---|
| **N-11** | WAF dot-path kuralı **yalnız `%2F`** kodlamasıyla atlanıyor — yalnız **literalinde `/` olan** kurallarda (tur 27 düzeltmesi: "üç kategoride de" fazla genişti) | Yetki | 🟠 orta | **yeni** — izole edildi |
| **N-12** | CF **URL normalizasyonu bu açığı KAPATMAZ** (RFC 3986 rezerve `/`'yi çözmez) | Doğruluk | ℹ️ | **yeni** — öneri düzeltmesi |
| **N-13** | `/api%2F*` yolları origin'de **500** döner (Next.js rotalayamıyor) | Hata yolu | 🟡 düşük | **yeni** — repo-tarafı |
| **N-14** | `robots.txt` `Disallow: /api/` kodlanmış yolu tutmuyor | Mantık | ℹ️ | **yeni** — bilgi |
| **H-01r** | H-01 düzeltmesi **imkânsız**: CF HSTS `max-age` **1–12 ay** ile sınırlı | Doğruluk | 🟠 orta | **düzeltme** |
| **N-15** | `AGENTS.md:82-83` "`tr` sunulan URL'de ön-ekli" ↔ canlı **308** çelişkisi | Doğruluk | ℹ️ | **devir** (AGENTS.md sahipsiz) |

### N-11 — WAF dot-path kuralı yalnız `%2F` ile atlanıyor (izolasyon, orta)

Tur 14 (W-01) "kodlanmış yol" diyordu; tur 26 **tek tek kodlama** denedi. Sonuç
kesin: kaçan **tek varyant `%2F`** (eğik çizginin yüzde-kodlanmış hâli). Nokta
(`%2E`), tire (`%2D`), harf (`%64`/`%74`), çift-kodlama (`%252F`), ters bölü,
çift eğik çizgi ve nokta-segmentleri **hepsi doğru** yakalanıyor.

| İstek | Sonuç | Yorum |
|---|---|---|
| `/api/devtools/x` | **403** | WAF tutuyor |
| `/api%2Fdevtools/x` · `/api%2fdevtools/x` | **404** | 🔴 **atlandı** → origin |
| `/api%2Fdevtools%2Fx` | **404** | 🔴 atlandı |
| `/api/%64evtools/x` · `/api/dev%74ools/x` | **403** | `%2E`/harf çözülüyor ✔ |
| `/api/devtools%2Fx` | **404** | 🔴 atlandı |
| `/API/devtools/x` | **403** | case-insensitive ✔ |
| `/api/devtools/x/../y` · `/api//devtools/x` · `/api/./devtools/x` | **403** | dot-segment/`//` ✔ |
| `/api\devtools\x` | **403** | ters bölü ✔ |
| `/api%252Fdevtools%252Fx` | **404** | çift-kodlama çözülmüyor (origin 404, kural değil) |
| `/.git/config` · `/.env` · `/.env/` | **403** | VCS/dotfile kuralı |
| `/.git%2Fconfig` · `/.git%2fconfig` | **404** | 🔴 atlandı |
| `/%2Egit/config` · `/.%67it/config` · `/%2Eenv` | **403** | ✔ |
| `/wp-admin` · `/wp%2Dadmin` | **403** | CMS kuralı |
| `/wp%2Fadmin` | **404** | 🔴 atlandı |
| `/.gitignore` · `/telescope/requests` · `/actuator/env` · `/Dockerfile` | **404** | kural imzayı hiç içermiyor (V-20) |

**Origin'e ulaştığının ispatı (CF 403'ü değil):** yanıt `x-vercel-id` +
`cf-cache-status: DYNAMIC` taşır ve gövde Next.js/`/500` veya Vercel 404'üdür —
CF'nin 403 sayfası (`<html class="no-js ie6 oldie">`) değil.

```
curl -sD- --path-as-is https://isbulkktc.com/api%2Fdevtools/x | head -1   -> HTTP/2 404
   server: cloudflare · x-vercel-id: cle1::iad1::… · cf-cache-status: DYNAMIC
curl -sD- --path-as-is https://isbulkktc.com/api/devtools/x  | head -1   -> HTTP/2 403  (CF)
```

**Etki (orta).** Bugün `.git`/`.env`/`/api/devtools` origin'de **yok** → 404, sızıntı
yok (tur 14'teki "düşük" etki bu origin için hâlâ geçerli). Ama kural **sınıfı**
çöküyor: origin'e bir gün `.env`, bir panel, bir `/api/devtools` veya statik
sunucu eklenirse WAF onu **görmez**. Kodlanmış yol, kuralın *tüm* kategorilerinde
(VCS, dotfile, CMS, api/devtools) aynı boşluğu açıyor → şiddet **orta**'ya çekildi.

**Düzeltme (CF paneli → sahibin onayı).** Kural ifadesini **ham alan** üzerinden
kur — `raw.http.request.uri.path` (CF Rules dilinde dönüşümsüz orijinal yol) ya da
`url_decode(...)` ile çöz. Free plan `matches` operatörünü reddettiğinden
`contains`/`in`/`lower()` ile:

```
lower(url_decode(http.request.uri.path)) contains "/.git"
lower(url_decode(http.request.uri.path)) contains "/.env"
lower(url_decode(http.request.uri.path)) contains "/api/devtools"
lower(url_decode(http.request.uri.path)) contains "/wp-admin"
```

`url_decode` `%2F`'yi `/`'ye çözer → kodlanmış varyant artık eşleşir. **WAF kuralı
değişikliği yıkıcıdır → sahibin onayı.** (Kanıt: CF Rules dil dokümanı
`url_decode`, `raw.http.request.uri.path`.)

### N-12 — CF URL normalizasyonu bu açığı KAPATMAZ (öneri düzeltmesi)

Yaygın düzeltme önerisi "Rules → Overview → Normalize incoming URLs'ı aç" olurdu.
**Kanıtla çürütüldü.** CF'nin RFC 3986 normalizasyonu **rezerve karakterleri
çözmez** — `: / ? # [ ] @ ! $ & ' ( ) * + , ; =` **kodlanmış hâlde kalır**
(resmî "How URL normalization works"). Yani `%2F` normalizasyondan **sonra da**
`%2F`'dir; kural yine tutmaz.

| Normalizasyon | `%2F` üzerindeki etkisi | Kuralı düzeltir mi? |
|---|---|---|
| RFC 3986 | rezerve `/` **çözülmez** | ❌ hayır |
| Cloudflare (ek: `\`→`/`, `//`→`/`) | yalnız eğik çizgi birleştirme; `%2F`'ye dokunmaz | ❌ hayır |

**Sonuç:** doğru düzeltme normalizasyon ayarı **değil**, N-11'deki **ifade**
(`url_decode`/`raw.`). Bu, tur 14'ün "WAF ve origin aynı normalizasyonu uygulamıyor"
teşhisini doğrular; çözümü ise normalizasyonda değil, ifadenin kendisindedir.

### N-13 — `/api%2F*` origin'de 500 (repo-tarafı, düşük)

`%2F` ile kodlanmış API yolları CF'i geçtikten sonra origin'de **500** döner
(Next.js bu yolu rotalayamıyor):

| Yol | Düz | `%2F` kodlu |
|---|---|---|
| `/api/build-info` | 200 | **200** (statik, her yolu yakalıyor) |
| `/api/qr` | 200 | **500** |
| `/api/push/subscriptions` | 405 | **500** |
| `/api/email/unsubscribe` | 400 | **500** |

Origin (Vercel alias) da aynı **500**'ü verir → **CF değil, repo-tarafı**.
**Sızıntı yok:** gövde jenerik `<html id="__next_error__">` `/500` sayfası,
`x-matched-path: /500`; yığın izi/commit yok. Etki düşük (gereksiz 5xx gürültüsü,
log kirliliği). Sahip: `src/app/api/**` (LANE-URUN/GÜVENLİK) — bu lane düzeltmez.

### N-14 — `robots.txt` `Disallow: /api/` kodlanmış yolu tutmuyor (bilgi)

`robots.txt` `Disallow: /api/` **literal** eşleşir; `/api%2Fbuild-info` bu kalıba
**girmez** (robots eşleşmesi `%2F`'yi çözmez). Aynı boşluk `/auth/` için de var.
Etki **bilgi** düzeyinde: robots `noindex` zorlamaz, yalnız iyi-niyetli tarayıcı
yönlendirmesidir; `X-Robots-Tag` yok. `api%2F` yollarının 500 dönmesi (N-13)
tarama yüzeyini ayrıca daraltır. Aksiyon: gerek yok (robot kuralı güvenlik
kontrolü değildir) — yalnız kayda geçti.

### H-01r — H-01 düzeltmesi imkânsız: CF HSTS `max-age` 1–12 ay (düzeltme)

Tur 9'dan beri **H-01** şöyle yazılıydı: *"CF panelde edge HSTS `max-age`'i origin
(2 yıl = `63072000`) ile hizala."* Bu **uygulanamaz**: CF'nin HSTS yapılandırması
`Max Age Header` alanını **"Disable, or a range from 1 to 12 months"** ile
sınırlar (resmî "HTTP Strict Transport Security (HSTS)" dokümanı, canlı 2026-11-06).
`63072000` (24 ay) **aralık dışı** → panelde girilemez.

| | Değer | Kaynak |
|---|---|---|
| Origin (`next.config.ts:36`) | `max-age=63072000` (24 ay) | repo |
| Edge (CF) | `max-age=31536000` (12 ay) | canlı |
| CF izin verilen aralık | **1–12 ay** | CF dokümanı |

**Sonuç:** H-01 bir "CF'yi origin'e hizala" işi **değil**, bir **politika kararı**.
Üç seçenek (sahip seçer):

1. **Origin'i 12 aya indir** (`next.config.ts` → `31536000`) → iki taraf tutarlı,
   CF kuralı korunur. *Repo değişikliği → LANE-GÜVENLİK (#424 sınıfı).*
2. **CF HSTS'i kapat** → edge origin başlığını geçirir, `63072000` teslim edilir.
   ⚠️ **Güvenlik notu:** CF panelindeki "HSTS'i kapat" (`Max Age = 0`) edge'de
   `max-age=0` yayar ve **tarayıcıdaki HSTS politikasını temizler** → politika
   origin'in başlığına kalır ama geçiş penceresinde downgrade koruması zayıflar.
   Yalnız origin'in her yanıtta HSTS gönderdiği **kanıtlanmışsa** kabul edilebilir.
3. **Olduğu gibi bırak** → 12 ay zaten HSTS preload asgarisinin (1 yıl) **üstünde**
   ve SSL Labs `A+`; "tutarsızlık" yalnız config ↔ edge arasında, **güvenlik
   açığı değil**. (Tur 9'daki "düşük etki" değerlendirmesi geçerli.)

**Bu tur H-01'i "açık bulgu" olarak yeniden sınıflandırdı:** *düzeltilemez çünkü
önerilen düzeltme geçersiz*; doğru çerçeve bir **uyum/politika** kararıdır.

### N-15 — `AGENTS.md` `tr` ön-ek çelişkisi (devir, AGENTS.md sahipsiz)

`AGENTS.md:82-83` der: *"The default locale (`tr`) is unprefixed in
canonical/`x-default` output but **prefixed in the served URL**."* Canlı ölçüm
bunu **çürütüyor**: `/tr/*` **308 ile ön-eksize** yönlendiriliyor.

```
/tr/jobs  -> 308  https://isbulkktc.com/jobs
/tr/auth  -> 308  https://isbulkktc.com/auth
/jobs     -> 200
```

Yani `tr` sunulan URL'de **ön-eksiz** (kanonik/`x-default` ile aynı). `robots.txt`
de bunu doğru yansıtıyor: yalnız **varsayılan-olmayan** diller için
`/en|ru|el|fa|de/auth/` listelenir, `/tr/auth/` listelenmez (gereksiz olurdu).
**Etki:** yalnız doküman doğruluğu; işlevsel açık yok. `AGENTS.md` bu lane'in
sahipliğinde **değil** → `lane:infra` + `agent:handoff` ile devredilecek
(sahiplik tablosunda AGENTS.md görünmüyor; en yakın sahip `docs/lanes/**` ile
LANE-INFRA).

### Nokta-noktasına denetim (brief 1–7) — tur 26 durumu

| # | Alan | Ölçüm | Durum |
|---|---|---|---|
| 1 | DNS: A/proxied/TTL/`www`/mail | apex+`www` → CF anycast (`104.21.29.3`, `172.67.171.53`), proxied; `www` → **308** apex; SPF/DKIM/DMARC/CAA/DNSSEC değişmedi | ✔ |
| 2 | SSL/TLS: mod/min/HSTS/AlwaysUseHTTPS | SSL Labs **`A+`** 4/4, yalnız **TLS 1.2+1.3**; `http://` → **301**; HSTS+`includeSubDomains`+`preload`; **H-01r** (12 ay tavanı) | ⚠️ H-01r |
| 3 | Cache Rules / `Vary` / dinamik yollar | statik `immutable`+`HIT`; dinamik HTML `private, no-store`; **H-02** (Browser Cache TTL: `/robots.txt` 30 gün, `/sitemap.xml` 1 saat) hâlâ açık | ⚠️ H-02 |
| 4 | WAF: 4 kural + managed; bypass | saldırı **12/12 → 403**; meşru **18/18 → 200**; `sqlmap` **403**; **N-11** (`%2F`) açık | ⚠️ N-11 |
| 5 | Bot koruması | Googlebot/bingbot 200, `cf-mitigated` yok (#163 halkası kopuk değil); GH runner challenge'ı bilinçli trade-off | ✔ |
| 6 | Rate limit | tek Free kuralı leak-check'te (F-26 kapalı); auth brute-force tahsisi **onay bekliyor** | ℹ️ |
| 7 | Analytics/logpush | `CF_API_TOKEN` sandbox'ta yok → zone API okunamadı; gereken scope: `zone.analytics.read` | ⚠️ token |

**Güvenlik başlıkları (edge vs origin, tur 26):** CSP, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, Permissions-Policy, COOP, CORP,
X-Permitted-Cross-Domain-Policies, X-DNS-Prefetch-Control → **edge ve origin
birebir aynı** (CF ezmiyor). Tek fark **HSTS** (H-01r). `alt-svc: h3` (HTTP/3 açık).

### Bakılmayan (dürüst işaretleme)

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset ifadesi, Cache Rules, Browser
  Cache TTL, Bot Management, Analytics **okunamadı** → N-11 düzeltmesinin
  paneldeki mevcut ifadeyle birebir eşleştiği doğrulanamaz.
- **IPv6 yolu:** sandbox'ta v6 yok (yalnız DoH AAAA + SSL Labs IPv6 endpoint).
- **Gerçek tarayıcı:** HSTS `max-age=0` geçiş penceresinin tarayıcıdaki etkisi
  sürülmedi (N-15/H-01r için politika kararı).
- **`Authentication-Results`:** #170 için hâlâ ölçülemedi (posta teslimi).

### Drift (tur 26)

**Yeni:** N-11 (`%2F` izolasyonu), N-12 (normalizasyon çare değil), N-13 (`%2F`
API → 500), N-14 (robots boşluğu), N-15 (`tr` çelişkisi — devir).
**Düzeltildi:** H-01 → **H-01r** (imkânsız düzeltme; politika kararına çevrildi).
**Açık (değişmedi):** H-02, N-11 (eski W-01/V-20), R-01, G-01, F-08, SR-01.
**Devir:** N-15 → `lane:infra` + `agent:handoff`; N-13 → `src/app/api/**` sahibi.

### Sahibin (CF paneli) yapması gerekenler (tur 26 güncel)

1. **N-11 (orta):** Custom WAF 4. kuralını `url_decode(http.request.uri.path)`
   üzerinden kur (bkz. N-11 ifade örneği). **Yıkıcı → onay.**
2. **H-01r:** HSTS'i "2 yıla hizala" **yapılamaz** (1–12 ay tavanı). Politika seç:
   origin'i 12 aya indir **veya** CF HSTS'i kapat (güvenlik notuna bak) **veya** bırak.
3. **H-02:** Caching → Browser Cache TTL = `Respect Existing Headers`.
4. **R-01:** `isbulkktc.com.` (trailing-dot) → apex 301/308.
5. **G-01:** Scrape Shield → Email Obfuscation OFF (hâlâ açık, `/`'da 1 eşleşme).
6. **F-08:** Vercel Deployment Protection aç.
7. **#227:** Resend DKIM'i 2048-bit'e çevir (DKIM panel/DNS yarısı bu lane).

### Edge mikro-denetim tur 27 — `%2F` mekanizması + kural-bazlı WAF asimetrisi + kapalı kayıtlar (2026-11-06)

Brief 4 (WAF bypass) ve AUDIT "girdi/yönlendirme" boyutları derinleştirildi. Tur
26'nın **N-11**'i mekanizma düzeyinde kesinleştirildi; tur 26'nın "üç kategori de
atlanıyor" özeti **fazla geniş** çıktı ve düzeltildi. WAF dışı halkalar
(DNS/TLS/cache/bot) tazelendi; #163'ün CF halkası **kapalı kayıt** olarak ölçüldü.

#### N-11r — `%2F` kaçışının kesin mekanizması (tur 26 N-11 düzeltmesi)

**Mekanizma (resmî dokümanla doğrulandı):** CF, WAF kural değerlendirmesinden
**önce** RFC 3986 normalizasyonu uygular; bu, **yalnız unreserved** karakterleri
çözer (`a-z A-Z 0-9 - . _ ~`). **Rezerve** karakterler — özellikle `/` — `%2F`
kodlu hâlde **kalır** (CF "How URL normalization works"). Origin (Vercel/Next)
ise `%2F`'ı **`/`'a çözer**. Sonuç: literalinde `/` bulunan bir kural, saldırgan
o `/`'ı `%2F` yazınca **eşleşmez**, ama origin yolu doğru rotaya çözer.

**Kesin kanıt (bilinen rotayla):**

```
/api/build-info      -> 200 application/json (80 B)
/api%2Fbuild-info    -> 200 application/json (80 B, AYNI gövde)
/api%252Fbuild-info  -> 404 (çift-kodlama çözülmez)
```

`/api%2Fbuild-info` CF'i **atlıyor** (`x-vercel-id` dolu; `cf-ray` var ama kural
tetiklenmiyor) ve origin gerçek rotayı sunuyor.

**Kural-bazlı asimetri (tur 26'nın "üç kategori de" iddiası düzeltildi).** Kaçış,
kuralın **literalinde `/` olmasına** bağlı:

| Kural literali (tur 26) | Düz yol | `%2F` kaçışı | Sonuç |
|---|---|---|---|
| `/api/devtools/` | 403 | `/api/devtools%2Fx` → **404 origin** | ✅ atlanıyor |
| VCS/dotfile/secret (`/.git`, `/.env`) | 403 | `/.git%2Fconfig` → **404 origin** | ✅ atlanıyor |
| CMS/scanner (`/wp-admin`, `/phpmyadmin`) | 403 | `/wp-admin%2Fx` → **403 CF** | ❌ bloklu kalıyor |

Neden: `/api/devtools/` ve `/.git/` literallerinde `/` var → saldırgan onu `%2F`
yapar → kural tutmaz. `/wp-admin` ve `/phpmyadmin` literallerinde `/` **yok** →
`%2F` eklemek yolu değiştirmez → kural yine tutar. Yani tur 26'nın "hepsi tek
kategori" özeti fazla geniş; gerçek sınıf **"literalinde `/` olan kurallar"**.

**Ek kaçış biçimleri (16 varyant test edildi; ayırt edici olanlar):**

| Girdi | Kod | Katman | Not |
|---|---|---|---|
| `/api/devtools/x` | 403 | CF | taban |
| `/api/devtools%2Fx` | 404 | origin | `%2F` |
| `/api/devtools/x%09x` | 403 | CF | `%09` (kodlu TAB) yol ayracı değil |
| `/api/devtools/x;.js` | 403 | CF | `;` ayracı kuralı bozmuyor |
| `/API/DEVTOOLS/x` | 403 | CF | `lower()` çalışıyor |
| `/api//devtools/x` | 403 | CF | `//` baseline normalizasyon |
| `/api/%2E%2E/devtools/x` | 404 | origin | dot-segment (`%2E` unreserved → çözülür) |
| `/.git%2Fconfig` | 404 | origin | `%2F` |

**Düzeltme (değişmedi, onay bekliyor):** kuralları `url_decode(...)` üzerinden kur
— `url_decode` `%2F`'ı `/`'a çözer, kodlanmış varyant artık eşleşir. CF Rules
dilinde `url_decode` **mevcut** (resmî fonksiyon listesi). Ayrıca
**`Normalize incoming URLs` ayarı bu boşluğu KAPATMAZ** (rezerve `/` çözülmez) —
tur 26 **N-12 doğrulandı**.

**Yeni kayıt (N-16):** aynı mekanizma VCS yollarında da (`/.git%2Fconfig`) çalışıyor;
**ama** `wp-admin`/`phpmyadmin`/`.env` bloklu kaldığından genel bir "WAF kapalı"
durumu yok. Sınıf adı **"`/`-içeren literaller"**; `%09` gibi kodlu ayraçlar yol
ayracı olmadığından kuralı bozmuyor.

#### N-13r — `%2F` API etkisi (tur 26 N-13 tazelendi)

| Yol | Düz | `%2F` kodlu | Katman |
|---|---|---|---|
| `/api/build-info` | 200 JSON | **200 JSON** (aynı) | origin (WAF-bloklu değil) |
| `/api/qr` | 200 | **500** | origin |
| `/api/push/subscriptions` | 405 | **500** | origin |
| `/api/email/unsubscribe` | 400 | **500** | origin |

Origin (alias) da aynı → **CF değil, repo-tarafı** (Next.js `%2F` içeren yolu
rotalayamıyor). Sızıntı yok (jenerik `/500` gövdesi). Sahip: `src/app/api/**` (devir issue **#441**, `lane:infra`+`agent:handoff`)
(LANE-URUN/GÜVENLİK) — bu lane düzeltmez.

#### Kapalı kayıt — #163 CF halkası (bulunabilirlik)

#163'ün **Cloudflare** halkası yeniden ölçüldü; **kopuk değil**:

- **Bot engeli yok:** Googlebot/bingbot/YandexBot `/` → **200**, `cf-mitigated` yok.
- **Sitemap tutarlı:** 207 `<loc>`'un **tamamı** `https://isbulkktc.com` host'unda
  (`www` karışıklığı yok); 75 `<lastmod>`.
- **Doğrulama etiketi YOK:** `google-site-verification` **hiçbir sayfada yok**
  (`/`, `/en`, `/de`, `/en/jobs`; `grep -c site-verification` = **0**, 2026-11-10).
  `src/app/[locale]/layout.tsx` etiketi `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`'dan
  okuyor; env **üretimde tanımsız** → etiket basılmıyor. **Önceki "gerçek sayfalarda
  mevcut" kaydı YANLIŞTI** (bkz. tur 38 / **V-01**).
  **Nüans (tur 39, U-16r):** DNS TXT'te **iki geçerli** `google-site-verification`
  token'i var (`1zuidCsJ2…`, `7YbjG-3…`) — bu, Google'ın **DNS doğrulama** yöntemidir
  ve meta etiket olmadan da mülkü doğrulayabilir. Yani meta etiketin yokluğu
  **kod/env boşluğudur**, mülkün doğrulanmadığının **kanıtı değildir**. GSC paneli
  okunmadan "doğrulanmamış" denemez; bu yüzden burada issue açılmıyor, yalnız
  `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` env'inin girilmesi önerilir (LANE-SEO).
- **robots.txt** yalnız `/api/`, `/auth/` ve **varsayılan-olmayan** dilleri listeler.

**Gerçek kopuk halka LANE-SEO'da ve zaten açık:** Bing mülk doğrulaması yok —
`BingSiteAuth.xml` **404**, `msvalidate.01` meta **yok**, Bing DNS TXT **yok** →
**#173** (`lane:seo`+`agent:handoff`). Bu lane yeni issue açmıyor (mükerrer olur).

#### Kapalı kayıt — sertifika / DNSSEC / CAA / preload

- **Sertifika CA'sı `Let's Encrypt`** (`CN=YE2`, 2026-09-19 → 2026-12-18) → apex
  CAA `issue "letsencrypt.org"` ile **uyumlu**.
- **DNSSEC:** DoH `AD=true` → imzalı ve doğrulanmış.
- **CAA:** apex'te 5 `issue` + 5 `issuewild`; `www` için ayrı CAA **yok** — RFC 8659
  gereği CAA araması `www.isbulkktc.com`'dan üste (`isbulkktc.com`) yapıldığından
  apex kaydı `www`'yı da kapsar → **eksik değil**.
- **HSTS preload:** `hstspreload.org/api/v2/status` → **`pending`** (henüz listeye
  alınmamış, başvuru sürüyor) → HSTS `max-age` **12 ayın altına düşürülmemeli**
  (asgari 1 yıl), aksi hâlde başvuru reddedilir. Bu, H-01r seçeneklerinden
  "CF HSTS'i kapat"ı **preload başvurusuyla çelişkili** kılar.

#### Cache / poisoning tazelemesi

- `%2F` yolları edge'de **cache'lenmiyor** (`cf-cache-status: DYNAMIC`/`BYPASS`;
  `private`/`no-store`) → cache-poisoning yüzeyi yok.
- Cache-deception (`/jobs/x.css`, `/profile/dashboard/x.css`, `%2F` varyantları) →
  **404 `BYPASS`**, `private` → temiz.
- `cf-cache-status` bu turda `REVALIDATED` (önceden `HIT`/`MISS`); **başlıklar**
  (H-02 kanıtı) değişmedi: `/robots.txt` `2628000`, `/sitemap.xml` `3600`,
  `/images/*` `2628000`.

#### Nokta-noktasına denetim (brief 1–7) — tur 27 durumu

| # | Alan | Ölçüm | Durum |
|---|---|---|---|
| 1 | DNS | apex+`www` CF anycast (`104.21.29.3`,`172.67.171.53`), proxied; `www`→**308** apex; NS `lex`/`serenity`; SPF/DKIM/DMARC/CAA/DNSSEC sabit | ✔ |
| 2 | SSL/TLS | Let's Encrypt (CAA uyumlu), TLS 1.2+1.3, `http`→**301**, HSTS+`includeSubDomains`+`preload`; preload **`pending`**; **H-01r** (12 ay tavanı) | ⚠️ H-01r |
| 3 | Cache | statik `immutable`; dinamik `private, no-store`; **H-02** açık; `%2F` yolları cache'lenmiyor | ⚠️ H-02 |
| 4 | WAF | saldırı yolları **403** (16 varyant matris); meşru **16/16 yanlış pozitif yok** (15×200; `/profile/dashboard` 307 `/login` beklenen); **N-11r** (`/`-literalli kurallar `%2F` ile atlanıyor); `wp-admin` bloklu | ⚠️ N-11r |
| 5 | Bot | arama botları 200, `cf-mitigated` yok; GH-runner challenge bilinçli trade-off | ✔ |
| 6 | Rate limit | tek Free kuralı leak-check'te; auth brute-force tahsisi onay bekliyor (F-26 kapalı) | ℹ️ |
| 7 | Analytics/logpush | `CF_API_TOKEN` yok → zone API okunamadı; gereken scope: `zone.analytics.read` | ⚠️ token |

#### Bakılmayan (dürüst işaretleme)

- **CF zone API** (`CF_API_TOKEN` yok): WAF ruleset **ifadesi** panelden okunamadı →
  N-11r'in mevcut kural metniyle birebir eşleştiği doğrulanamaz (yalnız davranış
  ölçüldü).
- **IPv6 yolu:** sandbox'ta v6 yok (yalnız DoH AAAA).
- **Gerçek tarayıcı:** HSTS geçiş penceresi sürülmedi.
- **`Authentication-Results`:** #170 için hâlâ ölçülemedi (posta teslimi).
- **Google/Bing/Yandex endeksi:** arama API'si yok → `site:` sayıları ölçülemedi
  (LANE-SEO).

#### Drift (tur 27)

**Yeni:** N-11r (mekanizma + kural-bazlı asimetri), N-16 (`/`-literalli kurallar sınıfı).
**Düzeltildi:** tur 26 N-11'in "üç kategori de" iddiası → "literalinde `/` olan
kurallar"; N-13 tazelendi.
**Kapalı kayıt:** #163 CF halkası (temiz), sertifika/DNSSEC/CAA (temiz), HSTS
preload `pending`.
**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01.
**Devir:** N-15 → #437 (açık); N-13 → `src/app/api/**`.

#### Sahibin (CF paneli) yapması gerekenler (tur 27 güncel)

1. **N-11r (orta):** `/`-içeren tüm WAF kurallarını `url_decode(http.request.uri.path)`
   üzerinden kur (`contains`/`in`/`lower`; `matches` Free'de yok). **Yıkıcı → onay.**
2. **H-01r:** HSTS 2 yıla hizalanamaz (1–12 ay). Preload **`pending`** olduğundan
   "CF HSTS'i kapat" başvuruyu riske atar → origin'i 12 aya indir **veya** bırak.
3. **H-02:** Browser Cache TTL = `Respect Existing Headers`.
4. **R-01:** trailing-dot apex → 301/308.
5. **G-01:** Email Obfuscation OFF.
6. **F-08:** Vercel Deployment Protection.
7. **#227:** Resend DKIM 2048-bit.

---

## Tur 29 (2026-11-10) — canlı kesinti ölçümü + WAF negatif matrisi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: O-01 (Vercel origin 402 `DEPLOYMENT_DISABLED` — LANE-INFRA
            acil) · N-11r · H-01r · H-02 · R-01 · G-01 · F-08 · #227
```

### O-01 (kritik — canlı kesinti, LANE-INFRA) — origin her istekte `402 DEPLOYMENT_DISABLED`

Bu turda ölçüm yapılırken **canlı site tamamen düştü**. `isbulkktc.com` üzerinden
yapılan **her** istek — ana sayfa, `/jobs`, statik varlıklar, `/api/*` dahil —
**402** döndü. Gövde `Payment required` + `DEPLOYMENT_DISABLED`; başlık
`x-vercel-error: DEPLOYMENT_DISABLED`. Kesinti **CF'de değil origin'de**: aynı
yanıtı CF'yi atlayan `isbulkktc-amber.vercel.app` alias'ı **doğrudan** (`server:
Vercel`) veriyor.

Kanıt (canlı `curl`, 2026-11-10 ~02:04 UTC):

| İstek | Sonuç |
|---|---|
| `https://isbulkktc.com/` (5×) | `402` ×5, `server: cloudflare`, `cf-cache-status: DYNAMIC` |
| `https://isbulkktc.com/jobs` | `402` `x-vercel-error: DEPLOYMENT_DISABLED` |
| `https://isbulkktc.com/robots.txt` · `/sitemap.xml` · `/sw.js` · `/images/*` | `402` |
| `https://isbulkktc.com/api/build-info` | `402` |
| `https://isbulkktc-amber.vercel.app/` (alias, CF bypass) | `402`, `server: Vercel` |

`x-vercel-error: DEPLOYMENT_DISABLED` Vercel'in **hesap/dondurulmuş dağıtım**
yoludur (plan/ödeme/faturalandırma kaynaklı); `server: Vercel` yanıtın CF'yi
atlayan origin'den geldiğini doğrular. **Bu CF tarafında bir arıza değildir** ve
bu lane'in düzeltebileceği bir şey değildir. **Sahip: LANE-INFRA** (Vercel
hesabı/plan durumu). CF katmanı doğru çalışıyor: WAF, TLS ve cache kuralları 402
yanıtında bile uygulanıyor.

### N-17 (bilgi) — WAF negatif/pozitif matrisi 402 altında da korunuyor

Origin 402 verirken WAF kural seti **değişmedi**: 10 saldırı yolu **403**, meşru
rotalar **403 vermiyor** (origin 402). Yani kesinti sırasında bile WAF bypass'ı yok.

| Sınıf | Yol | Kod |
|---|---|---|
| VCS | `/.git/config`, `/.svn/entries` | 403 |
| dotfile/secret | `/.env`, `/.aws/credentials` | 403 |
| CMS | `/wp-admin`, `/wp-login.php`, `/phpmyadmin`, `/xmlrpc.php` | 403 |
| api/devtools | `/api/devtools/` | 403 |
| tedarik zinciri | `/vendor/phpunit/phpunit` | 403 |
| meşru (17) | `/`, `/jobs`, `/companies`, `/blog`, `/contact`, `/freelance`, `/about`, `/privacy`, `/terms`, `/sss`, `/rehber`, `/packages`, `/login`, `/api/build-info`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` | 402 (WAF değil) |

### D-21 (doküman doğruluğu — çürüyen canlı kanıt)

Bu turdaki bulgular origin'in **çalışır** olduğunu varsayan tüm eski canlı
kanıtları geçersiz kılar. Origin tekrar 200 dönene kadar:

- `docs/cloudflare.md`'deki "canlı build `<sha>`", "dinamik HTML `private,
  no-store`", "`/robots.txt` edge `2628000`" gibi satırlar **o günün** ölçümüdür;
  bugünkü durumu yansıtmaz.
- 402 `DEPLOYMENT_DISABLED` yanıtı `cache-control: public, max-age=0,
  must-revalidate` **taşır** — yani yukarıdaki 402 satırlarında görülen cache
  başlıkları **Vercel'in 402 sayfasına** aittir, uygulamanın değil. **H-02
  bulgusu bu yanıttan doğrulanamaz/çürütülemez.**
- Origin döndüğünde (O-01 kapandığında) H-02, SR-01 ve cache matrisi **yeniden
  ölçülmelidir**; bu turda yalnız WAF matrisi ve kesintinin **CF'de olmadığı**
  sonucu geçerlidir.

**Devir:** O-01 → `lane:infra` (+ gerekirse insan; Vercel hesap durumu).

**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01.
**Yeni:** O-01 (kesinti, LANE-INFRA), N-17 (bilgi), D-21 (kanıt çürümesi).

### Tazelenen (canlı, origin düşükken de ölçülebilen)

Origin 402 verirken **CF/TLS/DNS katmanı** ölçüldü — hepsi tur 25–28 ile tutarlı:

| Nokta | Ölçüm (2026-11-10) | Durum |
|---|---|---|
| Apex A / AAAA | `104.21.29.3`, `172.67.171.53` / `2606:4700:3034::ac43:ab35`, `…3036::6815:1d03` | CF proxied — OK |
| `www` | ayrı CNAME yok, apex ile aynı CF IP'leri | OK |
| MX | `route{1,2,3}.mx.cloudflare.net` | OK |
| Kök SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` | OK |
| `send.` SPF | `v=spf1 include:amazonses.com ~all` | OK |
| DKIM `cf2024-1` | 2048-bit | OK |
| DKIM `resend` | **1024-bit** | **#227 açık** |
| DMARC | `p=none; rua=…; fo=1` | #170 açık (quarantine önerisi) |
| MTA-STS / TLS-RPT | kayıt **yok** | bilgi (opsiyonel) |
| TLS min | 1.2 (`tls1`/`tls1_1` → *no protocols*) | OK |
| Edge HSTS | `max-age=31536000` (origin config `63072000`) | **H-01r açık** |

`resend._domainkey` **1024-bit** teyit edildi (`openssl rsa -pubin` → `Public-Key:
(1024 bit)`), `cf2024-1` 2048. TLS 1.2 altı reddediliyor.

## Tur 30 (2026-11-10) — DNS sertleştirme taraması + O-01 yeniden ölçümü + issue kaydı

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: #520
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: O-01 (#518, LANE-INFRA, acil) · N-11r · H-01r ·
            H-02 · R-01 · G-01 · F-08 · #227
Sonraki lane için notlar: (1) Origin 402 verirken yalnız CF/TLS/DNS + WAF matrisi
            ölçülebilir; cache/başlık bulguları (H-02, SR-01) O-01 kapanana kadar
            D-21 gereği "çürük" sayılır. (2) `D-22` artık `O-` önekini kimlik
            şemasına kaydetti — yeni bulgudan önce aralığı `grep` ile doğrula.
```

### F-30 (bilgi — temiz) — apex/alt alan DNS sertleştirmesi

Apex ve yaygın alt alanlar tarandı; **grey-cloud (doğrudan origin) sızıntısı yok**:

| Kontrol | Ölçüm (DoH, 2026-11-10) | Sonuç |
|---|---|---|
| Wildcard `*.isbulkktc.com` | kayıt **yok** | ✔ sızıntı yok |
| 28 yaygın alt alan (`dev`, `staging`, `api`, `admin`, `origin`, `git`, `ci`, …) | hepsi **NXDOMAIN** | ✔ yalnız `send`/`rsend`/`www` yayında |
| `www` | ayrı CNAME **yok**, apex ile aynı CF IP'leri | ✔ (F-03 ile tutarlı) |
| `rsend` CNAME | `send.forge.rmta.net.` (dangling değil) | ✔ (tur 25 teyidi) |
| Apex NS / DS | `lex`+`serenity.ns.cloudflare.com`; DS `2371 13 2 36e0…775b` | ✔ DNSSEC açık (F-13) |
| `_mta-sts` / `_smtp._tls` / `_bimi` | kayıt **yok** | bilgi (opsiyonel, aşağıda) |

**Öneri (onay bekliyor, düşük öncelik):** MTA-STS (`_mta-sts` TXT + `mta-sts.`
policy host) ve TLS-RPT (`_smtp._tls` TXT) eklemek inbound TLS zorlamasını
güçlendirir; DMARC `p=quarantine` rollout'uyla aynı fazda yapılabilir. Bu lane
yazmaz — sahibin onayı gerekir.

### O-01r (yeniden ölçüm) — origin hâlâ 402; CF katmanı 402 altında da sağlam

Tur 29'daki kesinti **sürüyor** (2026-11-10 ~02:0x UTC):

| İstek | Sonuç |
|---|---|
| `https://isbulkktc.com/` (ardışık 2×) | `402`, `cf-cache-status: DYNAMIC` (cache'lenmiyor) |
| `https://isbulkktc-amber.vercel.app/` (CF bypass) | `402`, `server: Vercel` |
| `PUT`/`DELETE`/`PATCH` `/` | `402` (origin); `TRACE` → `405` (F-21 ile tutarlı) |
| WAF: `/.git/config`, `/.env`, `/wp-admin`, `/phpmyadmin`, `/api/devtools/` | `403` |
| `/cdn-cgi/trace` | `colo=ORD`, `tls=TLSv1.3`, `sni=plaintext`, `warp=off` |

- 402 gövdesinin `cache-control: public, max-age=0, must-revalidate`'i **Vercel'in
  402 sayfasına** aittir; `cf-cache-status: DYNAMIC` olduğu için edge'e
  **yazılmıyor** → **cache-poisoning / zehirli-hata yüzeyi yok** (N-01 sınıfından
  farklı: orada `404` `public, max-age=31536000` ile cache'leniyordu).
- Kesinti **CF'de değil**; WAF/TLS/cache/rate-limit katmanı doğru çalışıyor.

### D-23 (doküman doğruluğu) — O-01 artık izlenebilir issue

Tur 29'un `O-01` bulgusu **#518** olarak açıldı
(`lane:infra`, `agent:handoff`); **#319**'dan (build rate limit — geçici) **ayrı
kök neden** (hesap/plan, `Payment required`). #319'a da bu ağırlaşma yorumlandı.
Bu kayıt, `O-01`'in sahipsiz kalmadığını belgeler.

### D-24 (doküman doğruluğu) — tur 30 blok başlığı "Değişen dosyalar" eksikti

Tur 30 kaydı `docs/cloudflare.md`'ye eklenirken blok başlığı yalnız
`docs/cloudflare.md`'yi "Değişen dosyalar" olarak listeledi; oysa tur 30 lane
brief'i (`docs/lanes/02-cloudflare.md`) de değiştirdi. Başlık iki dosyayı ve
`PR: #520`'yi gösterecek şekilde düzeltildi — rapor bloğu ile gerçek diff
arasındaki tutarsızlık giderildi.

**Devir:** O-01 → **#518** (açık).
**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01.
**Yeni:** F-30 (temiz), O-01r (yeniden ölçüm), D-22 (O- öneki), D-23 (#518 kaydı),
D-24 (tur 30 blok başlığı düzeltmesi).

## Tur 31 (2026-11-10) — WAF kaçış matrisi: `/.git` eğiksiz + ayraç kaçışı + eksik dotfile kümesi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: N-18 (WAF `/.git` kuralı eğiksiz ve ayraçlı biçimde atlanıyor —
            onay) · N-19 (eksik dotfile kümesi — onay) · N-11r · H-01r · H-02 · R-01 ·
            G-01 · F-08 · #227 · O-01 (#518, LANE-INFRA, acil)
Sonraki lane için notlar: (1) `curl --path-as-is` kullan; onsuz curl yolu normalleştirir ve
            kaçışı maskeler. (2) Origin 402 verirken ayırt edici: **403 = WAF yakaladı**,
            **402 = origin'e ulaştı** (`x-vercel-error: DEPLOYMENT_DISABLED`). (3) Kural
            literali `/.git/` ise `/.git` (eğiksiz) VE `/.git;/x`, `/.git%09/config` atlanır —
            kaçışı "yalnız `%2F`" sanma, ayraç matrisini ölç. (4) `%2F` tek kaçış değil;
            `;` `,` `%09` de aynı etkiyi verir. (5) Yeni bulgu kimliği: `N-18`/`N-19`.
```

### N-18 (orta) — WAF nokta-yolu kuralı `/.git/` **literaline** bağlı; eğiksiz ve ayraçlı biçimler atlanıyor

**Mekanizma.** CF özel WAF kuralı `/.git/` **literal dizesini** arıyor (tur 27'nin
`/`-literalli kural sınıfı). Bu dizenin **tam** olarak bulunmadığı her biçim
kuralı atlar ve origin'e ulaşır — kaçış yalnız `%2F` ile sınırlı **değil**:

| Biçim | Yol | Kod | WAF |
|---|---|---|---|
| eğikli (temel) | `/.git/config` | **403** | yakalar |
| **eğiksiz** | `/.git` | **402** | **atlar** |
| ayraç `;` | `/.git;/x` | **402** | **atlar** |
| ayraç `,` | `/.git,/x` | **402** | **atlar** |
| kodlu TAB `%09` | `/.git%09/config` | **402** | **atlar** |
| kodlu `/` `%2F` | `/.git%2Fconfig` | **402** | **atlar** (tur 27, N-11) |
| **sonda nokta** | `/.git./config` | **402** | **atlar** |
| kodlu nokta `%2E` | `/.git%2e/config` | **402** | **atlar** |
| çift nokta segment | `/.git%2e%2e/config` | **402** | **atlar** |
| kodlu `\` `%5C` | `/.git%5cconfig` | **402** | **atlar** |
| `+` ayraç | `/.git+config` | **402** | **atlar** |
| kodlu boşluk `%20` | `/.git%20/config` | **402** | **atlar** |
| sınıf dışı | `/.gitx/config` | **402** | atlar (kural yok — beklenen) |
| segment içi | `/x/.git/config` | **403** | yakalar |
| nokta-segment | `/.git/./config` · `/.git/../.git/config` | **403** | yakalar (CF normalize) |
| yanlış ayraç | `/.git%00/config` | **400** | origin (NUL reddi) |

Aynı sınıf `/api/devtools`'ta da doğrulandı: `/api/devtools;/x`,
`/api/devtools%09/x`, `/api/devtools%2Fx` → **402**; `/api/devtools/` → **403**.
Kök neden **tek**: kural `contains "/.git/"` (sondaki eğik çizgi dahil) biçiminde
kurulduğu için `.git` ile `/` arasına giren **herhangi** bir karakter (veya hiç `/`
olmaması) eşleşmeyi kırıyor. Kaçış kümesi **tek karakter sınıfı değil**: ayraçlar
(`;` `,` `+`), kodlanmış ayraçlar (`%09` `%20` `%2F` `%5C`), kodlanmış nokta
(`%2E`) ve segment sonuna eklenen nokta (`.`) aynı sonucu verir — çünkü hepsi
literal `/.git/` dizesini bozar. Karşı örnek: dotfile kuralı (`/.env`) prefix/`contains`
tabanlı olduğundan ayraçtan etkilenmez — `/.env;/x`, `/.env%09/x`, `/.env./x`,
`/.env.bak` → **403**; CMS kuralı (`/wp-admin`, literalinde `/` yok) da
`/wp-admin;/x`, `/wp-admin%09/x`, `/wp-admin%2Fx`, `/wp-admin./x` → **403**.
Yani asimetri **kuralın literalinde `/` olup olmamasına** bağlı (tur 27'nin
`/`-literalli sınıfı), karakter sınıfına değil.

**Etki.** WAF'ın `.git` sızıntısına karşı koruması **yanılsama**: kural yalnız tam
`/.git/` yolunda çalışıyor. Bugün sömürülebilir değil (origin her istekte 402 —
O-01; Vercel varsayılan olarak `.git`'i servis etmez). O-01 kapandığında da
**build çıktısına `.git`/`.npmrc` girmediği sürece** içerik sızmaz — ancak
savunma-derinliği katmanı bu yollarda **fiilen yok**, ki bu katmanın tek işi bu.

**Düzeltme (öneri, onay bekliyor — yıkıcı WAF değişikliği).** İfadeyi eğik çizgi
**olmadan** ve **çözülmüş yol** üzerinden kur (Free plan `matches`'i reddeder;
`contains`/`lower`/`url_decode` kullan):

```
(lower(url_decode(http.request.uri.path)) contains "/.git") or
(lower(url_decode(http.request.uri.path)) contains "/api/devtools")
```

`url_decode` `%2F`/`%09`'u çözer; `;`/`,` kodlanmamış olduğundan **yine de**
literal dizede kalır ve sondaki eğik çizgi kaldırıldığı için `/.git;/x` de
yakalanır. Not: bu, `/.gitignore` gibi zararsız yolları da bloklar (kabul
edilebilir) — gerekirse segment sınırı eklenir.

### N-19 (orta) — WAF dotfile kümesi **eksik**: `.npmrc`, `.git-credentials`, `.netrc`, `.pypirc` … bloklu değil

Dotfile kuralı **kuralın kendisi yok** olduğu için değil, **liste eksik** olduğu
için boşluk bırakıyor. Taranan 18 dotfile'ın yarısı bloklu değil:

| Bloklu (403) | Bloklu **değil** (402 → origin) |
|---|---|
| `/.env`, `/.htpasswd` | `/.npmrc` |
| `/.aws/config` | `/.git-credentials` |
| `/.ssh/known_hosts` | `/.netrc` |
| `/.vscode/settings.json` | `/.pypirc` |
| | `/.bash_history` |
| | `/.kube/config` |
| | `/.gem/credentials` |
| | `/.docker/config.json` |
| | `/.gitignore`, `/.gitattributes`, `/.travis.yml` |

Bunlar **her ekosistemin kanonik sır dosyasıdır** (npm registry token'ı, git
kimlik bilgisi, netrc, PyPI token'ı, kube kubeconfig, gem credentials, Docker
registry auth). Bloklu olanlar (`/.env`, `/.aws/…`, `/.ssh/…`) daha yaygın
hedefler olduğu için kuralın **o kadarıyla** yetindiği anlaşılıyor.

**Etki.** N-18 ile aynı sınıf (savunma-derinliği boşluğu, canlı sızıntı yok — 402
+ repo'da bu dosyalar yok). Ancak liste eksikliği bir "yapılandırma hatası" değil,
**kapsam kararı**; kapatılması için ek `contains` girdileri gerekir.

**Düzeltme (öneri, onay bekliyor).** Dotfile kuralına şu literalleri ekle (tek
`or` zinciri): `/.npmrc`, `/.netrc`, `/.pypirc`, `/.git-credentials`,
`/.kube/config`, `/.gem/credentials`, `/.docker/config.json`, `/.bash_history`.

### D-25 (doküman doğruluğu) — tur 29'un "kesinti sırasında bile WAF bypass'ı yok" (N-17) iddiası fazla genişti

N-17 (tur 29) yalnız **eğikli** yolları denedi (`/.git/config`, `/.svn/entries`,
`/.env`, `/.aws/credentials`, `/wp-admin`, `/wp-login.php`, `/phpmyadmin`,
`/xmlrpc.php`, `/api/devtools/`) ve hepsi 403 döndü → "WAF bypass'ı yok" yazıldı.
Bu tur, **eğiksiz ve ayraçlı** biçimlerin (N-18) ve **kural dışı dotfile'ların**
(N-19) atlandığını gösterdi. N-17'nin matrisi **doğruydu ama kapsamı dardı**;
iddiası "denenen eğikli biçimlerde bypass yok" olarak daraltılmalı.

### O-01r2 (yeniden ölçüm) — origin hâlâ 402; CF katmanı sağlam

Bu turun tüm ölçümleri **402 kesintisi altında** alındı (O-01 sürüyor). 403/402
ayrımı bu koşulda **daha** net: 403 yalnız CF'ten gelir, 402 yalnız origin'den.
Tur 30'un bulguları (F-30 temiz, WAF/TLS/DNS sağlam) değişmedi.

**Devir:** N-18, N-19 → CF paneli (sahibin onayı) — bu lane yazmaz. O-01 → **#518** (açık).
**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01.
**Yeni:** N-18 (eğiksiz/ayraçlı `.git` kaçışı), N-19 (eksik dotfile kümesi),
D-25 (N-17 kapsam daraltması), O-01r2 (yeniden ölçüm).

## Tur 32 (2026-11-10) — metod kuralı kapsamı (TRACE=origin) + secret/dotfile WAF kapsaması

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: N-20 (metod kuralına TRACE ekle — onay) · N-21 (secret/dotfile
            kural setini genişlet — onay) · N-18 · N-19 · N-11r · H-01r · H-02 · R-01 ·
            G-01 · F-08 · #227 · O-01 (#518, LANE-INFRA, acil)
Sonraki lane için notlar: (1) Vercel **alias** (`isbulkktc-amber.vercel.app`) artık **her
            yola 403 "Vercel Security Checkpoint"** döner (bot challenge, `server: Vercel`) →
            origin'de "bloklu mu, serbest mi" testi için kullanılamaz; ayırt edici `.com`
            üzerinde **403 = CF bloğu** ("Attention Required! | Cloudflare") / **402 =
            origin'e ulaştı** (`x-vercel-error: DEPLOYMENT_DISABLED`). (2) `405` dönen
            metod yanıtı WAF değil **origin** olabilir: TRACE'te `cf-ray: -` (tire) ve
            gövdede `cloudflare` imzası origin'in 405'ini gösterir; WAF bloğu ise `cf-ray`
            **dolu** + "Attention Required!" gövdesi verir. (3) Metod matrisini ölçerken
            yalnız TRACK'e değil TRACE/OPTIONS'a da bak. (4) Yeni kimlik: `N-20`, `N-21`.
```

### N-20 (orta) — WAF "Metod allowlist" kuralı `TRACE`'i yakalamıyor; 405 **origin**'den geliyor

**Mekanizma.** Tur 7'de `F-21` (satır 97) "`TRACE` → **405**, `TRACK` → **403** | OK"
olarak kaydedildi; bu, iki sonucun da WAF davranışı olduğu izlenimi veriyor. Canlı
ölçüm bunu **çürütüyor** — `TRACE`'in 405'i origin'den geliyor, WAF değil:

| İstek | Kod | `cf-ray` | Gövde imzası | Katman |
|---|---|---|---|---|
| `TRACE https://isbulkktc.com/` | **405** | **`-`** (tire) | `<center>405 Not Allowed</center> … <center>cloudflare</center>` (155 B) | **origin** (Vercel) |
| `TRACE https://isbulkktc-amber.vercel.app/` (CF atlanır) | **405** | — | `Method not allowed` / `NOT_ALLOWED` (`server: Vercel`) | origin |
| `TRACK https://isbulkktc.com/` | **403** | `a582b57bd92baa0b-ORD` | `Attention Required! \| Cloudflare` | **WAF** |
| `OPTIONS https://isbulkktc.com/` | **402** | dolu | `x-vercel-error: DEPLOYMENT_DISABLED` | **WAF atladı** |

Yani metod kuralı `TRACK`'i (ve dokümana göre `CONNECT`) bloklar ama **`TRACE`'i
bloklamaz**; `TRACE` origin'e ulaşır ve orada 405 alır. `OPTIONS`'un 402 dönmesi de
kuralın "allowlist" değil **blocklist** olduğunu kanıtlar (yalnız TRACK/CONNECT
dışlanıyor). Tur 26'da `%2F` için yapılan "eğik çizgiyi değil, kuralı suçla" dersinin
aynısı: burada **eğik çizgi değil, eksik metod** suçlu.

**Etki.** WAF'ın `TRACE` koruması **yanılsama**: edge, TRACE'i geçiriyor; engelleme
origin'e (Vercel) devredilmiş. Bu (a) savunma-derinliğini origin'e bağımlı kılar,
(b) origin değişir/gevşerse TRACE açığa çıkar (klasik XST / Cross-Site Tracing
vektörü), (c) `F-21`'in "OK" kaydı katmanı yanlış atfediyor. Origin şu an doğru
davrandığı için bugün sömürülebilir değil.

**Düzeltme (öneri, onay bekliyor — yıkıcı WAF değişikliği).** Metod kuralını
`http.request.method` üzerinden `TRACE`'i de kapsayacak biçimde genişlet:

```
(http.request.method in {"TRACE" "TRACK" "CONNECT"})
```

veya mevcut "VCS/dotfile/secret yolları" kuralı gibi tek bir `in` listesinde topla.
Doğrulama: `curl -X TRACE -D - https://isbulkktc.com/` → `cf-ray` **dolu** ve gövde
"Attention Required!" olmalı (bugün `cf-ray: -` + origin 405).

- **D-26:** `F-21` (satır 97) "TRACE→405, TRACK→403 | OK" satırı katman atfını
  belirsiz bırakıyordu; TRACE 405'i **origin**, TRACK 403'ü **WAF** olarak netleştirildi.

### N-21 (orta) — Gizli-dosya/secret WAF kapsaması hem **eksik** hem **simetrik değil**; ~30 hassas yol bloklanmıyor

**Mekanizma.** Dotfile/secret kuralı belirli adlara bağlı ve **seçici**: kardeş
uzantıları, `dotfile-olmayan` secret dosyalarını ve birden çok VCS/konteyner sınıfını
kapsamıyor. Ölçüm: `.com` üzerinde **403 = WAF bloğu** ("Attention Required!"),
**402 = origin'e ulaştı** (`x-vercel-error: DEPLOYMENT_DISABLED`). `curl --path-as-is`.

**Bloklu (403) — kuralın yakaladığı adlar:**

| Yol | Yol | Yol |
|---|---|---|
| `/.env` (ve `/.env.local`, `.production`, `.backup`, `.old`, `.example`) | `/.env/` | `/.git/config`, `/.git/HEAD`, `/.git/index`, `/.git/logs/HEAD` |
| `/.aws/credentials`, `/.aws/config` | `/.ssh/id_rsa`, `/.ssh/id_ed25519`, `/.ssh/known_hosts` | `/.svn/entries`, `/.svn/wc.db`, `/.hg/hgrc` |
| `/.htpasswd` | `/.DS_Store` | `/wp-admin`, `/phpmyadmin`, `/xmlrpc.php` |
| `/web.config` | `/backup.sql`, `/dump.sql`, `/db.sql`, `/database.sql` | `/composer.json` |

**Bloklanmayan (402) — WAF atlıyor, origin'e ulaşıyor:**

| Sınıf | Örnek yollar (hepsi 402) |
|---|---|
| `.env` **kardeşleri** | `/env` |
| diğer VCS | `/.bzr/branch-format`, `/CVS/Entries` |
| git **yardımcı** dosyaları | `/.gitignore`, `/.gitattributes`, `/.gitmodules`, `/.git-credentials` |
| konteyner/orchestrator | `/Dockerfile`, `/docker-compose.yml`, `/docker-compose.yaml`, `/.dockerenv` |
| secret/credential | `/.npmrc`, `/.netrc`, `/.pypirc`, `/.gem/credentials`, `/.kube/config`, `/.docker/config.json`, `/.pgpass`, `/id_rsa` |
| kabuk/SQL geçmişi | `/.bash_history`, `/.zsh_history`, `/.mysql_history` |
| IaC state | `/terraform.tfstate`, `/.terraform.tfstate` |
| yapılandırma | `/config.json`, `/secrets.json`, `/credentials.json`, `/appsettings.json`, `/config.yml` |
| kilit/artefakt | `/package-lock.json`, `/yarn.lock`, `/composer.lock`, `/Thumbs.db` |

**Simetri kanıtı.** `/.env` → **403** ama `/.env.local` → **403** (aynı taban ad →
prefix eşleşiyor), buna karşın `/env` → **402**; `/.git/config` → **403** ama
`/.gitignore`/`/.git-credentials` → **402** (kural tam `.git/` segmentine bağlı,
`.git*` değil — bu N-18'in kural-mekanizmasıyla aynı kök). Yani bloklama **kural
listesine**, genel bir gizli-dosya sınıfına değil.

**Etki.** Bugün sömürülebilir değil: O-01 (origin 402) ve Vercel'in varsayılan
servis etmemesi içerik sızdırmıyor. Ancak WAF'ın bu yollar için sağladığı
savunma-derinliği **fiilen yok**; O-01 kapandığında `.git`/`.npmrc`/state dosyası
build çıktısına düşerse edge bloklamayacak.

**Düzeltme (öneri, onay bekliyor — yıkıcı WAF değişikliği).** Ad-listesi yerine
**sınıf** kuralı; `url_decode` + `lower` ile (Free plan `matches`'i reddeder):

```
(lower(url_decode(http.request.uri.path)) contains "/.git")
or (lower(url_decode(http.request.uri.path)) contains "/.svn")
or (lower(url_decode(http.request.uri.path)) contains "/.hg")
or (lower(url_decode(http.request.uri.path)) contains "/.bzr")
or (lower(url_decode(http.request.uri.path)) contains "/cvs/")
or (lower(url_decode(http.request.uri.path)) contains "/.env")
or (lower(url_decode(http.request.uri.path)) contains "/.npmrc")
or (lower(url_decode(http.request.uri.path)) contains "/.netrc")
or (lower(url_decode(http.request.uri.path)) contains "/.pgpass")
or (lower(url_decode(http.request.uri.path)) contains "/id_rsa")
or (lower(url_decode(http.request.uri.path)) contains "tfstate")
or (lower(url_decode(http.request.uri.path)) contains "/.aws/")
or (lower(url_decode(http.request.uri.path)) contains "/.ssh/")
or (lower(url_decode(http.request.uri.path)) contains "/.kube/")
or (lower(url_decode(http.request.uri.path)) contains "/.docker/")
or (lower(url_decode(http.request.uri.path)) contains "/.gem/")
```

Not: `/.gitignore`, `/.gitattributes` gerçek build çıktısında **istenen** dosyalardır
(Next.js bunları servis etmez ama WAF'ın bloklaması zararsız); kural bunları da
kapsamalı ki sınıf tutarlı olsun.

### D-27 — Vercel alias artık bot-challenge döndürüyor; origin testi için kullanılamaz

Tur 29/31 notları "alias CF'yi atlar, origin'i doğrudan ölç" diyordu. Bu turda
`isbulkktc-amber.vercel.app` **her** yola (kök dahil, `/robots.txt`, hatta
`/nonexistent-xyz-123`) **403 "Vercel Security Checkpoint"** döndürüyor
(`server: Vercel`, `retry-after: 30`, `data-astro-cid` gövdesi) → Vercel bot
challenge'ı. Dolayısıyla alias, "origin bu yolu bloklar mı" testi için **artık
geçersiz**; ayırt edici, `.com` üzerindeki **403 (CF bloğu, "Attention Required!")
/ 402 (origin'e ulaştı, `x-vercel-error: DEPLOYMENT_DISABLED`)** ayrımıdır.

**Devir:** N-20, N-21 → CF paneli (sahibin onayı) — bu lane yazmaz. O-01 → **#518**.
**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01, N-18, N-19.
**Yeni:** N-20 (metod kuralı TRACE'i kapsamıyor), N-21 (secret/dotfile kapsaması eksik),
D-26 (F-21 katman atfı), D-27 (alias challenge).

## Tur 33 (2026-11-10) — WAF bot kuralı `sqlmap/` literaline sabitli (N-22) + origin durum değişimi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: N-22 (bot UA kuralını `lower()` + sürüm-bağımsız sınıfa çevir —
            onay) · N-21 · N-20 · N-18 · N-19 · N-11r · H-01r · H-02 · R-01 · G-01 · F-08 ·
            #227 · O-01 (#518, LANE-INFRA, acil)
Sonraki lane için notlar: (1) Bot UA testini **tek biçimle** yapma — `sqlmap/1.7` 403 ama
            çıplak `sqlmap` 404 (atlıyor); matrisi kur. (2) Origin düşüş rejimi değişti:
            **403 = WAF bloğu** (Attention Required! / `error code: 1010`), **404 =
            origin'e ulaştı** (`x-vercel-error: DEPLOYMENT_NOT_FOUND`), **400 = NUL reddi**.
            (3) `sqlmap` UA bloğunun gövdesi **`error code: 1010`** (CF UA-block imzası),
            yol kuralınınki "Attention Required!" HTML — ikisi farklı katman/signature.
            (4) Yeni kimlik: `N-22`, `D-28`, `N-17r`, `O-01r3`.
```

### N-22 (orta) — WAF bot-UA kuralı `sqlmap/` **literaline** sabitli; çıplak `sqlmap` ve diğer tüm scanner'lar atlıyor

**Mekanizma.** Doküman boyunca `sqlmap` UA'sı **403** (bot koruması) olarak kaydedildi
(F-25 satır 101, C-04 satır 167, T-19, U-12, V-03, satır 2572). Bu tur, kaydın yalnız
**`sqlmap/1.7`** biçimini ölçtüğünü gösterdi: kural bir **`sqlmap/` literal ön-ek**
eşleşmesi, `sqlmap` (sürüm/`/` olmadan) eşleşmiyor ve **origin'e ulaşıyor**.

| UA | Kod | Katman |
|---|---|---|
| `sqlmap/1.7` · `sqlmap/1.8` · `sqlmap/2.0` · `sqlmap/1` · `sqlmap/1.7x` · `sqlmap/1.7.2#stable` · `sqlmap/` | **403** | **WAF** (`error code: 1010`) |
| `sqlmap` (çıplak) | **404** | **origin** (atlıyor) |
| `SQLMap/1.7` · `Sqlmap/1.7` · `SQLMAP/1.7` · `sQlMaP/1.7` | **404** | **origin** (büyük/küçük harf **duyarlı**) |
| `Mozilla/5.0 sqlmap/1.7` · `foo/sqlmap/1.7` · `/sqlmap/1.7` | **404** | **origin** (önek değil — tam dize eşleşmesi) |
| `sqlmap 1.7` | **404** | origin (`/` yok) |
| `nikto/2.5` · `nmap/7.94` · `WPScan/3.8` · `masscan/1.3` · `zgrab/0.x` · `acunetix/1.0` · `Nuclei/2.9` · `gobuster/3.5` · `feroxbuster/2.10` · `ffuf/2.1` · `httpx/1.3` · `jaeles/0.1` · `commix/3.0` · `wfuzz/3.1` · `dotdotpwn` · `DirBuster-1.0` | **404** | **origin** (imza yok) |

**Eşleşme semantiği (ölçülmüş):** UA dizesinin **başında** (veya tamamı) **küçük-harf
`sqlmap/`** olmalı. Büyük/küçük harf farkı (→404), `/` eksikliği (→404), ön-ek fazlalığı
(`Mozilla/5.0 sqlmap/1.7` → 404) hepsi bloklamayı kırıyor; sürüm numarası ve sonrası
serbest (`sqlmap/1.7x`, `sqlmap/1.7.2#stable` → 403). Bu, `contains "sqlmap/1.7"` değil
**`lower()` olmadan `starts_with "sqlmap/"`** (veya `equals`) bir eşleşmedir.

**Etki.** WAF'ın bot-UA koruması **tek bir dizeye** ve **tek bir yazıma** bağlı:
saldırgan `-A sqlmap` yazdığı anda edge geçilir; `nikto`, `nmap`, `Nuclei`, `ffuf` gibi
**kanonik tarayıcı UA'ları hiç bloklanmaz**. Bugün içerik sızmıyor (O-01: origin 404;
yol-WAF kuralları `/.env`/`/wp-admin`'i yine 403'ler) ama bot imzasına dayanan katman
**fiilen tek-kullanımlık** — "User-Agent bazlı koruma" yanılsaması.

**Düzeltme (öneri, onay bekliyor — yıkıcı WAF değişikliği).** Kuralı harf-duyarsız ve
**sınıf** tabanlı kur (Free plan `matches`'i reddeder; `lower()` + `contains` kullan):

```
(lower(http.user_agent) contains "sqlmap")
or (lower(http.user_agent) contains "nikto")
or (lower(http.user_agent) contains "nmap")
or (lower(http.user_agent) contains "nuclei")
or (lower(http.user_agent) contains "wpscan")
or (lower(http.user_agent) contains "masscan")
or (lower(http.user_agent) contains "acunetix")
or (lower(http.user_agent) contains "gobuster")
or (lower(http.user_agent) contains "ffuf")
or (lower(http.user_agent) contains "feroxbuster")
```

Not: UA bloklama **tek başına** yeterli bir savunma değildir (UA istemci tarafından
serbestçe uydurulur); asıl koruma WAF yol/pattern kuralları + managed ruleset'tir. Bu
düzeltme yalnız "hazır tarayıcı imzalarını" kapsar, saldırgan-kontrollü UA'yı değil.

### D-28 (doküman doğruluğu) — "`sqlmap` → 403" kayıtları tek biçimi ölçmüş; düzeltildi

F-25 (satır 101), C-04 (satır 167), T-19 (satır 1008), U-12 (satır 1359), V-03 (satır
1263) ve tur 26 özeti (satır 2572) "`sqlmap` → 403" yazıyor; gerçekte yalnız
**`sqlmap/1.7`** biçimi bloklanıyor, **çıplak `sqlmap` 404** (atlıyor). Bu satırlar
N-22'yi işaret edecek biçimde notlandı; "bot koruması aktif" iddiası "yalnız
`sqlmap/`-önekli UA'da aktif" olarak daraltıldı. T-32 (satır 1216, `nikto`/`masscan`/
`zgrab` → 200 "imza yok") **doğruydu** ve N-22'nin ilk kanıtıydı — ama tek başına
"bilgi" olarak bırakılmıştı; artık N-22'nin parçası.

### N-17r (yeniden ölçüm) — WAF yol matrisi yeni origin rejiminde de tutarlı

Tur 29/31'in WAF yol matrisi, origin **402** verirken alınmıştı. Bu tur origin
**404** (`DEPLOYMENT_NOT_FOUND`) rejiminde yeniden ölçüldü; ayırt edici **değişmedi**:

| Yol | Kod | Katman |
|---|---|---|
| `/.git/config` · `/.env` · `/wp-admin` · `/wp-login.php` · `/phpmyadmin` · `/api/devtools/` · `/composer.json` | **403** | **WAF** ("Attention Required!") |
| `/` · `/api/build-info` · `/jobs` · `/.git` (eğiksiz) · `/.npmrc` | **404** | **origin** (`x-vercel-error: DEPLOYMENT_NOT_FOUND`) |
| `/../../etc/passwd` | **400** | origin (NUL/yol reddi) |

Tur 31'in N-18 (eğiksiz `.git`) ve N-19 (eksik dotfile kümesi) bulguları **doğrulandı**.

### O-01r3 (yeniden ölçüm) — origin durumu `402 DEPLOYMENT_DISABLED` → `404 DEPLOYMENT_NOT_FOUND`

#518, canlı kesintiyi **`402 Payment required` / `x-vercel-error: DEPLOYMENT_DISABLED`**
olarak kaydetmişti. Bu tur (2026-11-10 ~08:12 UTC) origin **her** istekte
**`404`** + **`x-vercel-error: DEPLOYMENT_NOT_FOUND`** + gövde
`The deployment could not be found on Vercel.` döndürüyor. Bu, **farklı bir Vercel
hata sınıfıdır** (deployment silinmiş/alias hedefi yok ↔ hesap ödeme engeli) ve
çözüm adımı farklı olabilir → **#518'e güncelleme** olarak eklendi. CF katmanı her iki
rejimde de sağlam (WAF/TLS/cache uygulanıyor, `server: cloudflare`).

**Devir:** N-22, N-21, N-20, N-18, N-19 → CF paneli (sahibin onayı) — bu lane yazmaz.
O-01 → **#518** (LANE-INFRA; durum değişimi güncellendi).
**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01, N-18, N-19, N-20, N-21.
**Yeni:** N-22 (bot UA `sqlmap/` literaline sabitli), D-28 (F-25/C-04 kayıt düzeltmesi),
N-17r (yol matrisi 404 rejiminde tutarlı), O-01r3 (origin 402 → 404).

## Tur 34 (2026-11-10) — CF Cache Rules origin'in `max-age=0`'ını yol-bazlı TTL'lere yükseltiyor; `/_next/static` 404'ü **1 yıl** cache'li (H-02r, N-23)

**Yöntem:** aynı yolu **edge** (`isbulkktc.com`) ve **origin**
(`isbulkktc-amber.vercel.app`) üzerinden ölçüp `cache-control`'u diff'ledim. Origin
her yolda **tek** başlık gönderir; edge yol-bazlı **farklı** TTL'ler üretir →
TTL'ler **CF Cache Rules**'tan gelir, origin'den değil.

### H-02r — TTL kaynağı **CF Cache Rules** olarak kesinleşti (tur 9 tahminini daralttı)

Tur 9 H-02 mekanizmayı "CF **Browser Cache TTL** ayarı" diye tahmin etmişti (panel
token'sız okunamadığı için). Aynı-path diff bunu daralttı: origin `/`, `/robots.txt`,
`/sitemap.xml`, `/sw.js`, `/favicon.ico`, `/_next/static/*` için **hepsi**
`public, max-age=0, must-revalidate` gönderiyor; edge ise **yol-bazlı farklı**
`max-age` yayıyor. Browser Cache TTL **tek** bir sayıdır, yol ayrımı yapamaz → ayar
**Cache Rules** (path-pattern) olmalı. Bu, düzeltme adresini değiştirir: Browser
Cache TTL değil, **Cache Rules**'taki `Edge TTL` / `Browser TTL` override'ları
gözden geçirilmeli (ya da `Origin` moduna alınmalı).

| Yol | Origin `cache-control` | Edge `cache-control` (CF) | Edge `cf-cache-status` |
|---|---|---|---|
| `/` | `max-age=0` | `max-age=0` | `DYNAMIC` |
| `/robots.txt` | `max-age=0` | **`max-age=2628000`** (≈30 gün) | `HIT`/`EXPIRED` |
| `/sitemap.xml` | `max-age=0` | **`max-age=3600`** (1 saat) | `EXPIRED` |
| `/sw.js` | `max-age=0` | **`max-age=2628000`** | `EXPIRED` |
| `/favicon.ico` | `max-age=0` | **`max-age=2628000`** | `EXPIRED` |
| `/_next/static/**` (var) | `max-age=0`* | `max-age=31536000, immutable` | `HIT` |
| `/_next/static/**` (yok) | `max-age=0` | **`max-age=31536000`** | `MISS → HIT` |

\* Origin rejimi `DEPLOYMENT_NOT_FOUND` olduğundan var olan chunk için origin
`max-age=0` gösterir; sağlıklı origin'de Next.js bu önek için `immutable` gönderir
(bkz. `next.config.ts:149-183`).

**Doğrulama (MISS→HIT, cache-bust `?cb=`):** `/_next/static/chunks/<yok>.js` 1.
istek `MISS`, 2. istek **`HIT` + artan `age`**; `/images/*`, `/logos/*`, `/fonts/*`,
`/assets/*`, `/_next/image/*` 404'leri ise `MISS → EXPIRED` (HIT'e dönmüyor). Yani
**1 yıllık hata cache'i `/_next/static` öneğine özgüdür**, diğer öneklere sızmaz.

### N-23 (orta, yeni) — Origin **404**'ü `/_next/static` altında **1 yıl** cache'leniyor

N-01 (tur 12) bunu sağlıklı origin'de görmüştü; bu tur origin `DEPLOYMENT_NOT_FOUND`
(404) verirken de aynının olduğunu ve **diğer öneklerin etkilenmediğini** kanıtlar.
Kritik ayrım: **404'ler 200 gibi cache'leniyor** → origin düzeldikten **sonra bile**
edge, var olmayan chunk yolu için 1 yıl boyunca **eski 404**'ü servis eder; yeni
`?dpl=` anahtarı ayrı cache girdisi ürettiği için (`?dpl=dpl_AAA` → `MISS`) yalnız
query'siz istekler bu tuzaktan etkilenir. Etki: **dağıtım sonrası kalıcı kırık
varlık** + purge gerektiren opak durum. Düzeltme N-01/H-02 ile aynı sınıf: Cache
Rules'ta `/_next/static/**` için edge/browser TTL'i **`Origin`** bırak ya da 404'leri
cache'lemeyen bir kural (origin 404'te `max-age=0` der).

### O-01r4 (yeniden ölçüm)

Origin hâlâ **404 `DEPLOYMENT_NOT_FOUND`**; CF/TLS/WAF katmanı sağlam. Alias da aynı
404'ü verir → kesinti origin'de, CF'de değil.

**Devir:** H-02r/N-23 → CF paneli **Cache Rules** (sahibin onayı) — bu lane yazmaz.
**Yeni:** H-02r (TTL kaynağı Cache Rules), N-23 (`/_next/static` 404 → 1 yıl), O-01r4.

## Tur 35 (2026-11-10) — kesinti altında katman ayrımı: `www→apex` yönlendirmesi ölçülemiyor (R-01r) + N-22/WAF/DNSSEC teyit

**Yöntem:** origin hâlâ `404 DEPLOYMENT_NOT_FOUND` iken brief 1 (DNS/`www`), 4 (WAF)
ve 6 (rate-limit) noktaları yeniden ölçüldü; her iddia **katman atfı** ile ayrıldı
(CF mi origin mi).

### R-01r (gözlem — belirsiz, D-29 ile dokümana işlendi)

Doküman (`F-03` satır 79, `C-09`, `V-06`, `W-18-16`, `W-20-3`) `https://www` → **308
apex** diyor. Bu turda **yönlendirme ateşlenmiyor**: `www` içeriği doğrudan servis
ediyor (apex ile **aynı gövde**: `/robots.txt` md5 `3f95773253df085be0d6fd831ae2195f`
== apex).

| İstek | Yanıt | Katman |
|---|---|---|
| `http://www.isbulkktc.com/` | **301** → `https://www.isbulkktc.com/` | **CF** (Always Use HTTPS, origin'siz çalışır) |
| `https://www.isbulkktc.com/` | **404** (`DEPLOYMENT_NOT_FOUND`) — apex'e yönlenmiyor | origin |
| `https://www.isbulkktc.com/robots.txt` | **200**, apex ile **aynı** gövde | CF cache + origin |
| `https://www.isbulkktc.com./` | **404** (yönlenmiyor) | origin |

**Katman çıkarımı:** `http→https` CF'de olduğu için **origin düşükken de** çalışıyor
(301). `https://www → apex` ise **ateşlenmiyor** → bu hop CF edge kuralı **değil**;
büyük olasılıkla **Vercel domain-level** yönlendirme (deployment yönlendirmesi),
dolayısıyla deployment yokken uygulanamıyor. Repo'da `www` yönlendirmesi **yok**
(`next.config.ts` `redirects()` yok; yalnız `*.vercel.app` noindex kuralı var).

**Sonuç:** Bu bir **ölçüm kısıtıdır** (D-21 sınıfı), kanıtlanmış konfig açığı **değil**.
Sağlıklı origin'de `https://www/<yol>` → 308 apex **yeniden ölçülmeli**; o zaman (a)
hâlâ 404/200 ise gerçek açık, (b) 308 ise yalnız kesinti artefaktı. Aksi hâlde
`www`'de **duplicate content** (SEO kanonik riski) sürer.

### D-29 (doküman doğruluğu)

`F-03` satırındaki "`https://www` → **308** apex'e" iddiası koşulsuz yazılmıştı;
kesinti altında **doğrulanamadığı** (R-01r) notu eklendi.

### Teyit edilen (temiz)

- **WAF yol matrisi (404 rejimi):** 7/7 saldırı yolu **403** (WAF; `cf-ray` dolu,
  "Attention Required!"): `/.git/config`, `/.env`, `/wp-admin`, `/wp-login.php`,
  `/phpmyadmin`, `/api/devtools/`, `/composer.json`. 6/6 meşru/atlanan → **404**
  origin: `/`, `/jobs`, `/about`, `/api/build-info`, `/.git` (eğiksiz, N-18),
  `/.npmrc` (N-19).
- **N-22 (bot UA) teyit:** `sqlmap/1.7` **403**; çıplak `sqlmap`, `SQLMap/1.7`,
  `Mozilla/5.0 sqlmap/1.7`, `nikto`, `Nuclei`, `masscan` → **404** (atlıyor). Bulgu
  aynen duruyor.
- **DNSSEC:** `dns.google` `do=1` → **`AD=true`**.
- **HSTS preload:** `hstspreload.org` → **`status: "pending"`** (dokümanla uyumlu).
- **`Vary` ayrımı:** `/robots.txt` → **`Vary` yok**; `/sitemap.xml` →
  `vary: accept-encoding` (T-01/T-07 düzeltmesiyle uyumlu).
- **H-01r (hâlâ açık):** edge HSTS `max-age=31536000` vs origin `63072000`
  (`next.config.ts:36`) — CF eziyor, teyit edildi.
- **`/cdn-cgi` yüzeyi:** `/cdn-cgi/trace` 200, `/cdn-cgi/speculation` 200;
  `/cdn-cgi/challenge-platform/`, `/cdn-cgi/zaraz/`, `/cdn-cgi/l/email-protection` → 404.

### O-01r5 (yeniden ölçüm)

Origin hâlâ **404 `DEPLOYMENT_NOT_FOUND`**; CF/TLS/WAF katmanı sağlam. #518 (LANE-INFRA) açık.

**Devir:** R-01r → sağlıklı origin'de yeniden ölçüm (LANE-INFRA/CF panel).
**Yeni:** R-01r (www yönlendirmesi kesinti altında ateşlenmiyor — belirsiz), D-29, O-01r5.

## Tur 36 (2026-11-10) — origin **sağlıklı**: `www→apex` yönlendirmesi **YOK**; `www` tam gövdeyi **200** servis ediyor (H-03)

**Yöntem:** origin bu turda **ayağa kalktı** (`x-vercel-error` yok; apex `/` →
`200`, `cf-cache-status: DYNAMIC`, `x-vercel-cache` dolu). Tur 35'in ölçüm
kısıtı (R-01r) böylece kapandı ve `www` yönlendirmesi **sağlıklı origin'de**
yeniden ölçüldü. Her iddia katman atfıyla (CF mi origin mi) ayrıldı.

### H-03 (yüksek — kanıtlanmış konfig açığı) — `https://www` apex'e yönlenmiyor; duplicate content

Dokümanın çok sayıda satırı (`F-03`, `C-09`, `V-06`, `W-20-3`, `T-18`, satır 1208)
`https://www.isbulkktc.com/<yol>` → **308** apex iddiasını taşıyor. **Canlı ölçüm
bunu çürütüyor:**

| İstek (sağlıklı origin) | Yanıt | Katman |
|---|---|---|
| `https://www.isbulkktc.com/` | **200** (yönlendirme **yok**) | origin |
| `https://www.isbulkktc.com/freelance` | **200** — apex ile **bayt-özdeş** (139 342 B) | origin |
| `https://www.isbulkktc.com/jobs` | **200**, `/jobs` gövdesi | origin |
| `https://www.isbulkktc.com/jobs?q=x` | **200** (sorgu yankılanıyor) | origin |
| `http://www.isbulkktc.com/` | **301** → `https://www.isbulkktc.com/` | **CF** (Always Use HTTPS) |
| `https://www.isbulkktc.com./` | **404** | origin |
| `https://isbulkktc.com./` | **404** | origin |

- **Yöntem-bağımsız:** hem `GET` hem `HEAD` `200` döner (önceki turların
  "308"ü muhtemelen kesinti/`HEAD` rejiminden türetilmişti).
- **Duplicate content:** `www/freelance` gövdesi apex ile **birebir aynı**
  (139 342 bayt; `title` aynı). `www` **kendi URL'sini sunuyor**, apex'e
  kanonikleştirmiyor. Motorlar iki host'u ayrı URL kümesi olarak tarayabilir.
- **Azaltıcı (kısmi):** HTML içinde `<link rel="canonical" href="https://isbulkktc.com/…">`
  ve `og:url` apex'i gösteriyor; 9 iç bağlantının 9'u mutlak `https://isbulkktc.com`.
  Yani kanonik sinyali var, ama **HTTP 200 + yönlendirme yokluğu** yüzünden
  `www` crawl bütçesi/kopya sayfası yüzeyi olarak duruyor.
- **Repo'da `www` yönlendirmesi yok:** `next.config.ts` `redirects()` içermiyor;
  yalnız `*.vercel.app` için `X-Robots-Tag: noindex` kuralı var (satır 189-195).
  Yönlendirme ne repo'da ne CF edge'de → **Vercel domain-level** (host bazlı)
  yapılandırma eksik.
- **WAF/Robots tutarlı:** `www` üzerinde `/.git/config` → **403** (WAF çalışıyor);
  `/robots.txt` apex ile aynı gövde. Yani eksik olan **yalnız yönlendirme**.

**Etki:** SEO duplicate-content + "bulunabilirlik" (#163) halkasında `www`
URL'lerinin ayrı indekslenmesi. Ayrıca `http://www` zinciri `301 → 200` (2 hop,
apex'e hiç varmıyor).

**Düzeltme (devir — CF paneli + Vercel domain, sahibin onayı; bu lane yazmaz):**
1. **CF paneli → Rules → Redirect Rules:** `http.host eq "www.isbulkktc.com"` →
   Dynamic redirect `concat("https://isbulkktc.com", http.request.uri.path)`,
   **301**, "Preserve query string" açık. Bu, origin'den bağımsız çalışır ve
   mevcut `http→https` (301) davranışıyla tek sıçramada birleşir.
2. **Vercel → Domains:** `www.isbulkktc.com`'u `isbulkktc.com`'a
   **redirect (308)** olarak ekle (alternatif; CF proxy arkasında olduğundan
   Vercel redirect'i edge'e ulaşmadan da çalışır, ama CF kuralı daha erken ve
   daha güvenilir).

### D-30 (doküman doğruluğu)

`F-03` (satır 79), `C-09` (172), `V-06` (1266), `W-20-3` (1731), `T-18` (1007),
satır 1208 ve `W-20-7`/`W-18-16` satırlarındaki koşulsuz "**308**" iddiası
**yanlış**; canlı **200** ölçüldü (H-03). İlgili satırlar düzeltildi ve H-03'e
atıflandı. Tur 35'in R-01r'si ("ölçüm kısıtı, belirsiz") bu turda **kapandı**:
kısıt değil, gerçek açık.

### Teyit edilen (temiz, sağlıklı origin)

- **WAF:** `https://www…/.git/config` → **403** (edge kuralı host-bağımsız).
- **robots.txt:** `www` ve apex **aynı** gövde (CF cache + origin).
- **404 cache rejimi (H-02r teyit):** gerçek olmayan yol `/nonexistent-xyz-123`
  → **404**, `cache-control: private, no-cache…`, `cf-cache-status: DYNAMIC`
  (negatif cache **yok** — dinamik HTML sınıfı). `/_next/static` 404'ünün 1 yıl
  cache'lenmesi (N-23) statik-prefix Cache Rule'una özgü, teyit edildi.
- **Apex root:** `200`, `cf-cache-status: DYNAMIC` (HTML asla cache'lenmiyor).

### O-01r6 (yeniden ölçüm)

Origin **sağlıklı** (önceki `404 DEPLOYMENT_NOT_FOUND` rejimi bitti). #518
(LANE-INFRA) bu turda kapandı sayılabilir; CF/TLS/WAF katmanı sağlam.

**Devir:** H-03 → CF paneli **Redirect Rule** + Vercel domain (sahibin onayı).
**Yeni:** H-03 (`www` yönlendirmesi yok → 200 duplicate content), D-30, O-01r6.

### H-02r/N-23 teyidi (sağlıklı origin, tur 36) — negatif cache origin'den bağımsız

Tur 34'ün bulgusu (origin kesintideyken) **sağlıklı origin'de de** aynen geçerli,
yani kesinti artefaktı **değil**:

| İstek (sağlıklı origin) | Origin (Vercel alias) | Edge (CF) |
|---|---|---|
| `/_next/static/chunks/does-not-exist-*.js` | **404**, `public, max-age=0, must-revalidate` | **404**, `public, max-age=31536000, must-revalidate` — 1. istek `MISS`, 2. istek **`HIT`** |
| `/_next/static/chunks/<gerçek>.js` | `public, max-age=31536000, immutable` | `max-age=31536000, immutable`, `HIT` |
| `/icon-light-32x32.png` (gerçek) | — | `max-age=2628000`, `REVALIDATED` |

**Çıkarım:** CF Cache Rule `/_next/static/**` önekini **koşulsuz** 1 yıl
cache'liyor; origin'in gerçek 200 varlıkları zaten `immutable` (doğru) ama
origin'in **404**'ünü de (`max-age=0`) aynı 1 yıla yükseltiyor. Bir deploy
sonrası **silinen/rotasyona giren chunk** adı bir kez 404 ile talep edilirse,
edge onu **1 yıl** "var olmayan" olarak HIT'ler → kullanıcı kalıcı kırık JS alır.
Düzeltme CF panelinde: Cache Rule'a "**Only cache if origin status is 200**"
(Edge Cache TTL + Cache Everything + `Origin Status`/`Status Code` koşulu) ya da
`/_next/static` için **negative cache TTL = 0**. **Sahibin onayı** gerekir.

**Not:** gerçek 200 varlıklarda davranış **doğru** (`immutable`, uzun TTL);
sorun yalnız **hata yanıtının** uzun TTL ile cache'lenmesi (AUDIT "hata yolu"
boyutu).

## Tur 37 (2026-11-10) — `www` yönlendirmesi **şemayı** düzeltiyor, **host'u** kanonikleştirmiyor (H-03r/R-14); tur 36 "bayt-özdeş" daraltıldı (D-31)

**Yöntem:** origin sağlıklı (tur 36 rejimi). `www`/apex yönlendirme zinciri üç
bağımsız açıdan (durum kodu, `Location`, gövde) yeniden ölçüldü. Bulgu, H-03'ün
**mekanizmasını** netleştirir: eksik olan `http→https` değil, **host
kanonikleştirmesidir**.

### H-03r / R-14 (orta-yüksek) — `http://www` yalnız şemayı yükseltiyor, `www`'yi koruyor

| İstek | Yanıt | `Location` / not |
|---|---|---|
| `http://www.isbulkktc.com/` | **301** | `https://www.isbulkktc.com/` — **host www kalıyor** |
| `http://www.isbulkktc.com/freelance?q=test` | **301** | `https://www.isbulkktc.com/freelance?q=test` (yol+sorgu korunur) |
| `https://www.isbulkktc.com/` | **200** | yönlendirme **yok**; `server: cloudflare`, `cf-ray` dolu, `x-vercel-cache` dolu |
| `https://www.isbulkktc.com/sitemap.xml` | **200** | içerik **1509 URL, hepsi `https://isbulkktc.com`** (apex) — hiç `www` URL yok |
| `https://www.isbulkktc.com/robots.txt` | **200** | apex ile **aynı** gövde |
| `https://www.isbulkktc.com/.git/config` | **403** | WAF kuralı **host-bağımsız** çalışıyor |
| `https://www.isbulkktc.com/<olmayan-yol>` | **404** | `cf-cache-status: DYNAMIC` (negatif cache yok) |

- **Katman atfı:** `http→https` hop'u **CF** ("Always Use HTTPS"; origin
  olmadan da çalışır). **`www`→apex** hop'u **hiç yok** — ne CF edge'de ne
  repo'da (`next.config.ts` `redirects()` içermiyor). Yani `www` bir kanonik
  hedef gibi davranıyor, oysa `sitemap.xml`/`robots.txt` kanonik hedefin **apex**
  olduğunu söylüyor → **tutarsızlık**.
- **Zincir kanıtı:** `http://www.isbulkktc.com/jobs?q=x` → 301 →
  `https://www.isbulkktc.com/jobs?q=x` → **200**. **2 hop, son durak `www`**,
  apex'e hiç varılmıyor.
- **Etki:** `www` tam gövdeyi 200 servis ediyor (duplicate-content yüzeyi, H-03);
  "tek sıçrama, apex'te biter" beklentisi karşılanmıyor. #163 (bulunabilirlik)
  halkasında `www` URL'leri ayrı indekslenebilir.
- **Düzeltme (devir — CF paneli, sahibin onayı; bu lane yazmaz):** Rules →
  Redirect Rules: `http.host eq "www.isbulkktc.com"` → Dynamic redirect
  `concat("https://isbulkktc.com", http.request.uri.path)`, **301**, "Preserve
  query string" açık. Mevcut "Always Use HTTPS" ile birleşince tek sıçramada
  `http://www` → `https://apex` olur.

### D-31 (doküman doğruluğu) — "bayt-özdeş" ifadesi daraltıldı

Tur 36 `www/freelance` için "apex ile **bayt-özdeş** (139 342 B)" demişti. Tur 37
ölçümü: boyut **özdeş** ama **ham md5 farklı** (apex `27209a42330d658d…`, www
`bfc412de7f55c19d…`). Fark **iki CF-injected rastgele token**:
1. `window.__CF$cv$params={r:'…',t:'…',u:'…',ut:'…'}` — bot yönetimi imzası.
2. `/cdn-cgi/l/email-protection#…` + `data-cfemail="…"` — **G-01** email obfuscation.

Bu iki blok normalize edilince gövdeler **origin'de özdeş**. Doğru ifade: "apex
ile **origin gövdesi** özdeş; yalnız CF-injected token farkı". Aynı durum kök
sayfada da geçerli (normalize sonrası diff = yalnız bu iki blok). H-03'ün
"duplicate content" sonucu **değişmez** — kanonik sinyal yine de eksik.

### Teyit edilen (temiz, sağlıklı origin)

- **HSTS:** apex ve `www` **aynı** `max-age=31536000; includeSubDomains; preload`.
- **Negatif cache:** `www` üzerinde gerçek-olmayan yol → **404**, `DYNAMIC`
  (H-02r/N-23 rejimi dinamik HTML'de geçerli değil; yalnız `/_next/static/**`).
- **Apex root:** **200**, `cf-cache-status: DYNAMIC` (HTML asla cache'lenmiyor).

**Devir:** H-03r/R-14 → CF paneli **Redirect Rule** (host `www` → 301 apex).
**Yeni:** H-03r, R-14, D-31. **Değişmedi:** O-01r6 (origin sağlıklı).

---

## Tur 38 (2026-11-10) — #163: bot engeli çürütüldü (B-01) + doğrulama etiketi yok (V-01)

### B-01 (negatif kanıt) — Cloudflare arama motoru botlarını ENGELLEMİYOR

Issue #163'ün Cloudflare'e atfettiği "bot engeli / `cf-mitigated: challenge` arama
motoru botlarını da engelliyor" hipotezi **canlı ölçümle çürütüldü**. Aynı gün, taze:

| UA | yol | sonuç | `cf-mitigated` |
|---|---|---|---|
| `Googlebot/2.1` | `/robots.txt` | **200** | yok |
| `bingbot/2.0` | `/robots.txt` | **200** | yok |
| `YandexBot/3.0` | `/robots.txt` | **200** | yok |
| `Googlebot/2.1` | `/` | **200** (`DYNAMIC`) | yok |
| `GPTBot/1.1` | `/` | **200** | yok |
| `facebookexternalhit/1.1` | `/` | **200** | yok |
| `Scrapy/2.11` | `/` | **200** | yok |
| `python-requests/2.31` | `/` | **200** | yok |
| `curl/7.68` | `/` | **200** | yok |
| (boş UA) | `/` | **200** | yok |

- `robots.txt`: `Allow: /`; yalnız `/api/`, `/auth/` ve yerel-ek `/en|ru|el|fa|de/auth/`
  `Disallow`. `Host: https://isbulkktc.com`, `Sitemap: https://isbulkktc.com/sitemap.xml`.
- `X-Robots-Tag` **yok**; `sitemap.xml` **200** `application/xml`.
- **Etki:** #163'ün 2. halkası (taranabilirlik) **sağlam**; sorun Cloudflare'de değil.
  Yükleyici (load-sensitive) hipotezler ve "challenge" iddiaları bu kanıtla düşer.

### V-01 (kopuk halka) — doğrulama meta etiketi YOK

Üretim HTML'inde `google-site-verification` meta etiketi **yok**:

```
$ curl -sS https://isbulkktc.com/ | grep -c site-verification
0
```

AGENTS.md `NEXT_PUBLIC_{GOOGLE,BING,YANDEX}_SITE_VERIFICATION` env'lerinin koda bağlı
(`src/app/[locale]/layout.tsx`) ama değerlerinin girilmediğini söylüyordu — bu ölçüm
onu **doğruluyor**. Doğrulanmamış Search Console mülkü **taranmaz/indekslenmez**; bu,
"isbulkktc.com yazmadıkça çıkmıyor" şikâyetinin **en olası kopuk halkasıdır**.

- **Sahip:** LANE-SEO (+ sahip env erişimi). **CF panelinde çözülmez.**
- **Düzeltme:** env değerlerini gir → GSC/Bing/Yandex mülkünü doğrula → `sitemap.xml`
  gönder → kapsam raporunu oku.

### Değişmedi

- **H-03r/R-14:** `www` hâlâ apex'e yönlendirmiyor (`http://www` → 301 → `https://www`,
  200; host korunuyor). Kanonik etiket apex'i işaret ediyor (doğru) ama host redirect yok.
- **O-01r6:** origin sağlıklı.

**Yeni kimlik:** B-01, V-01. **Devir:** #163 halka-2 CF'de değil; halka-1 → LANE-SEO.

---

## Tur 39 (2026-11-10) — doküman↔canlı çelişkisi kapandı + edge tazelik taraması

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Canlı build: /api/build-info → 14629df (= main), environment=production
Sahibin yapması gerekenler: V-01r (GSC doğrulama env) · H-03r/R-14 (CF Redirect Rule:
            host www → 301 apex) · H-01r (HSTS max-age) · H-02r/N-01r (Cache Rules
            "Respect Existing Headers") · N-22/N-21/N-20/N-18/N-19 · R-01 · G-01 ·
            F-08 · B-02 · #227 · #170 · #163 · O-01 (#518)
Sonraki lane için notlar: (1) Canlı build 14629df'ye ilerledi (tur 38'deki main).
            (2) Dokümanın "google-site-verification VAR" kaydı (C-13/V-04 + "Kapalı
            kayıt") canlıda YANLIŞ; düzeltildi. (3) CF, HTML rotalara
            challenge-platform precursor script'i enjekte ediyor ama `__cf_bm`/challenge
            YOK → Bot Fight Mode kapalı (G-02/B-02). (4) `www` hâlâ apex'e 301 değil.
            Yeni kimlik: C-13r, V-01r, G-02, B-02, SW-01r, N-01r, F-12r.
```

### C-13r / V-04r — doküman "var" diyordu, canlı **YOK** (tur 38 V-01 doğrulandı)

Önceki tablolarda `C-13` ve `V-04`, `google-site-verification` meta etiketinin üretim
HTML'inde **var** olduğunu söylüyordu (`1zuidCsJ2…`). Taze ölçüm bunu **çürüttü**:

| Ölçüm | Sonuç |
|---|---|
| `curl -sS https://isbulkktc.com/ \| grep -c site-verification` | **0** |
| 6 dil (`/tr /de /en /ru /el /fa`) | **hepsi 0** |
| `/en/jobs` | **0** |
| origin alias (`isbulkktc-amber.vercel.app`) | **0** |
| token literali (`1zuidCsJ2…` / `7YbjG-3…` / `556993cbb…`) | **0** |
| `<meta name="…">` envanteri | `googlebot`, `description`, `theme-color`… — **hiç `verification` yok** |

DNS TXT **var** (DoH: iki `google-site-verification=` + `yandex-verification=`), ama
meta etiket **yok** → `src/app/[locale]/layout.tsx` env'i (`NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`)
üretimde tanımsız. **Düzeltme yapıldı:** `C-13`, `V-04` satırları ve "Kapalı kayıt —
#163" bölümü canlı kanıtla güncellendi (yanlış "var" kaydı kaldırıldı). Bu, LANE-SEO'yu
gerçek düzeltmeden uzaklaştırabilecek bir **doküman hatasıydı**.

### V-01r — GSC doğrulama halkası (sahip: LANE-SEO/env)

#163'ün **halka-1**'i (mülk doğrulama) hâlâ kopuk: meta etiket yok → Search Console
mülkü doğrulanmamış olabilir → taranmaz. CF panelinde çözülmez. Bing/`msvalidate.01`
de yok (bkz. #173). **Düzeltme:** env değerlerini gir → GSC/Bing/Yandex doğrula →
sitemap gönder → kapsam raporu.

### G-02 — CF, HTML rotalara challenge-platform precursor script'i enjekte ediyor

`/`, `/jobs`, `/login`, `/freelance`, `/about` gövdesinde CF-injected
`/cdn-cgi/challenge-platform/scripts/precursor/main.js?ray=…` script'i **var**
(`grep -c` = 1); Googlebot UA'da da aynı. `robots.txt` gibi non-HTML'de yok.
**Ama** hiçbir yanıtta `__cf_bm` / `cf_clearance` çerezi ve `cf-mitigated` başlığı
**yok** → tam challenge uygulanmıyor. Bu, tur 38'in "challenge platform script'i yok"
ifadesini **daraltır**: precursor **var**, ama gerçek challenge/koruma **yok**.

### B-02 — Bot Management kapalı (bot koruması zayıf, N-18..N-22 teyit)

Taze UA matrisi (`/`): `sqlmap/1.7` → **403**; ama çıplak `sqlmap`, `SQLMap`, `nikto`,
`nmap`, `Nuclei`, `ffuf`, `gobuster`, `masscan`, `WPScan` → **hepsi 200**. `__cf_bm`
çerezi yok + challenge yok → Bot Fight Mode/Bot Management **kapalı**. Etki: WAF
yalnız imza-bazlı (`sqlmap/` literali), tarayıcı otomasyonu serbest.

### SW-01r / N-01r / H-02r — cache override'ları hâlâ açık (Cache Rules)

| Yol | `cache-control` (edge) | `cf-cache-status` | Not |
|---|---|---|---|
| `/sw.js` | `no-cache, no-store, must-revalidate` | **BYPASS** | repo #365 düzeltmesi etkili; edge **yine de** cache kuralı override ediyor → izle |
| `/robots.txt` | `public, max-age=2628000` | `REVALIDATED` | H-02r açık |
| `/sitemap.xml` | `public, max-age=3600` | `REVALIDATED` | H-02r açık |
| `/_next/static/<yok>.js` | (404) | **HIT** | **N-01r açık** — var olmayan chunk 1 yıl cache |
| `/favicon.ico` (404) | — | `BYPASS` | negatif cache yok (N-02 doğru) |
| `/` | `private, no-store` | `DYNAMIC` | dinamik HTML cache'lenmiyor ✔ |

Düzeltme değişmedi: **Caching → Cache Rules → "Respect Existing Headers"** (sahibin onayı).

### F-12r — HSTS preload hâlâ `pending`

`hstspreload.org/api/v2/status?domain=isbulkktc.com` → `{"status":"pending"}`. Edge
HSTS `max-age=31536000` (H-01r: origin `63072000`'i eziyor). Preload asgarisi 1 yıl →
preload engellenmiyor; F-12 önerisi değişmedi (bekle, DNS/TLS'e dokunma).

### Teyit (değişmeyen açıklar)

- **H-03r / R-14:** `https://www.isbulkktc.com/` → **200** (301 yok); `http://www/jobs?q=x`
  → 301 **`www`'yi koruyor**; apex/www gövdesi **origin'de özdeş** (139 598 B), yalnız
  CF-injected token farkı (`__CF$cv$params` ray + email-protection) → tur 37 D-31 teyit.
- **H-01r:** edge HSTS `31536000` vs origin alias `63072000` (eziyor).
- **R-01:** `https://isbulkktc.com./` → **404** (`x-vercel-id` dolu → Vercel/Next).
- **F-08:** alias CF'i atlıyor, `x-robots-tag: noindex, nofollow`.
- **G-01:** email obfuscation (`/cdn-cgi/l/email-protection#…`) hâlâ aktif.
- **WAF temeli:** `/.git/config`, `/.GIT/config`, `/%2e%67it/config`, `/.ENV`,
  `/WP-ADMIN/` → **403** (case/encoding kaçışı yok; F-22 doğru).
- **Rate limit:** `/login` ×8 → **hepsi 200** (edge rate limit yok; tek kural leak-check'te).

### U-16r — doküman↔canlı drift: `security.txt` `Expires` (yeni bulgu, düzeltildi)

Tur 39 tazelemesinde `/.well-known/security.txt` (RFC 9116) **yeniden ölçüldü** ve
kayıtlı `Expires` değeriyle **uyuşmadığı** görüldü:

| Kaynak | Değer |
|---|---|
| Canlı (`isbulkktc.com`, `www.isbulkktc.com`, `isbulkktc-amber.vercel.app` — üçü de **200**) | `Expires: 2027-09-06T14:49:41.258Z` — **anlık** değer; kaynak onu **dinamik** üretir (bkz. aşağıdaki düzeltme) |
| Doküman (5 satır) | `2027-09-01` (U-16) · `2027-09-02` (U-07, V-10, W-18-24, özet) |

Doküman kendi içinde de **tutarsızdı** (09-01 vs 09-02) ve ikisi de canlıdan sapıyordu.
Kanıt: `curl -sS https://isbulkktc.com/.well-known/security.txt` → `Expires:
2027-09-06T14:49:41.258Z`. **Düzeltme:** beş satırın tamamı canlı değere (2027-09-06)
çekildi. Etki: `Expires` geçmiş bir `security.txt` RFC 9116 uyarınca **geçersiz**
sayılır; yanlış (daha erken) tarih, dosyanın süresi dolmuş gibi okunmasına yol
açabilirdi. Canlı dosya geçerli (`Contact`/`Canonical`/`Preferred-Languages` tam).

**Düzeltme (tur 39 devam — canlı kaynak okuması):** Yukarıdaki ilk not "`Expires`
sabit yazılmış" diyordu; bu **yanlıştı**. Kaynak
`src/app/.well-known/security.txt/route.ts` değeri **dinamik** üretir:

```
export const dynamic = "force-static";
export const revalidate = 86400;                              // günlük ISR
const expires = new Date(Date.now() + 300 * 24 * 60 * 60 * 1000); // now + 300 gün
```

Ardışık iki ölçüm (`14:49:41.258Z` → `15:41:21.365Z`, ~52 dk arayla) değerin her ISR
tazelemesinde ileri kaydığını doğruladı. Sonuç: **bayatlama riski yok** — `Expires`
her zaman gelecekte olduğundan RFC 9116'nın "gelecekte olmalı" şartı sürekli
karşılanır; 300 gün < 1 yıl olduğundan "bir yıldan kısa öner" tavsiyesi de zaten
uygulanıyor. Yani ek rotasyon **gerekmez**; yukarıdaki "sabit tarih" ifadeleri
kalıcı kayıt değil, **günlük kayan anlık görüntüdür** — kalıcı kayıt formüldür
(`now + 300 gün`, günlük ISR).
