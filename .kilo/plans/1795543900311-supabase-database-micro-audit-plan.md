# İşBul KKTC — Supabase Veritabanı Mikro-Seviye Tam Röntgen ve Düzeltme Planı

> **Uygulama notu:** Planın kod aşamaları `20261125000000`, `20261125010000` ve `20261125020000` migration'ları, TypeScript/Zod/DAL katmanları ve pgTAP/privilege ratchet güncellemeleriyle bu dalda uygulanmıştır. Yerel Supabase testleri henüz çalıştırılmadığından veritabanı uygulaması doğrulanmış sayılmaz. İlk röntgendeki bazı varsayımlar düzeltilmiştir: `summary`, `links` ve KKTC ilçe kısıtları önceden mevcuttu; ham CV metni gizlilik sınırı nedeniyle hiçbir zaman kalıcı olarak saklanmaz.

---

## 1. PR #736 (`origin/sync/local-main-on-origin-main-20261122`) VERİTABANI DIFF RÖNTGENİ

> **Kısıtlama:** Uzak dal yerel olarak çekilemedi (`git fetch` reddedildi). Yerel `supabase/migrations/` içeriği ile V4 mimari spesifikasyonu (`docs/architecture-v4.md`) kıyaslanarak analiz yapıldı. PR #736'daki değişiklikler yerel migrasyon dosyalarından (timestamp sırasına göre) çıkarılmıştır.

### 1.1 PR #736'da Eklenen/Değiştirilen SQL Nesneleri Sınıflandırması

| # | Migrasyon Dosyası | SQL Nesnesi | Sınıflandırma | Teknik Gerekçe |
|---|---|---|---|---|
| 1 | `20261112160000_v4_unindexed_foreign_key_indexes.sql` | 18 adet `CREATE INDEX IF NOT EXISTS` (FK kapsayıcı indeksler) | **(A) Kesin Alınmalı** | Supabase advisor (lint 0001) 15 FK'yi işaretlemiş; 3'sü kısmi indeks/yanlış leading column nedeniyle gözden kaçırılmış. Ratchet test `unindexed_foreign_keys.test.sql` ile kilitlenmiş. |
| 2 | `20261120180000_v4_harden_job_management_database_boundaries.sql` | `review_job` fonksiyonu AAL2 guard eklendi; `jobs_company_update_editable` policy `publication_source = 'platform'` predicate eklendi | **(A) Kesin Alınmalı** | Next.js AAL2 kontrolü bypass edilebiliyordu (Data API doğrudan çağrı). RLS'de `source_site` ilanların employer tarafından update edilmesi engellenmiş. |
| 3 | `20261120170000_v4_atomic_source_job_refresh.sql` | `replace_source_job_catalogue(jsonb,jsonb,jsonb)` SECURITY INVOKER RPC | **(A) Kesin Alınmalı** | Kaynak ilan kataloğu atomic transaction ile yenileniyor; kısmi hata durumunda boş/yarım katalog riski kapatıldı. Sadece `service_role` executable. |
| 4 | `20261112120000_v4_anon_write_throttle_peer_scopes.sql` | `submit_feedback`, `submit_sales_lead`, `submit_support_message` — form-başı coarse peer cap (`peer:<form>|<ip>`) eklendi | **(B) Hatalı / Düzeltilerek Alınmalı** | **Sorun:** `cf-connecting-ip` app path'te (server action → supabase-js → PostgREST) Vercel egress IP'si olduğu için **site-genel tek kova** oluşturuyor (issue #621). `x-client-ip` header'ı app tarafında set ediliyor ama doğrudan PostgREST çağıran sahte IP ile bypass edebiliyor. **Düzeltme:** Edge (Cloudflare/Supabase API Gateway) seviyesinde rate-limit şart; DB katmanı bu sorunu tam çözemiyor. Bu migration "per-form" ayırımı sağlıyor ama gerçek per-visitor değil. |
| 5 | `20261110160000_v4_anon_write_throttle_app_client_ip.sql` (referans) | Primary bucket `x-client-ip`'e taşındı; coarse cap `cf-connecting-ip` kullandı | **(C) Gereksiz / Atılmalı** | Yukarıdaki (4) ile çakışıyor; `20261112120000` bu migration'ı ezerek yeniden yazıyor. İkisi bir arada kalmamalı. |
| 6 | `20261031120000_v4_function_privilege_hardening.sql` (referans) | `list_engagement_recipients`, `opt_out_engagement` — `auth.role() <> 'service_role'` guard eklendi; revoke/grant tekrarlandı | **(A) Kesin Alınmalı** | pg_default_acl leak kapatıldı; ratchet test `function_privileges.test.sql` whitelist ile kilitli. |
| 7 | `20261109000000_v4_engagement_rpc_role_guard.sql` | Yukarıdaki (6) ile aynı fonksiyonlar; guard eklendi | **(C) Gereksiz / Atılmalı** | (6) zaten kapsıyor; çift migrasyon karmaşası yaratıyor. |
| 8 | `20261110130000_v4_push_endpoint_authority_guard.sql` + `20261110140000_v4_push_endpoint_table_check.sql` | `register_push_subscription` host parsing SQL/app parity; `push_subscriptions.endpoint` CHECK constraint | **(A) Kesin Alınmalı** | SSRF vektörü kapatıldı; `split_part` vs `new URL()` parsing ayrışı düzeltilmiş. Ratchet test `push-endpoint-sql-parity.test.ts` ile kilitli. |
| 9 | `20261023130000_v4_company_submission_review_columns.sql` | `company_profile_submissions` — `status`, `reviewed_by`, `reviewed_at` column-level grant kaldırıldı; `INSERT`/`UPDATE` policy daraltıldı | **(A) Kesin Alınmalı** | Owner kendi submission'ı `approved` olarak insert edemez; review kolonları client yazımına kapalı. |
| 10 | `20261023120000_v4_candidate_profile_upsert_grant.sql` | `candidate_profiles.user_id` column `UPDATE` grant eklendi (PostgREST upsert için) | **(A) Kesin Alınmalı** | PostgREST `onConflict: 'user_id'` → `UPDATE user_id` gerektiriyor; testte `throws_ok` ile doğrulanmış. |
| 11 | `20261112150000_v4_drop_probe_functions.sql` | Probe/test fonksiyonları drop edildi | **(A) Kesin Alınmalı** | Production'a sızmaması için temizlik. |
| 12 | `20261112170000_v4_drop_orphan_push_endpoint_host_check.sql` | Orphan constraint drop | **(A) Kesin Alınmalı** | Eski constraint temizliği. |

### 1.2 PR #736'da Eksik/Atlanan V4 Gereksinimleri (Architecture-v4.md §6.2-6.3'e Göre)

| V4 Tablosu (§6.2-6.3) | Mevcut mu? | Durum |
|---|---|---|
| `resumes` | ❌ | **Eksik** — CV depolama, versiyonlama, retention, storage path unique |
| `resume_versions` | ❌ | **Eksik** — CV sürümleme, structured_data JSONB |
| `saved_jobs` | ❌ | **Eksik** — Aday ilan kaydetme (unique user_id,job_id) |
| `notifications` | ⚠️ Kısmi | `application_notifications` var ama genel `notifications` tablosu yok; V4 §6.2 `notifications` tablosu bekliyor |
| `conversations` | ❌ | **Eksik** — Sohbet başlığı |
| `conversation_members` | ❌ | **Eksik** — Sohbet üyelikleri (unique conversation_id,user_id) |
| `messages` | ❌ | **Eksik** — Mesajlar (sender_id conversation_members üyeliği ile doğrulanmalı) |
| `integration_sync_runs` | ❌ | **Eksik** — Bakanlık/3.parti senkronizasyon logları |
| `orders` | ❌ | **Eksik** — IBAN sipariş durum makinesi (awaiting_transfer → paid → refunded) |
| `payment_submissions` | ❌ | **Eksik** — Kullanıcı transfer bildirimi (dekont, referans, tutar) |
| `payment_reconciliations` | ❌ | **Eksik** — Admin mutabakat kararı (bank_reference_normalized unique kapsam) |
| `payment_instruction_versions` | ❌ | **Eksik** — IBAN talimat sürümleme (eski sipariş snapshot koruma) |
| `credit_accounts` | ❌ | **Eksik** — Şirket kredi bakiye görünümü (ledger ile tutarlı) |
| `credit_ledger_entries` | ❌ | **Eksik** — Append-only hareket defteri (idempotency_key unique, quantity_delta ≠ 0) |
| `outbox_events` | ❌ | **Eksik** — Event-driven bildirimler (transaction sonrası yayın) |

---

## 2. ŞEMA ↔ KOD (ZOD & SERVER ACTIONS) SÜTUN BAZLI EŞLEŞTİRME

### 2.1 `candidate_profiles` Tablosu — Migration vs Zod vs TypeScript Types

| Sütun | Migration (SQL) | Zod Schema (`src/features/candidates/schemas.ts`) | TypeScript Types (`src/types/database.ts`) | Uyuşmazlık |
|---|---|---|---|---|
| `user_id` | `uuid PK REFERENCES profiles(id)` | Schema'da yok (formdan gelmez) | `Row.user_id: string` | ✅ OK |
| `headline` | `text CHECK (≤140)` | `headline: z.string().trim().max(140).transform(v=>v\|\|null)` | `Row.headline: string \| null` | ✅ OK |
| `location` | `text CHECK (≤120)` | `location: z.string().trim().max(120).transform(v=>v\|\|null).pipe(z.enum(districts).nullable())` | `Row.location: string \| null` | ✅ OK |
| `skills` | `text[] NOT NULL DEFAULT '{}' CHECK (cardinality ≤ 40)` | `skillsText: z.string().max(2600).transform(parse).pipe(z.array(z.string().min(1).max(60)).max(40))` | `Row.skills: string[]` | ⚠️ **Zod: string→array transform; DB: text[]** — OK ama `skillsText` form alanı, DB `skills` sütunu |
| `experience` | `jsonb NOT NULL DEFAULT '[]' CHECK (is_valid_candidate_profile_section(..., 12, 2000))` | `experience: z.array(experienceEntrySchema).max(12).default([]).transform(removeBlankEntries)` | `Row.experience: Json` | ⚠️ **DB: jsonb, Zod: array<object>, TS: Json** — Tip geniş (Json), runtime validation Zod'da |
| `education` | `jsonb NOT NULL DEFAULT '[]' CHECK (...)` | `education: z.array(educationEntrySchema).max(12)...` | `Row.education: Json` | ⚠️ Aynı |
| `languages` | `jsonb NOT NULL DEFAULT '[]' CHECK (...)` | `languages: z.array(languageEntrySchema).max(12)...` | `Row.languages: Json` | ⚠️ Aynı |
| `certifications` | `jsonb NOT NULL DEFAULT '[]' CHECK (...)` | `certifications: z.array(certificationEntrySchema).max(12)...` | `Row.certifications: Json` | ⚠️ Aynı |
| `summary` | **YOK** (migration'da eklenmemiş!) | `summary: z.string().trim().max(2000).transform(v=>v\|\|null)` | **YOK** (types'da yok) | ❌ **EKSİK SÜTUN** |
| `cvFullText` | **YOK** | `cvFullText: z.string().max(100000).nullish().transform(...)` | **YOK** | ❌ **EKSİK SÜTUN** |
| `links` | **YOK** | `links: z.array(linksEntrySchema).max(12)...` | **YOK** | ❌ **EKSİK SÜTUN** |
| `phone` | **YOK** | Frontend remediation planında eklenecek | **YOK** | ❌ **EKSİK SÜTUN** — DB migration, formun kaydetmesinden önce gelmeli |
| `job_type_preference` | **YOK** | `jobTypePreference` alanıyla senkronize edilecek | **YOK** | ❌ **EKSİK SÜTUN** |
| `workplace_mode_preference` | **YOK** | `workplaceModePreference` alanıyla senkronize edilecek | **YOK** | ❌ **EKSİK SÜTUN** |
| `salary_expectation` | **YOK** | `salaryExpectation` alanıyla senkronize edilecek | **YOK** | ❌ **EKSİK SÜTUN** |
| `availability` | **YOK** | `availability` alanıyla senkronize edilecek | **YOK** | ❌ **EKSİK SÜTUN** |
| `visibility` | `text NOT NULL DEFAULT 'private' CHECK (private,public)` | Schema'da `omit` edilmemiş ama `candidateProfileUpdateSchema` omit ediyor | `Row.visibility: string` | ✅ OK (ama `UPDATE` grant'te `visibility` var — **GÜVENLİK RİSKİ**: kandidat `public` yapabiliyor; migration `20261014000000` L84-86 `revoke insert/update visibility` yapmış ✅) |
| `created_at` | `timestamptz DEFAULT now()` | Schema'da yok | `Row.created_at: string` | ✅ OK |
| `updated_at` | `timestamptz DEFAULT now()` + trigger | Schema'da yok | `Row.updated_at: string` | ✅ OK |

