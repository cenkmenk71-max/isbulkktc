# LANE-CLOUDFLARE — edge/WAF/cache/DNS/Bot koruması

Hedef: Cloudflare yapılandırmasını **noktası noktasına** doğrulayıp eksikleri kapatmak.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- Alan: **isbulkktc.com** Cloudflare arkasında. Vercel alias: `isbulkktc-amber.vercel.app`.
- Çalışan token: **`<CF_API_TOKEN — ortam değişkeni>`** (cfat_ biçimli). `/user/tokens/verify` `1000 Invalid API Token` döner ama token çalışır — yok say.
- **Kanıtlanmış gerçekler:** WAF AÇIK (Managed Free Ruleset, 38 kural). Custom WAF 4 kural (ruleset `e2951dca01da47b8882fa120d5fbc308`): `/api/devtools/` bloğu, TRACE/TRACK, VCS/dotfile/secret yolları, CMS/exploit-scanner yolları. Free plan `matches` operatörünü reddeder (`contains`/`in`/`lower()` kullan).
- **Free plan = tam 1 `http_ratelimit` kuralı**, "Leaked credential check" için harcanmış. Auth brute-force koruması bunu **değiştirmeyi** gerektirir → önce sor.
- **GitHub runner egress'ini Cloudflare `cf-mitigated: challenge` ile her yolda engelliyor** (ana sayfa dahil). Custom WAF skip bunu kaldırmıyor. Bu yüzden IndexNow Vercel alias'tan okuyor.
- Cache doğru: dinamik HTML `private, no-cache, no-store`; edge-cached: `/_next/static/*` (immutable), `/robots.txt` (~30 gün), `/sitemap.xml` (1 saat), `/images/*`. **Not (tur 19):** **prerender** rotalar (`/blog`, `/contact`, `/freelance`, `/about`, `/privacy`, `/terms`) `public, max-age=0` + `Set-Cookie` döner; CF yine de `DYNAMIC` (cache'lemiyor) → bilgi, origin düzeltmesi LANE-GÜVENLİK'te (P-01).

## Sahip olduğun yollar
Repo dışı CF API; gerekirse yeni `docs/cloudflare.md` (kendi dosyan).

## Yapılacaklar (nokta noktasına denetim)
1. **DNS:** A/CNAME kayıtları, proxied durum, TTL, `www` yönlendirmesi, mail kayıtları (SPF/DKIM/DMARC).
2. **SSL/TLS:** mod (Full strict mi?), min TLS sürümü, HSTS, Always Use HTTPS, Automatic HTTPS Rewrites.
3. **Cache Rules:** hangi yollar edge-cached; `Vary`, `s-maxage`; `/jobs` gibi dinamik yollar asla cache'lenmiyor mu?
4. **WAF:** mevcut 4 kural + managed ruleset; bypass/skip mantığında delik var mı? Negatif test (9 saldırı yolu → 403, 17 meşru rota → 200) tekrarla.
5. **Bot koruması:** Bot Fight Mode / Verified Bots; GH runner engeli **bilinçli bir trade-off** — kapatmadan önce etkisini raporla.
6. **Rate limit:** tek kuralı nereye harcamak en doğru (auth brute-force vs leak check)? Öneri sun, uygulamadan sor.
7. **Analytics/logpush:** token `account.zone.analytics.read` istiyor; eksik scope'u net söyle.

## Kurallar
- **Yıkıcı CF değişikliği (cache purge, DNS, WAF kuralı silme) öncesi sahibin onayını al.** Read-only denetim + öneri önce gelsin.
- Her iddiayı **canlı HTTP kanıtıyla** doğrula (curl -I, cf-ray, cf-cache-status).
- Token'da olmayan yetkileri (DNS/cache/zone-write) listele: hangi scope gerektiğini tam adıyla yaz.

## Raporla
Bulgu tablosu (nokta → mevcut → olması gereken → kanıt) + uygulanacak değişiklikler (onay bekleyen) + eksik token scope'ları.

## Durum (2026-11-05)

Read-only denetim yapıldı; bulgular `docs/cloudflare.md`'de. Özet:

- **Token yok:** bu sandbox'ta `CF_API_TOKEN` tanımlı değil → zone-level API
  denetimi (WAF ruleset, cache rules, rate-limit kuralı, Bot Management,
  Analytics) yapılamadı; canlı HTTP + DNS kanıtı toplandı.
- **Doğrulanan gerçekler:** WAF saldırı yollarını 403'ler (case/kaçış denemeleri
  dahil), meşru aramalarda yanlış pozitif yok, TLS min 1.2, HSTS+preload,
  DNSSEC açık, dinamik HTML asla cache'lenmiyor. Cache "düzeltmesi" **gerekmiyor**.
