# Runbook: E-posta teslim edilebilirliği (Resend + DNS)

> Gizlilik notu: Kişisel test alıcıları sentetik `example.invalid` adresleriyle gösterilir. Gerçek alıcı adresleri ve üretim alıcı listeleri bu herkese açık runbook'ta tutulmaz.

Bu runbook, `info@isbulkktc.com` üzerinden giden pazarlama/edinim e-postalarının
spam'e değil gelen kutusuna düşmesi için gereken DNS durumunu ve bozulduğunda
nasıl teşhis edileceğini tanımlar. Ölçüm tek komuttur; token gerekmez.

## Tek komut

```
node scripts/verify-deliverability.mjs
```

Google DoH üzerinden canlı DNS'i okur (kimlik bilgisi istemez) ve altı ekseni
raporlar: **SPF, DKIM, DMARC, MX, MTA-STS/TLS-RPT, blocklist**. Son satır bir
özet verir: `N failure(s), M warning(s), K skipped`. Bir kayıt okunamazsa o satır
`skip` olur — asla sahte `FAIL` üretmez.

## Şu anki durum (2026-11-12, canlı ölçüm)

Resend API (`GET /domains`): `isbulkktc.com` **verified**, bölge **eu-west-1**,
`sending: enabled`, `receiving: enabled`. DNS (Google DoH):

```
PASS SPF         send.isbulkktc.com (Return-Path) göndereni yetkilendiriyor
WARN SPF         kök kayıt v=spf1 include:_spf.mx.cloudflare.net ~all — kök göndereni
                 yetkilendirmiyor ama DMARC-uyumlu Return-Path alt alanı yetkilendiriyor
INFO DKIM        resend._domainkey mevcut, 1024-bit — Resend 2048 desteklemez (bilgi)
PASS DMARC       v=DMARC1; p=reject; rua=mailto:dmarc@isbulkktc.com; fo=1
PASS MX          10 receive-euw1.forge.rmta.net.  (gelen posta artık Resend'e düşer)
PASS MTA-STS     _mta-sts.isbulkktc.com → v=STSv1; id=20261112000000
PASS TLS-RPT     _smtp._tls.isbulkktc.com → v=TLSRPTv1; rua=mailto:tlsrpt@isbulkktc.com
WARN Blocklists  SURBL/SpamCop temiz; Spamhaus genel çözümleyiciden sorgulanamaz
PASS Resend      isbulkktc.com status=verified

0 failure(s), 1 warning(s), 1 skipped (MTA-STS policy — sandbox resolver yeni host'u geç çözer)
```

> **2026-11-12 güncellemesi:** DMARC artık **`p=reject`** (yukarıdaki çıktıda
> `PASS DMARC`). MTA-STS ve TLS-RPT kayıtları eklendi ve doğrulandı. Politika
> dosyası yeni host'tan 200 döner
> (`https://mta-sts.isbulkktc.com/.well-known/mta-sts.txt`, `mode: testing`).

> Yukarıdaki çıktı **gerçek `RESEND_API_KEY`** ile alındı:
> `RESEND_API_KEY=re_… node scripts/verify-deliverability.mjs` → **0 hata**.
> (Sandbox `.env`'indeki anahtar sahtedir; o anahtarla çalıştırırsan Resend satırı
> `FAIL` görünür — yok say, gerçek anahtarı komut içinde ver.)

**Yorum:** Gönderim yolu (SPF alt alanı + DKIM + DMARC hizalı) **sağlam** ve gerçek
anahtarla **0 hata**. Kalan `WARN`'lar giden yerleşimi etkilemez (SPF kök kaydı
DMARC-uyumlu alt alanla telafi edilir; MTA-STS/TLS-RPT yalnız gelen duruş).
DMARC artık **`p=reject`** (2026-11-12).

**Dağıtım tazeliği:** Vercel artık `main`'den **otomatik Git dağıtımı** yapıyor
(önceki "200 dönen ama commit geride" boşluğu kapandı). Canlı
`GET https://isbulkktc.com/api/build-info` → `main` ucuyla aynı (`3bcef23`). Yani
bu runbook'taki env değişiklikleri gerçekten canlı derlemede.

## Kalan altyapı maddeleri — sahip için tam adımlar

Aşağıdaki sırayla ilerle. Her madde **kimin yaptığını** ve **nasıl doğrulanacağını**
yazar. `[x]` = bu turda tamamlandı, `[ ]` = senin yapman gerekiyor.

### 1. Resend alanı + gönderim + gelen  — TAMAM `[x]`
Domain doğrulandı, `sending` ve `receiving` açık. Yeni bir şey yapma. Doğrulama:
`GET https://api.resend.com/domains` (anahtar aşağıda) → `status: verified`.

### 2. `info@isbulkktc.com` gelen posta kabul etsin — TAMAM `[x]`
Apex `MX` artık `10 receive-euw1.forge.rmta.net` → gelen posta Resend'e düşer.
**Doğrula:** Resend panosunda `isbulkktc.com` → **Receiving** sekmesi → iletilen
adresler. İstersen geleni gerçek bir kutuya yönlendir (Resend → Receiving →
Forward to).