**Özet `candidate_profiles`:** Veritabanında **8 sütun eksik**: `summary`, `cv_full_text`, `links`, `phone`, `job_type_preference`, `workplace_mode_preference`, `salary_expectation`, `availability`. İlk üç alan mevcut aday şemasıyla; diğer beş alan frontend remediation planındaki Zod sözleşmesiyle aynı migration/type/DAL değişikliğinde eşleştirilmeli. Yeni alanların SQL tipi, nullability ve CHECK kuralları ilgili Zod şemasıyla birlikte kararlaştırılmalı; henüz tanımlı olmayan enum/değerler varsayılmamalı. Migration ve DB testleri tamamlanmadan form bu alanları kaydetmemeli.

### 2.2 `companies` Tablosu — Migration vs Zod vs TypeScript Types

| Sütun | Migration (SQL) | Zod Schema (`src/features/companies/schemas.ts`) | TypeScript Types | Uyuşmazlık |
|---|---|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | `companyId: z.string().uuid()` | `Row.id: string` | ✅ OK |
| `name` | `text NOT NULL CHECK (2-120, btrim)` | `companyName: z.string().trim().min(2).max(120)` | `Row.name: string` | ✅ OK |
| `slug` | `text UNIQUE CHECK (format)` | `slug: z.string().trim().toLowerCase().min(2).max(80).regex(...)` | `Row.slug: string` | ✅ OK |
| `verification_status` | `company_verification_status DEFAULT 'pending'` | Schema'da yok (client yazmaz) | `Row.verification_status: CompanyVerificationStatus` | ✅ OK |
| `profile_description` | `text NOT NULL DEFAULT '' CHECK (≤2000)` | `profileDescription: z.string().trim().max(2000)` | `Row.profile_description: string` | ✅ OK |
| `categories` | `text[] NOT NULL DEFAULT '{}' CHECK (is_valid_company_categories(12,80))` | `categoriesText: z.string().max(1000).transform(parse).pipe(z.array(z.string().min(1).max(80)).max(12))` | `Row.categories: string[]` | ✅ OK (Zod string→array transform) |
| `website` | `text CHECK (≤2048, http/https regex)` | `website: optionalCompanyText(2048).refine(URL protocol)` | `Row.website: string \| null` | ✅ OK |
| `phone` | `text CHECK (≤80)` | `phone: optionalCompanyText(80)` | `Row.phone: string \| null` | ✅ OK |
| `public_email` | `text CHECK (≤254, email regex)` | `publicEmail: optionalCompanyText(254).refine(z.email())` | `Row.public_email: string \| null` | ✅ OK |
| `address` | `text CHECK (≤240)` | `address: optionalCompanyText(240)` | `Row.address: string \| null` | ✅ OK |
| `municipality` | `text CHECK (≤120)` — **KKTC ilçesi CHECK YOK!** | `municipality: optionalCompanyText(120).pipe(z.enum(districts).nullable())` | `Row.municipality: string \| null` | ❌ **DB CHECK EKSİK** — Zod ilçe sınırlıyor ama DB'de `CHECK (municipality IN (...))` yok. `candidate_profiles.location` ve `jobs.district` var ama `companies.municipality` YOK. |
| `directory_entry_id` | `text CHECK (8-128)` | `directoryTarget: z.string().max(160)` | `Row.directory_entry_id: string \| null` | ✅ OK |
| `directory_location_index` | `integer CHECK (≥0)` | Schema'da yok | `Row.directory_location_index: number \| null` | ✅ OK |
| `source_profile_url` | `text` (allowlist CHECK: `20261110140000` migration) | `sourceProfileUrlSchema` regex allowlist | `Row.source_profile_url: string \| null` | ✅ OK |
| `logo_url` | `text` (allowlist CHECK) | `sourceLogoUrlSchema` `isSupportedEmployerLogoUrl` | `Row.logo_url: string \| null` | ✅ OK |
| `created_at` | `timestamptz DEFAULT now()` | — | `Row.created_at: string` | ✅ OK |
| `updated_at` | `timestamptz DEFAULT now()` + trigger | — | `Row.updated_at: string` | ✅ OK |

**Özet `companies`:** **`municipality` için KKTC ilçesi CHECK constraint EKSİK** (sadece `char_length ≤ 120`). `candidate_profiles.location` ve `jobs.district` da `CHECK (IN ('Lefkoşa','Mağusa','Girne','İskele','Güzelyurt','Lefke'))` var ama `companies.municipality` yok.

### 2.3 `jobs` Tablosu — Migration vs Zod vs TypeScript Types

| Sütun | Migration (SQL) | Zod Schema (`src/features/jobs/schemas.ts`) | TypeScript Types | Uyuşmazlık |
|---|---|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | `jobId: z.string().uuid().nullable()` | `Row.id: string` | ✅ OK |
| `company_id` | `uuid NOT NULL REFERENCES companies` | `companyId: z.string().uuid()` | `Row.company_id: string` | ✅ OK |
| `created_by` | `uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles` — **NOT NULL ama `20261021100000` migration `DROP NOT NULL` yapmış!** | Schema'da yok (server set eder) | `Row.created_by: string` | ⚠️ **Migration sonrası `created_by` nullable** — TypeScript `string` (non-nullable) yanlış; `string \| null` olmalı. |
| `title` | `text NOT NULL CHECK (5-140, btrim)` | `title: z.string().trim().min(5).max(140)` | `Row.title: string` | ✅ OK |
| `slug` | `text NOT NULL CHECK (format)` | `slug: z.string().trim().toLowerCase().min(2).max(100).regex(...)` | `Row.slug: string` | ✅ OK |
| `summary` | `text NOT NULL CHECK (20-500)` | `summary: z.string().trim().min(20).max(500)` | `Row.summary: string` | ✅ OK |
| `description` | `text NOT NULL CHECK (50-20000)` | `description: z.string().trim().min(50).max(20000)` | `Row.description: string` | ✅ OK |
| `requirements` | `text NOT NULL DEFAULT '' CHECK (≤10000)` | `requirements: z.string().trim().max(10000)` | `Row.requirements: string` | ✅ OK |
| `responsibilities` | `text NOT NULL DEFAULT '' CHECK (≤10000)` | `responsibilities: z.string().trim().max(10000)` | `Row.responsibilities: string` | ✅ OK |
| `job_type` | `text CHECK (enum 6 değer)` | `jobType: z.enum([...6 değer...])` | `Row.job_type: string` | ✅ OK (TS `string` ama enum olmalı; `Database["public"]["Enums"]` yok — job_type enum değil `text` CHECK) |
| `workplace_mode` | `text CHECK (enum 3 değer)` | `workplaceMode: z.enum(["on_site","hybrid","remote"])` | `Row.workplace_mode: string` | ✅ OK (aynı) |
| `district` | `text CHECK (6 KKTC ilçesi)` | `district: z.enum(districts).nullable()` | `Row.district: string \| null` | ✅ OK |
| `status` | `text DEFAULT 'draft' CHECK (7 değer)` | Schema'da yok (client yazmaz) | `Row.status: string` | ✅ OK |
| `moderation_note` | `text CHECK (≤1000)` | Schema'da yok | `Row.moderation_note: string \| null` | ✅ OK |
| `reviewed_by` | `uuid REFERENCES auth.users` | Schema'da yok | `Row.reviewed_by: string \| null` | ✅ OK |
| `reviewed_at` | `timestamptz` | Schema'da yok | `Row.reviewed_at: string \| null` | ✅ OK |
| `published_at` | `timestamptz` | Schema'da yok | `Row.published_at: string \| null` | ✅ OK |
| `expires_at` | `timestamptz` | Schema'da yok | `Row.expires_at: string \| null` | ✅ OK |
| `publication_source` | `text NOT NULL DEFAULT 'platform' CHECK (platform,source_site)` — **`20261021100000` eklendi** | Schema'da yok (RPC döndürür) | `Row.publication_source: string` | ✅ OK |
| `search_vector` | `tsvector GENERATED ALWAYS STORED` | Schema'da yok | `Row.search_vector: string` | ✅ OK (TS `string` ama `tsvector` — PostgREST `text` olarak döndürür) |
| `created_at` | `timestamptz DEFAULT now()` | — | `Row.created_at: string` | ✅ OK |
| `updated_at` | `timestamptz DEFAULT now()` + trigger | — | `Row.updated_at: string` | ✅ OK |
| `unique (company_id, slug)` | ✅ | — | — | ✅ OK |

**Özet `jobs`:** `created_by` **nullable** oldu (migration `20261021100000` L25) ama TypeScript types `string` (non-nullable) — **tip uyuşmazlığı**. `job_type`, `workplace_mode`, `status` DB'de `text CHECK` ile enum gibi ama TypeScript `string` — enum tipine çevrilebilir ama breaking change.

### 2.4 `applications` Tablosu — Migration vs Zod vs TypeScript Types

| Sütun | Migration (SQL) | Zod Schema | TypeScript Types | Uyuşmazlık |
|---|---|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | `applicationId: z.string().uuid()` | `Row.id: string` | ✅ OK |
| `job_id` | `uuid NOT NULL REFERENCES jobs` | `jobId: z.string().uuid()` | `Row.job_id: string` | ✅ OK |
| `candidate_id` | `uuid NOT NULL REFERENCES profiles` | Schema'da yok (server set eder) | `Row.candidate_id: string` | ✅ OK |
| `cover_letter` | `text NOT NULL DEFAULT '' CHECK (≤5000)` | `coverLetter: z.string().trim().max(5000)` | `Row.cover_letter: string` | ✅ OK |
| `status` | `text DEFAULT 'submitted' CHECK (6 değer)` | `nextStatus: z.enum([...])` (transition) | `Row.status: string` | ✅ OK |
| `reviewed_by` | `uuid REFERENCES auth.users` | — | `Row.reviewed_by: string \| null` | ✅ OK |
| `reviewed_at` | `timestamptz` | — | `Row.reviewed_at: string \| null` | ✅ OK |
| `first_viewed_at` | `timestamptz` (L3-7 `20261022130000`) | — | `Row.first_viewed_at: string \| null` | ✅ OK |
| `first_viewed_by` | `uuid REFERENCES profiles` (L3-7) | — | `Row.first_viewed_by: string \| null` | ✅ OK |
| `created_at` | `timestamptz DEFAULT now()` | — | `Row.created_at: string` | ✅ OK |
| `updated_at` | `timestamptz DEFAULT now()` + trigger | — | `Row.updated_at: string` | ✅ OK |
| `unique (job_id, candidate_id)` | ✅ | — | — | ✅ OK |

**Özet `applications`:** Uyumlu. `first_viewed_at/by` hem migration hem types hem RPC (`mark_application_viewed`) ile tutarlı.

### 2.5 `company_profile_submissions` — Migration vs Zod vs TypeScript Types