- **Yeni bulgu (F-08):** `isbulkktc-amber.vercel.app` CF edge'ini tamamen atlıyor
  → WAF/bot/rate-limit devre dışı kalıyor. Vercel Deployment Protection önerisi
  (sahip/INFRA onayı).
- **Onay bekleyen:** (1) tek rate-limit kuralını auth brute-force'a tahsis,
  (2) origin doğrudan erişimini kapat, (3) DMARC `p=none` → `quarantine/reject`,
  (4) HSTS preload `pending` iken DNS/TLS'e dokunma.

### Bulunabilirlik (#163) — 2026-11-05

Issue #163'ün **Cloudflare halkası** ölçüldü: CF arama motoru botlarını
engelliyor mu? **Hayır.** Sitemap'teki 207 URL'nin tamamı Googlebot UA'ya 200
döndü; bingbot/YandexBot/GPTBot/ClaudeBot/AhrefsBot de 200; hiçbir yolda
`cf-mitigated` yok; site geneli `X-Robots-Tag` yok; `robots.txt`/`sitemap.xml`
bot-bağımsız aynı; WAF yalnız `sqlmap` gibi kötü UA'yı 403'lüyor. Yani
"sıralanmama"nın nedeni bot engeli değil. Detay + kanıt: `docs/cloudflare.md`
→ "Bulunabilirlik denetimi".

