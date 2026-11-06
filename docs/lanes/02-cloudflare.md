# LANE-CLOUDFLARE — edge/WAF/cache/DNS/Bot koruması

Hedef: Cloudflare yapılandırmasını **noktası noktasına** doğrulayıp eksikleri kapatmak.

## Bağlam (önce oku)
- Repo: `cenkmenk71-max/isbulkktc`. Oku: `docs/lanes/00-orchestration.md`, `AGENTS.md`, `docs/lanes/00-orchestration.md`.
- Alan: **isbulkktc.com** Cloudflare arkasında. Vercel alias: `isbulkktc-amber.vercel.app`.
- Çalışan token: **`<CF_API_TOKEN — ortam değişkeni>`** (cfat_ biçimli). `/user/tokens/verify` `1000 Invalid API Token` döner ama token çalışır — yok say.
- **Kanıtlanmış gerçekler:** WAF AÇIK (Managed Free Ruleset, 38 kural). Custom WAF 4 kural (ruleset `e2951dca01da47b8882fa120d5fbc308`): `/api/devtools/` bloğu, TRACE/TRACK, VCS/dotfile/secret yolları, CMS/exploit-scanner yolları. Free plan `matches` operatörünü reddeder (`contains`/`in`/`lower()` kullan).
- **Free plan = tam 1 `http_ratelimit` kuralı**, "Leaked credential check" için harcanmış. Auth brute-force koruması bunu **değiştirmeyi** gerektirir → önce sor.
- **GitHub runner egress'ini Cloudflare `cf-mitigated: challenge` ile her yolda engelliyor** (ana sayfa dahil). Custom WAF skip bunu kaldırmıyor. Bu yüzden IndexNow Vercel alias'tan okuyor.
- Cache doğru: dinamik HTML `private, no-cache, no-store`; yalnız `/robots.txt` ve `/images/*` edge-cached. **"Düzeltme".**

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

**A-01b canlıda HÂLÂ AÇIK:** PR #359 desenlere görsel uzantısı şartı getirdi
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
- **W-01 (düşük):** WAF 4. kuralı kodlanmış yolda nokta-yolu kuralını atlıyor
  (`/.git%2fconfig`, `/api/devtools%2f` → CF geçip **Vercel origin** 404 döner;
  `x-vercel-id` kanıt). Origin'de `.git`/`/api/devtools` yok → sızıntı yok, ama
  normalizasyon farkı origin değişince risk.

**Drift:** H-01 (HSTS), H-02 (Browser Cache TTL), R-01 (noktalı apex), G-01 (email
obfuscation), N-01 (`_next/static` 404 cache), F-08 (alias CF'i atlıyor) hâlâ
açık. DNS/TLS/CAA/DNSSEC/SPF temiz; Resend DKIM **1024-bit**, DMARC `p=none`.
WAF yanlış pozitif yok (meşru rotalar + 6 dil 200). Detay: `docs/cloudflare.md`
→ "Edge mikro-denetim tur 14".