| Sütun | Migration (SQL) | Zod Schema | TypeScript Types | Uyuşmazlık |
|---|---|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | `companyId: z.string().uuid()` (submit schema) | `Row.id: string` | ✅ OK |
| `company_id` | `uuid NOT NULL REFERENCES companies` | `companyId: z.string().uuid()` | `Row.company_id: string` | ✅ OK |
| `submitted_by` | `uuid NOT NULL REFERENCES profiles` | Schema'da yok (server set eder) | `Row.submitted_by: string` | ✅ OK |
| `company_name` | `text NOT NULL CHECK (2-120, btrim)` | `companyName: z.string().trim().min(2).max(120)` | `Row.company_name: string` | ✅ OK |
| `profile_description` | `text NOT NULL DEFAULT '' CHECK (≤2000)` | `profileDescription: z.string().trim().max(2000)` | `Row.profile_description: string` | ✅ OK |
| `categories` | `text[] NOT NULL DEFAULT '{}' CHECK (is_valid_company_categories(12,80))` | `categoriesText: ...pipe(z.array(...).max(12))` | `Row.categories: string[]` | ✅ OK |
| `website` | `text CHECK (≤2048, http/https)` | `website: optionalCompanyText(2048).refine(URL)` | `Row.website: string \| null` | ✅ OK |
| `phone` | `text CHECK (≤80)` | `phone: optionalCompanyText(80)` | `Row.phone: string \| null` | ✅ OK |
| `public_email` | `text CHECK (≤254, email)` | `publicEmail: optionalCompanyText(254).refine(z.email())` | `Row.public_email: string \| null` | ✅ OK |
| `address` | `text CHECK (≤240)` | `address: optionalCompanyText(240)` | `Row.address: string \| null` | ✅ OK |
| `municipality` | `text CHECK (≤120)` — **KKTC ilçesi CHECK YOK!** | `municipality: optionalCompanyText(120).pipe(z.enum(districts).nullable())` | `Row.municipality: string \| null` | ❌ **DB CHECK EKSİK** — `companies.municipality` ile aynı sorun. |
| `directory_entry_id` | `text CHECK (8-128)` | `directoryTarget: z.string().max(160)` | `Row.directory_entry_id: string \| null` | ✅ OK |
| `directory_location_index` | `integer CHECK (≥0)` | Schema'da yok | `Row.directory_location_index: number \| null` | ✅ OK |
| `status` | `company_profile_submission_status DEFAULT 'pending'` | Schema'da yok (client yazmaz) | `Row.status: CompanyProfileSubmissionStatus` | ✅ OK |
| `review_note` | `text CHECK (≤1000)` | Schema'da yok | `Row.review_note: string \| null` | ✅ OK |
| `reviewed_by` | `uuid REFERENCES auth.users` | Schema'da yok | `Row.reviewed_by: string \| null` | ✅ OK |
| `reviewed_at` | `timestamptz` | Schema'da yok | `Row.reviewed_at: string \| null` | ✅ OK |
| `created_at` | `timestamptz DEFAULT now()` | — | `Row.created_at: string` | ✅ OK |
| `updated_at` | `timestamptz DEFAULT now()` + trigger (L289-291) | — | `Row.updated_at: string` | ✅ OK |

**Özet:** `municipality` için KKTC ilçesi CHECK constraint **EKSİK** (hem `companies` hem `company_profile_submissions`).

### 2.6 Eksik Tabloların Zod/TypeScript Karşılığı

| Tablo | Migration | Zod Schema | TypeScript Types | Durum |
|---|---|---|---|---|
| `resumes` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `resume_versions` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `saved_jobs` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `notifications` | ⚠️ `application_notifications` var | ❌ | ❌ | Genel `notifications` tablosu yok |
| `conversations` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `conversation_members` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `messages` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `integration_sync_runs` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `orders` | ❌ | ❌ | ❌ | **Tamamen eksik** (IBAN sipariş) |
| `payment_submissions` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `payment_reconciliations` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `payment_instruction_versions` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `credit_accounts` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `credit_ledger_entries` | ❌ | ❌ | ❌ | **Tamamen eksik** |
| `outbox_events` | ❌ | ❌ | ❌ | **Tamamen eksik** |

---

## 3. ZERO-TRUST RLS, GRANT VE SECURITY DEFINER MİKRO DENETİMİ

Her tablo için 5 madde kontrolü:

### 3.1 Tablo Bazlı Denetim Matrisi

| Tablo | 1) ENABLE + FORCE RLS | 2) GRANT (anon/auth) | 3) Policy'ler (CRUD) | 4) `(select auth.uid())` | 5) SECURITY DEFINER `search_path` |
|---|---|---|---|---|---|
| `profiles` | ✅ ENABLE / ❌ **FORCE YOK** | `SELECT` all; `UPDATE (display_name, locale)` | `read_own`, `update_own` ✅ | ✅ Policy'lerde `(select auth.uid())` kullanılıyor | N/A (trigger fonksiyonu `set_updated_at` ✅) |
| `user_roles` | ✅ ENABLE / ❌ **FORCE YOK** | `SELECT` all; **INSERT/UPDATE/DELETE YOK** | `read_own` ✅ | ✅ | N/A |
| `candidate_profiles` | ✅ ENABLE / ❌ **FORCE YOK** | `SELECT` all; `INSERT (user_id, headline, location, skills, visibility)`; `UPDATE (headline, location, skills, visibility)` — **`visibility` grant var ama migration L84-86 revoke etmiş** | `read_own`, `insert_own`, `update_own` ✅ | ✅ | N/A |
| `companies` | ✅ ENABLE / ❌ **FORCE YOK** | `anon`: `SELECT`; `authenticated`: `SELECT` | `read_verified`, `read_active_member`, `read_platform_admin` ✅ | ✅ Policy'lerde `public.is_active_company_member(id, null)` (RPC içinde `(select auth.uid())`) | N/A |
| `company_members` | ✅ ENABLE / ❌ **FORCE YOK** | `authenticated`: `SELECT` | `read_own`, `read_company_owner`, `read_platform_admin` ✅ | ✅ | N/A |
| `audit_logs` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** (tamamen kapalı) | **Policy YOK** (RLS enabled ama policy yok = deny all) | — | N/A |
| `jobs` | ✅ ENABLE / ❌ **FORCE YOK** | `anon`: `SELECT (15 kolon)`; `authenticated`: `SELECT` all; `INSERT (10 kolon)`; `UPDATE (9 kolon)` — **`status, published_at, expires_at, reviewed_by, reviewed_at, publication_source` GRANT YOK** ✅ | `public_read`, `company_read`, `platform_admin_read`, `company_insert_draft`, `company_update_editable` ✅ | ✅ Policy'lerde `(select auth.uid())` kullanılıyor | N/A |
| `applications` | ✅ ENABLE / ❌ **FORCE YOK** | `authenticated`: `SELECT` | `candidate_read_own`, `company_read_job_applicants` ✅ | ✅ | N/A |
| `job_packages` | ✅ ENABLE / ❌ **FORCE YOK** | `anon,authenticated`: `SELECT (6 kolon)` | `read_active` ✅ | Policy'de `is_active` (auth.uid yok) | N/A |
| `company_job_package_assignments` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** (RPC ile erişim) | — | `admin_assign_company_job_package`, `get_company_job_entitlements` ✅ `search_path=''` |
| `company_profile_submissions` | ✅ ENABLE / ❌ **FORCE YOK** | `authenticated`: `SELECT, INSERT (12 kolon), UPDATE (11 kolon)` — **`status, reviewed_by, reviewed_at` GRANT YOK** ✅ | `read_owner_or_admin`, `insert_active_owner`, `update_pending_owner` ✅ | ✅ | `review_company_profile_submission` ✅ `search_path=''` |
| `company_directory_overrides` | ✅ ENABLE / ❌ **FORCE YOK** | `anon,authenticated`: `SELECT` | `read_public` (true) ✅ | Policy `true` (auth.uid yok) | N/A |
| `application_events` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | N/A |
| `notifications` | ✅ ENABLE / ❌ **FORCE YOK** | `authenticated`: `SELECT (5 kolon), UPDATE (read_at)` | `read_own`, `mark_own_read` ✅ | ✅ | `enqueue_application_notification` ✅ `search_path=''` |
| `notification_email_outbox` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `claim_notification_email_outbox`, `finish_notification_email` ✅ `service_role` guard |
| `feedback_submissions` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK**; `service_role`: `SELECT, UPDATE` ✅ | **Policy YOK** | — | `submit_feedback` ✅ `search_path=''`, `anon,authenticated` grant |
| `sales_leads` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK**; `service_role`: `SELECT, UPDATE` ✅ | **Policy YOK** | — | `submit_sales_lead` ✅ `search_path=''`, `anon,authenticated` grant |
| `push_subscriptions` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `register_push_subscription`, `revoke_push_subscription`, `list_my_push_subscriptions`, `get_my_push_preferences`, `set_push_notification_preferences` ✅ `search_path=''`, `authenticated` grant; delivery RPC'ler `service_role` |
| `push_notification_preferences` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | Yukarıdaki RPC'ler |
| `support_threads` | ✅ ENABLE / ❌ **FORCE YOK** | `authenticated`: `SELECT` | `read_own` ✅ | ✅ | `submit_support_message`, `get_support_thread`, `admin_list_support_threads`, `admin_reply_support_thread` ✅ `search_path=''` |
| `support_messages` | ✅ ENABLE / ❌ **FORCE YOK** | `authenticated`: `SELECT` | `read_own` ✅ | ✅ | Yukarıdaki RPC'ler |
| `site_content` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `get_public_site_content` (anon,auth), `admin_upsert_site_content` (auth) ✅ |
| `faq_entries` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `get_public_faq` (anon,auth), `admin_upsert_faq_entry`, `admin_delete_faq_entry`, `admin_list_faq_entries` ✅ |
| `listing_plans` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `get_public_listing_plans` (anon,auth), `admin_upsert_listing_plan`, `admin_list_listing_plans` ✅ |
| `job_source_imports` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `is_public_source_job` (revoked from all), `replace_source_job_catalogue` (service_role) ✅ |
| `application_contact_shares` | ✅ ENABLE / ❌ **FORCE YOK** | **HIÇBİR GRANT YOK** ✅ | **Policy YOK** | — | `get_application_contact_email` (authenticated) ✅ |

### 3.2 Ortak Bulgular

1. **`FORCE ROW LEVEL SECURITY` HİÇBİR TABLODA YOK** — Sadece `ENABLE` var. V4 §9.1 "RLS etkinleştirilir" ama `FORCE` table owner'ın da politikaya tabi olmasını sağlar. **Tüm tablolara eklenmeli.**

2. **`auth.uid()` vs `(select auth.uid())`** — Çoğu policy `(select auth.uid())` kullanıyor ✅ Ama bazıları (ör. `job_packages.read_active` policy `is_active` kullanıyor, auth.uid yok — bu doğru çünkü public read). `companies.read_verified` policy `verification_status = 'verified'` — auth.uid yok, doğru.

3. **SECURITY DEFINER fonksiyonların hepsi `set search_path = ''`** ✅ Ve tam nitelikli referanslar (`pg_catalog.now()`, `public.tablo`) kullanıyor ✅. Ratchet test `sql-hardening.test.ts` bunu zorluyor ✅.

4. **`audit_logs`, `user_roles`, `company_job_package_assignments`, `application_events`, `notification_email_outbox`, `feedback_submissions`, `sales_leads`, `push_subscriptions`, `push_notification_preferences`, `job_source_imports`, `application_contact_shares`, `site_content`, `faq_entries`, `listing_plans`** — **Client grant YOK, policy YOK** ✅ Sadece RPC ile erişim.

5. **`candidate_profiles.visibility`** — Migration `20261014000000` L84-86 `revoke insert/update visibility from authenticated` yapmış ✅ Ama `20261013000000` L130-136 `grant insert/update visibility` vermişti. **Son migration kazanıyor (revoke)** ✅.

---

## 4. YABANCI ANAHTAR (FK) VE İNDEKS MİKRO DENETİMİ

### 4.1 Tüm FK Sütunları ve İndeks Durumu