### 3. Üretim `RESEND_API_KEY` — TAMAM `[x]`
Vercel `RESEND_API_KEY` **doğru ekibin** yeni `re_…` anahtarıyla değiştirildi
(hedef: `production` + `preview`) ve üretim yeniden dağıtıldı. Doğrulama:
`GET /api/email/resend-webhook` **503 → 401**, `POST /api/email/acquisition-campaign`
`Bearer` ile **200** `{"message":"Acquisition campaign complete","sent":0,...}`.

### 4. Cron sırları — `MARKETING_CRON_SECRET` / `ENGAGEMENT_CRON_SECRET` — TAMAM `[x]`
İki sır da `openssl rand -hex 32` ile üretildi ve **hem Vercel'e** (`production`,
`preview`) **hem GitHub Actions'a** (repository secret) **aynı değerle** yazıldı.
Dispatch origin değişkenleri de eklendi:
`MARKETING_DISPATCH_ORIGIN` / `ENGAGEMENT_DISPATCH_ORIGIN` were set to a Vercel deployment alias at the time of the original test; this historical value must be revalidated against current deployment protection.

Doğrulama (uçtan uca): Actions → **Send acquisition campaign** → **Run workflow** →
log `HTTP 200` + `{"message":"Acquisition campaign complete","sent":0,"failed":0}`.
Her iki rota da bearer'sız **401** döner.

> Not: GitHub sırları **yazılınca bir daha okunamaz** (write-only). Üretilen değeri
> güvenli bir yerde sakla; hem GitHub'a hem Vercel'e **aynı** değeri koy.

### 5. Resend webhook — `RESEND_WEBHOOK_SECRET` — TAMAM `[x]`
Webhook oluşturuldu (6 olay: `email.sent/delivered/delivery_delayed/bounced/complained/suppressed`),
`whsec_…` imza sırrı Vercel'e yazıldı (`production`+`preview`) ve yeniden dağıtıldı.

**Cloudflare bulgusu (önemli):** `https://isbulkktc.com` Cloudflare arkasında ve
bot koruması bazı istemci UA'larını **403 error 1010** ile bloklar (ör. Python
`urllib`). Webhook bu yüzden geçmişte **Cloudflare'siz deployment alias**'ına taşınmıştı
(aynı deployment derlemesini sunar). Bu tercih deployment koruma ayarlarıyla
birlikte yeniden doğrulanmadan sürdürülmemelidir.

Doğrulama: doğru Svix imzasıyla POST → **200** `{"message":"Ignored",...}`;
bozuk imza → **401** `{"message":"Invalid signature"}`.

> **20 Kasım 2026 yeniden doğrulama uyarısı:** Yukarıdaki 12 Kasım testleri
> Vercel SSO koruması etkinleştirilmeden önce yapıldı. Güncel Vercel proje ayarında SSO koruması non-custom deployment URL'lerini
> kapsıyor; bu nedenle deployment alias'larının harici Resend webhook isteklerine
> açık olduğu varsayılamaz. Son görülen Resend webhook teslimatları 19 Kasım
> 16:38 UTC'de başarılıydı; 20 Kasım koruma ayarı değişikliğinden sonraki bir
> teslimat henüz doğrulanmadı (issue #719).

> **Önerilen kalıcı topoloji:** Webhook'u `https://isbulkktc.com/api/email/resend-webhook`
> üzerinden al. Cloudflare bot/WAF bunu engelliyorsa yalnızca
> `POST /api/email/resend-webhook` için dar kapsamlı bir skip/allow kuralı
> tanımla; uygulamadaki Svix imza, timestamp/replay ve bounded-body doğrulaması
> zorunlu kalmalı. WAF'ı veya Vercel SSO'yu genel olarak kapatma. Değişiklikten
> sonra Resend'den test event gönderip 2xx teslimat ve uygulama tarafındaki
> event işlenmesini doğrula. DNS/Cloudflare/Vercel ayarları henüz değiştirilmedi.

### 5b. Takım gelen kutusu env'leri — TAMAM `[x]` (2026-11-12 ikinci tur)
Üretimde `SALES_INBOX_EMAIL` / `FEEDBACK_INBOX_EMAIL` / `COMPANY_REVIEW_INBOX_EMAIL`
**hiçbiri yoktu**. `mailer.ts` bunları şöyle çözüyor:

| Env | Tüketici | Yoksa ne olur |
|---|---|---|
| `SALES_INBOX_EMAIL` | `getReplyToInbox()` — her mesaja `Reply-To` | Giden posta `no-reply@`'dan çıkar, **`Reply-To` yok** → yanıt kaybolur, `List-Unsubscribe` mailto yedeği düşer |
| `FEEDBACK_INBOX_EMAIL` | `getFeedbackInbox()` — geri bildirim takım uyarısı | Uyarı **sessizce atlanır** (`console.warn`, hata yok) |
| `COMPANY_REVIEW_INBOX_EMAIL` | `getCompanyReviewInbox()` — şirket profili inceleme uyarısı | Uyarı **sessizce atlanır** |

Üçü de Vercel'e (`production`+`preview`) `info@isbulkktc.com` olarak yazıldı ve
üretim yeniden dağıtıldı. **Not:** `email-preview.mjs` yerel önizleme yolu
`reply_to`'yu `info@`'a sabit varsayılanla dolduruyordu; bu yüzden test postaları
doğru göründü ve eksik env fark edilmedi — üretim yolu varsayılansızdır.

**Doğrula:** bir edinim/etkileşim e-postasının başlığında `Reply-To: info@isbulkktc.com`
görünmeli. `getReplyToInbox()` artık `SALES_INBOX_EMAIL` ile dolu.

### 6. DMARC `p=none` → `quarantine` → `reject` `[x]` — TAMAMLANDI (2026-11-12)
Cloudflare DNS `_dmarc.isbulkktc.com` TXT güncellendi:
`v=DMARC1; p=reject; rua=mailto:dmarc@isbulkktc.com; fo=1`.
Geçiş güvenliydi çünkü gönderim **hizalı**: DKIM (`resend._domainkey`) hizalı,
Return-Path `send.isbulkktc.com` SPF'i hizalı, Resend alanı `verified`.
İki bağımsız çözümleyici (Cloudflare DoH + Google DoH) `p=reject` döndü;
`verify-deliverability.mjs` → `PASS DMARC`.

> Geri alma: `p=quarantine`'a (ya da gerekiyorsa `p=none`'a) döndürmek yeter (tek TXT kaydı). Raporlar
> `dmarc@isbulkktc.com`'a akmaya devam eder.

