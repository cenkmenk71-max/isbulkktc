# Plan: İşBul KKTC — Uçtan Uca Tam Otomatik İşveren Kayıt, Belge Ayrıştırma, Paket Satın Alma ve Kota Sınırlı İlan Yayınlama

**Durum:** Planlama tamam — kaynak kodunda hiçbir değişiklik yapılmadı. Bu dosya uygulama için referanstır.
**Kısıt:** Bu oturumda hiçbir dosya oluşturulmayacak/değiştirilmeyecek. Yalnızca plan dosyası yazılır.

## 1. Mevcut şema ve kod kanıtları (File:Satır)

Tüm kararlar aşağıdaki dosyaların gerçek içeriğine dayanır; tahmin kullanılmadı.

### Veritabanı tabloları ve sütunlar

**`public.companies`** — `supabase/migrations/20261013000000_v4_identity_companies_security.sql:61-77`
- `id uuid pk`, `name text` (2-120), `slug text unique`, `verification_status public.company_verification_status not null default 'pending'` (pending|verified|rejected|suspended), `profile_description`, `categories text[]`, `website`, `phone`, `public_email`, `address`, `municipality`, `directory_entry_id`, `directory_location_index`, `source_profile_url`, `logo_url`, `created_at`, `updated_at`
- RLS: `companies_read_verified` (273-275, anon+authenticated, status='verified'), `companies_read_active_member` (277-279), `companies_read_platform_admin` (281-283)
- Grant: `select` to `anon` (138), `select` to `authenticated` (118-124). **Yazarak `insert`/`update` yetkisi yok** → `companies` yazımı sadece SECURITY DEFINER RPC ile
- `create_company(text, text)` RPC (297-367): company oluşturur (verification_status='pending') + `company_members` owner satırı ekler + audit log

**`public.company_members`** — aynı migration:79-87
- `company_id`, `user_id`, `membership_role` (owner|recruiter|billing|viewer), `status` (active|pending|suspended), `invited_by`, `created_at`