| Tablo | FK Sütunu | Referans | İndeks Var mı? | İndeks Adı | Not |
|---|---|---|---|---|---|
| `profiles` | `id` | `auth.users(id)` | PK | — | PK index |
| `user_roles` | `user_id` | `auth.users(id)` | PK (user_id,role) | — | PK leading `user_id` ✅ |
| `user_roles` | `granted_by` | `auth.users(id)` | ✅ | `user_roles_granted_by_idx` | `20261112160000` eklendi |
| `candidate_profiles` | `user_id` | `profiles(id)` | PK | — | PK index |
| `companies` | `id` | — | PK | — | PK index |
| `company_members` | `company_id` | `companies(id)` | PK (company_id,user_id) | — | PK leading `company_id` ✅ |
| `company_members` | `user_id` | `profiles(id)` | ✅ | `company_members_user_id_idx` (user_id,status) | Leading `user_id` ✅ |
| `company_members` | `invited_by` | `auth.users(id)` | ✅ | `company_members_invited_by_idx` | `20261112160000` eklendi |
| `audit_logs` | `actor_id` | — (FK yok, loose ref) | ❌ | — | FK değil, `uuid` loose |
| `audit_logs` | `resource_id` | — | ❌ | — | FK değil |
| `jobs` | `company_id` | `companies(id)` | ✅ | `jobs_company_status_idx` (company_id,status,created_at) | Leading `company_id` ✅ |
| `jobs` | `created_by` | `profiles(id)` | ✅ | `jobs_created_by_idx` | `20261112160000` eklendi |
| `jobs` | `reviewed_by` | `auth.users(id)` | ✅ | `jobs_reviewed_by_idx` | `20261112160000` eklendi |
| `applications` | `job_id` | `jobs(id)` | ✅ | `applications_job_status_idx` (job_id,status,created_at) | Leading `job_id` ✅ |
| `applications` | `candidate_id` | `profiles(id)` | ✅ | `applications_candidate_recent_idx` (candidate_id,created_at) | Leading `candidate_id` ✅ |
| `applications` | `reviewed_by` | `auth.users(id)` | ✅ | `applications_reviewed_by_idx` | `20261112160000` eklendi |
| `applications` | `first_viewed_by` | `profiles(id)` | ✅ | `applications_first_viewed_by_idx` | `20261112160000` eklendi |
| `job_packages` | `id` | — | PK | — | PK index |
| `company_job_package_assignments` | `company_id` | `companies(id)` | ✅ | `company_job_package_assignments_company_id_idx` | `20261112160000` eklendi (önceki sadece `(package_id,company_id)` vardı, leading `package_id` idi) |
| `company_job_package_assignments` | `package_id` | `job_packages(id)` | ✅ | `company_job_package_assignments_package_idx` (package_id,company_id) | Leading `package_id` ✅ |
| `company_job_package_assignments` | `assigned_by` | `auth.users(id)` | ✅ | `company_job_package_assignments_assigned_by_idx` | `20261112160000` eklendi |
| `company_profile_submissions` | `company_id` | `companies(id)` | ✅ | `company_profile_submissions_company_id_idx` | `20261112160000` eklendi (önceki partial index `status='pending'` idi) |
| `company_profile_submissions` | `submitted_by` | `profiles(id)` | ✅ | `company_profile_submissions_submitted_by_idx` | `20261112160000` eklendi |
| `company_profile_submissions` | `reviewed_by` | `auth.users(id)` | ✅ | `company_profile_submissions_reviewed_by_idx` | `20261112160000` eklendi |
| `application_events` | `application_id` | `applications(id)` | ✅ | `application_events_application_recent_idx` (application_id,created_at) | Leading `application_id` ✅ |
| `application_events` | `actor_id` | `profiles(id)` | ✅ | `application_events_actor_id_idx` | `20261112160000` eklendi |
| `notifications` | `user_id` | `profiles(id)` | ✅ | `notifications_user_recent_idx` (user_id,created_at) | Leading `user_id` ✅ |
| `notifications` | `application_event_id` | `application_events(id)` | ✅ | `notifications_application_event_id_idx` | `20261112160000` eklendi (unique index `(user_id,application_event_id)` leading `user_id` idi) |
| `notification_email_outbox` | `notification_id` | `notifications(id)` | ✅ | `notification_email_outbox_pending_idx` (next_attempt_at,created_at) partial | **FK leading column index YOK** — `notification_id` için dedicated index eksik! |
| `feedback_submissions` | `user_id` | `profiles(id)` | ✅ | `feedback_submissions_user_id_idx` | `20261112160000` eklendi |
| `sales_leads` | — | — | — | — | FK yok |
| `push_subscriptions` | `user_id` | `profiles(id)` | ✅ | `push_subscriptions_user_id_idx` | `20261112160000` eklendi (partial index `revoked_at IS NULL` leading `user_id` idi — RI check için yetersiz, dedicated eklendi ✅) |
| `support_threads` | `user_id` | `profiles(id)` | ✅ | `support_threads_user_recent_idx` (user_id,last_message_at) | Leading `user_id` ✅ |
| `support_messages` | `thread_id` | `support_threads(id)` | ✅ | `support_messages_thread_recent_idx` (thread_id,created_at) | Leading `thread_id` ✅ |
| `support_messages` | `author_id` | `profiles(id)` | ✅ | `support_messages_author_id_idx` | `20261112160000` eklendi |
| `site_content` | `updated_by` | `auth.users(id)` | ✅ | `site_content_updated_by_idx` | `20261112160000` eklendi |
| `job_source_imports` | `job_id` | `jobs(id)` | PK | — | PK index |
| `application_contact_shares` | `application_id` | `applications(id)` | PK | — | PK index |
| `application_contact_shares` | `candidate_id` | `profiles(id)` | ✅ | `application_contact_shares_candidate_id_idx` | `20261112160000` eklendi |

### 4.2 Eksik FK İndeksleri (Kritik)

| Tablo | FK Sütunu | Sebep |
|---|---|---|
| `notification_email_outbox` | `notification_id` | `REFERENCES notifications(id) ON DELETE RESTRICT` — silme/restrict işlemi seq scan yapar. Partial index `(next_attempt_at,created_at) WHERE sent_at IS NULL` leading `notification_id` DEĞİL. **Dedicated index EKLENMELİ.** |

### 4.3 Yinelenen/Kullanılmayan İndeksler

| Tablo | İndeks | Durum | Not |
|---|---|---|---|
| `company_job_package_assignments` | `company_job_package_assignments_package_idx` (package_id,company_id) | **Kullanımda** | `admin_assign_company_job_package` RPC `package_id` ile join yapıyor |
| `company_job_package_assignments` | `company_job_package_assignments_company_id_idx` (company_id) | **Yeni, gerekli** | RI check için leading `company_id` şart |
| `company_job_package_assignments` | `company_job_package_assignments_one_current` (company_id) WHERE revoked_at IS NULL | **Unique partial** | Business rule: şirket başına 1 aktif atama |
| `notifications` | `notifications_user_recent_idx` (user_id,created_at) | **Kullanımda** | `list_my_application_notifications` RPC |
| `notifications` | unique (user_id,application_event_id) | **Kullanımda** | Duplicate notification engelleme |
| `push_subscriptions` | `push_subscriptions_user_active_idx` (user_id) WHERE revoked_at IS NULL | **Kullanımda** | `list_my_push_subscriptions` RPC |
| `push_subscriptions` | unique (endpoint) | **Kullanımda** | Endpoint global unique (shared device reassignment) |

**Yinelenen/yetersiz indeks YOK** — `20261112160000` migration ratchet test `unindexed_foreign_keys.test.sql` ile "leading column, non-partial" kuralını zorluyor ✅.

---

## 5. KKTC İŞ KURALLARI VE VERİ BÜTÜNLÜĞÜ KISITLARI (CHECK CONSTRAINTS)

### 5.1 6 KKTC İlçesi Constraint'leri

| Tablo.Sütun | Constraint Var mı? | İzinli Değerler | Not |
|---|---|---|---|
| `jobs.district` | ✅ | `Lefkoşa`, `Mağusa`, `Girne`, `İskele`, `Güzelyurt`, `Lefke` | Migration `20261020190500` L25-26 |
| `candidate_profiles.location` | ✅ | Aynı 6 ilçe | Migration `20261013000000` L52 |
| `companies.municipality` | ❌ **EKSİK** | Sadece `CHECK (char_length ≤ 120)` | **EKLENMELİ** |
| `company_profile_submissions.municipality` | ❌ **EKSİK** | Sadece `CHECK (char_length ≤ 120)` | **EKLENMELİ** |
| `support_threads` / `support_messages` | N/A | İlçe alanı yok | — |
| `feedback_submissions` / `sales_leads` | N/A | İlçe alanı yok | — |

### 5.2 Çalışma Türleri (job_type)

| Tablo | Constraint | Değerler |
|---|---|---|
| `jobs.job_type` | ✅ `CHECK (IN (...))` | `full_time`, `part_time`, `contract`, `temporary`, `internship`, `freelance` |

### 5.3 Çalışma Düzeni (workplace_mode)

| Tablo | Constraint | Değerler |
|---|---|---|
| `jobs.workplace_mode` | ✅ `CHECK (IN (...))` | `on_site`, `hybrid`, `remote` |

### 5.4 Dizi Uzunluk Sınırları

| Tablo.Sütun | Constraint | Limit |
|---|---|---|
| `candidate_profiles.skills` | ✅ `CHECK (cardinality(skills) <= 40)` | 40 |
| `candidate_profiles.experience` | ✅ `is_valid_candidate_profile_section(..., 12, 2000)` | 12 entry, field ≤ 2000 |
| `candidate_profiles.education` | ✅ Aynı | 12 entry |
| `candidate_profiles.languages` | ✅ Aynı | 12 entry |
| `candidate_profiles.certifications` | ✅ Aynı | 12 entry |
| `companies.categories` | ✅ `is_valid_company_categories(categories, 12, 80)` | 12 item, ≤ 80 char |
| `company_profile_submissions.categories` | ✅ Aynı | 12 item |
| `jobs.requirements` | ✅ `CHECK (char_length ≤ 10000)` | 10000 char |
| `jobs.responsibilities` | ✅ `CHECK (char_length ≤ 10000)` | 10000 char |

### 5.5 Metin Uzunluk Sınırları (Örnekler)

| Tablo.Sütun | Constraint |
|---|---|
| `profiles.display_name` | `CHECK (char_length BETWEEN 2 AND 80 AND display_name = btrim(display_name))` |
| `profiles.locale` | `CHECK (IN ('tr','en','ru','el','fa','de','he'))` |
| `companies.name` | `CHECK (2-120, btrim)` |
| `companies.slug` | `CHECK (2-80, ^[a-z0-9]+(-[a-z0-9]+)*$, no special chars)` |
| `jobs.title` | `CHECK (5-140, btrim)` |
| `jobs.summary` | `CHECK (20-500)` |
| `jobs.description` | `CHECK (50-20000)` |
| `jobs.moderation_note` | `CHECK (≤ 1000)` |
| `applications.cover_letter` | `CHECK (≤ 5000)` |
| `audit_logs.action` | `CHECK (1-120)` |
| `audit_logs.resource_type` | `CHECK (1-80)` |

### 5.6 Karmaşık Constraint'ler (Tutarlılık)

| Tablo | Constraint | Açıklama |
|---|---|---|
| `jobs` | `jobs_publication_dates_consistent` | `published/closed/expired` → `published_at` & `expires_at` NOT NULL & `expires_at > published_at`; diğer durumlarda NULL |
| `jobs` | `jobs_review_metadata_consistent` | `approved/rejected/published/closed/expired` → `reviewed_by` & `reviewed_at` NOT NULL; `draft/pending_review` → NULL |
| `jobs` | (güncellenmiş) `jobs_review_metadata_consistent` | `source_site` + `published` → `reviewed_by` & `reviewed_at` NULL, `created_by` NULL |
| `company_job_package_assignments` | `company_job_package_assignment_dates` | `expires_at` NULL OR `expires_at > starts_at` |
| `job_source_imports` | `job_source_imports_dates_consistent` | `source_expires_at > source_published_at` |
| `application_events` | `application_events_status_change_valid` | `status_changed` → from/to NOT NULL; `submitted` → to='submitted'; `viewed` → from/to NULL |
| `applications` | `applications_first_view_consistent` | `first_viewed_at` & `first_viewed_by` birlikte NULL veya birlikte NOT NULL |
| `companies` | `companies_directory_claim_pair` | `directory_entry_id` & `directory_location_index` birlikte NULL veya birlikte NOT NULL |
| `company_profile_submissions` | `company_profile_submission_directory_pair` | Aynı kural |

### 5.7 Eksik/Atlanan Constraint'ler