### 6b. DMARC raporlarını okuma — `npm run dmarc:reports` `[x]`
`p=reject` sonrası soru "DMARC yapılandırıldı mı?" değil, **"DMARC ne görüyor?"**dur;
o yanıt yalnız `dmarc@isbulkktc.com`'a gelen RUA raporlarındadır. Betik raporları
Resend receiving API'den çeker, `.xml` / `.xml.gz` / `.zip` sarmalını açar ve özetler
(bağımlılık yok — yalnız `node:zlib`):

```
RESEND_API_KEY=re_… npm run dmarc:reports -- --days 30
RESEND_API_KEY=re_… npm run dmarc:reports -- --days 30 --json
node scripts/read-dmarc-reports.mjs --file ./google.com!isbulkktc.com!….xml.gz  # çevrimdışı
```

Üç sonuç: **`OK`** (tüm mesajlar hizalı geçti) · **`WARN`** (quarantine/reject'e
düşen mesaj var — üstteki kaynak IP'leri kontrol et) · **`EMPTY`** (henüz rapor yok;
yeni kutu için normaldir, 1-2 gün sonra yeniden çalıştır). Rapor yokluğu **hata
değildir** (exit 0).

### 7. MTA-STS + TLS-RPT `[x]` — TAMAMLANDI (2026-11-12)
Bunlar **giden yerleşimi etkilemez**, yalnız bu alanın *aldığı* postanın TLS
duruşunu yayınlar. **Hem kod hem altyapı bitti.** Vercel'e `mta-sts.isbulkktc.com`
eklendi (`verified`), Cloudflare'e 3 kayıt girildi ve canlı doğrulandı:
`GET https://mta-sts.isbulkktc.com/.well-known/mta-sts.txt` → **200**, `text/plain`,
`mode: testing`; `verify-deliverability.mjs` → `PASS MTA-STS` / `PASS TLS-RPT`.
Aşağıdaki adımlar yalnız yeniden kurulum/yeni alan adı içindir.

**Kod tarafı (bu repoda, tamam):** politika dosyası uygulamadan sunuluyor —
`src/app/.well-known/mta-sts.txt/route.ts` → `GET /.well-known/mta-sts.txt` 200
döner, gövde:

```
version: STSv1
mode: testing
mx: receive-euw1.forge.rmta.net
max_age: 604800
```

`mode: testing` bilinçli ilk-adımdır: TLS kurulamazsa gönderen postayı yine teslim
eder, yalnız TLS-RPT ile raporlar. Raporlar temizlenince `mode: enforce`'a çek
(aynı DMARC `none` → `reject` mantığı). MX host'unu `MTA_STS_MX_HOST` env'i ile
geçersiz kılabilirsin; varsayılan canlı gelen MX'tir.

**Sahip adımları (yeniden kurulum için):**

1. **Vercel'e `mta-sts.isbulkktc.com` alan adını ekle** — projeye bağla
   (Settings → Domains → Add). Bu host'ta sayfa yok; yalnız politika dosyası
   sunulur. **Kritik:** bu host **redirect etmemeli** — RFC 8461 §3.3 bir
   yönlendirmeyi takip etmeyi yasaklar, politika arkasındaki 301/308 gönderen
   tarafından okunmaz. Vercel'de "Redirect to" kapalı olsun; `www` → apex
   yönlendirmesi **bu host için geçerli değil** (ayrı host).
