# Plan: Manuel pazarlama maili (admin'den seçili leadlere)

## Hedef
Admin panelinden `sales_leads` tablosundaki seçili firmalara/leadlere var olan ilan paketi pazarlama şablonunu (`renderMarketingEmail` / `info@isbulkktc.com` üzerinden Resend) tek tek atmak.

## Mevcut durumu (kod temeline göre)
- `supabase/functions/_shared/email-render.ts:563` — `renderMarketingEmail(input)` 6 dile özel paket posta şablonu render eder; signed one-click unsubscribe linkli.
- `src/server/email/mailer.ts:435` — `sendMarketingEmail(input)`, `MARKETING_FROM = "İşBul KKTC <info@isbulkktc.com>"`, Resend üzerinden gönderir, idempotency key `marketing/<campaignId>`.
- `src/server/email/unsubscribe-token-core.ts:48` — `unsubscribeUrlFor(email, baseUrl)` signed link üretir; `ENGAGEMENT_UNSUBSCRIBE_SECRET` veya `RESEND_API_KEY` gerekli, yoksa null.
- `src/app/api/email/acquisition-campaign/route.ts` — cron route, 25'şer batch, `list_marketing_recipients` + `mark_marketing_lead_contacted` RPC'leri, `service_role`, `MARKETING_CAMPAIGN_CONSENT_READY=true`.
- `supabase/migrations/20261120154500_v4_sales_lead_marketing_consent.sql` — `sales_leads` içinde `marketing_consent`, `marketing_consent_at`, `marketing_consent_requested_at`, `marketing_consent_version`. `list_marketing_recipients` sadece `status='new' AND marketing_consent=true AND marketing_consent_at IS NOT NULL` ve `email_engagement_optouts` hariç olanları döner.
- Admin sayfaları `/[locale]/(admin)/admin/*` — `AdminMfaGate` (AAL2) ile korumalı. Satış lead listesi/manuel gönderme sayfası **yok**.
- `src/server/dal/admin-packages.ts` — admin veri çekme pattern'i: `requirePlatformRole("platform_admin")` + `createSupabaseServerClient()` + RPC çağrısı.
- `src/server/dal/user.ts:255` — `requirePlatformRole(role)` pattern'i (redirectLocalized "/").
- Seed boş: `marketing_consent=true` onaylı lead yok gibi görünüyor (canlı Supabase'e erişim yok, doğrulanamadı).
- **Resend API (doküman: resend.com/docs/api-reference/emails):**
  - Tekli send: `POST /emails`, max 50 alıcısı/e-posta (biz 1:1 gönderiyoruz).
  - Batch send: `POST /emails/batch`, max 100 e-posta/istek, ama **atomik** — bir tanesi validation hatası verirse tüm batch başarısız olur. Tekli send daha güvenli seçenek.
  - `Idempotency-Key` başlığı: 24 saat sonra geçer, max 256 karakter. Kodda zaten kullanılıyor (`marketing/<campaignId>`).
  - Varsayılan rate limit: 10 istek/saniye. 50 lead/POST sınırı bu limite uygun.
  - Marketing mail = CAN-SPAM/CASL kapsamında, unsubscribe zorunlu — zaten mevcut (`unsubscribeUrlFor`).
  - **Resend Template:** Şablon Resend panelinde (veya `POST /templates` ile) kaydedilecek, gönderimde `template_id` + `template_data` kullanılarak atılacak. `RESEND_MARKETING_TEMPLATE_ID` env değişkeni gereklidir. Template ID yoksa mevcut `renderMarketingEmail` (raw html/text) fallback olarak çalışır.

## Kararlar (tümü kesin)
1. **Gönderen:** Resend üzerinden `info@isbulkktc.com` (var olan `MARKETING_FROM`). Ayrı inbox gerekmez.
2. **Alıcı filtresi (KESİN):** Sadece `marketing_consent = true` ve `marketing_consent_at IS NOT NULL` olan leadler listelenir/seçilir/atılır. Onaysız lead gönderilmez — spam şikayeti/domain kirliliği riskini minimum tutar.
3. **Lead listesi kaynağı:** Server Component (`page.tsx`) → DAL `getMarketingLeads()` → `requirePlatformRole("platform_admin")` → `createSupabaseServiceClient()` → doğrudan `sales_leads` sorgusu (`status='new' AND marketing_consent=true AND marketing_consent_at IS NOT NULL AND optout hariç`, `order by id`, limit 200). Mevcut admin pattern'ine (`getAdminPackageConsoleData`) uygun.
4. **Gönderim modeli:** Admin seçilen lead ID'lerini POST eder; sunucu her lead'i **sunucu tarafında tekrar doğrular** (consent=true, status=new, optout hariç), sonra `sendMarketingEmail` çağırır (signed unsubscribe URL, `campaignId = manual/<YYYY-MM-DD>/<lead_id>`), başarıyla kabul edildiyse `mark_marketing_lead_contacted(_lead_id)` ile `status='contacted'` yapar.
5. **Maksimum lead/POST:** 50. Daha fazlaya 400 döner.
6. **Yetkilendirme:** Sayfa `AdminMfaGate` (AAL2) + `requirePlatformRole("platform_admin")`. API route `force-dynamic`, `Cache-Control: no-store`, admin session kontrolü.
7. **campaignId formatı:** `manual/<YYYY-MM-DD>/<lead_id>` (cron sendlerinden farklı, ayrı idempotency alanı).
8. **Resend send yöntemi:** Tekli `POST /emails` (batch kullanılmaz). Batch atomik — bir hata tüm batch'i bozar, tekli send her lead'i bağımsız başarı/başarısız olarak raporlar.
9. **Resend Template:** Şablon Resend panelinde kaydedilir, `RESEND_MARKETING_TEMPLATE_ID` ile参照 edilir. Gönderim `template_id` + `template_data` ile. Template ID yoksa `renderMarketingEmail` raw html/text fallback. Template data içinde en az: `unsubscribeUrl`, `siteUrl`, `locale`, `subject`.
10. **i18n:** Yeni `"AdminMarketing"` namespace her `src/messages/{locale}.json`'a eklenecek (tr, en, ru, el, fa, de).

## Yeni dosyalar / değişiklikler
1. `src/app/[locale]/(admin)/admin/marketing-send/page.tsx` — Server Component, AdminMfaGate, consent=true lead listesi (tablo: firma, e-posta, dil, durum), checkbox seçimi, "Seçkilerine Gönder" butonu, sonuç tablosu (başarılı/başarısız sayacı, lead bazlı durum).
2. `src/app/api/admin/marketing-send/route.ts` — POST, `force-dynamic`, `no-store`, admin yetki kontrolü (`requirePlatformRole("platform_admin")`), `selectedLeadIds[]` alır (max 50), her lead'i sunucu tarafında doğrular, tek tek gönderir, durumları günceller, `{ sent, failed, results: [{ leadId, email, ok, error }] }` döner.
3. `src/server/dal/admin-marketing-send.ts` — `getMarketingLeads()` (okuma) ve işaretleme DAL katmanı (`createSupabaseServiceClient()` + doğrudan `sales_leads` sorgusu / RPC).
4. `src/server/email/mailer.ts` — `sendMarketingEmail` güncellenir: `RESEND_MARKETING_TEMPLATE_ID` tanımlıysa `template_id` + `template_data` ile gönderir, tanımlı değilse mevcut raw `html`/`text` fallback.
5. `.env.local` / Vercel Production — `RESEND_MARKETING_TEMPLATE_ID` env değişkeni eklenir.
6. `src/messages/{locale}.json` — `"AdminMarketing"` namespace copy'si (başlık, seç, gönder, boş durum, başarı/başarısız sayacı, onay uyarısı).

## Veri akışı
Admin sayfa (AAL2 doğrulu) → Server Component `getMarketingLeads()` (consent=true, status=new, optout hariç) → kullanıcı seçer → `POST /api/admin/marketing-send { selectedLeadIds[] }` → sunucu her lead'i yeniden doğrular → `unsubscribeUrlFor(email, siteUrl)` → `sendMarketingEmail({to, locale, unsubscribeUrl, campaignId})` → `mark_marketing_lead_contacted(lead_id)` → sonuç döner.

## Hata / rollback
- Tek bir lead'in gönderimi başarısız olursa diğerleri devam eder; lead `contacted` işaretlenmez (yeniden denenebilir).
- `mark_marketing_lead_contacted` hata verirse gönderim kabul edildiği halde lead tekrar edilebilir (idempotency key sayesinde Resend çift gönderimi engeller).
- `RESEND_API_KEY` veya unsubscribe signing yoksa `sendMarketingEmail` false döner, hata raporlanır, mail çıkar değil.
- Zaten `contacted` olan lead listede görünmez (`status='new'` filtresi).
- Client tarafından gönderilen `selectedLeadIds` her biri sunucu tarafında yeniden doğrulanır; consent=false, status!='new' veya optout olanlar atılır ve `ok=false` döner.

## Doğrulama (implementasyon sonrası)
- `bun run typecheck`, `bun run lint`, `bun run test:security` sıfır hata.
- Admin sayfası AAL2 olmadan erişim engelleniyor mu.
- Seçili consent=true lead'e test maili gider mi, unsubscribe linki geçerli mi, `status` 'contacted' olur mu.
- Seçili consent=FALSE lead listede görünmemeli / seçilemez olmalı.
- `scripts/email-preview.mjs` ile şablon önizleme `.artifacts/email-preview/` altında çıkar.
- POST'ta consent=false leadId gönderilirse `ok=false` dönmeli, mail gitmemeli.

## Açık notlar
- Canlı DB'de `marketing_consent=true` lead yoksa admin sayfası boş liste gösterir — normal, önce leadlerin onay akışından geçmesi gerekir.
- Consent'i atlayıp tüm leadlere atmak istenirse, filtre kaldırılmalı ve plan güncellenmeli (spam riski yükselir, ayrı kararla).