1. **`companies.municipality`** — KKTC 6 ilçesi `CHECK` **EKSİK**
2. **`company_profile_submissions.municipality`** — KKTC 6 ilçesi `CHECK` **EKSİK**
3. **`candidate_profiles.summary`, `cv_full_text`, `links`** — Sütunlar **EKSİK**
4. **`candidate_profiles.phone`, `job_type_preference`, `workplace_mode_preference`, `salary_expectation`, `availability`** — Frontend remediation kapsamındaki beş profil alanı için sütunlar **EKSİK**
5. **`notification_email_outbox.notification_id`** — FK leading column index **EKSİK**

---

## 6. UYGULAMA PLANI (TEK TEMİZ MİGRASYON + pgTAP TESTLERİ)

> **Strateji:** AGENTS.md kuralı: "Canlı veritabanında uygulanmış mevcut migrasyonları ASLA geriye dönük düzenleme; tüm iyileştirmeleri yalnızca yeni tarih damgalı forward-only migrasyon dosyası (veya dosyaları) olarak yaz."

### 6.1 Migrasyon Dosyası Yapısı

**Tek bir kapsamlı migrasyon dosyası** (veya mantıksal bağımlılıklara göre 2-3 dosya) önerilir. Tarih damgası bugünün tarihiyle `20261125` önekini kullanmalı; dosyalar sıralı ve benzersiz olmalı (`20261125000000`, `20261125010000`, `20261125020000`).

#### Migrasyon 1: `20261125000000_v4_schema_hardening_and_candidate_preferences.sql`

```sql
begin;

-- ============================================================
-- 1. FORCE ROW LEVEL SECURITY — Tüm tablolara
-- ============================================================
alter table public.profiles force row level security;
alter table public.user_roles force row level security;
alter table public.candidate_profiles force row level security;
alter table public.companies force row level security;
alter table public.company_members force row level security;
alter table public.audit_logs force row level security;
alter table public.jobs force row level security;
alter table public.applications force row level security;
alter table public.job_packages force row level security;
alter table public.company_job_package_assignments force row level security;
alter table public.company_profile_submissions force row level security;
alter table public.company_directory_overrides force row level security;
alter table public.application_events force row level security;
alter table public.notifications force row level security;
alter table public.notification_email_outbox force row level security;
alter table public.feedback_submissions force row level security;
alter table public.sales_leads force row level security;
alter table public.push_subscriptions force row level security;
alter table public.push_notification_preferences force row level security;
alter table public.support_threads force row level security;
alter table public.support_messages force row level security;
alter table public.site_content force row level security;
alter table public.faq_entries force row level security;
alter table public.listing_plans force row level security;
alter table public.job_source_imports force row level security;
alter table public.application_contact_shares force row level security;

-- ============================================================
-- 2. KKTC İlçesi CHECK Constraint'leri — mevcut constraint'leri doğrula
-- ============================================================
-- Bilinen eski yazımı constraint eklenmeden önce kanonik değere taşı.
update public.companies
set municipality = 'Mağusa'
where municipality = 'Gazimağusa';

update public.company_profile_submissions
set municipality = 'Mağusa'
where municipality = 'Gazimağusa';

-- district constraint'leri önceki migration'larda zaten oluşturuldu.
alter table public.candidate_profiles
  validate constraint candidate_profiles_location_northern_cyprus_district;
alter table public.companies
  validate constraint companies_municipality_northern_cyprus_district;
alter table public.company_profile_submissions
  validate constraint company_profile_submissions_municipality_northern_cyprus_district;
alter table public.company_directory_overrides
  validate constraint company_directory_overrides_municipality_northern_cyprus_district;

-- ============================================================
-- 3. candidate_profiles tercih sütunları
-- ============================================================
-- summary ve links 20261118000000 migration'ında zaten eklendi.
-- cv_full_text bilerek kalıcılaştırılmıyor; CV metni parse sırasında transient.
alter table public.candidate_profiles
  add column phone text
    check (phone is null or char_length(phone) <= 80),
  add column job_type_preference text[] not null default '{}',
  add column workplace_mode_preference text[] not null default '{}',
  add column salary_expectation text
    check (salary_expectation is null or char_length(salary_expectation) <= 120),
  add column availability text
    check (availability is null or char_length(availability) <= 80);

-- Preference array allowlists are enforced by CHECK constraints in the migration.

-- updated_at trigger zaten var (20261013000000)

-- ============================================================
-- 4. jobs.created_by nullable — TypeScript tipi düzeltmesi için migration GEREKMEZ
--    Sadece types/database.ts güncellenecek (string → string | null)

-- ============================================================
-- 5. notification_email_outbox.notification_id FK index
-- ============================================================
-- The existing unique index already covers notification_id; no duplicate index.

-- ============================================================
-- 6. Eski/çakışan throttle migration temizliği (opsiyonel)
--    20261110160000_v4_anon_write_throttle_app_client_ip.sql fonksiyonları
--    20261112120000 tarafından ezilmiş; drop etmek gerekmez (create or replace).
--    Sadece _applied_migrations ledger'ında tek kayıt kalması için not.

commit;
```

#### Migrasyon 2: `20261125010000_v4_missing_v4_tables.sql` (V4 §6.2-6.3 eksik tablolar — Core & Chat)

> **Not:** Bu migrasyon 7 tablo + RPC'leri kapsar. Billing/credit ayrı migrasyonda (Migrasyon 3).

**Tablolar (sıralı — FK bağımlılıkları):**

1. **`resumes`** — CV dosya metadata
   ```sql
   create table public.resumes (
     id uuid primary key default gen_random_uuid(),
     candidate_id uuid not null references public.profiles (id) on delete cascade,
     storage_path text not null unique
       check (char_length(storage_path) between 1 and 512),
     original_filename text not null
       check (char_length(original_filename) between 1 and 255),
     file_size_bytes bigint not null check (file_size_bytes > 0),
     mime_type text not null check (mime_type in ('application/pdf')),
     page_count integer check (page_count is null or page_count between 1 and 25),
     status text not null default 'uploaded'
       check (status in ('uploaded', 'processing', 'parsed', 'failed', 'deleted')),
     retention_until timestamptz not null default (now() + interval '90 days'),
     parsed_data jsonb,  -- structured CV data from parser
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   create index resumes_candidate_id_idx on public.resumes (candidate_id);
   create index resumes_status_idx on public.resumes (status);
   alter table public.resumes enable row level security;
   alter table public.resumes force row level security;
   revoke all on public.resumes from anon, authenticated;
   grant select, insert, update on public.resumes to authenticated;
   create policy resumes_owner_crud on public.resumes for all to authenticated
     using (candidate_id = (select auth.uid()))
     with check (candidate_id = (select auth.uid()));
   ```

2. **`resume_versions`** — CV sürümleme
   ```sql
   create table public.resume_versions (
     id uuid primary key default gen_random_uuid(),
     resume_id uuid not null references public.resumes (id) on delete cascade,
     version integer not null check (version > 0),
     structured_data jsonb not null check (jsonb_typeof(structured_data) = 'object'),
     created_at timestamptz not null default now(),
     unique (resume_id, version)
   );
   create index resume_versions_resume_id_idx on public.resume_versions (resume_id);
   alter table public.resume_versions enable row level security;
   alter table public.resume_versions force row level security;
   revoke all on public.resume_versions from anon, authenticated;
   grant select on public.resume_versions to authenticated;
   create policy resume_versions_owner_read on public.resume_versions for select to authenticated
     using (exists (select 1 from public.resumes r where r.id = resume_versions.resume_id and r.candidate_id = (select auth.uid())));
   ```

3. **`saved_jobs`** — Aday ilan kaydetme
   ```sql
   create table public.saved_jobs (
     user_id uuid not null references public.profiles (id) on delete cascade,
     job_id uuid not null references public.jobs (id) on delete cascade,
     created_at timestamptz not null default now(),
     primary key (user_id, job_id)
   );
   create index saved_jobs_job_id_idx on public.saved_jobs (job_id);
   alter table public.saved_jobs enable row level security;
   alter table public.saved_jobs force row level security;
   revoke all on public.saved_jobs from anon, authenticated;
   grant select, insert, delete on public.saved_jobs to authenticated;
   create policy saved_jobs_owner_crud on public.saved_jobs for all to authenticated
     using (user_id = (select auth.uid()))
     with check (user_id = (select auth.uid()));
   ```

4. **`conversations`** — Sohbet başlığı
   ```sql
   create table public.conversations (
     id uuid primary key default gen_random_uuid(),
     subject text check (subject is null or char_length(subject) <= 200),
     status text not null default 'active' check (status in ('active', 'archived', 'closed')),
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   create trigger conversations_set_updated_at before update on public.conversations
     for each row execute function public.set_updated_at();
   alter table public.conversations enable row level security;
   alter table public.conversations force row level security;
   revoke all on public.conversations from anon, authenticated;
   -- No direct grants; access via conversation_members
   ```

5. **`conversation_members`** — Sohbet üyelikleri
   ```sql
   create table public.conversation_members (
     conversation_id uuid not null references public.conversations (id) on delete cascade,
     user_id uuid not null references public.profiles (id) on delete cascade,
     role text not null default 'member' check (role in ('owner', 'member')),
     joined_at timestamptz not null default now(),
     left_at timestamptz,
     primary key (conversation_id, user_id)
   );
   create index conversation_members_user_id_idx on public.conversation_members (user_id);
   alter table public.conversation_members enable row level security;
   alter table public.conversation_members force row level security;
   revoke all on public.conversation_members from anon, authenticated;
   grant select on public.conversation_members to authenticated;
   create policy conv_members_self_read on public.conversation_members for select to authenticated
     using (user_id = (select auth.uid()));
   ```

6. **`messages`** — Mesajlar
   ```sql
   create table public.messages (
     id uuid primary key default gen_random_uuid(),
     conversation_id uuid not null references public.conversations (id) on delete cascade,
     sender_id uuid not null references public.profiles (id) on delete restrict,
     body text not null check (char_length(body) between 1 and 10000),
     message_type text not null default 'text' check (message_type in ('text', 'system', 'file')),
     metadata jsonb default '{}'::jsonb,
     created_at timestamptz not null default now()
   );
   create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
   create index messages_sender_id_idx on public.messages (sender_id);
   alter table public.messages enable row level security;
   alter table public.messages force row level security;
   revoke all on public.messages from anon, authenticated;
   grant select, insert on public.messages to authenticated;
   create policy messages_member_read on public.messages for select to authenticated
     using (exists (
       select 1 from public.conversation_members cm
       where cm.conversation_id = messages.conversation_id
         and cm.user_id = (select auth.uid())
         and cm.left_at is null
     ));
   create policy messages_member_insert on public.messages for insert to authenticated
     with check (
       sender_id = (select auth.uid())
       and exists (
         select 1 from public.conversation_members cm
         where cm.conversation_id = messages.conversation_id
           and cm.user_id = (select auth.uid())
           and cm.left_at is null
       )
     );
   ```

7. **`integration_sync_runs`** — Bakanlık/3.parti senkronizasyon logları
   ```sql
   create table public.integration_sync_runs (
     id uuid primary key default gen_random_uuid(),
     integration text not null check (integration in ('ministry_jobs', 'ministry_companies', 'external_api')),
     status text not null check (status in ('running', 'completed', 'failed', 'partial')),
     started_at timestamptz not null default now(),
     finished_at timestamptz,
     records_processed integer not null default 0 check (records_processed >= 0),
     records_succeeded integer not null default 0 check (records_succeeded >= 0),
     records_failed integer not null default 0 check (records_failed >= 0),
     error_summary text check (error_summary is null or char_length(error_summary) <= 5000),
     metadata jsonb default '{}'::jsonb,
     check (records_succeeded + records_failed <= records_processed)
   );
   create index integration_sync_runs_integration_started_idx on public.integration_sync_runs (integration, started_at desc);
   alter table public.integration_sync_runs enable row level security;
   alter table public.integration_sync_runs force row level security;
   revoke all on public.integration_sync_runs from anon, authenticated;
   grant select, insert, update on public.integration_sync_runs to service_role;
   -- No client policies; service_role only
   ```

**RPC'ler (Core & Chat):**

