# Runbook: E-posta teslim edilebilirliği (Resend + DNS)

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
WARN DMARC       v=DMARC1; p=quarantine; rua=mailto:dmarc@isbulkktc.com; fo=1
PASS MX          10 receive-euw1.forge.rmta.net.  (gelen posta artık Resend'e düşer)
WARN MTA-STS     _mta-sts kaydı yok (yalnız gelen posta duruşu; giden yerleşimi etkilemez)
WARN TLS-RPT     _smtp._tls kaydı yok (yalnız gelen posta duruşu; giden yerleşimi etkilemez)
WARN Blocklists  SURBL/SpamCop temiz; Spamhaus genel çözümleyiciden sorgulanamaz
PASS Resend      isbulkktc.com status=verified

0 failure(s), 5 warning(s), 0 skipped
```

> Yukarıdaki çıktı **gerçek `RESEND_API_KEY`** ile alındı:
> `RESEND_API_KEY=re_… node scripts/verify-deliverability.mjs` → **0 hata**.
> (Sandbox `.env`'indeki anahtar sahtedir; o anahtarla çalıştırırsan Resend satırı
> `FAIL` görünür — yok say, gerçek anahtarı komut içinde ver.)

**Yorum:** Gönderim yolu (SPF alt alanı + DKIM + DMARC hizalı) **sağlam** ve gerçek
anahtarla **0 hata**. Kalan `WARN`'lar giden yerleşimi etkilemez (SPF kök kaydı
DMARC-uyumlu alt alanla telafi edilir; MTA-STS/TLS-RPT yalnız gelen duruş;
DMARC `p=quarantine` zaten yeterli).

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
`MARKETING_DISPATCH_ORIGIN` / `ENGAGEMENT_DISPATCH_ORIGIN` = `https://isbulkktc-prod.vercel.app`.

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
`urllib`). Webhook bu yüzden **Cloudflare'siz Vercel alias**'ına taşındı:
`https://isbulkktc-prod.vercel.app/api/email/resend-webhook` (cron'ların da
kullandığı alias; aynı derlemeyi sunar). Kanonik host da çalışır ama alias
Cloudflare'i tamamen atlar.

Doğrulama: doğru Svix imzasıyla POST → **200** `{"message":"Ignored",...}`;
bozuk imza → **401** `{"message":"Invalid signature"}`.

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

### 6. DMARC `p=quarantine` → `reject` `[ ]` (raporları izledikten sonra)
Şimdilik bırak. `rua=mailto:dmarc@isbulkktc.com` raporlarını birkaç hafta izle;
meşru posta hep SPF+DKIM'den geçiyorsa Cloudflare DNS'te `_dmarc` TXT'sini
`v=DMARC1; p=reject; rua=…; fo=1` yap. **Erken yapma:** hizasız bir kaynak varsa
`reject` onu tamamen düşürür.

### 7. MTA-STS + TLS-RPT `[ ]` (isteğe bağlı — yalnız gelen duruş)
Bunlar **giden yerleşimi etkilemez**, yalnız bu alanın *aldığı* postanın TLS
duruşunu yayınlar. İstersen:
- `_smtp._tls.isbulkktc.com` TXT: `v=TLSRPTv1; rua=mailto:tlsrpt@isbulkktc.com`
- `_mta-sts.isbulkktc.com` TXT: `v=STSv1; id=20261112000000`
- `https://mta-sts.isbulkktc.com/.well-known/mta-sts.txt` (statik dosya) yayınla.

### 8. Gerçek gelen kutusu / spam doğrulaması `[ ]`
Araç bunu yapamaz; gerçek bir kutu gerekir. Bu turda üç adrese test postası
gönderildi (aşağıya bak). **Yapılacak:** o üç kutuda **Gelen Kutusu**'nu kontrol
et; spam'deyse **"Spam değil"** işaretle (ısınma için kritik).

### Isınma (DNS ile çözülmez)
Yeni alan + sıfır itibar: düşük hacimle başla, yalnız onaylı/ilgili alıcıya gönder,
alıcıların "spam değil" işaretlemesini sağla. Hacmi haftalar içinde kademeli artır.

## Bu turda gönderilen test postaları (2026-11-12)

`RESEND_API_KEY='re_…' node scripts/email-preview.mjs --only marketing --send <adres>`
ile üç adrese gönderildi. Hepsi `from İşBul KKTC <info@isbulkktc.com>`,
`reply_to info@isbulkktc.com`, konu TR:

| Alıcı | Resend e-posta id | son olay |
|---|---|---|
| muhammedali.kahraman@outlook.com | `01a1d203-3eac-7435-b840-80cc21926541` | sent |
| muhammed.ali.kahraman@outlook.com | `01a1d203-3fb1-73aa-98f7-e8b865102bd9` | sent |
| letgodeneme97@outlook.com | `01a1d203-40b6-7e84-ada2-c7e97cda60b6` | sent |

**Yeni anahtarla ikinci gönderim (aynı gün):** doğru ekibin anahtarı Vercel'e
yazıldıktan sonra üç adrese yeniden gönderildi. Gönderim anında `sent`; sonradan
üçü de **`delivery_delayed`** oldu (Outlook greylisting — kalıcı ret değil):