**`public.company_profile_submissions`** — `supabase/migrations/20261014120000_v4_company_profile_review.sql:85-136`
- `id`, `company_id`, `submitted_by`, `company_name`, `profile_description`, `categories`, `website`, `phone`, `public_email`, `address`, `municipality`, `directory_entry_id`, `directory_location_index`, `status` (pending|approved|rejected), `review_note`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`
- RLS insert: aktif owner (235-250); update: pending owner (252-282)

**`public.job_packages`** — `supabase/migrations/20261020192000_v4_package_entitlements.sql:1-16`
- `id`, `code`, `display_name`, `description`, `max_active_jobs` (1-1000), `job_duration_days` (1-365), `is_active`, `created_at`, `updated_at`

**`public.company_job_package_assignments`** — aynı migration:31-47
- `id`, `company_id`, `package_id`, `max_active_jobs_snapshot`, `job_duration_days_snapshot`, `assigned_by`, `starts_at`, `expires_at`, `revoked_at`, `created_at`
- Tek güncel atama kısıtı: `company_job_package_assignments_one_current` (49-51, `where revoked_at is null`)

**`public.jobs`** — `supabase/migrations/20261020190500_v4_jobs_applications.sql:1-70`
- `id`, `company_id`, `created_by`, `title` (5-140), `slug`, `summary` (20-500), `description` (50-20000), `requirements`, `responsibilities`, `job_type`, `workplace_mode`, `district`, `status` (draft|pending_review|approved|rejected|published|closed|expired), `moderation_note`, `reviewed_by`, `reviewed_at`, `published_at`, `expires_at`, `created_at`, `updated_at`
- `jobs_publication_dates_consistent` CHECK (48-70): published/closed/expired → published_at & expires_at dolu ve expires_at > published_at
- RLS: `jobs_company_insert_draft` (162-179, status='draft'), `jobs_company_update_editable` (181-204, **sadece draft/rejected** — published düzenlemesi şu anı engeller)

### Güvenlik sınırı (kullanıcıdan gelen her istek)
- `createSupabaseServerClient` → publishable/anon anahtar, oturum cookiesi ile (`src/server/db/supabase-server.ts:64-105`); authenticated rolü
- `companies` insert/update authenticated rolüne verilmedi → şirket oluşturma/doğrulama SECURITY DEFINER RPC zorunlu

### Varolan RPC'ler (`v4_package_entitlements.sql`)
- `publish_approved_job(_job_id)` (236-323): aktif üyelik + verified şirket + aktif paket ataması + `active_jobs < max_active_jobs_snapshot` (ağırtaşı P0001, 299-302); `status='published'`, `published_at=now`, `expires_at=now + job_duration_days_snapshot gün` (307-309)
- `get_company_job_entitlements(_company_id)` (325-383): döner `package_id, package_code, package_name, max_active_jobs, job_duration_days, active_jobs, assignment_expires_at`
- `admin_save_job_package(...)` (58-142), `admin_assign_company_job_package(_company_id, _package_id, _expires_at)` (144-224): platform_admin gerekir, verified şirket kontrolü (183-186), eski atamayı iptal eder ve yeni ekler

### Varolan Server Action'lar (`src/features/jobs/actions.ts`)
- `saveJobDraft` (58-148): draft iş insert/update, kota tüketmez
- `submitJobForReview` (150-215): taslak kaydı + `submit_job_for_review` RPC (status → pending_review)
- `publishApprovedJob` (217-279): `publish_approved_job` RPC, ardından yalnızca **işverene** `sendJobPublishedEmail` (259-276); admin bildirimi yok, `expires_at` mailde yok
- `saveJobPackage` (281-336), `assignCompanyJobPackage` (338-384): admin paket/atama

### Varolan şirket eylemi (`src/features/companies/actions.ts`)
- `submitCompanyProfile` (121-238): `company_profile_submissions` **pending** satırı oluşturur + `sendCompanyProfileEmails` (işveren ack + inceleme ekibine); **admin onayı bekler, auto-verified değildir** → gereksinim #1 bu davranışı değiştirir
- `createCompany` (33-89): `create_company` RPC → dashboard'a yönlendirir

### E-posta (`src/server/email/mailer.ts`)
- `sendJobPublishedEmail` (239-254): yalnızca işverene, `expires_at` yok
- `sendCompanyProfileEmails` (378-421): işveren ack + inceleme kutusuna
- `getCompanyReviewInbox()` (92-96): `COMPANY_REVIEW_INBOX_EMAIL` → feedback → sales
- `SUPPORT_EMAIL = "info@isbulkktc.com"` (`src/lib/social-links.ts:22`), `SUPPORT_PHONE_TEL="+905391316421"` (24), `getWhatsAppUrl()` (26-28), `getSupportMailto()` (30-36)

### Sayfalar ve bileşenler
- `src/app/[locale]/packages/page.tsx` (1-49): `PackagesExperience` render eder, `companySetup` parametresi yok, başarı bandı yok
- `src/components/packages/packages-experience.tsx` (1-289): her paket kartında zaten `WhatsAppButton` + `EmailButton` (187-208) ama **genel** mesaj (şirket adı / kullanıcı e-pası yok), `inquiryBody` çeviriden gelir
- `src/components/packages/whatsapp-button.tsx` (1-39): `https://wa.me/...?text=...`; `email-button.tsx` (1-38): `mailto:info@...`
- `src/app/[locale]/(company)/company/dashboard/page.tsx` (1-572): `CompanyProfileForm`, iş başvuruları, overview
- `src/app/[locale]/(admin)/admin/packages/page.tsx` (1-169): `CompanyPackageAssignmentForm` (süre `durationDays` var), `getAdminPackageConsoleData`
- `src/app/[locale]/(admin)/admin/company-profiles/page.tsx` (1-202): inceleme kuyruğu
- `src/features/jobs/admin-package-forms.tsx` (1-235): `CompanyPackageAssignmentForm` (company/package/durationDays)

### i18n e-posta kopyası (6 dil: tr, en, ru, el, fa, de)
- `supabase/functions/_shared/email-copy-extras.ts`: `jobPublished` tüm 6 yerel (64-391), `EMAIL_COPY_EXTRAS` (393-400); `labels` (56-61)
- `src/server/email/company-profile-copy.ts`: `CompanyProfileEmailCopy` tüm 6 yerel (43-199)
- `companies` check constraint locale'ları `('tr','en','ru','el','fa','de','he')` (20261013000000_v4_identity_companies_security.sql:34) — e-posta kopyası 6 dil (he yok), plan 6 dil ile uyumlu

