# Doğrulama günlüğü

Olgunlaşma sonrası gerçek dünya ölçümleri. Her satır **ölçülen** bir sonuçtur,
iddia değil.

## 2026-11-05 — e-posta teslim edilebilirliği

### Kimlik doğrulama (DNS, otomatik)

```
domain: isbulkktc.com | Resend status: verified | region: eu-west-1
  DKIM  resend._domainkey        verified
  SPF   send.isbulkktc.com       verified   v=spf1 include:amazonses.com ~all
  MX    send.isbulkktc.com       feedback-smtp.eu-west-1.amazonses.com
  SPF   rsend (return-path)      verified   send.forge.rmta.net
```

| Alan | Durum | Not |
|---|---|---|
| DKIM | PASS | `resend._domainkey`, 216 karakter anahtar |
| SPF | PASS | `send` alt alan adında; zarf göndericisi üzerinden geçer |
| DMARC | PASS | `p=quarantine` — canlı (2026-11-12'de DoH ile doğrulandı; önce `p=none`) |
| MX | PASS | Cloudflare Email Routing |
| Blocklists | ~~PASS~~ ⚠️ | **geçersiz** — araç alan adını yalnız-IP bölgelerine soruyordu; bkz. tur 2 |
| Resend domain | PASS | `verified` |

### Gerçek gönderim testleri

| # | İçerik | Resend sonucu | ID |
|---|---|---|---|
| 1 | Sade teslim testi | `delivered` | `01a1acc2-212f-72e5-a417-61e19b0f4bba` |
| 2 | **Gerçek marka şablonu** (logo + marka yeşili + footer) | `delivered` | `01a1acc6-7d7a-7518-9c17-5289b135a47f` |

`delivered` = alıcı sunucu kabul etti. **Gelen kutusu/spam ayrımı** için
3 gerçek adreste insan onayı gerekir (#187).

### Şablon kalitesi ölçümü

| Şablon | `<img>` | Satır içi stil | `<style>` | `<div>` |
|---|---|---|---|---|
| `email-layout.ts` (transactional) | 1 | 29 | 2 | 8 |
| `supabase/templates/*.html` (7 auth) | **0** | **0** | 1 | 5 |

Auth şablonları görselsiz ve satır içi stilsiz → Gmail/Outlook'ta düz yazı.
Düzeltme: #171.

### Açık kalan

- [ ] DMARC `p=quarantine` (LANE-CLOUDFLARE)
- [ ] mail-tester.com 10/10 skoru (LANE-VERIFY, #187)
- [ ] 3 adreste gelen kutusu doğrulaması (insan onayı, #187)
- [ ] Auth şablonlarında marka kimliği (#171)

## 2026-11-05 — araç doğruluğu düzeltmesi (LANE-VERIFY, #187 tur 2)

İlk ölçümdeki iki "temiz" sonuç **yanlıştı**: araç, gerçek durumu değil kendi
sorgu hatasını raporluyordu. Ölçüm aracının kendisi denetlendi.

### Ölçülen (dns.google, 2026-11-05)

```
isbulkktc.com            v=spf1 include:_spf.mx.cloudflare.net ~all
send.isbulkktc.com       v=spf1 include:amazonses.com ~all          <- Resend (aligned)
rsend.isbulkktc.com      send.forge.rmta.net. + v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all
resend._domainkey        p=MIGf… (216 karakter)                     <- DKIM
_dmarc.isbulkktc.com     v=DMARC1; p=none; rua=mailto:dmarc@isbulkktc.com; fo=1
MX                       3 route{1,2,3}.mx.cloudflare.net
```

### Düzeltilen araç bulguları (`scripts/verify-deliverability.mjs`)

| # | Bulgu (gözlenen) | Beklenen | Düzeltme |
|---|---|---|---|
| 1 | SPF "FAIL: amazonses.com YOK" — yalnız kök TXT'ye bakıyordu | Envelope (Return-Path) alt alanı kontrol edilmeli; `send`/`rsend` SPF'yi taşır | `returnPathAlignment()`: alt alan SPF'si + DMARC relaxed alignment → `WARN` (kök) + `PASS` (Return-Path) |
| 2 | Lookup sayımı tüm dizgede `mx` arıyordu → `_spf.mx.cloudflare.net` içindeki `mx` ikinci lookup sayılıyordu (1 yerine 2) | RFC 7208 §4.6.4 terim bazlı sayım | `countSpfDnsLookups()` token bazlı; 1 döndürür |
| 3 | `zen.spamhaus.org` ve `bl.spamcop.net`'e **alan adı** soruluyordu; ikisi de yalnız IP bölgesi → daima NXDOMAIN → "temiz" | Alan bölgeleri: `dbl.spamhaus.org`, `multi.surbl.org`; IP bölgeleri: `zen`, `bl.spamcop.net` (ters IPv4) | Sorgu formu bölge türüne göre ayrıldı |
| 4 | `127.255.255.252/254/255` (Spamhaus "sorgu reddedildi") `clean` sayılıyordu | Reddetme = bilinmiyor, temiz değil | `classifyDnsblAnswer()` yeni `refused` durumu |
| 5 | Zone erişilebilirliği kanıtlanmadan "temiz" deniyordu | Bilinen-listeli sentinel önce sorgulanmalı | `evaluateBlocklistZone()` sentinel kapısı; erişilemez bölge `unqueryable` |
| 6 | `dnsbl.sorbs.net` sorgulanıyordu | SORBS 2024-06-05'te kapandı | Kaldırıldı |

### Yeni ölçüm çıktısı (aynı gün, `node scripts/verify-deliverability.mjs`)

```
WARN SPF         kök kayıt göndericiyi yetkilendirmiyor, ama send.isbulkktc.com (Return-Path) yetkilendiriyor ve DMARC-aligned
PASS SPF         send.isbulkktc.com (Return-Path) SPF göndericiyi yetkilendiriyor
PASS DKIM        resend._domainkey var, 216 karakter
WARN DMARC       p=none — yalnız izleme
PASS MX          3 Cloudflare route
WARN Blocklists  multi.surbl.org ve bl.spamcop.net temiz; dbl/zen.spamhaus.org erişilemez (sorgu reddedildi)
FAIL Resend      anahtar re_ ile başlamıyor (len 36) — #186, insan düzeltmesi
```

Spamhaus bölgeleri bu çözümleyiciden (Google Public DNS) yanıt vermiyor —
sentinel kapısı bunu "temiz" diye raporlamak yerine `unqueryable` olarak
işaretliyor. Ölçüm artık kendi hatasını temizlik sanmıyor.

### Testler

`scripts/verify-deliverability.test.mjs` (yeni): 10 test — SPF terim sayımı ve
10-lookup sınırı, gönderici yetkilendirme (SES / `ip4:`) + sahte "amazonses"
alt dizesi, `ip4:`/`ip6:` çıkarımı, DNS present/absent/error ayrımı, DNSBL
listed/refused/clean, ters IPv4, sentinel kapısı, DMARC relaxed alignment.
`bun run test:unit` içinde koşar.

## 2026-11-05 — tur 3: SPF yetkilendirmede yanlış pozitif (LANE-VERIFY, #187)

Tur 2'nin `spfAuthorisesSender()` düzeltmesi fazla gevşekti: `amazonses\.com`
alt dize eşlemesi, **`include:notamazonses.com`** ve
**`include:amazonses.com.evil.example`** kayıtlarını "göndericiyi yetkilendiriyor"
sayıyordu — yani yetkisiz bir kayıt `PASS` görünüyordu. Bu, tur 2'de kapattığım
sınıfın (yanlış "temiz") tam tersi yönde bir yanlış "PASS"ıydı.

| # | Boyut | Gözlenen | Beklenen | Düzeltme |
|---|---|---|---|---|
| 7 | Doğruluk | `spfAuthorisesSender("v=spf1 include:notamazonses.com ~all")` → `true` | `false` | Mekanizma tam eşleşme (`include:amazonses.com`); yalnız çıplak/`+` kabul, sondaki nokta kabul, `-`/`~`/`?` kabul değil |

Ölçüm (düzeltme sonrası, aynı gün): SPF değerlendirmesi değişmedi —
`send.isbulkktc.com` gerçek `include:amazonses.com` taşıdığı için `PASS`.
Yani düzeltme yalnız yanlış pozitifi kapatır, doğru sonucu değiştirmez.

## 2026-11-05 — arama görünürlüğü

| Kontrol | Sonuç |
|---|---|
| robots.txt | Allow: / (yalnız /api/, /auth/ kapalı) |
| Googlebot / Bingbot | HTTP 200 |
| google-site-verification | canlı HTML'de var |
| canonical | mutlak string, doğru |
| hreflang | 6 dil + x-default |
| noindex | yok |
| sitemap.xml | 200, 207 URL |
| IndexNow | key canlı, workflow günlük success |
| Bing indeksi | **görünüyor** |
| Google indeksi | yok (7 haftalık domain) |

**Teşhis:** teknik engel yok; otorite/hacim sorunu. Domain yaşı 7 hafta,
207 URL, backlink yok. Bot trafiği **uygulanmadı** (spam cezası riski).

## 2026-11-05 — tur 4: arama görünürlüğü artık ölçülebilir (LANE-VERIFY, #187)

Yukarıdaki tablo elle ölçülmüştü ve yeniden üretilebilir bir aracı yoktu
(`verify-production-deployment.mjs` yalnız HTTP durumuna bakıyor). Aynı sınıf
hata — aracın kendi kusurunu sonuç sanması — arama yüzeyinde de mümkün olduğu
için ölçüm otomatikleştirildi.

**Yeni araç:** `scripts/verify-indexing.mjs` (`npm run indexing:verify`),
`scripts/verify-indexing.test.mjs` (13 test). Kaynak yok, kimlik bilgisi yok;
Cloudflare meydan okuması `skip` sayılır (yanlış `fail` değil).

Ölçtüğü dört katman: robots.txt (izin + sitemap ilanı), sitemap (`<loc>`
mutlak/aynı origin/`/tr` öneki yok + tam hreflang seti), örneklenen sayfalar
(200 + `noindex` yok + canonical sitemap `<loc>` ile eşleşiyor), IndexNow
anahtar dosyası (gövde anahtarla eşleşiyor).

### Ölçülen (canlı, 2026-11-05)

```
PASS robots     allows crawling; sitemap https://isbulkktc.com/sitemap.xml
PASS sitemap    207 URLs, all on-origin canonical; 186 with the full hreflang set,
                21 single-locale (no hreflang)
PASS single-loc 3 single-locale entries: the localized duplicate canonicalises back
PASS pages      8 sampled pages are 200, indexable, with a matching canonical
PASS indexnow   key file matches isbulkkt…
0 failure(s), 0 warning(s), 0 skipped
```

Yukarıdaki elle tabloyu **doğruluyor**: robots izin veriyor, canonical mutlak,
hreflang tam, `noindex` yok, sitemap 207 URL, IndexNow anahtarı canlı.

### Aracın kendi kusuru (düzeltildi, aynı sınıf)

İlk sürüm **her** sitemap girdisinde hreflang seti zorunlu tutuyordu. 21 iş
ilanı sayfasında yoktu → sahte `FAIL`. Kanıt: `/en/jobs/source-iskibris-mimar`
**200 dönüyor** ama canonical'ı `https://isbulkktc.com/jobs/source-iskibris-mimar`
(Türkçe URL). Yani o sayfalar tek dilli; yerelleştirilmiş kopyalar tek canonical'a
birleşiyor. Hreflang seti **isteğe bağlı** olmalı — zorunlu tutmak, kopya URL'leri
alternate ilan edip kümeyi bölerdi. Kural düzeltildi; tek dilli girdi için
"yerelleştirilmiş kopya geri canonical'lanıyor mu" kanıtı eklendi (`single-loc`).

Bu, tur 2 (blokliste yanlış "temiz") ve tur 3 (SPF yanlış "PASS") ile aynı
sınıf: ölçüm aracının kendi kusuru sonuç gibi okunmamalı.

## Tur 5 — ölçüm araçlarının kendi kusurları (2026-11-05)

Tur 2/3/4'ün ortak teması: **araç kusuru sonuç gibi okunmamalı**. Tur 5 aynı
sınıftan beş kusur daha çıkardı; hepsi kendi dosyalarımda (`scripts/verify-*.mjs`)
düzeltildi ve regresyon testiyle sabitlendi.

| # | Dosya | Kusur | Kanıt | Etki | Düzeltme |
|---|---|---|---|---|---|
| 1 | `verify-indexing.mjs` | `evaluateIndexability` `X-Robots-Tag` parametresi alıyor, testi geçiyor; ama `checkPages` ona **hep `null`** veriyordu ve `fetchText` yanıt başlıklarını hiç okumuyordu | kod: `xRobotsTag: null` (satır ~515), `fetchText` yalnız `response.text()` | Yalnız başlıkla `noindex`'lenen sayfa "indexable" görünür | `fetchText` başlığı okur; `verdictForPage` çıkarıldı + test |
| 2 | `verify-indexing.mjs` | robots'un ilan ettiği sitemap `s.startsWith(ORIGIN)` ile seçiliyordu | `https://isbulkktc.com.evil.example/sitemap.xml` → `startsWith` **true** | Rakip/yanlış host sitemap'i takip edilir | `isSameOrigin` (tam origin) + test |
| 3 | `verify-indexing.mjs` | `<meta name=… content=…>` regex'i yalnız `name` önce + çift tırnak | `<meta content="noindex" name="robots">` → `metaRobots=null` | Geçerli `noindex` kaçar; sayfa indexable sanılır | `findMetaContent` (sıra/quote bağımsız) + test |
| 4 | `verify-auth-config.mjs` | `callbackIsAllowed` çıplak origin girdisini (`https://isbulkktc.com`) callback'i kapsıyor sayıyordu | `callbackIsAllowed(origin, origin)` → **true**; GoTrue `glob.MustCompile(uri, '.', '/')` | Allowlist'te callback yokken "sağlıklı" raporlanır | yalnız `…/auth/callback` veya `…/**` kabul + test |
| 5 | `verify-deliverability.mjs` | (temiz — SPF/DKIM/DMARC/IP ayrıştırma tam eşleşmeli, tur 3'te sertleştirildi) | — | — | bakıldı, değişiklik yok |

### Kanıt (dosya:satır, gözlenen → beklenen)

- **#1:** `scripts/verify-indexing.mjs` — `checkPages` içinde `xRobotsTag: null`
  sabitti; `fetchText` yalnız `{status, body, error}` döndürüyordu. Yalnız
  `X-Robots-Tag: noindex` gönderen bir sayfa yeşil geçerdi. Artık başlık okunuyor,
  `verdictForPage` saf fonksiyonu test ediliyor.
- **#2:** `https://isbulkktc.com.evil.example/sitemap.xml` ve
  `https://isbulkktc.com.au/sitemap.xml` `startsWith("https://isbulkktc.com")`
  ile **true** dönüyordu → off-origin sitemap takip edilebilirdi. Tur 3 SPF
  hatasıyla aynı sınıf.
- **#3:** `<meta content="noindex" name="robots">` → `extractPageSignals`
  `metaRobots=null`. HTML'de öznitelik sırası anlamsız.
- **#4:** `callbackIsAllowed("https://isbulkktc.com", "https://isbulkktc.com")`
  → **true**. Supabase dokümanı: *"The separator characters in a URL are defined
  as `.` and `/`"*; GoTrue kaynağı `glob.MustCompile(uri, '.', '/')`
  (`supabase/auth` `internal/conf/configuration.go`). Çıplak origin
  `/auth/callback`'i kapsamaz → yanlış "sağlıklı".

### Canlı ölçüm (değişmedi)

```
node scripts/verify-indexing.mjs   → 0 fail / 0 warn / 0 skip
node scripts/verify-deliverability.mjs
  WARN SPF   kök kayıt göndereni yetkilendirmiyor; Return-Path alt alanı yetkili + DMARC hizalı
  PASS SPF   send.isbulkktc.com (Return-Path) yetkili
  PASS DKIM  resend._domainkey, 216 karakter
  WARN DMARC p=none (yalnız izler, uygulamaz)
  PASS MX    3 Cloudflare route
  WARN Blocklists surbl/spamcop temiz; spamhaus sorgulanamadı (datacenter IP)
  FAIL Resend anahtar `re_` ile başlamıyor (len 36) → #186 (insan)
```

Katman 2/3 (gerçek gönderim, spam skoru) hâlâ #186 + #170 yüzünden ölçülemez;
doğrulanmamış iddia yok. `/en|/de|/ru/jobs/<slug>` **200 + geri canonical**
(soft-duplicate birleşme) doğrulandı.

Testler: `scripts/verify-indexing.test.mjs` 16/16, `scripts/verify-auth-config.test.mjs`
3/3. Kapılar: lint/typecheck/check:frontend-source ✅, `test:unit` 589 (585 pass,
0 fail, 4 todo), `test:security` 77 (75 pass, 0 fail, 2 todo).

## Tur 6 — ölçüm araçlarının kendi kusurları, devam (2026-11-05)

Tur 5'in kapanışından sonra araçlar baştan denetlendi. Dört yeni kusur
çıktı; üçü `verify-indexing.mjs`, biri `verify-deliverability.mjs`. Yine
**araç kusuru sonuç gibi okunmamalı** sınıfı: araç, tarayıcının okuduğu sinyali
yanlış okuyup siteyi olduğundan farklı raporluyordu.

| # | Dosya | Boyut | Gözlenen | Beklenen | Etki | Düzeltme |
|---|---|---|---|---|---|---|
| 1 | `verify-indexing.mjs` | doğruluk | `<meta name="robots" content="none">` → `indexable` | Google: `none` ≡ `noindex, nofollow` → `noindex` | `none` ile deindexlenmiş sayfa "indexable" sanılır | `evaluateIndexability` `noindex\|none` |
| 2 | `verify-indexing.mjs` | doğruluk | yalnız `<meta name="googlebot" content="noindex">` → `indexable` | Google `robots` + `googlebot`'u birleştirir, en kısıtlayıcı kazanır | site her sayfada `googlebot` etiketi yayıyor; yalnız-googlebot `noindex` görünmez | `extractPageSignals` iki etiketi birleştirir |
| 3 | `verify-indexing.mjs` | doğruluk | `findCanonical` yalnız `rel` önce + çift tırnak; `data-rel="canonical"` eşleşir | öznitelik sırası/tırnak bağımsız; `data-rel` ≠ `rel` | canonical okunmaz (yanlış `FAIL`) ya da yabancı link canonical sanılır | `tagAttr` `(?:^\|\s)` sınırı; `findCanonical` |
| 4 | `verify-deliverability.mjs` | hata yolu | DoH `Status` yok sayılıyordu; SERVFAIL/REFUSED (HTTP 200, `Answer` yok) → "absent" | NXDOMAIN (3) absent; diğer sıfır-dışı `Status` = error | çözümleyici hatası kayıt yokmuş gibi → yanlış `FAIL`/`clean` | `interpretDnsResponse(Status, Answer)` |

### Kanıt (dosya:satır, gözlenen → beklenen)

- **#1:** Google robots meta referansı: *"none — Equivalent to noindex,
  nofollow"*. Önce: `evaluateIndexability({metaRobots:"none"})` → `ok:true`.
  Sonra: `state:"noindex"`.
- **#2:** Google robots meta referansı: *"To specify multiple crawlers
  individually, use multiple robots meta tags"* ve *"The page containing these
  meta tags will be interpreted as having a noindex, nofollow rule"*. Canlı site
  her sayfada `<meta name="googlebot" content="index, follow, …">` yayıyor —
  araç bu etiketi hiç okumuyordu.
- **#3:** `findCanonical('<link data-rel="canonical" href="https://evil.example/x">')`
  → önce `"https://evil.example/x"`, sonra `null`. `\b` sınırı `data-rel`
  içindeki `rel`'e uyuyordu.
- **#4:** `interpretDnsResponse(2, undefined)` → önce `{answers:[],error:null}`
  (absent), sonra `{answers:[],error:"DNS Status 2"}` (error). RFC 1035 §4.1.1
  RCODE'ları: 0 NOERROR, 2 SERVFAIL, 3 NXDOMAIN, 5 REFUSED. Google DoH JSON
  dokümanı `Status`'u "Standard DNS response code" olarak tanımlar ve başarısız
  yanıtı HTTP 200 + `Status: 2` olarak gösterir.

### Canlı ölçüm (değişmedi)

```
node scripts/verify-indexing.mjs   → 0 fail / 0 warn / 0 skip
node scripts/verify-deliverability.mjs
  WARN SPF   kök kayıt göndereni yetkilendirmiyor; Return-Path alt alanı yetkili + DMARC hizalı
  PASS SPF   send.isbulkktc.com (Return-Path) yetkili
  PASS DKIM  resend._domainkey, 216 karakter
  WARN DMARC p=none (yalnız izler, uygulamaz)
  PASS MX    3 Cloudflare route
  WARN Blocklists dbl.spamhaus.org + surbl + spamcop temiz; zen.spamhaus.org sorgulanamadı
  SKIP Resend bu kabukta RESEND_API_KEY yok (tur 5'te yanlış anahtar → FAIL, #186)
```

Bu turda `dbl.spamhaus.org` sentinel kapısını geçti (temiz), `zen.spamhaus.org`
hâlâ reddediyor — sentinel kapısı ikisini doğru ayırıyor.

Katman 2/3 (gerçek gönderim, spam skoru) hâlâ #186 + #170 yüzünden ölçülemez;
doğrulanmamış iddia yok.

Testler: `verify-indexing.test.mjs` 19/19, `verify-deliverability.test.mjs` 11/11,
`verify-auth-config.test.mjs` 3/3 (toplam 33).
## Tur 7 — ölçüm araçlarının kendi kusurları, devam (2026-11-05)

Tur 5 ve 6 ile aynı sınıf: **araç kusuru sonuç gibi okunmamalı**. Üç sahipli
doğrulayıcı baştan denetlendi; yedi kusur çıktı — beşi `verify-indexing.mjs`,
biri `verify-deliverability.mjs`, biri `verify-auth-config.mjs`. Hepsi kendi
dosyalarımda düzeltildi ve regresyon testiyle sabitlendi.

| # | Dosya | Boyut | Gözlenen | Beklenen | Etki | Düzeltme |
|---|---|---|---|---|---|---|
| 1 | `verify-indexing.mjs` | doğruluk | `/\b(?:noindex\|none)\b/` `max-image-preview:none` / `max-video-preview:none` değerini eşeliyordu | `none` yalnız başına bir direktif; `…:none` önizleme sınırıdır, index'i engellemez | Sağlıklı sayfa sahte `noindex` | direktif sınırına çapalı regex |
| 2 | `verify-indexing.mjs` | doğruluk | her `name` için yalnız **ilk** `<meta>` okunuyordu | Google etiketleri birleştirir ("sum of the negative rules") | İkinci `<meta name="robots" content="noindex">` görünmez → sahte indexable | `findMetaContents` tüm etiketleri döner |
| 3 | `verify-indexing.mjs` | mantık | `selectGroup` token'ın substring olduğu **ilk** grubu alıyordu | en **spesifik** (en uzun) token kazanır; eşit token'lar birleşir | Kısa `bot` grubu `googlebot`'u gölgeler; aynı ajanın ikinci grubu düşer | en uzun token + eşitleri birleştir |
| 4 | `verify-indexing.mjs` | doğruluk | `X-Robots-Tag: googlebot: noindex` değeri olduğu gibi okunuyordu | baştaki ajan adı kural değil | Ajan adı kural listesine karışır | `stripRobotsAgent` (kural sözlüğüyle ayrım) |
| 5 | `verify-indexing.mjs` | mantık | `googlebot/1.2` / `googlebot*` token biçimleri | Google ikisini de `googlebot` sayar | Sürümlü token eşleşmez | token `*` ve `/` kırpılır |
| 6 | `verify-deliverability.mjs` | doğruluk | `spfIpEntries` `ip4:` için büyük/küçük harfe duyarlıydı | RFC 7208 §4.6.1 mekanizma adları harf-duyarsız | `IP4:` göndereni yetkisiz gösterir → sahte `FAIL` | regex `/i` |
| 7 | `verify-auth-config.mjs` | hata yolu | `evaluateCaptchaProbe` 429'u `disabled` sayıyordu | 429 hız sınırı; captcha hiç sınanmadı | Kısıtlanmış koşu "captcha kapalı" der → sahte PASS | 429 → `unreachable` |

### Kanıt (dosya:satır, gözlenen → beklenen)

- **#1:** Google robots meta referansı, `max-image-preview` *"Accepted
  [setting] values: none: No image preview is to be shown."* — index kuralı
  değil. Önce: `evaluateIndexability({metaRobots:"index, follow, max-image-preview:none"})`
  → `state:"noindex"`; sonra `ok:true`. `none` tek başına hâlâ `noindex`.
- **#2:** Google robots meta referansı: *"Multiple meta tags … The page
  containing these meta tags will be interpreted as having a noindex, nofollow
  rule"*. Önce: `<meta name="robots" content="index"><meta name="robots"
  content="noindex">` → `indexable`; sonra `noindex`.
- **#3:** Google robots.txt referansı: *"finding in the robots.txt file the group
  with the most specific user agent that matches the crawler's user agent"* ve
  *"If there's more than one specific group declared for a user agent, all the
  rules … are combined"*. Önce: `[bot: Disallow /private/][googlebot: Allow
  /private/]` + `Googlebot` → `/private/x` **disallowed** (yanlış); sonra
  **allowed**. İki `googlebot` grubu: ikinci grubun `Disallow`'u önce düşüyordu.
- **#4:** Google robots meta referansı: *"The X-Robots-Tag may optionally specify
  a user agent before the rules … `X-Robots-Tag: googlebot: nofollow`"*. Önce
  ajan adı kural listesine giriyordu.
- **#6:** RFC 7208 §4.6.1: *"As per the definition of the ABNF notation in
  [RFC5234], mechanism and modifier names are case-insensitive."* Önce:
  `spfIpEntries("v=spf1 IP4:52.3.252.119 ~all")` → `[]`; sonra IP döner.
- **#7:** Supabase Auth hız sınırı dokümanı: *"When rate limits are exceeded, a
  429 Too Many Requests error is returned."* Önce: `evaluateCaptchaProbe(429,
  …)` → `state:"disabled", ok:true`; sonra `state:"unreachable", ok:false`.

### Canlı ölçüm (değişmedi)

```
node scripts/verify-indexing.mjs   → 0 fail / 0 warn / 0 skip
node scripts/verify-deliverability.mjs
  WARN SPF   kök kayıt göndereni yetkilendirmiyor; Return-Path alt alanı yetkili + DMARC hizalı
  PASS SPF   send.isbulkktc.com (Return-Path) yetkili
  PASS DKIM  resend._domainkey, 216 karakter
  WARN DMARC p=none (yalnız izler, uygulamaz)
  PASS MX    3 Cloudflare route
  WARN Blocklists surbl/spamcop temiz; dbl/zen.spamhaus sorgulanamadı (datacenter IP)
  FAIL Resend anahtar `re_` ile başlamıyor (len 36) → #186 (insan)
```

Katman 2/3 (gerçek gönderim, spam skoru) hâlâ #186 + #170 yüzünden ölçülemez;
doğrulanmamış iddia yok.

Testler: `verify-indexing.test.mjs` 23/23, `verify-deliverability.test.mjs` 11/11,
`verify-auth-config.test.mjs` 5/5 (toplam 39).

## Tur 8 — canlı site düşükken doğrulayıcı yanlış negatif veriyordu (2026-11-10, LANE-VERIFY #187)

Bu turda **katman 1 (arama görünürlüğü)** ölçülemedi, ama ölçüm girişiminin
kendisi bir araç kusuru ortaya çıkardı: canlı origin düşükken doğrulayıcı
"indexing başarısız" diyordu.

### Canlı durum (ölçülen, 2026-11-10 ~03:50 UTC)

`isbulkktc.com` hesap düzeyinde kapalı. Her istek **402** + `x-vercel-error:
DEPLOYMENT_DISABLED` dönüyor (kök neden LANE-INFRA'nın #518'i):

```
/          -> 402   server: cloudflare   x-vercel-error: DEPLOYMENT_DISABLED
/robots.txt-> 402
/sitemap.xml -> 402
/tr        -> 402
```

### Araç kusuru (düzeltildi, kendi dosyam)

`verify-indexing.mjs` bir **hesap düzeyi kesintiyi** (402 `DEPLOYMENT_DISABLED`)
indexing sinyali sanıyordu: robots/sitemap/key dosyası `fail` görünüyordu. Oysa
her ziyaretçinin paylaştığı bu durum sitenin crawl yüzeyi hakkında hiçbir şey
söylemez — `skip` olmalı (Cloudflare challenge ile aynı sınıf). İlk yazımda
mesaj dilbilgisi de bozuktu ("robots.txt is the deployment is disabled").

| Boyut | Gözlenen (öncesi) | Beklenen (sonrası) | Etki |
|---|---|---|---|
| hata yolu | 402 → `fail robots`/`fail sitemap`/`fail indexnow` | `skip` + "deployment is disabled" | Site düşükken doğrulayıcı indexing'i "bozuk" raporluyordu |

Düzeltme: `isDeploymentDisabled(status, vercelError)` + `unmeasurableReason(...)`
dışa aktarıldı; robots, sitemap, canonical probe, örnek sayfalar ve IndexNow key
kontrolü bu durumu `skip` sayıyor. Regresyon testi: `verify-indexing.test.mjs`
"a disabled deployment is not evidence about indexing".

### Canlı ölçüm (düzeltmeden sonra)

```
node scripts/verify-indexing.mjs
  SKIP robots   robots.txt is unmeasurable: the deployment is disabled (HTTP 402, DEPLOYMENT_DISABLED) — the site is down for every visitor
  SKIP sitemap  sitemap is unmeasurable: the deployment is disabled (HTTP 402, DEPLOYMENT_DISABLED) — the site is down for every visitor
  SKIP indexnow key file is unmeasurable: the deployment is disabled (HTTP 402, DEPLOYMENT_DISABLED) — the site is down for every visitor
  0 failure(s), 0 warning(s), 3 skipped
```

Doğru okuma: **indexing ölçülemedi** (site düşük), "indexing bozuk" değil.

### Katman 1 teslim edilebilirlik (değişmedi)

```
node scripts/verify-deliverability.mjs
  WARN SPF         kök kayıt göndereni yetkilendirmiyor; Return-Path alt alanı yetkili + DMARC hizalı
  PASS SPF         send.isbulkktc.com (Return-Path) yetkili
  PASS DKIM        resend._domainkey, 216 karakter
  WARN DMARC       p=none (yalnız izler, uygulamaz)
  PASS MX          3 Cloudflare route
  WARN Blocklists  surbl/spamhaus-zen/spamcop temiz; dbl.spamhaus.org sorgulanamadı (datacenter IP)
  FAIL Resend      anahtar `re_` ile başlamıyor (len 36) → #186 (insan)
```

Katman 2/3 (gerçek gönderim, mail-tester spam skoru, 3 adreste yerleşim) hâlâ
#186 (Resend anahtarı — insan) + #170 (SPF `amazonses.com` — LANE-CLOUDFLARE)
yüzünden ölçülemez. Doğrulanmamış iddia yok.

Testler: `verify-indexing.test.mjs` 24/24, `verify-deliverability.test.mjs` 11/11,
`verify-auth-config.test.mjs` 5/5, `verify-production-deployment.test.mjs` 14/14.

## Tur 9 — doğrulayıcının kendi hata yolu denetlendi (2026-11-10, LANE-VERIFY #187)

Bu turda ölçülecek yeni bir katman yok (katman 2/3 hâlâ #186 + #170'e bağlı).
Bunun yerine **ölçüm aracının kendisi** denetlendi: "doğrulanamayan bir durum
negatif sanılır mı?" sorusu üç bağımsız kusur ortaya çıkardı. Üçü de aynı sınıf —
bilinmeyen/geçici durumun sert bir `fail`'e (ya da sessiz bir no-op'a) çökmesi.

### Kusur 1 — doğrudan çalıştırma koruması yolda boşluk/`#` varken sessizce düşüyordu

Üç script (`verify-deliverability`, `verify-indexing`, `verify-auth-config`)
`import.meta.url === \`file://${process.argv[1]}\`` ile "doğrudan mı çağrıldım?"
kontrol ediyordu. `file://${path}` yolu yüzde-kodlamaz; dizin adında boşluk ya da
`#` varsa eşleşme tutmaz → script **hiçbir şey doğrulamadan `exit 0`** verir.

| Boyut | Gözlenen (önce) | Beklenen (sonra) | Etki |
|---|---|---|---|
| mantık / sınır girdi | yol `#` ya da boşluk içeriyorsa guard tutmaz, `exit 0` | `pathToFileURL(argv[1]).href` ile karşılaştır | "Yeşil" görünen ama hiçbir şey ölçmeyen bir doğrulama koşusu |

Düzeltme: dışa aktarılan `isDirectRun(moduleUrl, argv1)` (`pathToFileURL`).
Regresyon: her üç `.test.mjs` içinde birer guard testi.

### Kusur 2 — sorgulanamayan Return-Path alt alanı `FAIL`'e çöküyordu

Kök SPF göndereni yetkilendirmiyor **ve** Return-Path alt alanı TXT sorgusu
geçici bir DNS hatasıyla düşüyorsa, eski kod hatayı `aligned:false`'a indirip
sert `FAIL` ("hiçbir hizalı alt alan da yetkilendirmiyor") veriyordu. Bu durum
*negatif* değil *bilinmiyor*; script başlığı bunu tam olarak yasaklıyor.

| Boyut | Gözlenen (önce) | Beklenen (sonra) | Etki |
|---|---|---|---|
| hata yolu | alt alan sorgusu düştü → `fail` | `skip` (durum bilinmiyor) | Geçici DNS hatası "SPF bozuk" olarak raporlanıyordu |

Düzeltme: dışa aktarılan `rootSpfVerdict({rootAuthorises, aligned, queryFailed})`;
sorgu düştüyse `skip`, yanıt verip yetkilendirmiyorsa gerçek `fail`.

### Kusur 3 — Resend 429/5xx "anahtar reddedildi" sanılıyordu (bu tur)

`checkResend` her non-OK yanıtı `fail` + "API rejected the key" olarak yazıyordu.
Resmî Resend hata dokümanına göre 429 (`rate_limit_exceeded`,
`daily_quota_exceeded`) ve 5xx (`application_error`, `service_unavailable`)
**yeniden denenebilir sağlayıcı durumlarıdır** — anahtar hakkında hiçbir şey
söylemez. `fail` exit kodunu 1 yaptığı için meşgul/geçici-düşük bir sağlayıcı
"bozuk kimlik bilgisi" olarak okunuyordu (kusur 2 ile aynı sınıf).

| Boyut | Gözlenen (önce) | Beklenen (sonra) | Etki |
|---|---|---|---|
| hata yolu / yetki | 429/5xx → `fail` "API rejected the key" | 429/5xx → `warn`; 401/403/400/422 → `fail` | Rate limit ya da kesinti, kullanıcıyı yanlışlıkla anahtar peşinde koşturuyordu |

Düzeltme: dışa aktarılan `classifyResendStatus(status)`; `checkResend` **ve**
`sendTestEmail` kullanıyor. Kaynak: Resend Errors sayfası
(<https://resend.com/docs/api-reference/errors>). Regresyon: "a Resend rate
limit or outage is a warn, not a FAIL that blames the key".

### Canlı ölçüm (2026-11-10 ~06:55 UTC)

```
node scripts/verify-deliverability.mjs
  WARN SPF         kök kayıt göndereni yetkilendirmiyor; Return-Path alt alanı yetkili + DMARC hizalı
  PASS SPF         send.isbulkktc.com (Return-Path) yetkili
  PASS DKIM        resend._domainkey, 216 karakter
  WARN DMARC       p=none (yalnız izler, uygulamaz)
  PASS MX          3 Cloudflare route
  WARN Blocklists  surbl/spamcop temiz; dbl.spamhaus.org + zen.spamhaus.org sorgulanamadı
  SKIP Resend      RESEND_API_KEY not set
  0 failure(s), 3 warning(s), 1 skipped
```

`isbulkktc.com` hâlâ 402 `DEPLOYMENT_DISABLED` (#518, LANE-INFRA); katman 2/3
(#186 anahtar, #170 SPF) ölçülemez. **Doğrulanmamış iddia yok.**

Testler: `verify-deliverability.test.mjs` 14/14 (üç kusurun regresyonu dahil).
Kapılar: `bun run lint`, `bun run typecheck`, `bun run check:frontend-source`,
`bun run test:unit` (946/946) — yeşil.

## Tur 10 — ikinci Vercel kesinti işaretçisi de tanınmıyordu (2026-11-10, LANE-VERIFY #556/#550)

Devir issue'su (#556, kopyası #550): 2026-11-10'da canlı origin **her rotada 404
+ `x-vercel-error: DEPLOYMENT_NOT_FOUND`** döndü — hesap/dağıtım durumu, yol
hatası değil. `verify-indexing.mjs:538` içindeki `isDeploymentDisabled` yalnız
**402**'yi ve **`DEPLOYMENT_DISABLED`** işaretçisini tanıyordu; bu ikinci hesap
durumu `unmeasurableReason()`'dan `null` olarak geçiyordu.

| Boyut | Gözlenen (önce) | Beklenen (sonra) | Etki |
|---|---|---|---|
| hata yolu | 404 + `DEPLOYMENT_NOT_FOUND` → `fail robots`/`fail sitemap` | `skip` + gözlenen işaretçi adıyla | Hesap kesintisi "indexing bozuk" diye raporlanıyordu — tam da bu fonksiyonun ayırmaya çalıştığı sınıf |

Düzeltme (issue'nun önerdiği gibi `verify-production-deployment.mjs` ve
`scripts/system-health-core.mjs` ile aynı şekil): `vercelAccountState(vercelError)`
yardımcısı çıkarıldı, hem `DEPLOYMENT_DISABLED` hem `DEPLOYMENT_NOT_FOUND`
eşleştiriliyor ve `unmeasurableReason()` gözlenen işaretçiyi metne taşıyor.
**Çıplak 404 eşleşmiyor**: sağlıklı origin sahip olmadığı her yol için 404 döner,
404'ü yalnız `x-vercel-error` başlığı ayrıştırır (402 tek başına kesin).

Regresyon: `verify-indexing.test.mjs` "a disabled deployment is not evidence
about indexing" — `404 DEPLOYMENT_NOT_FOUND` → `true`, `404 ""`/`404 NOT_FOUND`
→ `false`, `skip` metni `DEPLOYMENT_NOT_FOUND` içeriyor.

### Canlı ölçüm (2026-11-10 ~10:20 UTC — düzeltmeden sonra)

Kesinti bu turda **çözülmüş**; origin yeniden servis ediyor:

```
$ curl -s -o /dev/null -w '%{http_code}' https://isbulkktc.com/          -> 200
$ curl -s -o /dev/null -w '%{http_code}' https://isbulkktc.com/robots.txt -> 200

node scripts/verify-indexing.mjs
  PASS robots    allows crawling; sitemap https://isbulkktc.com/sitemap.xml
  PASS sitemap   207 URLs, all on-origin canonical; 186 with the full hreflang set, 21 single-locale (no hreflang)
  PASS single-loc 3 single-locale entries: the localized duplicate canonicalises back
  PASS pages     8 sampled pages are 200, indexable, with a matching canonical
  PASS indexnow  key file matches isbulkkt…
  0 failure(s), 0 warning(s), 0 skipped
```

Kesinti sırasında ölçüm (issue kanıtı, düzeltmeden önce): `404 DEPLOYMENT_NOT_FOUND`
→ `fail robots`. Düzeltmeden sonra aynı girdi `skip` verir; canlı kesinti
bittiği için `fail`'in `skip`'e döndüğü canlı gösterilemez, ama predicate girdisi
birim testle sabitlendi.

Kapılar: `bun run lint`, `bun run typecheck`, `bun run check:frontend-source`,
`bun run test:unit` (1018/1018) — yeşil.

## Tur 11 — IndexNow anahtarı dosya adına göre seçiliyordu: doğrulayıcının kendi sessiz yanlış-PASS'i (2026-11-10, LANE-VERIFY #309)

**Boyut: mantık / sınır girdi (araç doğruluğu).**

`scripts/verify-indexing.mjs` IndexNow anahtar dosyasını `entries.find(/^[a-z0-9]{8,128}\.txt$/i)`
ile seçiyordu — yani **alfabetik ilk** şekle-uyan `.txt`. IndexNow protokolü anahtar
dosyasını "adı == gövdesi" olarak tanımlar; adı uyan ama gövdesi anahtar olmayan
ikinci bir dosya (ör. `security.txt`, `ads.txt`, bir site-doğrulama `.txt`'si) araya
girdiğinde doğrulayıcı **yanlış dosyayı** çeker. Araç çektiği dosyayı kendi seçtiği
için, yanlış-ama-tutarlı ad/gövde çifti **PASS** verir: sessiz bir yanlış-pozitif,
tam da bu lane'in yakalamak için var olduğu sınıf.

`scripts/submit-indexnow.mjs` zaten paylaşılan `readIndexNowKey` (ad == gövde)
yardımcısına delege edilmişti; doğrulayıcı bu düzeltmeden ayrı düşmüştü.

| Boyut | Gözlenen (önce) | Beklenen (sonra) | Etki |
|---|---|---|---|
| mantık / sınır girdi | `entries.find(...)` → alfabetik ilk `.txt` | `readIndexNowKey` → ad == gövde | Şekle-uyan ikinci `.txt` doğrulamayı sahte PASS'a çevirebiliyordu |

**Kanıt (önce/sonra, aynı dizin — `aaasecurity.txt` + gerçek anahtar):**

```
files: aaasecurity.txt, isbulkktcada1d9ce6917a3363df4ff8fccc7629a.txt
OLD picks: aaasecurity.txt | body: "Contact: mailto:security@example.com"
NEW picks: isbulkktcada1d9ce6917a3363df4ff8fccc7629a.txt | body: "isbulkktcada1d9ce6917a3363df4ff8fccc7629a"
```

Eski mantıkta seçilen dosyanın adı gövdesine eşit değil; doğrulayıcı yine de onu
çekip "eşleşiyor" derdi. Yeni mantık gerçek anahtarı seçer.

**Düzeltme.** `verify-indexing.mjs` `readIndexNowKey`'e delege eder; `readdir`/`readFile`
ithalatı kalktı, `entries.find` deseni gitti. Regresyon testi
(`verify-indexing.test.mjs`) ithalatı `assert.match` ile sabitler ve `entries.find(`
kullanımını `assert.doesNotMatch` ile yasaklar — iki IndexNow çağrı yeri bir daha
ayrışamaz.

**Canlı ölçüm (2026-11-10 ~10:30 UTC, düzeltmeden sonra):**

```
node scripts/verify-indexing.mjs
  PASS robots    allows crawling; sitemap https://isbulkktc.com/sitemap.xml
  PASS sitemap   207 URLs, all on-origin canonical; 186 with the full hreflang set, 21 single-locale
  PASS single-loc 3 single-locale entries: the localized duplicate canonicalises back
  PASS pages     8 sampled pages are 200, indexable, with a matching canonical
  PASS indexnow  key file matches isbulkkt…
  0 failure(s), 0 warning(s), 0 skipped
```

Kapılar: `bun run lint`, `bun run typecheck`, `bun run check:frontend-source`,
`bun run test:unit` (1020/1020) — yeşil.

## Tur 12 — auth-config doğrulayıcısı canlı captcha'yı "kapalı" sanıyordu (2026-11-10, LANE-VERIFY)

**Boyut: doğruluk / yanlış-NEGATİF (araç doğruluğu).**

`scripts/verify-auth-config.mjs` Turnstile durumunu **yerel**
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` ortam değişkeninden okuyordu. O değer *bu ağaçta*
derleme anında gömülen değerdir; üretim ise Vercel tarafından **kendi ortamıyla**
derlenir. Yerel değişken boş olduğunda araç "captcha is disabled" diye not düşüyordu
— oysa üretim paketi canlı bir anahtar taşıyor. Araç, ölçtüğünü sandığı şeyi değil
kendi ortamını raporluyordu.

### Gözlenen / beklenen

| | |
|---|---|
| **Gözlenen** (önce) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY is empty — captcha is disabled.` |
| **Beklenen** (sonra) | `production ships a Turnstile site key (0x4AAAAAAFL-yuC1YeNRT3FB) — captcha is enforced on auth forms.` |

### Kanıt — SSR HTML tuzağı

AGENTS.md uyarısı: Turnstile alanı bir effect içinde render edilir, bu yüzden sunucu
HTML'i her zaman **boş** `<div class="editorial-turnstile"><div></div></div>`
kapsayıcısı içerir — widget canlı olsa bile. SSR'ı grep'lemek "captcha kapalı" der.
Doğru kanıt **dağıtılmış istemci paketi**dir: SDK yükleyicisi
(`challenges.cloudflare.com/turnstile`) yalnızca bir anahtar ayarlıysa çekilir, yanındaki
`0x4A…` anahtarı onu adlandırır.

**Düzeltme.** `detectDeployedCaptcha(origin)` `/login` sayfasını çeker, `_next/static/chunks/*.js`
referanslarını toplar ve ilk Turnstile anahtarını bulur; `main()` artık yerel env var
yerine bu durumu okur. Paket okunamazsa "captcha kapalı" **değil**, "ölçülemedi"
notu düşülür (yanlış-negatifin tam tersi). `fetchText` 15 sn sınırlı; ağ hatası `""`
döner. `turnstileSiteKeyInBundle` ve `detectDeployedCaptcha` dışa açık, `fetchImpl`
enjekte edilebilir — ağ olmadan test edilir.

### Canlı ölçüm (2026-11-10 ~10:15 UTC, düzeltmeden sonra)

```
node scripts/verify-auth-config.mjs
  Project: uwmhquvzbilbfzdrlxmb | Origin: https://isbulkktc.com
  ✅ No configuration inconsistency found.
  ℹ️ production ships a Turnstile site key (0x4AAAAAAFL-yuC1YeNRT3FB) — captcha is enforced on auth forms.
  ℹ️ SUPABASE_ACCESS_TOKEN is unset — Supabase checks skipped.
```

Eşlik eden canlı ölçümler (aynı tur): `verify-indexing` 0 failure / 0 warning / 0 skip;
`verify-deliverability` 0 failure / 3 warning (SPF kök, DMARC `p=none`, blocklist kısmi).

**Regresyon testi.** `verify-auth-config.test.mjs` 8 test: paket taraması SDK URL'i
yokken `null`, varken anahtarı döndürür; `detectDeployedCaptcha` HTTP 200 olmayan
sayfada `checked:false`, anahtarlı pakette `checked:true`, anahtarsız pakette
`siteKey:null`. Yerel env var ile dağıtılmış durum ayrıştığında araç artık dağıtılmış
olanı raporlar.

Kapılar: `bun run lint`, `bun run typecheck`, `bun run check:frontend-source`,
`bun run test:unit` (1022/1022) — yeşil.

## 2026-11-12 — RFC 8058 tek-tıkla çıkış düzeltmesi (deliverability)

### Kök neden

`List-Unsubscribe-Post: List-Unsubscribe=One-Click` başlığı (RFC 8058) Gmail ve
Yahoo'ya "`List-Unsubscribe` HTTPS adresine **POST** at, gövdeyi okuma, yalnız
durum koduna bak" der. Ama `/api/email/unsubscribe` yalnız `GET` sunuyordu →
Gmail'in POST'u **405** dönüyordu → tek-tıkla sessizce başarısız → kullanıcı
"spam bildir"e basıyor. Başlığın var olma amacı tam da bunu önlemekti.

### Düzeltme

`route.ts`: `GET` ve `POST` aynı `optOut(email, signature)` yolunu paylaşır —
HMAC doğrulaması servis istemcisinden **önce**, tek başarı gövdesi, aynı
`no-store`. Yetki sınırı değişmedi (imza hâlâ tek yetki kaynağı).

### Ölçüm (2026-11-12, DoH — token gerekmez)

```
_dmarc.isbulkktc.com   v=DMARC1; p=quarantine; rua=mailto:dmarc@isbulkktc.com; fo=1
isbulkktc.com          v=spf1 include:_spf.mx.cloudflare.net ~all
send.isbulkktc.com     v=spf1 include:amazonses.com ~all
resend._domainkey      p=MIGf… (1024-bit)
```

`node scripts/verify-deliverability.mjs`: **1 failure / 3 warning** —
FAIL yalnız yerel `RESEND_API_KEY` geçersizliği (`re_` ile başlamıyor, len 36);
SPF kök ve blocklist uyarıları bilinen/zararsız.

### Açık kalan (kod dışı, token/insan gerekir)

- [ ] DKIM `1024` → `2048` bit (Resend paneli; anahtar gücü)
- [ ] Üretimde geçerli `RESEND_API_KEY` (`re_…`)
- [ ] DMARC `p=quarantine` → `reject` (raporları izledikten sonra)
- [ ] 3 adreste gelen kutusu/spam doğrulaması (#187)

**Regresyon testi.** `tests/integration/unsubscribe-route.test.ts` +2 (POST
tek-tıkla, POST'ta bozuk imza); `tests/security/unsubscribe-route-auth.test.ts`
+1 (GET/POST tek doğrulama yolu).