| Alıcı | Resend e-posta id | son olay |
|---|---|---|
| muhammedali.kahraman@outlook.com | `01a1d23c-2df0-7cbd-a4a5-d6e701aa74e4` | delivery_delayed |
| muhammed.ali.kahraman@outlook.com | `01a1d23c-2efa-734e-bdba-7a6b89083958` | delivery_delayed |
| letgodeneme97@outlook.com | `01a1d23c-3027-7d63-8df8-92dc46c132cb` | delivery_delayed |

**Üçüncü gönderim — `Reply-To` düzeltmesinden sonra (2026-11-12, aynı gün):**
`SALES_INBOX_EMAIL` Vercel'e yazıldıktan sonra üç adrese yeniden gönderildi.
Her üçünde de `from İşBul KKTC <info@isbulkktc.com>`, **`reply_to info@isbulkktc.com`**
doğrulandı (`GET /emails/<id>`):

| Alıcı | Resend e-posta id | reply_to | son olay |
|---|---|---|---|
| muhammedali.kahraman@outlook.com | `01a1d24c-3c7e-7e46-844b-145126219007` | info@isbulkktc.com | sent |
| muhammed.ali.kahraman@outlook.com | `01a1d24c-3d88-704d-a357-f69e88fb6ee5` | info@isbulkktc.com | sent |
| letgodeneme97@outlook.com | `01a1d24c-3e92-7b54-8ff3-05a38424900d` | info@isbulkktc.com | sent |

`last_event` başta `sent` olur; `delivered` = alıcı sunucu kabul etti (yine de
gelen kutusu garantisi değildir), `delivery_delayed` = alıcı sunucu 4xx ile
erteledi (Outlook'ta yaygın, alıcı-tarafı itibar sinyali — kimlik doğrulama
sorunu değil), `bounced` = kalıcı ret. Olayları izle:
```
curl -H "Authorization: Bearer re_…" https://api.resend.com/emails/<id>
```

### Bounce → bastırma hattı doğrulandı (2026-11-12)

Üç adrese gönderilen testte `muhammed.ali.kahraman@outlook.com` **hard bounce**
verdi (Resend `email.bounced`, "mailbox unavailable" — geçersiz adres, teslim
edilebilirlik kusuru değil). Webhook bunu işledi ve **otomatik bastırma** devreye
girdi:

| Adım | Kanıt |
|---|---|
| Resend olayı | `email.bounced`, 2026-11-13 00:30:09 UTC |
| Webhook işledi | `POST /api/resend-webhook` 200 (Svix imzası geçti) |
| Bastırma kaydı | `public.email_engagement_optouts` → `(muhammed.ali.kahraman@outlook.com, reason=bounce, 00:30:11)` |

Yani bounce → opt-out hattı **uçtan uca çalışıyor**; geçersiz adres artık pazarlama
gönderimlerinden otomatik düşecek. Hem edinim hem etkileşim yolu bu tabloyu
filtreler: `list_marketing_recipients` (edinim) ve `list_engagement_recipients`
(etkileşim) `not exists (select 1 from email_engagement_optouts where email = lower(...))`
koşulunu taşır. Aynı gün üç adres için ölçülen **gönderim uygunluğu**:

| Adres | `eligible_for_send` | Neden |
|---|---|---|
| muhammed.ali.kahraman@outlook.com | **false** | hard bounce → `email_engagement_optouts` |
| muhammedali.kahraman@outlook.com | true | teslim edildi |
| letgodeneme97@outlook.com | true | teslim edildi |

Doğrulama sorgusu:

```sql
select email, reason, opted_out_at
from public.email_engagement_optouts
order by opted_out_at desc;
```

Not: tablo adı `email_engagement_optouts`'tur (`engagement_optouts` değil). Bu
adı sorgularken `42P01 relation does not exist` alırsanız **yanlış ad** kullanıyorsunuz;
migration eksiği yok.

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

Workflow, Cloudflare'in bot korumasının GitHub'ın veri merkezi çıkışını
engellememesi için **Vercel alias**'ını çağırır (`vars.MARKETING_DISPATCH_ORIGIN`,
varsayılan `https://isbulkktc-amber.vercel.app`). Aynı derlemeyi sunar.

Her iki rota da **idempotent**'tir (bir parti talebeder, gönderir, işaretler), bu
yüzden kaçan/yinelenen bir koşu güvenlidir.

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
- [ ] DMARC `p=quarantine` → `reject` (raporları izledikten sonra)
- [ ] MTA-STS + TLS-RPT kayıtları (isteğe bağlı — yalnız gelen posta duruşu)
- [ ] Gerçek gelen kutusu/spam yerleşim doğrulaması (araç bunu yapamaz — gerçek
      posta kutusu gerekir; bu turda 3 adrese gönderildi)
- [~] ~~DKIM `1024` → `2048`~~ **iptal: Resend 2048 desteklemiyor**

### Cloudflare 1010 bot-koruması notu (2026-11-12)

`https://isbulkktc.com` Cloudflare arkasında ve bot koruması bazı istemci UA'larını
**403 error 1010** ile bloklar (ör. Python `urllib`). `curl` ve `Svix-Webhooks` UA
geçer. Bu yüzden webhook ve cron çağrıları **Cloudflare'siz Vercel alias**'ını
(`https://isbulkktc-prod.vercel.app`) kullanır; aynı derlemeyi sunar. Kanonik host da
çalışır ama Cloudflare'i atlamak teslim garantisi için daha güvenli.