---

## 2. Tasarım kararları (sıfır varsayım, kod tabanına dayalı)

### Modül 1 — Belge ayrıştırma + otomatik `verified` şirket onayı
Mevcut `submitCompanyProfile` pending kuyruğuna yazar. Gereksinim: gönderim anında şirket `verified` olarak kaydedilsin, kullanıcı `company_members` owner/active bağlansın, admin onayı beklenmesin.

Karar: `submitCompanyProfile` eylemi değiştirilir (yeni ayrı eylem eklenmez, tek giriş noktası):
1. `getCurrentUser()` → aktif kullanıcı zorunlu.
2. `companyProfileSchema` ile doğrulama (zaten var: `src/features/companies/schemas.ts:39-63`).
3. `companyId` varsa ve kullanıcı o şirketin aktif owner'ıysa → o şirketi finalize et; yoksa önce varolan `create_company` RPC'yi çağır (pending şirket + owner üyelik oluşturur, `actions.ts:54-57`).
4. Yeni SECURITY DEFINER RPC `public.finalize_company_profile(_company_id, _company_name, _profile_description, _categories, _website, _phone, _public_email, _address, _municipality)` çağrılır: chiamacı şirketin aktif owner'ı olmalı; `companies` satırını `verification_status='verified'` + tüm profil alanlarıyla günceller; audit log yazar (`company.profile.auto_verified`). Yeni migration gerekir.
5. `company_profile_submissions` penceresine **yazılmaz** (auto-verify, kuyruk yok). İsteğe bağlı denetim izni için `audit_logs` yeterli.
6. İki e-posta (Modül 2) tetiklenir; başarısız olursa primary işlem geri alınmaz (best-effort, try/catch — mevcut model `actions.ts:213-234`).
7. Yönlendirme: `/[locale]/packages?companySetup=completed`.

Güvenlik: RPC'de `auth.uid()` null kontrolü, aktif profil kontrolü, owner üyelik kontrolü (`is_active_company_member` patterni `20261013000000_v4_identity_companies_security.sql:218-245`). `revoke all ... from public, anon, authenticated`; `grant execute` to `authenticated`.

### Modül 2 — Çift yönlü anında e-posta (şirket onayı)
Yeni mailer işlevi `sendCompanyProfileVerifiedEmails` (`src/server/email/mailer.ts`):
- a) Admin: `ADMIN_NOTIFICATION_EMAIL` env, yoksa `SUPPORT_EMAIL` (`info@isbulkktc.com`, `social-links.ts:22`). Konu: "Yeni bir şirket profili oluşturuldu". İçerik: okunabilir kurumsal tablo (TÜŞirket bilgileri: unvan, vergı/sicil → `categories`/adres/telefon/e-posta/website/ilçe), doğrudan link `https://isbulkktc.com/tr/admin/company-profiles`.
- b) İşverene: konu "Şirket profiliniz oluşturuldu ve yayınlandı", şirket profili linki (`/[locale]/companies/[slug]` veya dashboard), bir sonraki adım `/packages` linki.
Her iki gönderim de `try/catch` içinde, primary işlemi engellemez.

Yeni render/kopyamodülleri: `src/server/email/company-profile-verified-render.ts`, `src/server/email/company-profile-verified-copy.ts`, 6 yerel (tr, en, ru, el, fa, de). Kalıp: `company-profile-render.ts` + `company-profile-copy.ts` aynen.

