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

## Şu anki durum (2026-11-12)

```
WARN SPF         v=spf1 include:_spf.mx.cloudflare.net ~all — kök göndereni yetkilendirmiyor,
                 ama DMARC-uyumlu Return-Path alt alanı (send.isbulkktc.com) yetkilendiriyor
PASS SPF         send.isbulkktc.com (Return-Path) göndereni yetkilendiriyor
INFO DKIM        resend._domainkey mevcut, 1024-bit — Resend 2048 desteklemez (bilgi)
PASS DMARC       v=DMARC1; p=quarantine; rua=mailto:dmarc@isbulkktc.com; fo=1
PASS MX          Cloudflare MX kayıtları
WARN MTA-STS     _mta-sts kaydı yok (yalnız gelen posta duruşu; giden yerleşimi etkilemez)
WARN TLS-RPT     _smtp._tls kaydı yok (yalnız gelen posta duruşu; giden yerleşimi etkilemez)
```

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

## Açık kalan (kod dışı — token/insan gerekir)

- [ ] `isbulkktc.com`'un kayıtlı olduğu Resend **ekibini** bul (Yol A/B)
- [ ] Üretimde geçerli `RESEND_API_KEY` (`re_…`) — doğru ekipten üret
- [ ] `MARKETING_CRON_SECRET` / `ENGAGEMENT_CRON_SECRET` + `APP_URL` secret'larını ekle
- [ ] `info@isbulkktc.com` gelen posta kabul etsin (CF Email Routing yönlendirmesi
      **veya** gelen kabul eden `RESEND_FROM_EMAIL`)
- [ ] DMARC `p=quarantine` → `reject` (raporları izledikten sonra)
- [ ] MTA-STS + TLS-RPT kayıtları (yalnız gelen posta duruşu)
- [ ] Gerçek gelen kutusu/spam yerleşim doğrulaması (araç bunu yapamaz — gerçek
      posta kutusu gerekir)
- [~] ~~DKIM `1024` → `2048`~~ **iptal: Resend 2048 desteklemiyor**
