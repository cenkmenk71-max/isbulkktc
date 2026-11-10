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

## Tur 22 özeti (2026-11-06)

Salt-okuma. Canlı build `3f5a654` = `main` HEAD (drift yok).

- **P-01 KAPANDI** (#403, `lane:guvenlik`): prerender rotalar (`/blog`,`/contact`,
  `/freelance`,`/about`,`/privacy`,`/terms` + dil önekleri) artık
  `private, no-cache, no-store, max-age=0, must-revalidate`; `public, max-age=0`
  kalmadı. F-14 satırı güncellendi.
- **D-10 (düzeltme):** tur 21 D-07'nin "edge `Vary` ekler" gözlemi doğru ama
  `Vary` **yalnız GET'te** görünür; `curl -I` (HEAD) cache HIT'te göstermez →
  ölçüm yöntemi notu eklendi (F-15'e çapraz referans).
- **D-11 (düzeltme):** G-01 adres bağlamları tek tek sayıldı (2× JSON-LD, 1×
  `contactEmail`, 2× RSC JSON-LD kopyası, `mailto:` href, footer değeri = 7×);
  önceki "2+5" toplu ifadesi netleştirildi. Öneri değişmedi: Email Obfuscation OFF.
- **SR-01 (yeni, bilgi):** CF Speed Brain `speculation-rules:
  "/cdn-cgi/speculation"` tüm HTML yanıtlarında enjekte ediliyor (origin'de yok);
  `eagerness: conservative`, `prefetch`. Panel önerisi: kullanılmıyorsa kapat.
- **Yeniden doğrulanan (temiz):** WAF negatif 11/12×403 (+`/.env%2f`403), pozitif
  yanlış-pozitif yok; metodlar TRACE 405/TRACK 403/CONNECT 400; smuggling CL+TE
  400 (GET+POST), çift CL 400; başlık sahteleme CF-Connecting-IP 403/`error 1000`,
  `Host: evil.com` 403, absolute-form 403; yönlendirmeler 301/308 zincirsiz;
  trailing-dot R-01 teyit; cache-deception 404 `no-store`; N-01 teyit; A-01c
  kapalı (400); bot UA sqlmap 403 / iyi botlar 200; HTTP/3 200; DNS (DMARC
  `p=none`, DKIM 2048/1024, `_mta-sts` yok, DNSSEC apex AD=true) — hepsi değişmedi.
- **Brief ile çelişki:** "her yolda `cf-mitigated: challenge`" gözlemi bu sandbox
  egress'inden (GCP) **yeniden üretilemedi** (0 challenge); panel/gerçek GH-runner
  teyidi gerekir → "Bakılmayan" notu.

**Açık kalan (tur 22 sonrası):** H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08,
**SR-01 (yeni)**. Detay: `docs/cloudflare.md` → "Edge mikro-denetim tur 22".

---

## Tur 23 (2026-11-06) — rate-limit iddiasının çürütülmesi (D-12)

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF değiştirilmedi)
Sahibin yapması gerekenler: H-01 (CF HSTS max-age) · H-02/N-01 (Browser Cache TTL
            = Respect Existing Headers) · G-01 (Email Obfuscation OFF) · R-01
            (Vercel host eşleştirme) · W-01 + V-20 (WAF ifadesini genişlet) ·
            F-08 (Vercel Deployment Protection) · HSTS preload · MTA-STS/TLS-RPT
            (#170) · DKIM 2048 (#227). **F-26 kuralı kalktı — aksiyon gerekmez.**
Sonraki lane için notlar: bir throttle/eşik iddiasını **her zaman ilgili metodun
            kendisiyle** ölç (GET'e bakıp "limit yok" deme); CF'siz alias
            kontrolü limitin sahibini (CF mi origin mi) kesinleştirir.
```

**Bu tur ne buldu.** Brief 6. maddesinin dayanağı olan "CF'de rate limit yok"
ölçümü **çürütüldü**. Önceki turlar `GET /login` (ve `curl -I`) ile ölçmüştü; CF
limiti **metod-duyarlı**:

- **D-12 (doğruluk, orta):** `POST /login` hızlı serisi ~**10** istekte **429**
  (`error code: 1015`, `retry-after: 10`, `server: cloudflare`). Kova
  `/login`+`/register`+`/forgot-password`+`/reset-password` arasında **paylaşımlı**;
  `GET /login` ve `POST /` limite **girmez**; CF'siz alias aynı seride **12/12 200**
  → limit **CF'nin**. Yani **auth brute-force edge'de korumalı** ve "tek
  `http_ratelimit` kuralını auth'a tahsis et" önerisinin premise'i **yanlıştı**.
- **Kalan (düşük):** limit yalnız POST'ta; GET tabanlı hesap-numaralandırma açık
  (brute-force değil, keşif). Eşik ~10/~10 sn — makul.

Doküman doğruluğu: **F-26**, "Onay bekleyen" 1. madde, **T-20**, **W-18-21** ve
tur 19 "Rate-limit gözlemi" düzeltildi.

**Temiz doğrulananlar:** WAF pozitif 403 / gap 404; cache (`robots.txt` vary yok,
`sitemap.xml` vary var); N-01; R-01; G-01; SR-01; F-08; `cf-mitigated` yok.

**Açık kalan:** H-01, H-02, N-01, R-01, G-01, W-01/V-20, F-08, SR-01.
**Kapandı:** F-26. Canlı build `main`'in 3 commit gerisinde (#319). Detay:
`docs/cloudflare.md` → "Edge mikro-denetim tur 23".

## Tur 24 (2026-11-06) — teslim/sıkıştırma/cache-key + challenge sahibi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF değiştirilmedi)
```

**Bu tur ne buldu (hepsi canlı `curl`/DoH kanıtlı, `docs/cloudflare.md` → "tur 24"):**

- **D-13 (bilgi):** apex HTML'de görülen "çift `link:`" bir bug değil — HTTP/2'de
  CF `103 Early Hints` ekliyor (origin'de yok), `Link` kümesi `200`'le birebir
  aynı. `curl -D -` iki bloğu basınca çift sanılır. **Ölçüm tuzağı.**
- **D-16 (bilgi):** sıkıştırma istemciye göre (`br`/`gzip`/**`zstd`**/`identity`),
  `vary: accept-encoding` ile anahtarlı; cache-key encoding-duyarlı.
- **D-14 (orta — F-08 nüansı):** Vercel alias'ın **kendi** Security Checkpoint'i
  var; tetikleyici **hacim değil saldırı-yolu taraması** (25× `GET /` → 200,
  ardından tek bir hassas-yol serisi → `x-vercel-mitigated: challenge`,
  `retry-after: 30`). Challenge **IP'ye özel** (temiz egress → 200) ve tetikleyen
  IP'de **≥6 dk** kalıcı. "Alias tamamen korumasız" **fazla iddialıydı**.
- **D-15 (teyit):** `#163` CF halkası **kopuk değil** — Googlebot/bingbot/
  YandexBot/DuckDuckBot/GPTBot/ClaudeBot hepsi 200, `cf-mitigated` yok,
  30× hızlı `GET /` 30/30 200, yalnız `sqlmap` 403. Kök neden CF değil.
- **D-17 (bilgi):** case-insensitive rotalar (`/JOBS` → 200, canonical doğru);
  `NEXT_LOCALE=de` çerezi `<html lang>`'i **değiştirmiyor** (localeDetection
  kapalı), yalnız `__cf_email__`/challenge token'ı değişiyor.
- **D-18 (orta — #227/#170, `lane:cloudflare`):** DKIM `resend._domainkey` canlı
  **1024-bit** (2048 olmalı), `cf2024-1` 2048; SPF `send.isbulkktc.com`
  `amazonses` içeriyor → **#170'in "SPF fail" iddiası zarf alanına bağlı,
  ölçülmeden kabul edilmemeli** (Authentication-Results gerekir).

**Düzeltilen (doküman doğruluğu):** F-08 şiddeti düştü (alias'ın kendi katmanı
var); tur 23'ün "her hassas yol alias'ta 404" notu yanlıştı (bazıları Vercel
403'ü); "challenge dakikalar içinde söner" iddiası ≥6 dk kalıcı olduğu için
düzeltildi.

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01/V-20, F-08, SR-01.
**Kapandı:** yok (bilgi + nüans turu).

**Sonraki lane için notlar:** (1) `curl -D -` çıktısındaki çift başlığı `103`'e
karşı ayıkla (`--http2 -v` + `grep '^< HTTP'`); (2) bir egress'ten alınan
challenge'ı "site geneli" sanma — temiz egress ile çapraz doğrula; (3) SPF/DKIM
"fail" iddiasını zarf alanı + `Authentication-Results` olmadan doğrulama.

## Tur 25 (2026-11-06) — origin başlık sahipliği + yöntem semantiği + preload blocker düzeltmesi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: #423 (tur 25) — MERGED
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅ (729/727/0)
                          CI: Static ✅  Database ✅  4×E2E ✅  aggregator ✅  (yalnız Vercel: #319 rate limit)
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF değiştirilmedi)
Sahibin yapması gerekenler: (1) CF panelde H-01 edge HSTS max-age'i origin (2 yıl) ile hizala;
  (2) H-02 Browser Cache TTL; (3) R-01 trailing-dot apex; (4) G-01 Email Obfuscation OFF;
  (5) W-01 %2f normalizasyon; (6) V-20 tarayıcı-yolu WAF kuralı; (7) F-08 Vercel alias'ı kapat;
  (8) #227 Resend DKIM'i 2048-bit'e çevir.
```

**Bu tur ne buldu (hepsi canlı `curl`/DoH kanıtlı, `docs/cloudflare.md` → "tur 25"):**

- **M-01 (düşük — #424, LANE-GÜVENLİK):** `/api/build-info` `force-static`
  olduğu için Vercel statik katmanı `access-control-allow-origin: *` ekliyor →
  canlı commit SHA herhangi bir origin'den `fetch()` ile okunabilir. Aynı ACAO
  `/robots.txt`, `/sitemap.xml`, `/_next/static/*`'te var; **HTML ve dinamik
  API'de yok**. `next.config.ts` ile ilgisi yok — atıf düzeltildi.
- **M-02 (düşük — #424):** sayfa rotaları `PUT/DELETE/PATCH` → **200** (tam HTML);
  `/api/*` doğru şekilde **405**. Origin (Vercel alias) da aynı → repo-tarafı.
- **M-03/M-04 (düşük — #424):** API hata yolları (405/400/404) ve
  `/_next/static/<yok>` 404'ü `public, max-age=0|31536000, must-revalidate`
  alıyor → `no-store` olmalı. CF bugün `DYNAMIC`/`BYPASS` tuttuğu için
  sömürülemez; Cache Rule eklenirse N-01 sınıfı yinelenir.
- **M-05 (bilgi):** `/profile/dashboard` 307'si **iki özdeş** `NEXT_LOCALE`
  çerezi yazıyor (deterministik); işlevsel etki yok.
- **M-06 (doğruluk düzeltmesi):** tur 20'nin W-20-4 "mail-only isimler preload'u
  takar" çıkarımı **geçersiz** — hstspreload.org yalnız **kaydı olan** alt alanı
  denetler; `send`/`rsend` yalnız MX/TXT/CNAME, `mail`/`smtp`/`cdn` hiç kayıt
  yok. Dört preload şartı da canlı karşılanıyor → `pending` = kuyruk, engel değil.

**Teyit edilen (kapanan yok):** F-07 CAA eksik değil (10 kayıt, LE `YE2` uyumlu);
`#163` CF halkası yine kopuk değil (Googlebot/bingbot 200); gerçek statik varlık
`immutable` + `HIT`; canlı build `00c665b` (`main` 1 commit geride — teslimat).

**Açık kalan (değişmedi):** H-01, H-02, N-01, R-01, G-01, W-01, V-20, F-08.
**Kapandı:** W-20-4 (geçersiz çıktı — M-06). **Yeni açık:** M-01..M-04 → **#424**.
**Devir:** M-01..M-04 `lane:guvenlik` + `agent:handoff` ile **#424** açıldı.

**Sonraki lane için notlar:** (1) origin başlıklarını "CF mi, Vercel mi, config
mi" diye **sahiplendir** — statik katman (Vercel) ACAO ekler, config eklemez;
(2) `PUT/DELETE` ile sayfa rotasını dene, 200 beklenmezse origin davranışını
alias'tan çapraz doğrula; (3) preload "engeli" iddiasını yalnız **DNS kaydı olan**
alt alan üzerinden kur.

## Tur 26 (2026-11-06) — WAF `%2F` izolasyonu + H-01'in imkânsızlığı + nokta-noktasına denetim

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: #438 (tur 26)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF değiştirilmedi)
Sahibin yapması gerekenler: (1) N-11 WAF ifadesini url_decode ile kur (yıkıcı → onay);
  (2) H-01r HSTS politika kararı (1–12 ay tavanı); (3) H-02 Browser Cache TTL;
  (4) R-01 trailing-dot apex; (5) G-01 Email Obfuscation OFF; (6) F-08 Vercel alias kapat;
  (7) #227 Resend DKIM 2048-bit.
Sonraki lane için notlar: (1) WAF boşluğunu "kodlanmış yol" diye bırakma — kodlamayı izole et
  (burada tek kaçan %2F); (2) "Normalize incoming URLs'ı aç" bu boşluğu KAPATMAZ (RFC 3986
  rezerve / çözülmez); (3) CF HSTS max-age'i 1–12 ay ile sınırlı → origin'in 2 yılını
  "hizalama" önerisi geçersiz.
```

**Bu tur ne buldu (hepsi canlı `curl`/DoH/SSL Labs kanıtlı, `docs/cloudflare.md` → "tur 26"):**

- **N-11 (orta — yeni, izolasyon):** tur 14'ten beri "kodlanmış yol" denen WAF
  boşluğu **yalnız `%2F`** ile açılıyor. `%2E`/`%2D`/harf-kodlaması, çift-kodlama,
  ters bölü, `//`, nokta-segmentleri ve case **hepsi doğru yakalanıyor**; kaçan tek
  varyant eğik çizginin `%2F`'si. **Tur 27 düzeltmesi:** kaçış "üç kategoride de"
  değil, yalnız **literalinde `/` olan** kurallarda (VCS `/.git/`, `/api/devtools/`)
  geçerli; `/wp-admin`, `/phpmyadmin`, `.env` (literalinde `/` yok) **bloklu kalır**.
  Origin'e ulaşma `x-vercel-id`+`DYNAMIC` ile ispatlı (CF 403 sayfası değil).
  **Düzeltme:** ifadeyi `url_decode(http.request.uri.path)` (veya `raw.`) üzerinden
  kur. **Yıkıcı → sahibin onayı.**
- **N-12 (bilgi — öneri düzeltmesi):** "Normalize incoming URLs'ı aç" bu boşluğu
  **kapatmaz** — CF'nin RFC 3986 normalizasyonu rezerve `/`'yi **çözmez**, `%2F`
  normalizasyondan sonra da `%2F`'dir. Doğru çözüm ifade, ayar değil.
- **N-13 (düşük — repo):** `/api%2F*` yolları origin'de **500** (Next.js
  rotalayamıyor; `qr`/`push`/`unsubscribe`), `build-info` 200. Origin alias da aynı
  → CF değil. Sızıntı yok (jenerik `/500` gövdesi). Sahip: `src/app/api/**`.
- **N-14 (bilgi):** `robots.txt` `Disallow: /api/` `%2F`'yi tutmuyor; robots
  güvenlik kontrolü değil → aksiyon yok.
- **H-01r (düzeltme — orta):** tur 9'un "H-01: CF edge HSTS'i origin'in 2 yılına
  hizala" önerisi **imkânsız** — CF HSTS `Max Age Header` **1–12 ay** ile sınırlı
  (resmî doküman); `63072000` panelde girilemez. H-01 "açık bulgu" değil,
  **politika kararı** (origin'i 12 aya indir / CF HSTS'i kapat / bırak).
- **N-15 (devir):** `AGENTS.md:82-83` "`tr` sunulan URL'de ön-ekli" ↔ canlı
  `/tr/jobs` → **308** ön-eksiz. `robots.txt` doğru (yalnız varsayılan-olmayan
  diller listeli). AGENTS.md bu lane'in değil → devir **#437** (`lane:infra` + `agent:handoff`).

**Teyit edilen (temiz):** SSL Labs **`A+`** 4/4, yalnız TLS 1.2+1.3; `http://` → 301;
apex+`www` CF anycast + `www` → 308 apex; WAF saldırı **12/12 → 403**, meşru
**18/18 → 200**, `sqlmap` 403; güvenlik başlıkları edge=origin **birebir** (tek
fark HSTS); `alt-svc: h3`; dinamik HTML hiç cache'lenmiyor.

**Açık (değişmedi):** H-02, N-11 (eski W-01/V-20), R-01, G-01, F-08, SR-01.
**Düzeltildi:** H-01 → H-01r (imkânsız öneri, politika kararına çevrildi).
**Yeni açık:** N-11, N-13. **Devir:** N-15 → `lane:infra` (issue **#437**); N-13 → `src/app/api/**`.

**Sonraki lane için notlar:** (1) WAF boşluğunu "kodlanmış yol" diye bırakma,
kodlamayı **tek tek** izole et (burada tek kaçan `%2F`); (2) "Normalize incoming
URLs'ı aç" önerisini **test etmeden** yazma — RFC 3986 rezerve `/`'yi çözmez;
(3) CF panel tavanlarını (HSTS `max-age` 1–12 ay) resmî dokümandan doğrula,
yoksa "hizala" önerisi imkânsız çıkar.

### Edge mikro-denetim tur 27 — `%2F` mekanizması + kural-bazlı WAF asimetrisi (2026-11-06)

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: #440
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
            (CI: Static/Database/E2E — PR açılışında)
Canlıya dokundu mu: hayır (read-only; CF paneli/DNS/cache/WAF değiştirilmedi)
Sahibin yapması gerekenler: N-11r (WAF kurallarını `url_decode` üzerinden kur, onay) ·
            H-01r (HSTS 1–12 ay tavanı; preload `pending` → "kapat" riskli) ·
            H-02 (Browser Cache TTL) · R-01 · G-01 · F-08 · #227 (DKIM 2048)
Sonraki lane için notlar: (1) `%2F` kaçışı kurala bağlı — kuralın literalinde `/`
            varsa atlanır, yoksa (`wp-admin`) bloklu kalır; "hepsi" deme, matrisi ölç.
            (2) `Normalize incoming URLs` bu boşluğu KAPATMAZ (rezerve `/` çözülmez) —
            tek düzeltme ifadede `url_decode`. (3) Tur 26'nın "üç kategori de" özeti
            fazla genişti → düzeltildi. (4) #163 CF halkası TEMİZ; kopuk halka
            LANE-SEO'da (#173). (5) Preload `pending` iken HSTS `max-age` 12 ayın
            altına inmemeli. (6) Bulgu kimliği şeması `docs/cloudflare.md` →
            "Bulgu kimliği şeması"; yeni bulgudan önce aralığı `grep` ile doğrula
            (`N-11..N-16` tur 26/27 WAF kümesi için ayrıldı, `N-01..N-08` negatif-cache).
```

**Ne ölçüldü (tur 27).**

- **N-11r (mekanizma, orta):** CF WAF'tan önce **yalnız unreserved** karakterleri
  çözer (`%2E`→`.`) — **rezerve `/` (`%2F`) çözülmez**; origin ise çözer. Kesin
  kanıt: `/api/build-info` ve `/api%2Fbuild-info` ikisi de **200, aynı 80 B JSON**;
  `/api%252Fbuild-info` → 404.
- **Kural-bazlı asimetri:** `/api/devtools/` ve `/.git/` (literalinde `/`) `%2F` ile
  **atlanıyor** (`x-vercel-id` dolu, 404 origin); `/wp-admin`, `/phpmyadmin`, `.env`
  (literalinde `/` yok) **403 CF'te kalıyor**. Tur 26'nın "üç kategori de" iddiası
  **düzeltildi**.
- **N-16:** Sınıf adı **"`/`-içeren literaller"**; `%09`/`;` gibi kodlu ayraçlar
  kuralı bozmuyor (`/api/devtools/x%09x` → 403).
- **N-13r:** `%2F` API yolları origin'de 500 (`/api/qr`, `/api/push/subscriptions`,
  `/api/email/unsubscribe`); `/api%2Fbuild-info` 200. CF değil, `src/app/api/**` (devir **#441**).
- **Kapalı kayıt — #163 CF halkası TEMİZ:** Googlebot/bingbot/YandexBot 200,
  `cf-mitigated` yok; 207 `<loc>` hepsi apex host'ta; `google-site-verification`
  gerçek sayfalarda var; robots yalnız `/api/`+`/auth/`+varsayılan-olmayan diller.
  Kopuk halka **LANE-SEO**'da ve zaten açık: Bing artefaktı yok → **#173**.
- **Kapalı kayıt — TLS/CAA/DNSSEC:** sertifika **Let's Encrypt** (apex CAA ile
  uyumlu); **DNSSEC `AD=true`**; `www` CAA ayrı kaydı yok ama **RFC 8659** gereği
  apex kapsar; **HSTS preload `pending`**.
- **Cache:** `%2F` yolları ve cache-deception varyantları `DYNAMIC`/`BYPASS`,
  `private` → poisoning yüzeyi yok. **H-02** başlıkları sabit.

**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01.
**Devir:** N-15 → **#437** (açık); N-13 → **#441** (`lane:infra`+`agent:handoff`, açık).

## Tur 28 (2026-11-09) — bulgu kimliği çakışmasının kapatılması + SR-01r

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Çalıştırılan kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅ (886 pass, 2 todo)
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF değiştirilmedi)
Sahibin yapması gerekenler: N-11r (WAF `/`-literallerini `url_decode` üzerinden kur, onay) ·
            H-01r (HSTS politika kararı) · H-02 (Browser Cache TTL = Respect Existing Headers) ·
            R-01 (trailing-dot apex) · G-01 (Email Obfuscation OFF) · F-08 (Vercel alias kapat) ·
            #227 (Resend DKIM 2048-bit)
Sonraki lane için notlar: (1) Bulgu kimliği şeması `docs/cloudflare.md` → "Bulgu kimliği şeması";
            yeni bulgudan önce aralığı `grep` ile doğrula. (2) `N-01..N-08` negatif-cache'e,
            `N-11..N-16` WAF `%2F` kümesine aittir — ikisi karıştırılmasın.
```

**Bu tur ne düzeltti (hepsi `docs/cloudflare.md`'de kanıtlı):**

- **D-19 (doküman doğruluğu — kimlik çakışması):** tur 26/27 WAF bulguları
  `N-01..N-06` kimlikleriyle yazılmıştı, ama `N-01..N-08` aralığı **zaten**
  tur 12–25 **negatif-cache** bulgularına aitti (`N-01` = `/_next/static` 404'ünün
  1 yıl cache'lenmesi). Aynı kimlik iki bulguya işaret ediyordu → WAF `%2F` kümesi
  **`N-11..N-16`** (+`N-11r`, `N-13r`) olarak yeniden numaralandı. `grep -nE 'N-0[1-6]'
  origin/main -- docs/cloudflare.md` ile çakışma doğrulandı.
- **D-20 (kapsam daraltma):** tur 26'nın "üç kategoride de (VCS, dotfile,
  CMS/api-devtools) atlanıyor" özeti **fazla genişti**; kaçış yalnız **literalinde
  `/` olan** kurallarda (`/.git/`, `/api/devtools/`). `wp-admin`/`phpmyadmin`/`.env`
  bloklu kalır (tur 27 matrisi). Özet buna göre düzeltildi.
- **SR-01r (canlı teyit — bu turda yeniden ölçüldü):** `speculation-rules` başlığı
  **her içerik tipinde** ve **hata yanıtlarında** geliyor — önceki "yalnız HTML
  yanıtlarında" iddiası **yanlıştı** ve düzeltildi. Kanıt (canlı `curl -I`):
  `/robots.txt` `text/plain`, `/sitemap.xml` `application/xml`,
  `/api/build-info` `application/json`, `/favicon.ico` **404**, `/nonexistent-xyz-123`
  **404**, `/.env` **403** → hepsinde `speculation-rules: "/cdn-cgi/speculation"`.
- **Bulgu kimliği şeması tablosu eklendi** (`docs/cloudflare.md`): tüm `ÖNEK-NN`
  aileleri + kapsamları; `W-` ve `N-` öneklerinin **iki kapsamlı** olduğu açıkça
  belirtildi, yeni bulgudan önce aralığı `grep` ile doğrulama kuralı yazıldı.
- **T-07 düzeltmesi:** tur 7 ölçüm tablosundaki `/robots.txt` satırı yanlışlıkla
  `Vary: accept-encoding` diyordu; tur 21'in T-01 düzeltmesine göre `/robots.txt`'te
  **`Vary` yok** (yalnız `/sitemap.xml`'de var).

**Teyit edilen (temiz):** WAF saldırı yolları **403**, meşru rotalar **200**,
`wp-admin`/`phpmyadmin`/`.env` bloklu; dinamik HTML cache'lenmiyor; #163 CF halkası
kopuk değil (arama botları 200, `cf-mitigated` yok).

**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01 (SR-01 davranışı
açık; yalnız **iddiası** SR-01r ile düzeltildi).
**Devir:** N-15 → **#437**, N-13 → **#441** (ikisi de açık, `lane:infra`).

## Tur 29 (2026-11-10) — canlı kesinti (O-01) + WAF matrisi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma)
Sahibin yapması gerekenler: O-01 (Vercel 402 — LANE-INFRA, acil) · N-11r · H-01r ·
            H-02 · R-01 · G-01 · F-08 · #227
Sonraki lane için notlar: (1) Ölçümden önce `curl -sI https://isbulkktc.com/` ile
            origin'in canlı olduğunu doğrula; 402 dönerse cache/başlık bulguları
            ölçülemez. (2) 402 `DEPLOYMENT_DISABLED` origin tarafıdır (alias da
            verir) — CF'ye yazma. (3) WAF matrisi 402 altında bile ölçülebilir.
```

**O-01 (kritik, LANE-INFRA):** bu turda canlı site **402 `DEPLOYMENT_DISABLED`**
döndü — her rota, statik varlık ve `/api/*` dahil; CF'yi atlayan alias
`isbulkktc-amber.vercel.app` de doğrudan 402 (`server: Vercel`). Yani kesinti
**origin'de**, CF'de değil. Ayrıntı: `docs/cloudflare.md` → "Tur 29".

**N-17 (bilgi):** WAF matrisi 402 altında da temiz — 10 saldırı yolu **403**,
meşru 17 rota **403 değil**.

**D-21:** origin düşükken cache/başlık bulguları (H-02, SR-01, cache matrisi)
ölçülemez; 402 gövdesinin `cache-control`'u **Vercel'in** 402 sayfasına aittir.
Origin dönünce yeniden ölçülmeli.

## Tur 30 (2026-11-10) — DNS sertleştirme + O-01 yeniden ölçüm + kimlik şeması

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: #520
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma)
Sahibin yapması gerekenler: O-01 (#518, LANE-INFRA, acil) · N-11r · H-01r ·
            H-02 · R-01 · G-01 · F-08 · #227
Sonraki lane için notlar: (1) Origin 402 verirken cache/başlık bulguları (H-02,
            SR-01) ölçülemez → D-21. (2) `O-` öneki artık kimlik şemasında (D-22).
```

- **D-22:** tur 29 `O-01`'i kullandı ama `O-` önekini kimlik şemasına eklemedi →
  eklendi (`docs/cloudflare.md` → "Bulgu kimliği şeması").
- **F-30 (temiz):** apex + 28 yaygın alt alan tarandı; wildcard yok, grey-cloud
  sızıntısı yok, `rsend` CNAME dangling değil, DNSSEC açık. MTA-STS/TLS-RPT/BIMI
  kaydı yok → düşük öncelikli öneri (onay bekliyor).
- **O-01r:** origin hâlâ 402 (`DYNAMIC`, cache'lenmiyor → poisoning yüzeyi yok);
  CF/TLS/WAF katmanı 402 altında da sağlam.
- **D-23:** O-01 → **#518** (açık, `lane:infra`); #319'dan ayrı kök neden.
- **D-24:** tur 30 blok başlığında "Değişen dosyalar" yalnız `docs/cloudflare.md`
  diyordu → iki dosya + `PR: #520` olarak düzeltildi (blok ↔ gerçek diff uyumu).

## Tur 31 (2026-11-10) — WAF kaçış matrisi: eğiksiz/ayraçlı `.git` + eksik dotfile kümesi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: N-18 (WAF `/.git` kuralını eğiksiz + `url_decode` üzerinden
            kur — onay) · N-19 (eksik dotfile kümesini ekle — onay) · N-11r · H-01r ·
            H-02 · R-01 · G-01 · F-08 · #227 · O-01 (#518, LANE-INFRA, acil)
Sonraki lane için notlar: (1) `curl --path-as-is` kullan (yoksa curl yolu normalleştirir,
            kaçışı maskeler). (2) 402 kesintisinde 403=WAF / 402=origin ayrımı kanıt sağlar.
            (3) Kural literali `/.git/` ise `/.git` (eğiksiz), `/.git;/x`, `/.git,/x`,
            `/.git%09/config`, `/.git./config`, `/.git%2e/config`, `/.git%5cconfig`,
            `/.git%20/config`, `/.git+config` atlanır — kaçış yalnız `%2F` değil, **tek
            karakter sınıfı da değil**; literalin `/`'sini bozan her biçim atlar. Karşı
            örnek: `/wp-admin` (literalinde `/` yok) ve `/.env` (prefix) bu varyantlarda
            **403** kalır. (4) Yeni kimlik: `N-18`, `N-19` (tur 26/27 `N-11..N-16` WAF
            kümesinin devamı).
```

- **N-18 (orta):** WAF `/.git/` kuralı **literale** bağlı. Eğiksiz `/.git`,
  ayraçlı `/.git;/x`·`/.git,/x`, kodlu TAB `/.git%09/config`, kodlu `/`
  `/.git%2Fconfig`, **sonda nokta** `/.git./config`, **kodlu nokta** `/.git%2e/config`
  ve `%5C`/`%20`/`+` varyantları → **402** (origin'e ulaşıyor); yalnız tam
  `/.git/config` → 403. `/api/devtools` aynı sınıfta. Kök neden: kural sondaki
  eğik çizgiyi dahil ediyor; kaçış **tek karakter sınıfı değil**. Düzeltme:
  eğik çizgisiz + `url_decode(http.request.uri.path)`. Karşı örnek: `/wp-admin`
  (literalinde `/` yok) ve `/.env` (prefix) ayraç/nokta varyantlarında **403**
  kalır → asimetri literalin `/` içerip içermemesine bağlı.
- **N-19 (orta):** dotfile kuralı **eksik**: `/.npmrc`, `/.git-credentials`,
  `/.netrc`, `/.pypirc`, `/.bash_history`, `/.kube/config`, `/.gem/credentials`,
  `/.docker/config.json` → **402** (bloklu değil). `/.env`, `/.htpasswd`,
  `/.aws/config`, `/.ssh/known_hosts` bloklu.
- **D-25:** tur 29 N-17'nin "kesinti sırasında bile WAF bypass'ı yok" iddiası
  fazla genişti — yalnız **eğikli** yollar denenmişti; kapsamı daraltıldı.
- **O-01r2:** tüm ölçümler 402 kesintisi altında; CF/TLS/WAF katmanı sağlam.

## Tur 32 (2026-11-10) — metod kuralı kapsamı (TRACE=origin) + secret/dotfile WAF kapsaması

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma)
Sahibin yapması gerekenler: N-20 (metod kuralına TRACE ekle — onay) · N-21 (secret/dotfile
            kural setini genişlet — onay) · N-18 · N-19 · N-11r · H-01r · H-02 · R-01 ·
            G-01 · F-08 · #227 · O-01 (#518, LANE-INFRA, acil)
Sonraki lane için notlar: (1) Vercel alias (`isbulkktc-amber.vercel.app`) artık HER yola 403
            "Vercel Security Checkpoint" (bot challenge) → origin testi için kullanılamaz;
            ayırt edici .com'da **403 = CF bloğu** ("Attention Required!") / **402 =
            origin'e ulaştı** (`x-vercel-error: DEPLOYMENT_DISABLED`). (2) 405 dönen metod
            yanıtı WAF değil origin olabilir: TRACE'te `cf-ray: -` (tire) + gövdede
            `cloudflare` imzası → origin 405; WAF bloğu `cf-ray` DOLU + "Attention
            Required!" verir. (3) Metod matrisini TRACE/OPTIONS ile de ölç. (4) Yeni kimlik:
            `N-20`, `N-21`; düzeltme kayıtları `D-26`, `D-27`.
```

- **N-20 (orta):** WAF metod kuralı `TRACE`'i **yakalamıyor** — `TRACE https://isbulkktc.com/`
  **405** ama `cf-ray: -` (tire) ve gövde `<center>405 Not Allowed</center> … <center>cloudflare</center>`
  → **origin** (Vercel) yanıtı, WAF değil; `TRACK` → **403** `cf-ray` **dolu** + "Attention
  Required!" → **WAF**. `OPTIONS` → **402** (WAF atladı) → kural allowlist değil **blocklist**
  (yalnız TRACK/CONNECT). Yani edge TRACE'i geçiriyor; engelleme origin'e devredilmiş.
  Düzeltme: `http.request.method in {"TRACE" "TRACK" "CONNECT"}`. Doğrulama: TRACE'te
  `cf-ray` dolu + "Attention Required!" olmalı.
- **N-21 (orta):** Dotfile/secret kuralı **seçici** — bloklu: `/.env*`, `/.git/*`, `/.aws/*`,
  `/.ssh/*`, `/.svn/*`, `/.hg/*`, `/.htpasswd`, `/.DS_Store`, `/web.config`, `/backup.sql`,
  `/wp-admin`, `/phpmyadmin`, `/xmlrpc.php`, `/composer.json`. **Bloklanmayan (402):**
  `/env`, `/.gitignore`, `/.gitattributes`, `/.gitmodules`, `/.git-credentials`,
  `/.npmrc`, `/.netrc`, `/.pypirc`, `/.gem/credentials`, `/.kube/config`,
  `/.docker/config.json`, `/.pgpass`, `/id_rsa`, `/.bash_history`, `/.zsh_history`,
  `/.mysql_history`, `/.bzr/branch-format`, `/CVS/Entries`, `/Dockerfile`,
  `/docker-compose.yml`, `/.dockerenv`, `/terraform.tfstate`, `/config.json`,
  `/secrets.json`, `/credentials.json`, `/package-lock.json`, `/yarn.lock`,
  `/composer.lock`, `/Thumbs.db` (~30 yol). Simetri: `/.env` **403** ama `/env` **402**;
  `/.git/config` **403** ama `/.gitignore` **402**. Düzeltme: ad-listesi yerine **sınıf**
  kuralı (`url_decode` + `lower` + `contains "/.git"`, `"/.npmrc"`, `"tfstate"` …).
- **D-26:** `F-21` (satır 97) "TRACE→405, TRACK→403 | OK" satırı katman atfını belirsiz
  bırakıyordu; TRACE 405'i **origin**, TRACK 403'ü **WAF** olarak netleştirildi.
- **D-27:** Vercel alias artık **her** yola 403 "Vercel Security Checkpoint" (bot challenge,
  `server: Vercel`, `retry-after: 30`) → origin testi için kullanılamaz; tur 29/31
  notlarındaki "alias ile origin'i ölç" yönergesi geçersiz.
- **O-01r3:** tüm ölçümler 402 kesintisi altında; CF/TLS/WAF katmanı sağlam.

## Tur 33 (2026-11-10) — bot UA kuralı `sqlmap/` literaline sabitli (N-22) + origin durum değişimi

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: N-22 (bot UA kuralını `lower()`+sınıf yap — onay) · N-21 · N-20 ·
            N-18 · N-19 · N-11r · H-01r · H-02 · R-01 · G-01 · F-08 · #227 · O-01 (#518)
Sonraki lane için notlar: (1) Bot UA'yı tek biçimle ölçme; `sqlmap/1.7`=403 ama çıplak
            `sqlmap`=404. (2) Yeni origin rejimi: 403=WAF, 404=origin (`DEPLOYMENT_NOT_FOUND`),
            400=yol reddi. (3) `sqlmap` UA bloğu gövdesi `error code: 1010`; yol kuralı
            gövdesi "Attention Required!" — farklı signature. (4) Yeni kimlik: N-22, D-28.
```

- **N-22 (orta, yeni):** WAF bot-UA kuralı **`sqlmap/` literal ön-ekine** sabitli ve
  **harf-duyarlı**. `sqlmap/1.7`/`1.8`/`2.0`/`1`/`1.7x` → 403; ama **çıplak `sqlmap`**,
  `SQLMap/1.7`, `sqlmap 1.7`, `Mozilla/5.0 sqlmap/1.7` → **404 (atlıyor)**. `nikto`,
  `nmap`, `WPScan`, `masscan`, `Nuclei`, `ffuf`, `gobuster` … **hiç bloklanmıyor**.
  Düzeltme önerisi (onay): `lower(http.user_agent) contains "<scanner>"` sınıfı.
- **D-28 (doğruluk):** F-25/C-04/T-19/U-12/V-03 "`sqlmap` → 403" kayıtları tek biçimi
  (`sqlmap/1.7`) ölçmüştü; çıplak `sqlmap` atlıyor. Kayıtlar daraltıldı.
- **N-17r:** WAF yol matrisi yeni 404 rejiminde tutarlı (403 = WAF, 404 = origin).
- **O-01r3:** origin `402 DEPLOYMENT_DISABLED` → **`404 DEPLOYMENT_NOT_FOUND`**; #518'e
  durum güncellemesi eklendi (LANE-INFRA).

**Açık (değişmedi):** H-01r, H-02, N-11r, R-01, G-01, F-08, SR-01, N-18, N-19, N-20, N-21.
**Yeni:** N-22, D-28, N-17r, O-01r3.

## Tur 34 (2026-11-10) — CF Cache Rules TTL yükseltmesi + `/_next/static` 404 1-yıl cache (H-02r, N-23)

```
Lane: LANE-CLOUDFLARE  Branch: lane/cloudflare  PR: (bu PR)
Değişen dosyalar: docs/cloudflare.md, docs/lanes/02-cloudflare.md
Kontroller: lint ✅  typecheck ✅  check:frontend-source ✅  test:unit ✅
Canlıya dokundu mu: hayır (salt-okuma; CF paneli/DNS/WAF/cache değiştirilmedi)
Sahibin yapması gerekenler: H-02r/N-23 (Cache Rules → `/_next/static/**` edge+browser
            TTL = `Origin`; origin `max-age=0`'ını ezme — onay) · N-22 · N-21 · N-20 ·
            N-18 · N-19 · N-11r · H-01r · R-01 · G-01 · F-08 · #227 · O-01 (#518)
Sonraki lane için notlar: (1) Cache TTL'i ölçmek için **aynı yolu** edge + alias
            üzerinden al ve `cache-control`'u diff'le — origin hepsinde `max-age=0`
            derse TTL CF Cache Rules'tandır (Browser Cache TTL tek sayıdır, yol ayıramaz).
            (2) 404'ün cache'lenip cache'lenmediğini `?cb=` cache-bust ile MISS→HIT
            ölç; yalnız `/_next/static/**` 1 yıl, diğer önekler `EXPIRED`/`DYNAMIC`.
            (3) Yeni kimlik: `H-02r`, `N-23`, `O-01r4`.
```

- **H-02r (mekanizma daraltma):** tur 9'un "Browser Cache TTL" tahmini **Cache
  Rules**'a daraltıldı. Kanıt: origin (`isbulkktc-amber.vercel.app`) `/`, `/robots.txt`,
  `/sitemap.xml`, `/sw.js`, `/favicon.ico`, `/_next/static/*` → **hepsi**
  `public, max-age=0, must-revalidate`; edge (`isbulkktc.com`) aynı yollarda
  **yol-bazlı farklı** TTL (`2628000` / `3600` / `31536000`) yayıyor. Tek-sayılık
  Browser Cache TTL yol ayrımı yapamaz → ayar path-pattern'li **Cache Rules**.
- **N-23 (orta, yeni):** `/_next/static/**` altındaki **404** `MISS → HIT`, `age`
  artıyor, `max-age=31536000` → origin düzeldikten sonra da edge 1 yıl **eski 404**
  servis eder. Diğer önekler (`/images`, `/logos`, `/fonts`, `/assets`,
  `/_next/image`) 404'ü `EXPIRED` (HIT'e dönmüyor) → sızıntı yalnız bu önekte.
- **O-01r4:** origin hâlâ **404 `DEPLOYMENT_NOT_FOUND`**; alias da aynı → kesinti
  origin'de, CF'de değil. #518 (LANE-INFRA) açık.