### Modül 3 — `/packages` yönlendirmesi + hazır WhatsApp / e-posta paket sipariş butonları
- `packages/page.tsx`: `searchParams` içinden `companySetup=completed` okunur; varsa üstte başarı bandı render edilir. Oturumdaki işverenin şirket adı + e-postası sayfaya geçilir (DAL üzerinden `getOwnedCompany` / `company_members`).
- `packages-experience.tsx`: paket kartına iki buton zaten var (187-208); `WhatsAppButton`/`EmailButton` prop olarak `companyName` ve `userEmail` alacak şekilde genişletilir. Mesaj: *"Merhaba İşBul KKTC, [Şirket Adı] adına [Paket Adı] ilan paketini satın almak istiyorum. IBAN ödeme bilgilerini paylaşabilir misiniz?"*
- WhatsApp: `https://wa.me/905391316421?text=<encoded>` (`getWhatsAppUrl()` zaten `+905391316421` → `social-links.ts:26-28`)
- E-posta: `mailto:info@isbulkktc.com?subject=<...>&body=<...>` (`getSupportMailto`, `social-links.ts:30-36`)
- 6 dilde buton etiketi ve mesaj çevirisi (`PackagesPage.showcase.pricing` namespace'i, `whatsappAction`/`emailAction`/`inquiryBody`/`inquirySubject`).

### Modül 4 — Admin paket/kota tanımlama + sıkı sınır koruması
Mevcut altyapı zaten var, plan doğrular ve küçük eksikleri gider:
- Paket tanımı: `admin_save_job_package` + `admin/packages` sayfası (`NewAdminPackageForm`/`EditAdminPackageForm`, `admin-package-forms.tsx:131-172`) — `max_active_jobs` (ilan hakkı), `job_duration_days` (süre), `is_active`.
- Firma atama: `admin_assign_company_job_package(_company_id, _package_id, _expires_at)` + `CompanyPackageAssignmentForm` (`durationDays` → `expires_at`, `actions.ts:361-364`). Atama `company_job_package_assignments` ile `starts_at`/`expires_at` snapshot'ını tutar.
- **Sert kota:** `publish_approved_job` (292-302) `active_jobs >= max_active_jobs_snapshot` → P0001 `"packageLimit"`; `publishApprovedJob` bunu `"packageLimit"` mesajına çevirir (244-248) → UI `/packages` yönlendirmesi gösterir.
- **Sert süre:** `expires_at = now + job_duration_days_snapshot` (307-309). Süre dolmuş ilan public RLS (`jobs_public_read`, `20261020190500_v4_jobs_applications.sql:125-137`) `expires_at > now()` ile gizlenir; `status='expired'` işaretlemesi bir cron/tetikleyiciyle istenirse ayrı iş, plan kapsamı dışı (RSL zaten erişimi engeller).
- Eksiklik: admin atama ekranında `active_jobs / max_active_jobs` zaten gösteriliyor (`admin/packages/page.tsx:139-141`); kalan hakkı vurgulamak için küçük bir uyarı satırı eklenebilir (isteğe bağlı, iş akışını engellemez).

### Modül 5 — Esnek ilan taslağı, kaldığı yerden devam, yayınlanmış ilan düzenleme
- Taslak: `saveJobDraft` zaten DB'de `draft` olarak saklar (58-148). Tarayıcı yerel taslak koruması (localStorage otomatik yedek) **yok** → iş ilanı form bileşenine (`src/features/jobs/job-management-forms.tsx`) client tarafında localStorage otomatik kayıt/geri yükleme eklenir; sayfa yeniden açıldığında kaydedilen taslak formsa dökülür.
- Yayınlanmış ilan düzenleme: RLS `jobs_company_update_editable` sadece `draft`/`rejected` izin verir → yayınlanmış ilan güncellenemez. Yeni SECURITY DEFINER RPC `public.update_published_job(_job_id, title, slug, summary, description, requirements, responsibilities, job_type, workplace_mode, district)`: çağrıcı aktif owner/recruiter, iş `publication_source='platform'` ve `status='published'` olmalı; yalnızca metin/başlık/detay alanları güncellenir, `status`=`published` kalır, `expires_at` değişmez, **kota tüketilmez** (yeni ilan değil, aynı ilanın güncellemesi). Yeni migration + server action `updateJob`.
- Düzenleme sonrası ilan aynı `expires_at` ile yayınlı kalır; `/[locale]/jobs/[slug]` anında güncellenir (SSR/dinamik render).

### Modül 6 — İlan yayınlandığında çift yönlü e-posta
`publishApprovedJob` genişletilir:
- a) İşverene: mevcut `sendJobPublishedEmail` (239-254) + `expires_at` eklenir (`getJobPublishAnnouncement` `jobs.ts:81-112` içinde `expires_at` yok → eklenir veya iş satırı çekilir), konu "İlanınız yayına alındı", doğrudan ilan linki + bitiş tarihi/saati.
- b) `info@isbulkktc.com` (`ADMIN_NOTIFICATION_EMAIL` / `SUPPORT_EMAIL`): yeni mailer `sendJobPublishedAdminEmail`, konu "Yeni iş ilanı yayınlandı", içerik: şirket adı, ilan başlığı, ilçe, paket süresi, ilan linki, admin inceleme bağlantısı (`/tr/admin/jobs`).
İkisi de best-effort try/catch.