2. **Cloudflare DNS** — `mta-sts` host'u için Vercel CNAME'i (gri bulut / proxy
   kapalı) ekle, sonra iki TXT:
   - `_mta-sts.isbulkktc.com` TXT: `v=STSv1; id=20261112000000`
   - `_smtp._tls.isbulkktc.com` TXT: `v=TLSRPTv1; rua=mailto:tlsrpt@isbulkktc.com`
3. **Doğrula:** `node scripts/verify-deliverability.mjs` → `PASS MTA-STS policy`
   (politika dosyasını redirect'siz 200 olarak okur) ve `PASS MTA-STS` / `PASS
   TLS-RPT` (TXT kayıtları). Politika dosyası 200 dönmezse ya da yönlendirirse
   araç `WARN` yazar.

### 8. Gerçek gelen kutusu / spam doğrulaması `[x]` — Gmail Gelen Kutusu teyit edildi
Araç bunu yapamaz; gerçek bir kutu gerekir. Outlook'a yapılan gönderimler hâlâ
sahibin o kutuları kontrol etmesini bekler (`delivery_delayed`'da kaldılar).

Ayrıca sahip talebiyle **Gmail**'e (`test-recipient-02@example.invalid`) bir test postası
gönderildi; Gmail sunucusu **`delivered`** ile kabul etti ve **sahip iletinin Gelen
Kutusu'na düştüğünü teyit etti** (spam değil). Gmail bu testte greylisting yapmadı;
Outlook'un `delivery_delayed` davranışından farklı olarak **teyitli gelen kutusu
yerleşimi** verdi — bu, gönderim yolunun (SPF alt alanı + DKIM + DMARC `p=reject`
hizalı) giden yerleşimde çalıştığının ilk gerçek-kutu kanıtıdır.

### Isınma (DNS ile çözülmez)
Yeni alan + sıfır itibar: düşük hacimle başla, yalnız onaylı/ilgili alıcıya gönder,
alıcıların "spam değil" işaretlemesini sağla. Hacmi haftalar içinde kademeli artır.

## Bu turda gönderilen test postaları (2026-11-12)

> **Adres düzeltmesi (sahip, 2026-11-12):** doğru üç adres
> `test-recipient-06@example.invalid`, `test-recipient-04@example.invalid` ve
> `test-recipient-03@example.invalid`'dur. Aşağıdaki tablolarda geçen
> `test-recipient-05@example.invalid` **yanlış** adrestir (yazım hatası, hard
> bounce etti); yeni gönderimlerde **kullanılmaz**. Satırlar geçmiş kayıt olarak
> bırakıldı.

`RESEND_API_KEY='re_…' node scripts/email-preview.mjs --only marketing --send <adres>`
ile üç adrese gönderildi. Hepsi `from İşBul KKTC <info@isbulkktc.com>`,
`reply_to info@isbulkktc.com`, konu TR:

| Alıcı | Resend e-posta id | son olay |
|---|---|---|
| test-recipient-06@example.invalid | `01a1d203-3eac-7435-b840-80cc21926541` | sent |
| test-recipient-05@example.invalid | `01a1d203-3fb1-73aa-98f7-e8b865102bd9` | sent |
| test-recipient-03@example.invalid | `01a1d203-40b6-7e84-ada2-c7e97cda60b6` | sent |

**Yeni anahtarla ikinci gönderim (aynı gün):** doğru ekibin anahtarı Vercel'e
yazıldıktan sonra üç adrese yeniden gönderildi. Gönderim anında `sent`; sonradan
üçü de **`delivery_delayed`** oldu (Outlook greylisting — kalıcı ret değil):

| Alıcı | Resend e-posta id | son olay |
|---|---|---|
| test-recipient-06@example.invalid | `01a1d23c-2df0-7cbd-a4a5-d6e701aa74e4` | delivery_delayed |
| test-recipient-05@example.invalid | `01a1d23c-2efa-734e-bdba-7a6b89083958` | delivery_delayed |
| test-recipient-03@example.invalid | `01a1d23c-3027-7d63-8df8-92dc46c132cb` | delivery_delayed |

**Üçüncü gönderim — `Reply-To` düzeltmesinden sonra (2026-11-12, aynı gün):**
`SALES_INBOX_EMAIL` Vercel'e yazıldıktan sonra üç adrese yeniden gönderildi.
Her üçünde de `from İşBul KKTC <info@isbulkktc.com>`, **`reply_to info@isbulkktc.com`**
doğrulandı (`GET /emails/<id>`):

| Alıcı | Resend e-posta id | reply_to | son olay |
|---|---|---|---|
| test-recipient-06@example.invalid | `01a1d24c-3c7e-7e46-844b-145126219007` | info@isbulkktc.com | sent |
| test-recipient-05@example.invalid | `01a1d24c-3d88-704d-a357-f69e88fb6ee5` | info@isbulkktc.com | sent |
| test-recipient-03@example.invalid | `01a1d24c-3e92-7b54-8ff3-05a38424900d` | info@isbulkktc.com | sent |

`last_event` başta `sent` olur; `delivered` = alıcı sunucu kabul etti (yine de
gelen kutusu garantisi değildir), `delivery_delayed` = alıcı sunucu 4xx ile
erteledi (Outlook'ta yaygın, alıcı-tarafı itibar sinyali — kimlik doğrulama
sorunu değil), `bounced` = kalıcı ret. Olayları izle:
```
curl -H "Authorization: Bearer re_…" https://api.resend.com/emails/<id>
```

### Bounce → bastırma hattı doğrulandı (2026-11-12)

Üç adrese gönderilen testte `test-recipient-05@example.invalid` **hard bounce**
verdi (Resend `email.bounced`, "mailbox unavailable" — geçersiz adres, teslim
edilebilirlik kusuru değil). Webhook bunu işledi ve **otomatik bastırma** devreye
girdi:

| Adım | Kanıt |
|---|---|
| Resend olayı | `email.bounced`, 2026-11-13 00:30:09 UTC |
| Webhook işledi | `POST /api/resend-webhook` 200 (Svix imzası geçti) |
| Bastırma kaydı | `public.email_engagement_optouts` → `(test-recipient-05@example.invalid, reason=bounce, 00:30:11)` |

Yani bounce → opt-out hattı **uçtan uca çalışıyor**; geçersiz adres artık pazarlama
gönderimlerinden otomatik düşecek. Hem edinim hem etkileşim yolu bu tabloyu
filtreler: `list_marketing_recipients` (edinim) ve `list_engagement_recipients`
(etkileşim) `not exists (select 1 from email_engagement_optouts where email = lower(...))`
koşulunu taşır. Etkileşim digest'i 50 alıcılık keyset sayfaları döndürür; GitHub cron
cursor'ı takip ederek sayfaları ayrı Vercel çağrılarında tüketir. Cursor kalıcı DB
checkpoint'i değildir. Haftalık anahtar her hafta Pazartesi UTC tarihini kullanır;
Resend idempotency kayıtları yalnız 24 saat tutulduğu için aynı hafta içindeki
yeniden deneme de yalnız bu 24 saat içinde duplicate-safe kabul edilmelidir. Bu
süre geçtikten sonra workflow'u körlemesine yeniden çalıştırma; önce Resend
gönderim kayıtlarını uzlaştır. Kalıcı gönderim defteri/checkpoint'i hâlâ açık
ölçek/güvenilirlik işidir.

Edinim kampanyası da 25 alıcılık keyset sayfaları döndürür; GitHub cron cursor'ı
ayrı Vercel çağrılarında izler. Başarılı gönderimden sonra lead `contacted` olur;
gönderim veya durum güncelleme hatası workflow'u başarısız kılar ve lead'i
kuyrukta bırakır. Manuel retry, aynı Resend idempotency anahtarını kullanmak için
ilk çalıştırmadaki `campaign_date` değerini vermelidir ve yalnız 24 saat içinde
duplicate-safe kabul edilmelidir. Bu süreden sonra önce Resend gönderim
kayıtlarını ve lead durumunu uzlaştır. Kalıcı gönderim defteri hâlâ açık.
Aynı gün üç adres için ölçülen **gönderim uygunluğu**:

| Adres | `eligible_for_send` | Neden |
|---|---|---|
| test-recipient-05@example.invalid | **false** | hard bounce → `email_engagement_optouts` |
| test-recipient-06@example.invalid | true | teslim edildi |
| test-recipient-03@example.invalid | true | teslim edildi |

Doğrulama sorgusu:

```sql
select email, reason, opted_out_at
from public.email_engagement_optouts
order by opted_out_at desc;
```

Not: tablo adı `email_engagement_optouts`'tur (`engagement_optouts` değil). Bu
adı sorgularken `42P01 relation does not exist` alırsanız **yanlış ad** kullanıyorsunuz;
migration eksiği yok.

### Dördüncü gönderim — DMARC `p=reject` sonrası (2026-11-12)

DMARC `reject`'e çekildikten sonra aynı yolla üç adrese yeniden gönderildi
(`from İşBul KKTC <info@isbulkktc.com>`, `reply_to info@isbulkktc.com`):

| Alıcı | Resend e-posta id | gönderim anı | sonraki ölçüm |
|---|---|---|---|
| test-recipient-06@example.invalid | `01a1d461-cc1d-7f0f-9214-7a9ddb2df7c3` | sent | delivery_delayed |
| test-recipient-03@example.invalid | `01a1d461-cd23-792c-837d-f3a7918db659` | sent | delivery_delayed |
| test-recipient-04@example.invalid | `01a1d462-ea3a-7852-8a3f-2e5f650214b8` | sent | delivery_delayed |

**Düzeltme:** doğru adres `test-recipient-04@example.invalid`'dur. Yanlış yazım
`test-recipient-05@example.invalid` bu turda `suppressed` döndü — Resend
bastırma listesindeki (önceki hard bounce) adresi **göndermeden engelledi**, yani
bounce → bastırma hattı yeniden doğrulandı.

**`delivery_delayed` bir sorun değildir.** Üç adres de sonradan `delivery_delayed`
gösterir; bu alıcı sunucunun (Outlook) 4xx ile geçici ertelediği anlamına gelir —
kalıcı ret değil, kimlik doğrulama hatası değil. Yeni alan + sıfır itibarda
Outlook'un ilk günlerde greylisting/geciktirme yapması beklenir ve alıcı-tarafı
bir itibar sinyalidir. Kritik ayrım: `bounced` (kalıcı, bastırır) ≠ `delivery_delayed`
(geçici, yeniden denenir). Son durumu şu komutla izle:
```
RESEND_API_KEY=re_… node scripts/verify-deliverability.mjs   # DNS + Resend
curl -s -H "Authorization: Bearer re_…" https://api.resend.com/emails/<id>   # tek ileti
```
Zaman içinde `delivered`'a dönmesi beklenir; dönmezse (birkaç gün) MX/MTA-STS
politikasını ve Outlook postmaster panelini incele.

### Beşinci gönderim — Gmail'e spam/yerleşim kontrolü (2026-11-12, sahip talebi)

Sahip, önceki testin spam'e mi gelen kutusuna mı düştüğünü hatırlamadığını
belirtti ve **yeni bir alıcı** verdi: `test-recipient-02@example.invalid`. Önceki
gönderimlerin hepsi Outlook'a gitti ve yalnızca `delivery_delayed` gösterdi —
yani hiçbiri teyitli `delivered` durumuna ulaşmadı. Gmail farklı bir alıcı
sunucudur ve bu testte **greylisting yapmadı**.

`RESEND_API_KEY='re_…' RESEND_FROM_EMAIL='İşBul KKTC <info@isbulkktc.com>' node scripts/verify-deliverability.mjs --send <owner-supplied-test-mailbox> --confirm-send

| Alıcı | Resend e-posta id | gönderim anı | sonraki ölçüm |
|---|---|---|---|
| test-recipient-02@example.invalid | `01a1d4ff-8cf1-7715-abba-cc3d9945d8e1` | sent | **delivered** |

`from İşBul KKTC <info@isbulkktc.com>`, konu `isbulkktc deliverability test`.
`delivered`, Gmail sunucusunun iletiyi kabul ettiği anlamına gelir. **Sahip
iletiyi Gmail Gelen Kutusu'nda buldu (spam değil)** — giden yerleşim teyit edildi.

> **Anahtar kurtarma notu (bu turda öğrenildi):** üretim `RESEND_API_KEY`'i
> Vercel'in proje düzeyi liste ucundan şifreli bir zarf (`eyJ2…`) olarak döner ve
> çözülemez. **Tek bir env değişkeni** için
> `GET https://api.vercel.com/v9/projects/<projId>/env/<envId>?teamId=<teamId>&decrypt=true`
> ucu düz metin değeri döndürür. Anahtar sandbox'ta bu yolla kurtarıldı.

## DKIM bit uzunluğu — düzeltilecek bir şey DEĞİL (2026-11-12 düzeltmesi)

Önceki sürüm "DKIM'i 2048-bit'e rotate et" diyordu. **Bu yanlıştı.** Resend resmî
dokümanı (`resend.com/docs/knowledge-base/do-i-need-2048-dkim`) kesin konuşur:

> "Resend signs outbound mail with 1024-bit DKIM keys … **Resend does not support
> 2048-bit DKIM keys.** You can't change the key length, and Resend doesn't rotate
> or regenerate keys on request. The key Resend creates when you add a domain stays
> with that domain, even if you delete the domain and add it again to that team."

Yani 1024-bit anahtar ne Cloudflare'de ne Zoho'da ayarlanır; **Resend'in sunduğu
tek şeydir ve değiştirilemez**. 1024-bit RFC 8301'e uyar ve Google/Yahoo/Microsoft
toplu-gönderen kurallarını karşılar. `p=` değerini (TXT) elle 2048-bit'lik bir
anahtarla değiştirmek gönderimi **bozar** (özel anahtar Resend'de yok → imza
doğrulanamaz → DKIM fail). Araç bu yüzden 1024-bit için artık `WARN` değil `INFO`
yazar; gerçek `<1024-bit` yine `FAIL`'dir.

**"Spam düşüyor"un gerçek nedenleri (kod/durum):**

1. **`info@isbulkktc.com` gelen posta kabul etmiyor** (Resend receiving kapalı;
   apex MX Cloudflare Email Routing'de). Reply-To bouncelar ve spam-şikayet
   döngüsü → itibar kaybı. Çözüm: CF Email Routing'de `info@` → gerçek kutu
   yönlendirmesi kur **veya** `SALES_INBOX_EMAIL`/`RESEND_FROM_EMAIL`'i gelen
   kabul eden bir kutuya çevir.
2. **`[TEST]` konu öneki** (test gönderim yolu) — bilinen spam tetikleyicisi; kod
   düzeltildi (`a074fb1`).
3. **RFC 8058 tek-tıkla çıkış**: `/api/email/unsubscribe` yalnız `GET` sunuyordu,
   `List-Unsubscribe-Post` POST bekliyordu → 405 → kullanıcı "spam bildir"e
   basıyordu. Düzeltildi (`0e5ac77`).
4. **Yeni domain + sıfır itibar**: ısınma (düşük hacim, ilgili/onaylı alıcı) ve
   alıcıların "spam değil" işaretlemesi gerekir. Bu, DNS ile çözülmez.

## Scheduler (cron) — edinim ve etkileşim e-postaları

İki rota vardı, dağıtılmıştı ve **herkese 401** dönüyordu: hiçbir çağıran bearer
sırrı sunmuyordu, yani edinim ailesinde **hiç trafik yoktu**. İki workflow bu
çağrıyı yapar (her biri tek bir işi yapar; tek workflow'a iki `schedule` koymak
her cron'da iki işi birden çalıştırır):

| Workflow | Rota | Zamanlama |
|---|---|---|
| `.github/workflows/acquisition-campaign.yml` | `POST /api/email/acquisition-campaign` | Her gün 06:00 UTC |
| `.github/workflows/engagement-digest.yml` | `POST /api/email/engagement-digest` | Pazartesi 07:00 UTC |

**Gerekli repository secret'ları** (ikisi de yoksa iş yeşil kalır ve uyarır —
sahte kırmızı yok):

- `APP_URL` (veya `vars.APP_URL`) — üretim adresi.
- `MARKETING_CRON_SECRET` — sunucudaki `MARKETING_CRON_SECRET` ile **aynı** değer.
- `ENGAGEMENT_CRON_SECRET` — sunucudaki `ENGAGEMENT_CRON_SECRET` ile **aynı** değer.

Workflow, Cloudflare bot koruması nedeniyle tarihsel olarak bir deployment alias'ı
kullanıyordu (`vars.MARKETING_DISPATCH_ORIGIN` / `vars.ENGAGEMENT_DISPATCH_ORIGIN`).
Güncel Vercel deployment protection bu alias'ları engelleyebilir; 20 Kasım
uyarısındaki yeniden doğrulama yapılmadan bu rotaya güvenilmemelidir.

Her iki rota da Resend idempotency key kullanır; bu, sağlayıcının sınırlı
idempotency saklama penceresi içinde tekrarları azaltır ancak kalıcı exactly-once
garantisi değildir. Acquisition gönderimi kabul edildikten sonra DB işaretleme
başarısız olursa sonraki kampanya tarihinde tekrar gönderim riski vardır (issue
#710); reconciliation tamamlanmadan yeni kampanya başlatılmamalıdır.

## Doğrulama kapısı

`scripts/verify-deliverability.mjs` içindeki saf fonksiyonlar
(`dkimKeyBits`, `dkimKeyVerdict`, `classifyTransportSecurity`) birim testlerle
kilitlidir: gerçek 512/1024/2048-bit RSA SPKI anahtarları, bozuk değer, eksik
kayıt, sorgu hatası. Regresyon testi:
`node --test scripts/verify-deliverability.test.mjs`.

## Domain'i Resend'e ekleme — sahip için tam adımlar

**Önemli bulgu (2026-11-12 DoH):** `rsend.isbulkktc.com` CNAME →
`rsend-euw1.forge.rmta.net` ve `send.isbulkktc.com` → `send.forge.rmta.net`.
`forge.rmta.net`, **Resend Forge**'un kendi altyapısıdır (Resend dokümanı:
`receive.forge.rmta.net`, `receive-euw1.forge.rmta.net`). Yani `isbulkktc.com`
**bir Resend ekibinde zaten doğrulanmış** ve gönderim yapıyor. Sahibin panelinde
"hiçbir şey yapılmamış" görünmesinin nedeni: **yanlış ekibe (team) bakılıyor.**

### Yol A — domain başka bir ekibinizde (en olası)

1. `resend.com/login` → sağ üst **team switcher**'dan tüm ekipleri tek tek seç;
   `isbulkktc.com`'un **verified** olduğu ekibi bul.
2. O ekipte domain **Configuration → Activate Resend Forge** zaten yeşilse hiçbir
   şey yapma; gönderim bu ekipten yapılır.
3. API anahtarını da **o ekipte** üret (Settings → API Keys → Create), `re_…` ile
   başlar. Bu anahtarı sunucuya `RESEND_API_KEY` olarak koy.

### Yol B — domain başka bir ekipte ve erişiminiz yok → "Claim"

1. Doğru ekipte **Add Domain** → `isbulkktc.com` yaz.
2. Resend "already in use" uyarısı ve bir **TXT claim kaydı** verir.
3. O TXT'i Cloudflare DNS'e ekle → panelde **I've added the records**.
4. Resend sahipliği doğrular, domain'i eski ekipten **serbest bırakır**, size
   gönderim/alım kayıtlarını gösterir.

### Yol C — temiz kurulum (domain hiçbir ekipte değilse)

1. **Add Domain** → `isbulkktc.com`, bölge **eu-west-1**, Return-Path varsayılan
   (`send`). (Return-Path sonradan **değiştirilemez**; değiştirmek isterseniz
   domaini silip yeniden eklemeniz gerekir.)
2. **Records** sekmesindeki kayıtları **birebir** Cloudflare'e gir (kopyala-yapıştır;
   CNAME'lerde **proxy kapalı / gri bulut** olmalı).
3. **Verify DNS Records** → genelde 15 dk, en fazla 72 saat.
4. Doğrula: `node scripts/verify-deliverability.mjs` → `PASS SPF/DKIM/DMARC`.

> DKIM anahtar uzunluğu **seçilmez**: Resend her domain için 1024-bit üretir ve
> değiştirilemez (yukarıdaki düzeltme bölümü). Ne Cloudflare ne Zoho bu ayarı sunar.

## Açık kalan maddeler — durum (2026-11-12)

Tam adımlar için yukarıdaki **"Kalan altyapı maddeleri"** bölümüne bak.

- [x] Resend alanı doğrulandı (sending + receiving açık)
- [x] `info@isbulkktc.com` gelen posta kabul ediyor (apex MX → Resend)
- [x] Üretim `RESEND_API_KEY` doğru ekibin `re_…` anahtarıyla güncellendi (Vercel
      `production`+`preview`) ve üretim yeniden dağıtıldı; rota 200 döndü
- [x] `MARKETING_CRON_SECRET` / `ENGAGEMENT_CRON_SECRET` — Vercel **ve** GitHub
      Actions'a aynı değerle yazıldı; `MARKETING/ENGAGEMENT_DISPATCH_ORIGIN`
      değişkenleri eklendi; `workflow_dispatch` uçtan uca HTTP 200
- [x] `RESEND_WEBHOOK_SECRET` + Resend webhook endpoint (`sent/delivered/delivery_delayed/bounced/complained/suppressed`)
      — endpoint Cloudflare'siz Vercel alias'ına yönlendirildi (aşağıdaki 1010 notu)
- [x] Takım gelen kutusu env'leri (`SALES_INBOX_EMAIL` / `FEEDBACK_INBOX_EMAIL` /
      `COMPANY_REVIEW_INBOX_EMAIL`) → `info@isbulkktc.com`, Vercel `production`+`preview`
- [x] Webhook bounce → bastırma hattı doğrulandı (`email.bounced` → `email_engagement_optouts`)
- [x] DMARC `p=none` → `quarantine` → **`reject`** (Cloudflare DNS; hizalı gönderim teyit edildi, 2 resolver)
- [x] MTA-STS politika dosyası **kodda sunuluyor** (`/.well-known/mta-sts.txt`, `mode: testing`)
- [x] MTA-STS + TLS-RPT **DNS kayıtları** (Vercel host + CF CNAME/TXT; canlı 200, `verify-deliverability` PASS)
- [x] Gerçek gelen kutusu/spam yerleşim doğrulaması — **Gmail teyitli Gelen Kutusu**
      (2026-11-12, sahip): `test-recipient-02@example.invalid` adresine gönderilen test
      `delivered` oldu ve **spam'e değil Gelen Kutusu'na düştü**. Outlook'a yapılan
      4 gönderim `delivery_delayed`'da kaldı (alıcı-tarafı greylisting; kimlik
      doğrulama sorunu değil)