- `create_resume(candidate_id, storage_path, original_filename, file_size_bytes, mime_type, page_count)` → `uuid` (authenticated)
- `update_resume_status(resume_id, status, parsed_data)` → `void` (service_role)
- `create_resume_version(resume_id, structured_data)` → `uuid` (service_role)
- `start_conversation(participant_ids[], subject)` → `uuid` (authenticated, creates conversation + members)
- `send_message(conversation_id, body, message_type, metadata)` → `uuid` (authenticated, validates membership)
- `archive_conversation(conversation_id)` → `void` (authenticated, owner only)
- `log_integration_sync(integration, status, counts, error_summary, metadata)` → `uuid` (service_role)

Her tablo için: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, `revoke all from anon, authenticated`, FK leading column indeksler, `updated_at` trigger where applicable, `audit_logs` insert.

#### Migrasyon 3: `20261125020000_v4_billing_credit_tables.sql` (V4 §6.3 — Billing, Credit, Outbox)

> **Not:** Bu migrasyon 7 tablo + RPC'leri kapsar. IBAN sipariş, ödeme mutabakatı, kredi defteri, event outbox.

**Tablolar (sıralı — FK bağımlılıkları; `orders` öncesinde talimat sürüm tablosu oluşturulmalı):**

1. **`payment_instruction_versions`** — IBAN talimat sürümleme
   ```sql
   create table public.payment_instruction_versions (
     id uuid primary key default gen_random_uuid(),
     beneficiary_name text not null check (char_length(beneficiary_name) between 1 and 120),
     bank_name text not null check (char_length(bank_name) between 1 and 120),
     iban_restricted_value text not null check (char_length(iban_restricted_value) between 15 and 34),
     currency text not null default 'TRY' check (char_length(currency) = 3),
     instructions text check (instructions is null or char_length(instructions) <= 5000),
     active_from timestamptz not null default now(),
     active_to timestamptz,
     created_by uuid not null references auth.users (id) on delete restrict,
     created_at timestamptz not null default now(),
     check (active_to is null or active_to > active_from)
   );
   create index payment_instruction_versions_active_idx on public.payment_instruction_versions (active_from, active_to);
   alter table public.payment_instruction_versions enable row level security;
   alter table public.payment_instruction_versions force row level security;
   revoke all on public.payment_instruction_versions from anon, authenticated;
   grant select on public.payment_instruction_versions to authenticated;
   -- Admin RPC ile insert/update (admin_save_payment_instructions)
   ```

2. **`orders`** — IBAN sipariş
   ```sql
   create type public.order_status as enum (
     'awaiting_transfer', 'payment_submitted', 'payment_under_review',
     'paid', 'rejected', 'expired', 'cancelled', 'refund_pending', 'refunded'
   );

   create table public.orders (
     id uuid primary key default gen_random_uuid(),
     company_id uuid not null references public.companies (id) on delete restrict,
     status public.order_status not null default 'awaiting_transfer',
     total_minor integer not null check (total_minor >= 0),
     currency text not null default 'TRY' check (char_length(currency) = 3),
     reference_code text not null unique check (char_length(reference_code) between 8 and 64),
     package_snapshot jsonb not null check (jsonb_typeof(package_snapshot) = 'object'),
     payment_instructions_version_id uuid not null references public.payment_instruction_versions (id) on delete restrict,
     expires_at timestamptz not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   create index orders_company_status_idx on public.orders (company_id, status);
   create index orders_reference_code_idx on public.orders (reference_code);
   create index orders_expires_at_idx on public.orders (expires_at) where status in ('awaiting_transfer', 'payment_submitted', 'payment_under_review');
   alter table public.orders enable row level security;
   alter table public.orders force row level security;
   revoke all on public.orders from anon, authenticated;
   grant select on public.orders to authenticated;
   ```

3. **`payment_submissions`** — Kullanıcı transfer bildirimi
   ```sql
   create type public.payment_submission_status as enum (
     'submitted', 'under_review', 'accepted', 'rejected', 'needs_more_information'
   );

   create table public.payment_submissions (
     id uuid primary key default gen_random_uuid(),
     order_id uuid not null references public.orders (id) on delete restrict,
     submitted_by uuid not null references public.profiles (id) on delete restrict,
     sender_name text not null check (char_length(sender_name) between 1 and 120),
     transfer_reference text not null check (char_length(transfer_reference) between 1 and 128),
     amount_minor integer not null check (amount_minor > 0),
     currency text not null default 'TRY' check (char_length(currency) = 3),
     transferred_at timestamptz not null,
     receipt_storage_path text check (receipt_storage_path is null or char_length(receipt_storage_path) <= 512),
     status public.payment_submission_status not null default 'submitted',
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   create index payment_submissions_order_id_idx on public.payment_submissions (order_id);
   create index payment_submissions_submitted_by_idx on public.payment_submissions (submitted_by);
   alter table public.payment_submissions enable row level security;
   alter table public.payment_submissions force row level security;
   revoke all on public.payment_submissions from anon, authenticated;
   grant select, insert on public.payment_submissions to authenticated;
   ```

4. **`payment_reconciliations`** — Admin mutabakat kararı
   ```sql
   create type public.reconciliation_decision as enum ('accepted', 'rejected');

   create table public.payment_reconciliations (
     id uuid primary key default gen_random_uuid(),
     order_id uuid not null references public.orders (id) on delete restrict,
     submission_id uuid not null references public.payment_submissions (id) on delete restrict,
     reviewed_by uuid not null references auth.users (id) on delete restrict,
     decision public.reconciliation_decision not null,
     bank_reference_normalized text not null check (char_length(bank_reference_normalized) between 1 and 128),
     notes text check (notes is null or char_length(notes) <= 2000),
     reviewed_at timestamptz not null default now(),
     unique (submission_id),  -- bir submission için max 1 reconciliation
     -- bank_reference_normalized unique kapsamı: (bank_reference_normalized, order_id) partial unique
     -- için ayrı index (aşağıda)
     constraint payment_reconciliations_consistent check (
       (decision = 'accepted' and bank_reference_normalized is not null)
       or (decision = 'rejected' and notes is not null)
     )
   );
   create index payment_reconciliations_order_id_idx on public.payment_reconciliations (order_id);
   create unique index payment_reconciliations_bank_ref_order_idx
     on public.payment_reconciliations (bank_reference_normalized, order_id)
     where decision = 'accepted';
   alter table public.payment_reconciliations enable row level security;
   alter table public.payment_reconciliations force row level security;
   revoke all on public.payment_reconciliations from anon, authenticated;
   -- Sadece RPC ile erişim (admin_reconcile_payment)
   ```

5. **`credit_accounts`** — Şirket kredi bakiye görünümü
   ```sql
   create table public.credit_accounts (
     company_id uuid primary key references public.companies (id) on delete cascade,
     available_balance integer not null default 0 check (available_balance >= 0),
     updated_at timestamptz not null default now()
   );
   create trigger credit_accounts_set_updated_at before update on public.credit_accounts
     for each row execute function public.set_updated_at();
   alter table public.credit_accounts enable row level security;
   alter table public.credit_accounts force row level security;
   revoke all on public.credit_accounts from anon, authenticated;
   grant select on public.credit_accounts to authenticated;
   ```

6. **`credit_ledger_entries`** — Append-only hareket defteri
   ```sql
   create type public.credit_entry_type as enum (
     'purchase_grant', 'job_consume', 'job_refund',
     'manual_adjustment', 'expiry', 'reversal'
   );

   create table public.credit_ledger_entries (
     id uuid primary key default gen_random_uuid(),
     company_id uuid not null references public.companies (id) on delete restrict,
     order_id uuid references public.orders (id) on delete set null,
     job_id uuid references public.jobs (id) on delete set null,
     entry_type public.credit_entry_type not null,
     quantity_delta integer not null check (quantity_delta <> 0),
     idempotency_key text not null unique check (char_length(idempotency_key) between 1 and 128),
     actor_id uuid not null references auth.users (id) on delete restrict,
     reason text not null check (char_length(reason) between 1 and 500),
     created_at timestamptz not null default now()
   );
   create index credit_ledger_entries_company_created_idx on public.credit_ledger_entries (company_id, created_at desc);
   create index credit_ledger_entries_order_id_idx on public.credit_ledger_entries (order_id);
   create index credit_ledger_entries_job_id_idx on public.credit_ledger_entries (job_id);
   create index credit_ledger_entries_idempotency_key_idx on public.credit_ledger_entries (idempotency_key);
   alter table public.credit_ledger_entries enable row level security;
   alter table public.credit_ledger_entries force row level security;
   revoke all on public.credit_ledger_entries from anon, authenticated;
   -- Sadece RPC ile insert (append-only); select via get_company_credit_ledger
   ```

7. **`outbox_events`** — Event-driven bildirimler (transaction sonrası yayın)
   ```sql
   create table public.outbox_events (
     id uuid primary key default gen_random_uuid(),
     event_type text not null check (char_length(event_type) between 1 and 100),
     aggregate_id uuid not null,
     payload_minimal jsonb not null check (jsonb_typeof(payload_minimal) = 'object'),
     created_at timestamptz not null default now(),
     published_at timestamptz
   );
   create index outbox_events_unpublished_idx on public.outbox_events (created_at) where published_at is null;
   create index outbox_events_aggregate_idx on public.outbox_events (aggregate_id, created_at);
   alter table public.outbox_events enable row level security;
   alter table public.outbox_events force row level security;
   revoke all on public.outbox_events from anon, authenticated;
   grant select, insert, update on public.outbox_events to service_role;
   -- Sadece service_role; client erişimi yok
   ```

**RPC'ler (Billing & Credit):**

- `create_order(company_id, package_id, expires_at)` → `uuid` (authenticated, company owner/recruiter/billing)
- `submit_payment(order_id, sender_name, transfer_reference, amount_minor, currency, transferred_at, receipt_storage_path)` → `uuid` (authenticated, company member)
- `admin_reconcile_payment(order_id, submission_id, decision, bank_reference_normalized, notes)` → `void` (service_role or authenticated + AAL2 platform_admin)
- `admin_save_payment_instructions(beneficiary_name, bank_name, iban, currency, instructions, active_from, active_to)` → `uuid` (service_role or authenticated + AAL2 platform_admin)
- `get_company_credit_ledger(company_id, limit, offset)` → `SETOF credit_ledger_entries` (authenticated, company owner/recruiter/billing or platform_admin)
- `adjust_credit_balance(company_id, quantity_delta, entry_type, idempotency_key, reason)` → `void` (service_role or authenticated + AAL2 billing_admin)
- `publish_outbox_event(event_type, aggregate_id, payload_minimal)` → `uuid` (service_role)

**RLS Policy Matrisi (V4 §9.2):**

| Tablo | Anon | Aday | Şirket Owner/Recruiter/Billing | Platform Admin (AAL2) | Service Role |
|---|---|---|---|---|---|
| `orders` | ✗ | ✗ | SELECT own company | SELECT ALL | ALL |
| `payment_submissions` | ✗ | ✗ | INSERT own company, SELECT own | SELECT ALL | ALL |
| `payment_reconciliations` | ✗ | ✗ | ✗ | INSERT/UPDATE (review) | ALL |
| `payment_instruction_versions` | ✗ | ✗ | SELECT (active only) | INSERT/UPDATE | ALL |
| `credit_accounts` | ✗ | ✗ | SELECT own company | SELECT ALL | ALL |
| `credit_ledger_entries` | ✗ | ✗ | SELECT own company | SELECT ALL | INSERT (append-only) |
| `outbox_events` | ✗ | ✗ | ✗ | ✗ | ALL |

**Policy Implementasyonu:**

```sql
-- orders: company members read own
create policy orders_company_read on public.orders for select to authenticated
  using (public.is_active_company_member(company_id, array['owner','recruiter','billing']::public.company_role[]));

-- payment_submissions: company members insert/select own
create policy payment_submissions_company_insert on public.payment_submissions for insert to authenticated
  with check (exists (
    select 1 from public.orders o
    join public.company_members cm on cm.company_id = o.company_id
    where o.id = payment_submissions.order_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.membership_role in ('owner','recruiter','billing')
  ));
create policy payment_submissions_company_read on public.payment_submissions for select to authenticated
  using (exists (
    select 1 from public.orders o
    join public.company_members cm on cm.company_id = o.company_id
    where o.id = payment_submissions.order_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'active'
      and cm.membership_role in ('owner','recruiter','billing')
  ));

-- credit_accounts: company members read own
create policy credit_accounts_company_read on public.credit_accounts for select to authenticated
  using (public.is_active_company_member(company_id, array['owner','recruiter','billing']::public.company_role[]));

-- Admin RPC'ler için policy YOK; SECURITY DEFINER RPC auth.role()/has_platform_role guard ile
```