---

## 3. Dosya bazlı değişiklik matrisi

| Dosya | Değişiklik | Neden |
|-------|-----------|-------|
| `supabase/migrations/<yeni>_v4_auto_verify_company_profile.sql` | Yeni RPC `finalize_company_profile` + `update_published_job`; `revoke/grant` izinleri | Şirket yazımı ve yayınlanmış-ilan düzenlemesi authenticated rolüne yok; SECURITY DEFINER gerekli |
| `supabase/migrations/<yeni>_v4_job_expires_cleanup.sql` (isteğe bağlı) | Süre dolmuş ilanları `expired` işaretleme | Modül 4 "otomatik yayından düşer" — RLS zaten erişimi engeller, opsiyonel |
| `src/features/companies/actions.ts` | `submitCompanyProfile` auto-verify akışı; yeni RPC çağrıları; iki e-posta; `/packages?companySetup=completed` yönlendirmesi | Modül 1 + 2 |
| `src/features/companies/schemas.ts` | Gerekirse `finalizeCompanyProfileSchema` (input doğrulama) | Modül 1 input güvenliği |
| `src/server/email/mailer.ts` | `sendCompanyProfileVerifiedEmails`, `sendJobPublishedAdminEmail` (+ `sendJobPublishedEmail` `expires_at` parametresi) | Modül 2 + 6 |
| `src/server/email/company-profile-verified-copy.ts` | 6-dil kopya (admin notification + employer welcome) | Modül 2 i18n |
| `src/server/email/company-profile-verified-render.ts` | HTML metin render (kurumsal tablo, linkler) | Modül 2 |
| `src/app/[locale]/packages/page.tsx` | `companySetup` başarı bandı; oturum şirket/e-posta verisini `PackagesExperience`'e aktar | Modül 3 |
| `src/components/packages/packages-experience.tsx` | Paket kartına `companyName`, `userEmail` prop'u; WhatsApp/mailto mesajına şirket+paket+doldurma | Modül 3 |
| `src/components/packages/whatsapp-button.tsx` | `companyName`, `userEmail` prop'u ile önceden doldurulmuş metin | Modül 3 |
| `src/components/packages/email-button.tsx` | `companyName`, `userEmail` prop'u ile önceden doldurulmuş mailto | Modül 3 |
| `src/features/jobs/actions.ts` | `publishApprovedJob`: admin e-postası + `expires_at`; yeni `updateJob` eylemi | Modül 4 + 5 + 6 |
| `src/features/jobs/schemas.ts` | `updatePublishedJobSchema` (güncellenebilir alanlar) | Modül 5 |
| `src/features/jobs/job-management-forms.tsx` | Client localStorage otomatik taslak kaydı/geri yükleme | Modül 5 tarayıcı taslak koruması |
| `src/server/dal/jobs.ts` | `getJobPublishAnnouncement` içinde `expires_at` döndür | Modül 6 |
| `src/server/dal/companies.ts` | (isteğe bağlı) aktif şirket/profil getirme yardımcıısı packages sayfası için | Modül 3 |

---

## 4. i18n ve CSS token kontrol listesi (6 dil: tr, en, ru, el, fa, de)

- [ ] Yeni e-posta kopya modülü `company-profile-verified-copy.ts`: tüm 6 yerel için `EmailLocale` türü tamamıyla doldurulur (eksik çeviri derleme hatası olur — mevcut kural `company-profile-copy.ts:43` ile aynı).
- [ ] `email-copy-extras.ts` `jobPublished` zaten 6 dilde var; `expires_at` satırı eklenecekse her dilde cümle eklenir.
- [ ] Paket buton etiketleri (`whatsappAction`, `emailAction`, `inquiryBody`, `inquirySubject`) `PackagesPage.showcase.pricing` namespace'inde 6 dilde.
- [ ] Başarı bandı i18n anahtarı `packages?companySetup=completed` için 6 dilde.
- [ ] CSS: yeni renk eklenirse `@theme` içine alınır, hardcoded hex eklenmez (`tests/unit/design-tokens.test.ts` ratcheti).
- [ ] RTL (`fa`) paket kartı butonları ve başarı bandı için düzen kontrolü.
- [ ] `next-intl` mesaj dosyaları için yeni anahtarlar eklenir; `check:frontend-source` geçmelidir.