**Kopuk halka adayı (LANE-SEO'ya handoff):** Bing doğrulama artefaktı yok
(`msvalidate.01` meta, `BingSiteAuth.xml`, Bing DNS TXT'inin üçü de eksik) —
Bing indeksi 1 sayfada. `lane:seo` + `agent:handoff` ile issue açıldı.

### E-posta kimlik doğrulama (#170) — 2026-11-05

Canlı DNS ölçümü: Resend kayıtları **tam** — `send.isbulkktc.com` TXT
`v=spf1 include:amazonses.com ~all` + MX `feedback-smtp.eu-west-1.amazonses.com`
(return-path), `resend._domainkey` DKIM, kök `_dmarc` mevcut. Resend
**envelope/Return-Path'i `send.` subdomaini** olduğu için SPF orada kontrol
edilir ve **pass** olur; issue'nun istediği "kök SPF'e `include:amazonses.com`
ekle" adımı **gereksiz**. Gerçek fırsatlar: DKIM **1024-bit** (2048'e yükselt) ve
DMARC'i `ruf` + sıkı alignment ile güçlendir. Detay: `docs/cloudflare.md` →
"E-posta kimlik doğrulama denetimi". Yıkıcı DNS değişikliği yapılmadı.
Handoff: auth SMTP (LANE-SUPABASE; doğru bölüm **`[auth.email.smtp]`**), `List-Unsubscribe`/`Reply-To` (LANE-URUN).

### Uç/edge mikro-denetim (tur 4) — 2026-11-05

Cache-deception / cache-poisoning / origin-ifşası / WAF eksenleri yeniden tarandı;
**açık yok**. Özel rotalar (`/profile/dashboard`, `/company/dashboard`) → 307
`/login`, `DYNAMIC`, `private, no-store`; statik-uzantı ve traversal varyantları
cache'lenmiyor; unkeyed header yansıması yok; 56 alt alan tarandı, grey-cloud
sızıntısı yok; WAF 9/9 saldırı → 403, 17/17 meşru → 200. **Yeni bulgu (G-01):**
CF **Email Address Obfuscation** açık — footer `mailto:` linki
`/cdn-cgi/l/email-protection#…`'e çevriliyor (JSON-LD'de e-posta düz kalıyor →
tutarsızlık; CSP aynı-origin olduğu için kırılmıyor). Öneri: Scrape Shield →
Email Obfuscation **OFF** (onay bekliyor). Detay: `docs/cloudflare.md` → "Uç/edge
güvenlik mikro-denetimi".

### DKIM sahiplik ayrımı (#227) — 2026-11-05

#195'in LANE-CLOUDFLARE'e düşen parçası **DKIM 1024→2048 rotasyonu**. Canlı DoH
ölçümü doğruladı: `resend._domainkey` **1024-bit** (tek selector), kök SPF/SES
return-path/DMARC/CAA tam; MTA-STS/TLS-RPT/BIMI yok. **Panel + DNS yazma →
sahibin onayı** (uygulanmadı). Auth SMTP bloğu eksikliği `supabase/config.toml`'da
= **LANE-SUPABASE** (repo okumasıyla doğrulandı, yazılmadı). Ayrıca CORS (preflight
+ simple GET) ve Set-Cookie bayrakları tarandı — temiz. Detay: `docs/cloudflare.md`
→ "DKIM sahiplik ayrımı".

### DMARC `p=quarantine` dağıtımı (#170) — 2026-11-05

Sahip #170'te teşhisi düzeltti ve bu lane'e **açık görev** verdi: "DMARC'i
`p=quarantine`'a yükselt (LANE-CLOUDFLARE)". Uygulamadan **önce** hizalama
ön-kontrolü yapıldı: Resend SES (`send.`), Resend Forge (`rsend.` →
`send.forge.rmta.net`) ve DKIM `d=isbulkktc.com` — üçü de `isbulkktc.com` ile
**relaxed align** → `p=quarantine` güvenli. Önerilen kayıt + iki fazlı rollout
`docs/cloudflare.md` → "DMARC `p=quarantine` dağıtımı". **DNS yazma → sahibin
onayı; değişiklik yapılmadı.** `rsend` CNAME'inin **dangling olmadığı** da
doğrulandı. G-01 (email obfuscation) ve DKIM 1024-bit hâlâ açık.

### Edge mikro-denetim tur 7 — 2026-11-05

Cache-key + hata yolu + TLS tazelendi; **yeni açık yok**. `/robots.txt` ve
`/sitemap.xml` gzip/identity varyantları `Vary: accept-encoding` ile ayrı
tutuluyor; çerez/`Accept-Language` gövdeyi değiştirmiyor; 404/401/400 hata yolları
`no-store`/`max-age=0` + `DYNAMIC` ve gövdede sızıntı yok; TLS min 1.2; sertifika
`*.isbulkktc.com`; HTTP/3 açık. **Düzeltme:** önceki notlarda `[auth.smtp]` yazan
yerler doğru bölüm adı **`[auth.email.smtp]`** olarak güncellendi (LANE-SUPABASE
PR #239 kanıtı). IPv6 bu sandbox'ta doğrulanamadı → "bakılmadı". Detay:
`docs/cloudflare.md` → "Edge mikro-denetim tur 7".

### Yönlendirme / host kanonikleştirme tur 8 — 2026-11-05

Brief 1. maddesi + AUDIT "yönlendirme zinciri" tazelendi. **Açık yönlendirme
yok** (`//evil.com` → göreli `/evil.com`; `/\`, `/%5C`, `/%2F%2F`, `../..` → 404);
`http→https` ve `www→apex` yol+sorguyu koruyor; zincir ≤2 hop; host case 200; HSTS
yalnız TLS'te. **Yeni bulgu (R-01, düşük):** sondaki noktalı apex host
`https://isbulkktc.com./` → **404** (`/jobs` de), ama `www.isbulkktc.com.` → 308 ve
`isbulkktc.com./en` → 200 (tutarsız). Hata **Vercel/Next** host eşleştirmesinde
(`x-vercel-id` dolu) → `lane:infra` handoff. Detay: `docs/cloudflare.md` →
"Yönlendirme / host kanonikleştirme denetimi".

### Edge vs origin başlık karşılaştırması tur 9 — 2026-11-05

Aynı isteği **edge (`isbulkktc.com`)** ve **origin (`isbulkktc-amber.vercel.app`)**
üzerinden yapıp başlıkları diff'ledim. İki yeni bulgu (ikisi de **CF zone ayarı**):

- **H-01:** CF, HSTS `max-age`'i **eziyor** — origin `63072000` (2 yıl,
  `next.config.ts:36`) gönderirken edge `31536000` (1 yıl) gönderiyor. Preload
  asgarisi 1 yıl olduğundan **preload engellenmez**, ama config'in 2 yıllık politikası
  teslim edilmiyor → düşük etki, tutarsızlık. Düzeltme: CF'de HSTS'i kapat ya da
  `max-age=63072000` yap.
- **H-02:** CF **Browser Cache TTL** origin'in `max-age=0`'ını yükseltiyor —
  `/robots.txt` ve `/images/*` → 30 gün, `/sitemap.xml` → 1 saat. Tazelik riski;
  öneri: `Respect Existing Headers`.

Detay: `docs/cloudflare.md` → "Edge vs origin başlık karşılaştırması". Panel
değişikliği → sahibin onayında; kod değişmez. CSP/diğer güvenlik başlıkları
edge'de **birebir** korunuyor.

### Edge mikro-denetim tur 10 — HTTP semantiği / cache-key / kaçakçılık (2026-11-05)

Brief 3/4/5 + AUDIT sınır-girdi boyutları derinleştirildi; **yeni açık yok**.
Cache-key doğru (304 koşullu, 206 range, HEAD, sorgu-dizesi ve `Accept-Encoding`
ayrımı; RSC kişisel yanıtlar `DYNAMIC`+`private, no-store`). Özel rotalar **tüm
metodlarda** 307 `/login`; cacheable statiklere yazma 405. Sahte
`X-Forwarded-*`/`Forwarded` canonical'ı değiştirmiyor; absolute-form 403, `%00`
400, CRLF yansımıyor. `sqlmap` 403, diğer botlar 200. Önceki bulgular (H-01, H-02,
R-01, G-01) hâlâ açık. Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 10".

### Edge mikro-denetim tur 11 — `/_next/image` içerik eşlemesi (2026-11-05)

Görsel optimizasyon uç noktasını incelerken **A-01** bulundu: `/_next/image?url=<göreli
aynı-origin yol>` bazı rotaların **kendi içeriğini** döndürüyor (`/blog`,`/about`,
`/contact` → 200 `text/html`; `/api/build-info` → 200 JSON; `/llms.txt`,`/feed.xml`,
`/.well-known/security.txt` → 200 metin). Yalnız **göreli** yol tetikler (mutlak URL
→ 400). Oturum-gerektiren rotalar, WAF-bloklu yollar ve `/robots.txt`/`/sitemap.xml`
→ **400**. Yanıt katı CSP (`script-src 'none'; sandbox;`) + `nosniff` taşır; sır/PII
sızıntısı **yok** → **düşük etki**. Vercel alias'ında da aynı → **Vercel/Next** (CF
değil). Düzeltme `next.config.ts`'te → **`lane:guvenlik` handoff**. Optimizer
allowlist/parametre/sınır testleri temiz (A-02…A-09). Detay: `docs/cloudflare.md` →
"Edge mikro-denetim tur 11".

### Edge mikro-denetim tur 12 — negatif cache (2026-11-05)

Brief 3 kapsamında **404'lerin cache'lenmesi** tarandı; **N-01** bulundu:
`/_next/static/**` altındaki **var olmayan** dosyalar origin'de `max-age=0` iken
CF tarafından **1 yıl** (`max-age=31536000`) cache'leniyor (`MISS → HIT`). Yalnız
bu önek: `/images/**`, `/logos/**`, `/_next/**` (static dışı), `/_next/image/**`,
`/favicon*.ico` 404'leri cache'lenmiyor (`BYPASS`/`private, no-store`). Gerçek
chunk akışı etkilenmiyor (`immutable`+`HIT`). **Etki düşük** (hash'li chunk adları
yeniden kullanılmaz; gövde 9 B `Not Found`, sır yok). Düzeltme H-02 ile aynı:
Caching → Browser Cache TTL = **Respect Existing Headers** (sahibin onayı).
Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 12".

### Edge mikro-denetim tur 13 — `images.localPatterns` çift-kodlama (2026-11-06)

Tur 11'in **A-01**'i `next.config.ts` `images.localPatterns` ile düzeltilmişti;
düzeltme **eksik** çıktı (**A-01b**): matcher kodlanmış yolu görür, optimizer
içeriği çözer → `/images/%2e%2e/blog` tipi **çift-kodlama** allowlist'i atlayıp
`/blog`'a ulaşıyordu (tek-kodlama 400, çift-kodlama 200). Kaynak
`next.config.ts` + `tests/security/**` = **LANE-GÜVENLİK** → devredildi, issue
#356 açıldı. Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 13".

### Edge mikro-denetim tur 14 — #359 denetimi + WAF normalizasyon + SW-01 (2026-11-06)

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: #363 (merge edildi)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅ (671/671)
            test:db ✅ (CI)  test:e2e ✅ (4/4 shard)  build ✅ (CI standalone)
Canlıya dokundu mu: hayır (yalnızca okuma; canlı Supabase'e yazı yok, CF paneli değiştirilmedi)
Sahibin yapması gerekenler: #319 (deploy donması, LANE-INFRA) · CF paneli H-01/H-02/
            G-01/W-01 (hesap sahibi onayı). (SW-01 #364→#365 ile kapandı; A-01c deploy
            sonrası canlıda doğrulandı: 400.)
Sonraki lane için notlar: CF API token'sız zone-API denetimi yapılamıyor; canlı build
            ilerledikçe (/api/build-info) bu turdaki bulguların deploy durumu yeniden ölçülmeli.
```

**✅ Tur 14.1 (aynı gün): A-01b canlıda KAPANDI.** Canlı build `1d804b6`'ya
ilerledi (#359 deploy edildi); aynı 11 hedef PoC artık **hepsi 400**. Ayrıca
**SW-01 → #364 → PR #365** (LANE-GÜVENLİK) ile `next.config.ts`'e `/sw.js`
`no-cache` başlığı eklendi (henüz deploy edilmedi; deploy sonrası `/sw.js`
başlığı yeniden ölçülmeli).

**Tur 14 (deploy öncesi anlık görüntü) — A-01b o zaman canlıda açıktı:** PR #359
desenlere görsel uzantısı şartı getirdi
(`next.config.ts:79-82`) ve kod doğru, ama **deploy edilmedi** — canlı build
`ee58dad` (#359 öncesi). Canlı kanıt: `/_next/image?url=%2Fimages%2F%252e%252e%2Fblog`
→ **200 text/html** (`<title>…</title>`, 142 KB); tek-kodlama → 400. Sızan içerik
yalnız **herkese açık ön-render HTML** (`/blog`,`/about`,`/contact`,`/rehber`,
`/packages`,`/freelance`,`/sss`, `/blog/<slug>`); `/jobs`,`/companies`,`/api/*`,
`/login`,`/llms.txt` → 400. CSP `sandbox`+`script-src 'none'`, `DYNAMIC` → **etki
düşük** ama canlı↔main sapması var. Eylem: #359 build'i canlıya alınmalı (#319
donması). Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 14" (A-01c).

**Yeni bulgular:**
- **SW-01 (orta):** `/sw.js` origin'de `max-age=0` iken CF edge **30 gün**
  (`2628000`) cache'liyor → SW güncelleme yayılımı kırılgan (şu an `REVALIDATED`).
  H-02 (Browser Cache TTL) sınıfının aynısı; düzeltme = `Respect Existing Headers`.
  Repo-tarafı (`next.config.ts`) → **#364** → **#365** ile düzeltildi (`/sw.js`
  `no-cache`; deploy bekliyor).
- **W-01 (düşük):** WAF 4. kuralı kodlanmış yolda nokta-yolu kuralını atlıyor
  (`/.git%2fconfig`, `/api/devtools%2f` → CF geçip **Vercel origin** 404 döner;
  `x-vercel-id` kanıt). Origin'de `.git`/`/api/devtools` yok → sızıntı yok, ama
  normalizasyon farkı origin değişince risk.

**Drift:** H-01 (HSTS), H-02 (Browser Cache TTL), R-01 (noktalı apex), G-01 (email
obfuscation), N-01 (`_next/static` 404 cache), F-08 (alias CF'i atlıyor) hâlâ
açık. DNS/TLS/CAA/DNSSEC/SPF temiz; Resend DKIM **1024-bit**, DMARC `p=none`.
WAF yanlış pozitif yok (meşru rotalar + 6 dil 200). Detay: `docs/cloudflare.md`
→ "Edge mikro-denetim tur 14".

### Edge mikro-denetim tur 15 — açık issue'ların canlı doğrulaması (2026-11-06)

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (yalnızca okuma; CF paneli/DNS değiştirilmedi)
Sahibin yapması gerekenler: #163 Bing doğrulama (LANE-SEO/panel) · #170 SPF+DMARC · #227 DKIM 2048 (panel/DNS)
Sonraki lane için notlar: CF halkası #163 için hâlâ kopuk değil; kopuk halka Bing mülk doğrulaması.
```

Açık üç issue (#163, #170, #227) **canlı** yeniden ölçüldü — drift yok:
bot UA'ları (Googlebot/Bingbot/YandexBot/DuckDuckBot/AhrefsBot) hepsi **200**,
`cf-mitigated` yok; `sqlmap` **403**; kök SPF/DMARC/DKIM değişmemiş. **Yeni
kanıt:** Vercel alias'a `Host: isbulkktc.com` ile gidilince **421 Misdirected**
(F-08: alias CF zone'undan geçmiyor, kesinleşti). Detay: `docs/cloudflare.md`
→ "Edge mikro-denetim tur 15".

### Edge mikro-denetim tur 16 — SW-01 kapandı + tam drift taraması (2026-11-06)

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS değiştirilmedi)
Sahibin yapması gerekenler: H-01 (CF HSTS max-age) · H-02/N-01 (Browser Cache TTL
            = Respect Existing Headers) · G-01 (Email Obfuscation OFF) · R-01
            (Vercel host eşleştirme) · W-01 (WAF normalizasyon) · F-08 (Vercel
            Deployment Protection) · apex TXT'teki yinelenen google-site-verification
            token'ı panelde teyit · MTA-STS/TLS-RPT ekle (#170) · DKIM 2048 (#227)
Sonraki lane için notlar: canlı build ilerledikçe (/api/build-info) SW-01 gibi
            "deploy bekliyor" notlarını yeniden ölç; tur 16'da SW-01 kapandı.
```

**✅ Kapanan (SW-01).** `/sw.js` edge artık `no-cache, no-store, must-revalidate`
+ `BYPASS` (önceden `max-age=2628000` + `REVALIDATED`). #365 deploy edildi (canlı
`d154e44`). CF Browser Cache TTL ezişi `no-cache` origin başlığıyla etkisiz kaldı.

**Drift (canlı, 2026-11-06):** H-01, H-02, R-01, G-01, N-01, W-01, F-08 hâlâ
**açık**; A-01c **kapalı**; DKIM 1024-bit, DMARC `p=none`. Dinamik HTML hiç
edge-cache'lenmiyor (`DYNAMIC` + `private, no-store`), cacheable statikte yazma
405, CORS yalnız `/api/build-info`'da açık, `security.txt` var, CAA 5 issuer,
DNSSEC `AD=true`, WAF `sqlmap` → 403, bot UA'ları → 200.

**Yeni DNS gözlemi:** apex TXT **iki farklı `google-site-verification` token'ı**
taşıyor (`1zuidCsJ2…` + `7YbjG-3INgSrdkIKFG0inLGNgD0BX4P8mf1oIDtJehU`) —
hangisinin güncel olduğu panelden teyit edilmeli (silme yıkıcı → onay bekler).
`_mta-sts` / `_smtp._tls` **yok** (e-posta sertleştirme fırsatı, #170).

Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 16".

---

## Tur 17 (2026-11-06) — ölçüm doğruluğu düzeltmesi + yeni WAF boşluğu

**F-09/T-15 düzeltmesi.** "TLS 1.0/1.1 reddediliyor" kanıtı yanlıştı: `no
protocols available` **istemci-taraflı** (sandbox OpenSSL 1.0/1.1'i derlemiyor).
Bağımsız doğrulama: **SSL Labs API → 4/4 endpoint `A+`, yalnız TLS 1.2+1.3**.
Sonuç doğru, dayanak artık SSL Labs. Negatif iddiayı istemcinin desteklemediği
protokolle kanıtlamayın.

**V-01 (yeni, düşük).** WAF yüzde-kodlamasız tarayıcı yollarını kaçırıyor:
`/config.php`, `/shell.php`, `/actuator/env`, `/server-status`, `/actuator`,
`/phpinfo.php`, `/info.php`, `/settings.py`, `/Dockerfile` → **404 origin** (CF
403 değil). Sızıntı/cache yok (`DYNAMIC`, `private, no-store`). Etki düşük ama
tarayıcı trafiği Vercel edge'ine ulaşıyor (WAF yok). W-01 paketiyle birlikte
desen genişletilmeli — yıkıcı CF değişikliği, **sahibin onayı**.

**Tur 17'de temiz doğrulananlar:** WAF pozitif (17 yol: 12 tr rotası + 5 dil öneki; yanlış pozitif
yok), bot UA'ları 200, yönlendirme zinciri (www 308, http 301, sorgu korunuyor,
`http://www`→2 hop), açık-yönlendirme denemeleri hep apex'te kalıyor, HTTP/3
(`alt-svc: h3`), güvenlik başlıkları tam, mixed content yok, `security.txt`
`Expires 2027-09-02`, DNSSEC `AD=true`, CAA 10 kayıt, CF Email Routing DKIM
`cf2024-1._domainkey` **2048-bit**. HSTS preload hâlâ `pending`.

**Rate-limit (brief 6):** `/login` 20/20 → 200; CF katmanında görünür limit yok.
`/api/email/unsubscribe` POST → 405. Tek `http_ratelimit` kuralının auth
brute-force'a tahsisi önerisi sahibin onayını bekliyor.

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01, V-01, F-08.

Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 17".

---

## Tur 18 (2026-11-06) — DNS kapsam taraması + doküman doğruluk düzeltmeleri

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS değiştirilmedi)
Sahibin yapması gerekenler: H-01 (CF HSTS max-age) · H-02/N-01 (Browser Cache TTL
            = Respect Existing Headers) · G-01 (Email Obfuscation OFF) · R-01
            (Vercel host eşleştirme) · W-01 + V-20 (WAF ifadesini genişlet) ·
            F-08 (Vercel Deployment Protection) · apex TXT yinelenen
            google-site-verification teyidi · MTA-STS/TLS-RPT (#170) · DKIM 2048 (#227)
Sonraki lane için notlar: "tüm kayıtlarda AD=true" gibi kapsam iddialarını tek tek
            ad üzerinden doğrula; CNAME zinciri imzasız bir bölgeye (rmta.net) gidiyorsa
            AD=false döner. Bulgu kimliklerini (V-*) çakıştırmadan ver.
```

**Bu tur ne buldu.** Brief 1–7 yeniden ölçüldü; odak **DNS kayıt-seti genişliği**
ve **kendi dokümanlarımın canlı kanıta uygunluğu** oldu. Üç doküman kusuru
kanıtla düzeltildi:

- **D-01 (doğruluk):** F-13/T-23/U-11/V-12 "DNSSEC `AD=true`" iddiası **tüm**
  kayıtlar için geçerli değil. `rsend.isbulkktc.com` bir **CNAME** →
  `send.forge.rmta.net`; uç bölge **`rmta.net` DS yok → imzasız**, `AD=false`
  (CF DoH + Google DoH teyit). Apex + `www` + `send` + `_dmarc` + DKIM +
  `mta-sts` + `autodiscover` hepsi `AD=true`. Kapsam iddiası düzeltildi.
  `TXT`/`MX`'te görünen CNAME+hedef kayıtlar **co-location değil** (RFC 2181
  §10.1 ihlali yok) — CNAME zinciri çözülüyor; ayrı doğrulandı.
- **D-02 (doğruluk):** F-15/T-02 `/_next/static/*` için "`vary: accept-encoding`"
  diyordu; edge'de bu yolda `Vary` **yok** (gerçek hash'li chunk + font
  ölçüldü). Düzeltildi.
- **D-03 (tutarlılık):** İki farklı bulgu aynı `V-01` kimliğini taşıyordu
  (tur 15 bot-UA ve tur 17 WAF-boşluğu). tur 15 → `V-19`, tur 17 → `V-20`.

**Temiz doğrulananlar:** 32 subdomain (yalnız `www`; takeover yüzeyi yok), SPF
include-ağacı 2 lookup (limit 10), CAA 10 kayıt, WAF poz (22+6 dil) / neg (21),
cache zehirlenmesi ve cache-deception temiz, metod allowlist, A-01c kapalı,
bot UA'ları 200, yönlendirme/açık-yönlendirme temiz, TLS A+ 4/4, HSTS preload
`pending`, `security.txt` tam, sitemap tek host.

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08.
Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 18".

### Edge mikro-denetim (tur 19) — TLS/cipher derinliği + prerender cache (2026-11-06)

Salt-okuma. Canlı build `7b0f7170`. SSL Labs tam analiz + HTTP/3 + cache başlık
taraması.

- **D-04 (doğruluk):** `docs/cloudflare.md:490` (T-07) hâlâ "TLS 1.0/1.1
  **reddedilir**" diyordu — tur 17'de F-09/T-15 için düzeltilen istemci-taraflı
  kanıt T-07'de kalmıştı. SSL Labs kanıtıyla düzeltildi.
- **D-05 (doğruluk):** F-14 "tüm dinamik HTML `private, no-store`" iddiası
  eksikti; **prerender** rotalar `public, max-age=0` döner. Düzeltildi.
- **P-01 (bilgi/orta):** `/blog`, `/contact`, `/freelance`, `/about`, `/privacy`,
  `/terms` → `cache-control: public, max-age=0, must-revalidate` **+**
  `set-cookie: NEXT_LOCALE=…`; `Vary`'da `Cookie` yok. Şimdilik zararsız (CF
  `DYNAMIC` + CF HTML'i yeniden yazıyor → gövde deterministik değil; Vercel
  cache'i cookie-ayrımlı; `must-revalidate`). HTML cache kuralı değişirse
  dil-içeriği sızma riski → **LANE-GÜVENLİK'e handoff** (`next.config.ts`).

**Yeni temiz doğrulananlar:** SSL Labs 4/4 `A+` `isExceptional`, yalnız TLS
1.2/1.3, **ECDSA** sertifika (`SHA384withECDSA`), forward secrecy 4, AEAD açık,
RC4/compression/ticketbleed/heartbleed yok, secure renegotiation, PQC named
group `X25519MLKEM768` (canlı `kex=X25519MLKEM768`), HTTP/3 `--http3` → 200,
ALPN `h2/http1.1`, HSTS preload hâlâ `pending`, OCSP stapling yok (Free'de
beklenen).

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08.
Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 19".

---

## Tur 20 (2026-11-06) — HSTS preload hazırlığı + CNAME hedef çözünürlüğü

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS değiştirilmedi)
Sahibin yapması gerekenler: H-01 (CF HSTS max-age) · H-02/N-01 (Browser Cache TTL
            = Respect Existing Headers) · G-01 (Email Obfuscation OFF) · R-01
            (Vercel host eşleştirme) · W-01 + V-20 (WAF ifadesini genişlet) ·
            F-08 (Vercel Deployment Protection) · apex TXT yinelenen
            google-site-verification teyidi · HSTS preload (W-20-4) · MTA-STS/
            TLS-RPT (#170) · DKIM 2048 (#227)
Sonraki lane için notlar: bir CNAME'in "dangling değil" kanıtı hedefin KENDİ
            A/AAAA'sı olmalı — MX hedefinin A'sını delil göstermek yanlış (D-06).
            HSTS preload eligibility için includeSubDomains altındaki her ismi
            HTTPS açısından tek tek ölç.
```

**Bu tur ne buldu.** İki eksen: (1) HSTS preload **hazırlığı** — `includeSubDomains`
altındaki her isim HTTPS sunmalı; (2) `rsend` CNAME hedefinin **kendi** adres
kaydı. Bulgular:

- **D-06 (doğruluk):** T-22/W-18-5 "`rsend`→`send.forge.rmta.net` çözülüyor →
  dangling değil" iddiası **yanlış kanıt** taşıyordu. Hedefte **A/AAAA yok**;
  delil gösterilen `3.231.87.173` MX hedefi `feedback.forge.rmta.net`'in adresi.
  CNAME hedefi adreslenemiyor (subdomain-devralma riski yok — hedef sağlayıcının
  imzasız bölgesi, adres yayınlamıyor). Üç yerde düzeltildi.
- **W-20-4 (bilgi/düşük):** `includeSubDomains` altında `send`, `rsend`,
  `autodiscover`, `mta-sts` **HTTPS sunmuyor** (mail-only, A/AAAA yok) → HSTS
  preload denetiminde `pending`'i açıklayabilecek tek bulgu. Bugün kırılma yok
  (bu isimler tarayıcı trafiği almıyor).

**Temiz doğrulananlar:** apex+`www` HSTS `max-age=31536000; includeSubDomains;
preload`; `www` 308→apex (SAN kapsıyor); `http://www` 301→`https://www`→apex
(yol+sorgu korunur); apex/`www` AAAA CF; HTTP/3 200 + `kex=X25519MLKEM768`;
güvenlik başlıkları tam; `/_next/static` immutable+HIT; root MX Cloudflare Email
Routing; WAF negatif 5/5→403, V-20 boşluğu 404 origin; bot UA 200 / `sqlmap` 403;
meşru rotalar + 6 dil 200.

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08.
Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 20".

---

## Tur 21 (2026-11-06) — yeniden ölçüm + G-01 derinleştirme + `/robots.txt` `Vary`

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF değiştirilmedi)
Sahibin yapması gerekenler: H-01 (CF HSTS max-age) · H-02/N-01 (Browser Cache TTL
            = Respect Existing Headers) · G-01 (Email Obfuscation OFF) · R-01
            (Vercel host eşleştirme) · W-01 + V-20 (WAF ifadesini genişlet) ·
            F-08 (Vercel Deployment Protection) · apex TXT yinelenen
            google-site-verification teyidi · HSTS preload · MTA-STS/TLS-RPT
            (#170) · DKIM 2048 (#227)
Sonraki lane için notlar: bir başlığın "var/yok" iddiasını varlık tipine göre
            ayır (Vary: metin vs font); Vary'yi cache-bust ile de doğrula (edge
            ekliyor, origin değil); obfuscation'ın etkisini görünür linkle sınırlı
            sanma — JSON-LD/RSC payload'ı da tara.
```

**Bu tur ne buldu.** Üç eksen: (1) `Vary` iddiasının varlık tipine göre yeniden
ölçümü; (2) `/robots.txt` vs `/sitemap.xml` `Vary` ayrımı; (3) G-01
(Email Obfuscation) etkisinin ham HTML üzerinden derinleştirilmesi. Bulgular:

- **D-07 (doğruluk):** F-15/T-02 "edge'de `Vary` yok" iddiası fazla genellemeydi.
  Edge `*.css`/`*.js`'te `vary: accept-encoding` **ekler**, `*.woff2`'te eklemez.
  Düzeltildi (gözlenen bozulma yok; kanıt hizalaması).
- **D-08 (doğruluk):** T-01 "`/robots.txt` ve `/sitemap.xml` `Vary:
  accept-encoding` var" yanlıştı. `/sitemap.xml` döner, `/robots.txt` **dönmez**
  (10/10 örnek + `?cb=` cache-bust). Kodlama yine de doğru (identity düz, gzip
  açılıyor). Düzeltildi + izleme notu.
- **G-01 derinleştirme (bilgi/orta):** `info@isbulkktc.com` tek yanıtta **7×**
  düz (2× JSON-LD + 3× RSC payload + görünür span). Obfuscation yalnız görünür
  `mailto:`'u sarıyor → kazınabilir, pratik etki ~sıfır. Öneri değişmedi (OFF).

**Temiz doğrulananlar:** WAF neg (SQLi/XSS/LFI/RCE/SSRF/Log4Shell) güvenli
404/405, VCS/dotfile 403; WAF poz 6 dil × 6 rota 200 (yanlış poz yok);
`CF-Connecting-IP` spoof → 403 `error code: 1000`; `XFF`/`True-Client-IP`/
`X-Real-IP` spoof → 200 yansımasız; CL+TE 200, yinelenen CL 400, CONNECT 400;
`%0d%0a` yansımasız; `X-Forwarded-*` canonical'ı değiştirmiyor; `If-None-Match`
304, `Range` 200; negatif cache `MISS→HIT` (N-01); `/cdn-cgi/trace` ORD/TLS1.3;
HSTS preload `pending`; DKIM `cf2024-1` 2048 / `resend` 1024; mail DNS kayıtları;
OG `og-cover.webp` 1200×630, unicode varlık yolları 200.

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08.
Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 21".