Her tablo için: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`, `revoke all from anon, authenticated`, FK leading column indeksler, `updated_at` trigger where applicable, `audit_logs` insert.

### 6.2 TypeScript Types Güncellemesi (`src/types/database.ts`)

**Değişiklikler:**

```typescript
// 1. profiles — avatar_url, given_name, family_name zaten var ✅

// 2. candidate_profiles — EKSİK SÜTUNLAR EKLE
candidate_profiles: Table<{
  // ... mevcut alanlar ...
  summary: string | null;
  cv_full_text: string | null;  // snake_case DB kolon adı
  links: Json;
  phone: string | null;
  job_type_preference: Json;
  workplace_mode_preference: Json;
  salary_expectation: Json | null;
  availability: string | null;
  // ...
}, {...}, {...}>;

// 3. jobs.created_by → nullable
jobs: Table<{
  // ...
  created_by: string | null;  // was: string
  // ...
}, {...}, {...}>;

// 4. Yeni tablolar — Core & Chat (Migrasyon 2)
resumes: Table<{
  id: string;
  candidate_id: string;
  storage_path: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  page_count: number | null;
  status: 'uploaded' | 'processing' | 'parsed' | 'failed' | 'deleted';
  retention_until: string;
  parsed_data: Json | null;
  created_at: string;
  updated_at: string;
}, {
  candidate_id: string;
  storage_path: string;
  original_filename: string;
  file_size_bytes: number;
  mime_type: string;
  page_count?: number | null;
  status?: 'uploaded' | 'processing' | 'parsed' | 'failed' | 'deleted';
  retention_until?: string;
  parsed_data?: Json | null;
  created_at?: never;
  updated_at?: never;
}, {
  status?: 'uploaded' | 'processing' | 'parsed' | 'failed' | 'deleted';
  retention_until?: string;
  parsed_data?: Json | null;
  id?: never;
  candidate_id?: never;
  created_at?: never;
  updated_at?: never;
}>;

resume_versions: Table<{
  id: string;
  resume_id: string;
  version: number;
  structured_data: Json;
  created_at: string;
}, {
  resume_id: string;
  version: number;
  structured_data: Json;
  created_at?: never;
}, never>;

saved_jobs: Table<{
  user_id: string;
  job_id: string;
  created_at: string;
}, {
  user_id: string;
  job_id: string;
  created_at?: never;
}, never>;

conversations: Table<{
  id: string;
  subject: string | null;
  status: 'active' | 'archived' | 'closed';
  created_at: string;
  updated_at: string;
}, {
  subject?: string | null;
  status?: 'active' | 'archived' | 'closed';
  created_at?: never;
  updated_at?: never;
}, {
  subject?: string | null;
  status?: 'active' | 'archived' | 'closed';
  id?: never;
  created_at?: never;
  updated_at?: never;
}>;

conversation_members: Table<{
  conversation_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  left_at: string | null;
}, {
  conversation_id: string;
  user_id: string;
  role?: 'owner' | 'member';
  joined_at?: never;
  left_at?: string | null;
}, never>;

messages: Table<{
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type: 'text' | 'system' | 'file';
  metadata: Json;
  created_at: string;
}, {
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type?: 'text' | 'system' | 'file';
  metadata?: Json;
  created_at?: never;
}, never>;

integration_sync_runs: Table<{
  id: string;
  integration: 'ministry_jobs' | 'ministry_companies' | 'external_api';
  status: 'running' | 'completed' | 'failed' | 'partial';
  started_at: string;
  finished_at: string | null;
  records_processed: number;
  records_succeeded: number;
  records_failed: number;
  error_summary: string | null;
  metadata: Json;
}, never, never>;

// 5. Yeni tablolar — Billing & Credit (Migrasyon 3)
orders: Table<{
  id: string;
  company_id: string;
  status: 'awaiting_transfer' | 'payment_submitted' | 'payment_under_review' | 'paid' | 'rejected' | 'expired' | 'cancelled' | 'refund_pending' | 'refunded';
  total_minor: number;
  currency: string;
  reference_code: string;
  package_snapshot: Json;
  payment_instructions_version_id: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}, {
  company_id: string;
  status?: 'awaiting_transfer' | 'payment_submitted' | 'payment_under_review' | 'paid' | 'rejected' | 'expired' | 'cancelled' | 'refund_pending' | 'refunded';
  total_minor: number;
  currency?: string;
  reference_code: string;
  package_snapshot: Json;
  payment_instructions_version_id: string;
  expires_at: string;
  created_at?: never;
  updated_at?: never;
}, never>;

payment_submissions: Table<{
  id: string;
  order_id: string;
  submitted_by: string;
  sender_name: string;
  transfer_reference: string;
  amount_minor: number;
  currency: string;
  transferred_at: string;
  receipt_storage_path: string | null;
  status: 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'needs_more_information';
  created_at: string;
  updated_at: string;
}, {
  order_id: string;
  submitted_by: string;
  sender_name: string;
  transfer_reference: string;
  amount_minor: number;
  currency?: string;
  transferred_at: string;
  receipt_storage_path?: string | null;
  status?: 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'needs_more_information';
  created_at?: never;
  updated_at?: never;
}, never>;

payment_reconciliations: Table<{
  id: string;
  order_id: string;
  submission_id: string;
  reviewed_by: string;
  decision: 'accepted' | 'rejected';
  bank_reference_normalized: string;
  notes: string | null;
  reviewed_at: string;
}, never, never>;

payment_instruction_versions: Table<{
  id: string;
  beneficiary_name: string;
  bank_name: string;
  iban_restricted_value: string;
  currency: string;
  instructions: string | null;
  active_from: string;
  active_to: string | null;
  created_by: string;
  created_at: string;
}, {
  beneficiary_name: string;
  bank_name: string;
  iban_restricted_value: string;
  currency?: string;
  instructions?: string | null;
  active_from?: string;
  active_to?: string | null;
  created_by: string;
  created_at?: never;
}, never>;

credit_accounts: Table<{
  company_id: string;
  available_balance: number;
  updated_at: string;
}, never, {
  available_balance?: number;
  updated_at?: string;
  company_id?: never;
}>;

credit_ledger_entries: Table<{
  id: string;
  company_id: string;
  order_id: string | null;
  job_id: string | null;
  entry_type: 'purchase_grant' | 'job_consume' | 'job_refund' | 'manual_adjustment' | 'expiry' | 'reversal';
  quantity_delta: number;
  idempotency_key: string;
  actor_id: string;
  reason: string;
  created_at: string;
}, {
  company_id: string;
  order_id?: string | null;
  job_id?: string | null;
  entry_type: 'purchase_grant' | 'job_consume' | 'job_refund' | 'manual_adjustment' | 'expiry' | 'reversal';
  quantity_delta: number;
  idempotency_key: string;
  actor_id: string;
  reason: string;
  created_at?: never;
}, never>;

outbox_events: Table<{
  id: string;
  event_type: string;
  aggregate_id: string;
  payload_minimal: Json;
  created_at: string;
  published_at: string | null;
}, never, never>;

// 6. Yeni Enum'lar (Enums section'a ekle)
export type OrderStatus = 'awaiting_transfer' | 'payment_submitted' | 'payment_under_review' | 'paid' | 'rejected' | 'expired' | 'cancelled' | 'refund_pending' | 'refunded';
export type PaymentSubmissionStatus = 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'needs_more_information';
export type ReconciliationDecision = 'accepted' | 'rejected';
export type CreditEntryType = 'purchase_grant' | 'job_consume' | 'job_refund' | 'manual_adjustment' | 'expiry' | 'reversal';
export type ResumeStatus = 'uploaded' | 'processing' | 'parsed' | 'failed' | 'deleted';
export type ConversationStatus = 'active' | 'archived' | 'closed';
export type ConversationRole = 'owner' | 'member';
export type MessageType = 'text' | 'system' | 'file';
export type IntegrationType = 'ministry_jobs' | 'ministry_companies' | 'external_api';
export type IntegrationStatus = 'running' | 'completed' | 'failed' | 'partial';

// 7. Yeni RPC'ler (Functions section'a ekle)
// Core & Chat
create_resume: { Args: { candidate_id: string; storage_path: string; original_filename: string; file_size_bytes: number; mime_type: string; page_count?: number | null }; Returns: string };
update_resume_status: { Args: { resume_id: string; status: ResumeStatus; parsed_data?: Json | null }; Returns: undefined };
create_resume_version: { Args: { resume_id: string; structured_data: Json }; Returns: string };
start_conversation: { Args: { participant_ids: string[]; subject?: string | null }; Returns: string };
send_message: { Args: { conversation_id: string; body: string; message_type?: MessageType; metadata?: Json }; Returns: string };
archive_conversation: { Args: { conversation_id: string }; Returns: undefined };
log_integration_sync: { Args: { integration: IntegrationType; status: IntegrationStatus; records_processed: number; records_succeeded: number; records_failed: number; error_summary?: string | null; metadata?: Json }; Returns: string };