---

## 5. Uçtan uca test planı (Playwright E2E + pgTAP + unit)

**Güvenlik kapaları (negatif testler her akışta):**
- Kim crossesız `/company/dashboard` ve `/packages` erişimi engellenmeli (redirect /login).
- Başka şirketin ilanını düzenleme/yayınlama denemesi 42501 / unauthorized döndürmeli.
- Anonim `companies` update/insert denemesi engellenmeli (RLS).
- Paket ataması olmayan şirket ilan yayınlamaya çalışınca `packageLimit` hatası ve `/packages` yönlendirmesi.

**Test senaryoları:**

1. **Kota sınırı (1 ilan, 1 aktif):** Admin tek ilanlık paket atar; işveren 1. ilanı yayınlar (başarılı, `expires_at` = +1 gün); 2. ilanı yayınlamaya çalışınca engellenir ve `/packages` yönlendirmesi görünür.
2. **1 günlük süre:** Yayınlanan ilanın `expires_at` tam 24 saat sonrası olmalı; süresi dolmuş ilan `/jobs` listesinde görünmemeli (RLS `expires_at > now`).
3. **Taslak kurtarma:** İşveren yarım bırakan ilan formundan ayrılır, tekrar girer; localStorage'tan bilgiler geri yüklenir (kaldığı yerden devam).
4. **Mevcut ilan düzenleme:** Yayınlanmış ilanın başlığı/detayı güncellenir; **yeni kota tüketilmez** (2. ilan yine de engellenir); `expires_at` değişmez; `/jobs/[slug]` güncellenmiş içeriği gösterir.
5. **Çift yönlü e-posta (şirket onayı):** Şirket profili gönderildiğinde saniyede iki e-posta: admin'e (info@, tüm firma bilgileri tablosu + `/tr/admin/company-profiles` linki) ve işverene (hoş geldin + profil linki + `/packages`).
6. **Çift yönlü e-posta (ilan yayına):** İşverene ("İlanınız yayına alındı" + link + bitiş) ve info@'ya ("Yeni iş ilanı yayınlandı" + şirket, başlık, ilçe, süre, link, admin inceleme linki).
7. **Otomatik verified şirket:** Profille gelen işletme `companies.verification_status='verified'`, `/companies` dizininde görünür, `company_members` owner/active olarak bağlı; admin kuyruğa düşmez.

**pgTAP:** `supabase/tests/database/` altında yeni RPC'ler (`finalize_company_profile`, `update_published_job`) için yetki ve RLS testleri (anon/owner/ünlü/yetkisiz), `function_privileges.test.sql` ratchete eklenir.

**Çalıştırma sırası (AGENTS.md):** `bun run lint` → `bun run typecheck` → `bun run check:frontend-source` → `bun run test:unit` → ilgili E2E shard. `test:db` ve `test:e2e` altyapı gerektirir; yoksa rapor edilir, geçmiş sayılmaz.

---

## 6. Açık kararlar / riskler

- `submitCompanyProfile` mevcut pending-kuyruk davranışını değiştirir (auto-verify). Admin inceleme kuyruğu (`admin/company-profiles`) işveren self-serve yolu için devre dışı kalır; bu gereksinimle ("manuel admin onayı beklemeden") uyumludur.
- `companies` doğrudan update yetkisi yok → `finalize_company_profile` SECURITY DEFINER RPC zorunlu; migration ve test ekleme gerekir.
- Yayınlanmış-ilan düzenleme için RLS kısıtı (`draft`/`rejected` sadece) → `update_published_job` RPC gerekir.
- E-posta ortamı yoksa (RESEND_API_KEY yok) gönderimler sessizce başarısız olur ve primary işlemi engellemez (mevcut `deliver` modeli, `mailer.ts:123-172`); bunu testlerde "mail configured" ile ayrı assert edilir.
- `companySetup=completed` bandı yalnızca oturum açmış işveren için gösterilir; publique `/packages` için etkisi yok.

Plan dosyası: `.kilo/plans/1795689719899-isbulkktc-employer-onboarding.md`