- [x] **GA4 canlı ölçüm** — `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-HNM3KEX9VD` Vercel
      `production`+`preview`'a yazıldı ve yeniden dağıtıldı; tarayıcıda onay sonrası
      `gtag.js` + `page_view` + `google-analytics.com/g/collect` isteği doğrulandı,
      onay yokken sıfır istek (2026-11-12)
- [~] ~~DKIM `1024` → `2048`~~ **iptal: Resend 2048 desteklemiyor**

### Cloudflare 1010 bot-koruması notu (2026-11-12)

`https://isbulkktc.com` Cloudflare arkasında ve bot koruması bazı istemci UA'larını
**403 error 1010** ile bloklar (ör. Python `urllib`). Bu nedenle webhook ve cron çağrıları tarihsel olarak Cloudflare'i atlayan bir
deployment alias'ı üzerinden yapılandırılmıştı. Vercel deployment protection
sonradan değiştiği için eski 200/401 testleri güncel erişimi kanıtlamaz. Kalıcı
çözüm, public custom domain üzerinden çağrı yapmak ve gerekiyorsa yalnızca ilgili
POST endpoint'leri için dar kapsamlı Cloudflare kuralı eklemektir. Uygulama
katmanındaki Svix ve cron Bearer doğrulamaları korunmalıdır.