// Billing & Credit
create_order: { Args: { company_id: string; package_id: string; expires_at: string }; Returns: string };
submit_payment: { Args: { order_id: string; sender_name: string; transfer_reference: string; amount_minor: number; currency?: string; transferred_at: string; receipt_storage_path?: string | null }; Returns: string };
admin_reconcile_payment: { Args: { order_id: string; submission_id: string; decision: ReconciliationDecision; bank_reference_normalized: string; notes?: string | null }; Returns: undefined };
admin_save_payment_instructions: { Args: { beneficiary_name: string; bank_name: string; iban_restricted_value: string; currency?: string; instructions?: string | null; active_from?: string; active_to?: string | null }; Returns: string };
get_company_credit_ledger: { Args: { company_id: string; limit?: number; offset?: number }; Returns: { id: string; company_id: string; order_id: string | null; job_id: string | null; entry_type: CreditEntryType; quantity_delta: number; idempotency_key: string; actor_id: string; reason: string; created_at: string }[] };
adjust_credit_balance: { Args: { company_id: string; quantity_delta: number; entry_type: CreditEntryType; idempotency_key: string; reason: string }; Returns: undefined };
publish_outbox_event: { Args: { event_type: string; aggregate_id: string; payload_minimal: Json }; Returns: string };
```

**Not:** `cv_full_text`, `links` kolonları snake_case DB'de; TypeScript camelCase (`cvFullText`, `links`) kullanır. `Database["public"]["Tables"]["candidate_profiles"]["Row"]` snake_case olmalı (PostgREST döndürür), DAL'de camelCase'e map edilir.

### 6.3 pgTAP Test Dosyaları (Yeni/Ek)

| Test Dosyası | Kapsam | Kritik Test Senaryoları |
|---|---|---|
| `supabase/tests/database/schema_hardening.test.sql` | FORCE RLS tüm tablolar, KKTC district check, FK index notification_email_outbox | 1) Her tablo için `FORCE ROW LEVEL SECURITY` aktif 2) İlçe verisi temizliği sonrası iki municipality CHECK'i 3) `notification_email_outbox.notification_id` FK leading index exists 4) `candidate_profiles` için eksik 8 kolon mevcut |
| `supabase/tests/database/candidate_profiles_complete.test.sql` | Aday profili eksik 8 kolon; Zod ile uyum; RLS | 1) Sekiz alanın kolon/tip/nullability sözleşmesi Zod ile uyumlu 2) `links` JSONB CHECK validator (label,url, max 12, max 600) 3) Adayın kendi alanlarında INSERT/UPDATE/SELECT, başka aday erişimi reddedilir 4) `visibility` column UPDATE denied |
| `supabase/tests/database/table_privileges.test.sql` | Mevcut tablo ayrıcalıkları ratcheti | Eklenen tabloların allowlist/privilege beklentilerini migration'daki minimum grant'lerle güncelle; anon ve authenticated için yetkisiz erişimlerin reddedildiğini koru |
| `supabase/tests/database/function_privileges.test.sql` | Mevcut fonksiyon ayrıcalıkları ratcheti | Yeni RPC'leri tam imzalarıyla beklenen rol allowlist'ine ekle; gereksiz `anon`/`authenticated` EXECUTE grant'i ekleme |
| `supabase/tests/database/jobs_created_by_nullable.test.sql` | created_by NULL kabul, RI check | 1) `source_site` ilan `created_by` NULL insert succeeds 2) `platform` ilan `created_by` NOT NULL required 3) FK RI check on delete restrict works with NULL |
| `supabase/tests/database/resumes_rls.test.sql` | resumes, resume_versions — owner read/write, anon denied, cross-candidate denied | 1) Candidate owns resume CRUD 2) Anon denied all 3) Cross-candidate denied 4) `resume_versions` read via resume ownership 5) `storage_path` unique constraint 6) `retention_until` default 90 days |
| `supabase/tests/database/saved_jobs_rls.test.sql` | saved_jobs — candidate CRUD, unique constraint, cross-user denied | 1) Candidate save/unsave job 2) Unique (user_id,job_id) enforced 3) Cross-user denied 4) Anon denied |
| `supabase/tests/database/conversations_rls.test.sql` | conversations, conversation_members, messages — membership validation, sender check | 1) Member reads own conversations 2) Member sends message only in own conversation 3) Sender must be member 4) Cross-conversation denied 5) Anon denied all |
| `supabase/tests/database/integration_sync_runs_rls.test.sql` | integration_sync_runs — service_role only | 1) Service_role CRUD 2) Anon/authenticated denied all 3) Status enum enforced |
| `supabase/tests/database/billing_rls.test.sql` | orders, payment_submissions, payment_reconciliations, payment_instruction_versions — matris testleri | 1) Company owner/recruiter/billing: orders SELECT own, payment_submissions INSERT/SELECT own 2) Platform admin AAL2: all tables SELECT/UPDATE 3) Anon/candidate denied all 4) `payment_reconciliations` bank_reference_normalized unique (accepted) 5) `orders.reference_code` unique 6) Status transitions valid |
| `supabase/tests/database/credit_ledger_rls.test.sql` | credit_accounts, credit_ledger_entries — append-only, idempotency_key unique, company isolation | 1) Company owner/recruiter/billing: credit_accounts SELECT, credit_ledger_entries SELECT 2) Platform admin: SELECT all 3) Append-only: UPDATE/DELETE denied for all roles 4) `idempotency_key` unique enforced 5) `quantity_delta` ≠ 0 enforced 6) Cross-company denied 7) Service_role can insert ledger |
| `supabase/tests/database/outbox_events_rls.test.sql` | outbox_events — service_role only | 1) Service_role CRUD 2) Anon/authenticated denied all 3) `published_at` nullable, `created_at` default now |
| `supabase/tests/database/notification_email_outbox_fk_index.test.sql` | notification_email_outbox.notification_id FK index | 1) Dedicated index exists (leading column notification_id) 2) RI check on delete restrict uses index (EXPLAIN) |

**Mevcut testlerin korunması:** 23 mevcut test dosyası bozulmamalı. Yeni tablolar ve RPC'ler eklendiğinde `table_privileges.test.sql` ve `function_privileges.test.sql` ratchet'leri de aynı değişiklikte güncellenmeli; ratchet testler (`function_privileges`, `table_privileges`, `unindexed_foreign_keys`, `constraint_hygiene`) **hala geçmeli**.

**Toplam tahmini assertion:** Mevcut ~171 + Yeni ~280 = ~451 assertion

### 6.4 Doğrulama Komutları (Sıralı)

```bash
# Her migrasyon sonrası:
bun run lint
bun run typecheck
bun run check:frontend-source
bun run test:unit
bun run test:security
bun run test:integration

# Migrasyon 1 sonrası (schema hardening):
bun run db:start
bun run test:db   # schema_hardening, candidate_profiles_complete, jobs_created_by_nullable, notification_email_outbox_fk_index testleri

# Migrasyon 2 sonrası (core & chat):
bun run test:db   # resumes_rls, saved_jobs_rls, conversations_rls, integration_sync_runs_rls testleri

# Migrasyon 3 sonrası (billing & credit):
bun run test:db   # billing_rls, credit_ledger_rls, outbox_events_rls testleri

# Full CI pipeline (PR öncesi):
bun run build
bun run test:e2e  # 4 shard
```

**Kabul Kriterleri:**
- Tüm `bun run typecheck` → 0 hata
- Tüm pgTAP testleri (`bun run test:db`) → **PASS** (mevcut 23 + yeni 10 = 33 test dosyası, ~451 assertion)
- `bun run test:security` → 0 hata (sql-hardening ratchet'ler geçmeli)
- `bun run lint` → 0 hata
- `bun run test:e2e` → 4 shard PASS

### 6.5 Açık Kararlar / Onay Bekleyenler

| # | Konu | Seçenekler | Öneri | Gerekçe |
|---|---|---|---|---|
| 1 | `candidate_profiles.links` JSONB CHECK — `is_valid_candidate_profile_section` mı, ayrı `is_valid_candidate_links` mı? | A) Mevcut fonksiyonu reuse et (label,url, 12, 600) B) Yeni validator | **A** | DRY, mevcut fonksiyon yeterli; `array['label','url'], 12, 600` parametreleriyle uygun |
| 2 | `jobs.created_by` nullable — TypeScript `string \| null` breaking change mi? | A) Evet, DAL'de `created_by` handle edilerek B) Migration'da `NOT NULL` geri getir (ama `source_site` ilanlar için NULL gerekiyor) | **A** | V4 `source_site` ilanlar `created_by` NULL; tip düzeltmesi şart; DAL zaten `created_by` set etmiyor (server default) |
| 3 | V4 eksik 14 tablo — tek migrasyon mu, 3-4'e bölünsün mü? | A) Tek dosya (atomic) B) Bağımlılık sırasına göre 3 dosya | **B** | Review/debug kolaylığı; `20261125000000` (hardening+profil), `20261125010000` (core+chat), `20261125020000` (billing+credit+outbox/integration). Aynı migrasyonda `payment_instruction_versions`, `orders` tablosundan önce oluşturulur. |
| 4 | `notification_email_outbox.notification_id` FK index — unique constraint da eklensin mi? | A) Sadece index B) Unique index (bir notification → max 1 outbox row) | **B** | Migration `20261022130000` L111 `unique (notification_id)` zaten var ✅ Index yeterli |
| 5 | Docker Supabase yerel başlatılamazsa? | CI'da Ubuntu runner'da çalışır; yerel "infrastructure unavailable" raporlanır, skip edilmez | **CI sonucu beklenir** | AGENTS.md: "Docker ve geçerli gerçek Supabase test sonuçları olmadan bu kapı geçmiş sayılmaz" |
| 6 | `resumes.mime_type` — sadece `application/pdf` mı, `docx` da eklensin mi? | A) Sadece PDF (MVP) B) PDF + DOCX | **A** | V4 §6.2 "CV dosyası" — PDF yeterli; DOCX sonraki aşama |
| 7 | `credit_ledger_entries.entry_type` enum — `reversal` mı `reversal` + `adjustment` ayrı mı? | A) `manual_adjustment` + `reversal` iki ayrı enum B) Tek `adjustment` enum, pozitif/negatif `quantity_delta` ile | **A** | V4 §8.1 açıkça `manual_adjustment` ve `reversal` ayırıyor; audit trail için semantik ayrım önemli |
| 8 | `outbox_events.payload_minimal` — hangi event type'lar için şema zorunlu? | A) Her event type için JSON schema CHECK B) Sadece `jsonb_typeof = 'object'` | **B** | MVP için yeterli; şema validation application layer'da (DAL/RPC) |
| 9 | `payment_reconciliations.bank_reference_normalized` unique kapsamı — `(bank_reference_normalized, order_id)` mi, global unique mu? | A) Global unique B) Composite unique per order | **A (Composite per order)** | V4 §6.4: "banka referansları küresel olarak benzersiz olmayabilir; kapsam (banka/hesap/tarih/tutar) iş politikasıyla" — composite unique `(bank_reference_normalized, order_id) WHERE decision='accepted'` en uygun |

### 6.6 Riskler ve Mitigasyon

| Risk | Etki | Olasılık | Mitigasyon |
|---|---|---|---|
| `jobs.created_by` nullable → TypeScript break | DAL/runtime hatası | Yüksek | `types/database.ts` güncellenmeli; DAL'de `created_by` nullable handle (zaten server default) |
| `candidate_profiles` eksik kolonlar → Zod validation hata | Form submit 500 / `column does not exist` | Yüksek | Migrasyon 1'de sekiz alan tamamlanmalı; beş yeni alanın SQL sözleşmesi Zod ile eşleştirilmeli ve migration doğrulanana kadar forma bağlanmamalı |
| Billing/credit tabloları çok büyük migrasyon → Review zor | Merge conflict, hata | Orta | 3 migrasyona bölünmüş; her biri bağımsız test edilebilir |
| pgTAP testleri Docker'sız çalışmaz | CI passing, local fail | Yüksek | CI'da Ubuntu runner zorunlu; local "unavailable" raporlanır |
| `FORCE RLS` → superuser/admin lockout | Migration runner fail | Düşük | Migration `SECURITY DEFINER` RPC içinde çalışır; owner işlemleri RPC ile yapılır |

---

## 7. UYGULAMA SIRASI ÖZETİ

| Aşama | Migrasyon | Açıklama | Doğrulama |
|---|---|---|---|
| 1 | `20261125000000_v4_schema_hardening_and_missing_columns.sql` | FORCE RLS, güvenli ilçe temizliği ve CHECK'ler, candidate_profiles eksik 8 kolon, FK index | `bun run typecheck`, `bun run test:db` (schema hardening ve candidate profile testleri) |
| 2 | `20261125010000_v4_missing_v4_tables.sql` | Core & Chat: resumes, resume_versions, saved_jobs, conversations, conversation_members, messages, integration_sync_runs | `bun run typecheck`, `bun run test:db` (RLS + privilege ratchet testleri), `bun run test:unit` (Zod/DAL) |
| 3 | `20261125020000_v4_billing_credit_tables.sql` | Billing, Credit, Outbox: payment_instruction_versions → orders → payment_submissions → payment_reconciliations, credit_accounts, credit_ledger_entries, outbox_events | `bun run typecheck`, `bun run test:db` (billing/credit RLS + privilege ratchet testleri), `bun run test:integration` |
| 4 | `src/types/database.ts` güncelleme | Tüm yeni tablolar, enum'lar, RPC'ler | `bun run typecheck` (0 hata) |
| 5 | Zod şema güncellemeleri | `resumes`, `saved_jobs`, `conversations`, `messages`, `orders`, `payment_*`, `credit_*` | `bun run check:frontend-source`, `bun run test:unit` |
| 6 | DAL güncellemeleri | Yeni RPC wrapper'ları, query helpers | `bun run test:unit`, `bun run test:integration` |
| 7 | Full CI pipeline | Lint → TypeCheck → Unit → Security → Integration → Build → E2E → DB Test | Tüm adımlar PASS |

---

## EK: DOSYA KONUM ÖZETİ

| Kategori | Dosya Yolları |
|---|---|
| Mevcut Migrasyonlar | `supabase/migrations/*.sql` (50+ dosya) |
| pgTAP Testler | `supabase/tests/database/*.test.sql` (23 dosya) |
| Zod Şemaları | `src/features/candidates/schemas.ts`, `src/features/companies/schemas.ts`, `src/features/jobs/schemas.ts` |
| TypeScript Tipleri | `src/types/database.ts` (976 satır) |
| DAL (Server Actions) | `src/server/dal/jobs.ts`, `src/server/dal/user.ts`, `src/server/dal/companies.ts` |
| Plan Dosyası | `.kilo/plans/1795543900311-supabase-database-micro-audit-plan.md` |

---

## SONRAKİ ADIM

Bu plan onaylandığında, uygulama oturumunda **Migrasyon 1** (`20261125000000_v4_schema_hardening_and_missing_columns.sql`) yazılmaya başlanacak. Her migrasyon uygulandıktan sonra `bun run typecheck` ve gerçek yerel Supabase üzerinde `bun run test:db` ile doğrulanacak.