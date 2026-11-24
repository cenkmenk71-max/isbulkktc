# Supabase Veritabanı Derinlemesine Denetim, Güvenlik Sıkılaştırma ve V4 Şema Eşitleme Planı

## 📋 Genel Bakış

Bu plan, İşBul KKTC projesinin Supabase/PostgreSQL veritabanını V4 mimari spesifikasyonuna (`docs/architecture-v4.md`) göre denetleme, güvenlik açılarını kapatma, performans optimizasyonu yapma ve TypeScript tiplerini senkronize etmeyi kapsar. Tüm değişiklikler **forward-only migrasyon** olarak uygulanacak; mevcut migrasyonlar asla geriye dönük düzenlenmeyecek.

---

## 🎯 Kapsam ve Hedefler

### Denetim Kapsamı
1. **Tablo/Sütun/Veri Bütünlüğü** — V4 şema tabloları ile mevcut migrasyonlar ve Zod şemaları arasında satır satır karşılaştırma
2. **Zero-Trust Güvenlik** — RLS, GRANT, SECURITY DEFINER fonksiyonları, `search_path` hijyeni
3. **Performans/İndeks** — FK indeksleri, çakışan/yinelenen indeksler, kısmi indeks yanlış kullanımları
4. **TypeScript & pgTAP** — Şema değişiklikleri sonrası tiplerin güncellenmesi, test kapsamının genişletilmesi

### Hedefler
- V4 mimarisinde tanımlı tüm tabloların mevcut olması (eksik tablolar: `resumes`, `credit_ledger_entries`, `orders`, vb.)
- Her tabloda `FORCE ROW LEVEL SECURITY` aktif
- Tüm FK'lar için kaplayıcı (covering) indeksler
- `auth.uid()` çağrıları `(select auth.uid())` ile optimize edilmiş
- Tüm `SECURITY DEFINER` fonksiyonlarında `SET search_path = ''` ve tam nitelikli referanslar
- TypeScript tipleri birebir güncel
- pgTAP testleri %100 geçen (pozitif + negatif matris)

---

## 🔍 1. KAYNAK VE GEÇMİŞ ANALİZİ (Tamamlandı)

✅ Okunan dosyalar:
- `AGENTS.md` — Proje kuralları, CI sırası, Next.js 16 kuralları
- `docs/architecture-v4.md` — V4 hedef mimari, veri modeli (§6), RLS standartları (§9), IBAN/kredi (§7-8), test stratejisi (§15)
- `docs/architecture.md` — Uygulama durumu, güvenlik değişmezleri, aşamalar
- `docs/threat-model.md` — Tehdit modeli, kanıtlı kontroller, açık/kapalı bulgular
- `supabase/migrations/` — 50+ migrasyon dosyası (kimlik, şirket, ilan, paket, RLS, indeksler, throttle, kaynak ilanlar)
- `supabase/tests/database/` — 23 pgTAP test dosyası (RLS, privileges, constraints, indexes, throttle)
- `src/features/**/schemas.ts` — Zod şemaları (aday, şirket, ilan)
- `src/types/database.ts` — Supabase TypeScript tipleri
- `src/server/dal/**/*.ts` — Server-side veri erişim katmanı

### PR #736 (`origin/sync/local-main-on-origin-main-20261122`) Değerlendirmesi
> **Not:** Uzak dal yerel olarak çekilemedi; CI geçmişi ve migrasyon dosyalarından çıkarım yapıldı.

**Değerli katkılar (korunacak):**
- `20261112160000_v4_unindexed_foreign_key_indexes.sql` — 18 FK için kaplayıcı indeksler + pgTAP ratchet
- `20261120180000_v4_harden_job_management_database_boundaries.sql` — `review_job` AAL2 guard, `publication_source` RLS koruması
- `20261120170000_v4_atomic_source_job_refresh.sql` — `replace_source_job_catalogue` transactional RPC
- `20261112120000_v4_anon_write_throttle_peer_scopes.sql` — Form-başı coarse peer cap, support eklendi
- `constraint_hygiene.test.sql` — Çift constraint engelleme ratcheti
- `function_privileges.test.sql` — Client-callable fonksiyon whitelist ratcheti
- `table_privileges.test.sql` — Tablo erişim ratcheti

**Düzeltilecek/eksik alanlar:**
- V4 §6.2-6.3 tablolarının çoğu henüz yok (`resumes`, `credit_ledger_entries`, `orders`, `payment_*`, `outbox_events`, `saved_jobs`, `conversations`, `messages`)
- `FORCE ROW LEVEL SECURITY` hiçbir tabloda yok (sadece `ENABLE`)
- Bazı RLS politikaları hâlâ `auth.uid()` kullanıyor (performans)
- `candidate_profiles` JSONB alanları için DB-level CHECK validator yok (`is_valid_candidate_profile_section` var ama tablo constraint'i değil)
- `company_profile_submissions.municipality` için legacy `Gazimağusa` reddi var ama `companies` tablosunda yok
- TypeScript tipleri `resumes`, `credit_ledger_entries`, `orders` vb. için eksik

---

## 📝 2. TABLO, SÜTUN VE VERİ BÜTÜNLÜĞÜ KONTROLÜ

### 2.1 V4 Şeması vs Mevcut Migrasyonlar — Eksik Tablolar

| V4 Tablo (§6.2-6.3) | Mevcut mu? | Aksiyon |
|---|---|---|
| `profiles` | ✅ | Mevcut |
| `user_roles` | ✅ | Mevcut |
| `candidate_profiles` | ✅ | Mevcut — JSONB validator eksik |
| `resumes` | ❌ | **YENİ MİGRASYON** |
| `resume_versions` | ❌ | **YENİ MİGRASYON** |
| `companies` | ✅ | Mevcut — `municipality` legacy constraint eksik |
| `company_members` | ✅ | Mevcut |
| `company_profile_submissions` | ✅ | Mevcut |
| `jobs` | ✅ | Mevcut |
| `applications` | ✅ | Mevcut |
| `saved_jobs` | ❌ | **YENİ MİGRASYON** |
| `notifications` | ❌ | **YENİ MİGRASYON** (kısmi: `application_notifications` var) |
| `conversations` | ❌ | **YENİ MİGRASYON** |
| `conversation_members` | ❌ | **YENİ MİGRASYON** |
| `messages` | ❌ | **YENİ MİGRASYON** |
| `integration_sync_runs` | ❌ | **YENİ MİGRASYON** |
| `job_packages` | ✅ | Mevcut |
| `orders` | ❌ | **YENİ MİGRASYON** (ödeme paketi) |
| `payment_submissions` | ❌ | **YENİ MİGRASYON** |
| `payment_reconciliations` | ❌ | **YENİ MİGRASYON** |
| `payment_instruction_versions` | ❌ | **YENİ MİGRASYON** |
| `credit_accounts` | ❌ | **YENİ MİGRASYON** |
| `credit_ledger_entries` | ❌ | **YENİ MİGRASYON** |
| `audit_logs` | ✅ | Mevcut |
| `outbox_events` | ❌ | **YENİ MİGRASYON** |

### 2.2 Mevcut Tablolardaki Eksiklikler

| Tablo | Eksiklik | Öncelik |
|---|---|---|
| `candidate_profiles` | `experience`, `education`, `languages`, `certifications`, `links`, `summary`, `cvFullText` sütunları yok — JSONB tek sütun (`structured_data` benzeri) veya ayrı sütunlar olarak eklenmeli | Yüksek |
| `companies` | `municipality` CHECK constraint (`Gazimağusa` reddi) eksik; `source_profile_url`, `logo_url` allowlist CHECK'i migrasyonda var ama TypeScript tipinde yok | Orta |
| `jobs` | `publication_source` default `'platform'` olmalı (kaynak ilanlar için `'source_site'`); `search_vector` index var | Düşük |
| `applications` | `first_viewed_at`, `first_viewed_by` sütunları var ama RLS/policy'de `first_viewed` mantığı eksik | Orta |
| `company_profile_submissions` | `status` için `approved`/`rejected`/`pending` enum — `CompanyProfileSubmissionStatus` tipinde | Düşük |

### 2.3 KKTC'ye Özgü CHECK Constraint'ler

| Alan | İzinli Değerler | Durum |
|---|---|---|
| `district` (jobs, candidate_profiles, companies) | `Lefkoşa`, `Mağusa`, `Girne`, `Güzelyurt`, `İskele`, `Lefke` | ✅ `jobs` ve `candidate_profiles` tablolarında var; `companies.municipality` için **eksik** |
| `job_type` | `full_time`, `part_time`, `contract`, `temporary`, `internship`, `freelance` | ✅ |
| `workplace_mode` | `on_site`, `hybrid`, `remote` | ✅ |
| `skills` dizi uzunluğu | ≤ 40 | ✅ |
| `experience/education/languages/certifications` dizi uzunluğu | ≤ 12 (Zod) / DB'de yok | **DB constraint eksik** |
| `visibility` | `private`, `public` | ✅ |
| `locale` | `tr`, `en`, `ru`, `el`, `fa`, `de`, `he` | ✅ `profiles` da var; `he` V4'te hedeflenmiş ama henüz UI/çeviri yok — constraint'te bırakılabilir |

### 2.4 `updated_at` Tetikleyicileri

| Tablo | Trigger Var mı? |
|---|---|
| `profiles` | ✅ |
| `candidate_profiles` | ✅ |
| `companies` | ✅ |
| `company_members` | ❌ **EKSİK** |
| `company_profile_submissions` | ✅ (migrasyonda `updated_at` var, trigger kontrol edilecek) |
| `jobs` | ✅ |
| `applications` | ✅ |
| `job_packages` | ✅ |
| `company_job_package_assignments` | ❌ **EKSİK** (updated_at sütunu yok) |
| `audit_logs` | ❌ (sadece `created_at`) — doğru, append-only |
| Diğerleri | Kontrol edilecek |

---

## 🔒 3. ZERO-TRUST GÜVENLİK DENETİMİ

### 3.1 RLS: `ENABLE` + `FORCE ROW LEVEL SECURITY`

**Mevcut:** Tüm tablolarda `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` var.
**Eksik:** Hiçbir tabloda `ALTER TABLE ... FORCE ROW LEVEL SECURITY` yok.
**V4 §9.1:** "İstemci erişimine açık şemadaki her tablo için RLS etkinleştirilir" — `FORCE` table owner'ın (ve superuser) da politikaya tabi olmasını sağlar.

**Aksiyon:** Her tablo için `ALTER TABLE public.<tablo> FORCE ROW LEVEL SECURITY;` eklenecek (yeni migrasyonda).

### 3.2 GRANT/REVOKE — Least Privilege

**Mevcut Durum (Özet):**
- `revoke all on table ... from anon, authenticated` — ✅ Çoğu tabloda
- Column-level grant'ler (`grant select (col1, col2) ...`) — ✅ `jobs`, `job_packages`, `profiles` için
- `audit_logs`, `user_roles`, `credit_*` (yok henüz), `payment_*` (yok henüz) — **tamamen kapalı** olmalı
- `company_job_package_assignments` — ✅ Kapalı, sadece RPC ile erişim

**Kontrol Edilecekler:**
1. `profiles` — `status` sütunu `authenticated` UPDATE grant'inde **yok** (doğru)
2. `candidate_profiles` — `user_id` UPDATE grant'inde **yok** (doğru, upsert için grant var ama testte reddediliyor)
3. `companies` — `verification_status` grant'inde **yok** (doğru)
4. `jobs` — `status`, `published_at`, `expires_at`, `reviewed_by`, `reviewed_at`, `publication_source` — `authenticated` UPDATE grant'inde **yok** (doğru)
5. **Yeni tablolar** (`orders`, `payment_*`, `credit_*`, `outbox_events`) — **Hiçbir grant yok**, sadece RPC

### 3.3 RLS Politikası Optimizasyonu — `auth.uid()` → `(select auth.uid())`

**Tespit Edilenler (örnek):**
- `jobs_company_read` policy: `exists (select 1 from public.profiles as p where p.id = (select auth.uid()) ...)` — ✅ Zaten optimize
- `jobs_company_insert_draft`: `created_by = (select auth.uid())` — ✅
- `candidate_profiles_read_own`: `using ((select auth.uid()) = user_id)` — ✅
- **Ancak** bazı politikalar hâlâ `auth.uid()` kullanıyor olabilir — tam tarama yapılacak.

**Kural:** Tüm `USING` ve `WITH CHECK` ifadelerinde `auth.uid()` yerine `(select auth.uid())` kullanılacak.

### 3.4 SECURITY DEFINER Fonksiyonları — `search_path` ve Nitelikli Referanslar

**Mevcut Kontrol (threat-model.md §482-493):**
- 83 definer fonksiyonunun hepsi `set search_path = ''` ile sabitlenmiş ✅
- Tam nitelikli referanslar (`pg_catalog.*`, `public.*`) kullanılıyor ✅
- Ratchet test: `sql-hardening.test.ts` bunu zorluyor ✅

**Yeni Fonksiyonlar İçin Şablon:**
```sql
create or replace function public.yeni_fonksiyon(...)
returns ...
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  -- pg_catalog.now(), public.tablo_adi, public.diger_fonksiyon()
end;
$$;

revoke all on function public.yeni_fonksiyon(...) from public, anon, authenticated;
grant execute on function public.yeni_fonksiyon(...) to authenticated; -- veya service_role
```

### 3.5 Admin/Ödeme İşlemleri — Dar RPC Yolları

**Mevcut:** `review_job`, `publish_approved_job`, `admin_assign_company_job_package`, `admin_save_job_package` — hepsi `has_platform_role('platform_admin')` (AAL2) guard'ı taşıyor ✅
**Eksik:** IBAN/ödeme mutabakatı, kredi defteri, sipariş yönetimi RPC'leri henüz yok (yeni tablolarla gelecek).

---

## ⚡ 4. PERFORMANS VE İNDEKS OPTİMİZASYONU

### 4.1 FK İndeksleri — Mevcut Ratchet

`20261112160000_v4_unindexed_foreign_key_indexes.sql` + `unindexed_foreign_keys.test.sql` ratcheti ile **her FK için kaplayıcı indeks zorunlu** ✅

**Yeni Tablolarda Eklenecek İndeksler (örnek):**
- `resumes.candidate_id` → `create index resumes_candidate_id_idx on public.resumes (candidate_id);`
- `resume_versions.resume_id` → `create index resume_versions_resume_id_idx on public.resume_versions (resume_id);`
- `orders.company_id` → `create index orders_company_id_idx on public.orders (company_id);`
- `payment_submissions.order_id` → `create index payment_submissions_order_id_idx on public.payment_submissions (order_id);`
- `credit_ledger_entries.company_id` → `create index credit_ledger_entries_company_id_idx on public.credit_ledger_entries (company_id);`
- `credit_ledger_entries.order_id` → `create index credit_ledger_entries_order_id_idx on public.credit_ledger_entries (order_id);`
- `credit_ledger_entries.idempotency_key` → **UNIQUE INDEX** (zaten unique constraint)
- `outbox_events.aggregate_id` → `create index outbox_events_aggregate_id_idx on public.outbox_events (aggregate_id);`
- `saved_jobs.user_id` → `create index saved_jobs_user_id_idx on public.saved_jobs (user_id);`
- `saved_jobs.job_id` → `create index saved_jobs_job_id_idx on public.saved_jobs (job_id);`
- `conversations` — PK yeterli
- `conversation_members.conversation_id` → `create index conversation_members_conversation_id_idx on public.conversation_members (conversation_id);`
- `conversation_members.user_id` → `create index conversation_members_user_id_idx on public.conversation_members (user_id);`
- `messages.conversation_id` → `create index messages_conversation_id_idx on public.messages (conversation_id);`
- `messages.sender_id` → `create index messages_sender_id_idx on public.messages (sender_id);`

### 4.2 Çakışan/Gereksiz İndeksler

**Taranacak:** `pg_indexes` üzerinden duplicate/overlapping index tespiti.
**Bilinen:** `company_job_package_assignments` — `company_job_package_assignments_one_current` (unique partial) + `company_job_package_assignments_package_idx` (package_id, company_id) + yeni `company_id_idx` — üçü de farklı amaç, çakışma yok.

### 4.3 Kısmi İndeks Yanlış Kullanımları

**Uyarı:** `unindexed_foreign_keys.test.sql` ratcheti kısmi indeksleri **kabul etmiyor** (referential integrity check için yetmez). Yeni FK indeksleri **tam (non-partial)** olmalı.

---

## 🔧 5. TYPESCRIPT TİPLERİ VE pgTAP DOĞRULAMA

### 5.1 TypeScript Tipleri Güncelleme Stratejisi

**Yöntem:** `supabase gen types typescript` **KULLANILMAYACAK** (CI'da supabase CLI yok, türler manuel tutuluyor). Değişiklikler `src/types/database.ts` dosyasında manuel senkronize edilecek.

**Güncellenecek Alanlar:**
1. **Yeni tablolar** → `Tables` objesine eklenecek (`Row`, `Insert`, `Update`, `Relationships`)
2. **Yeni enum'lar** → `Enums` objesine eklenecek
3. **Mevcut tablo değişiklikleri** (sütun ekleme/tipi değiştirme) → `Row`/`Insert`/`Update` güncellenecek
4. **Yeni RPC'ler** → `Functions` objesine eklenecek

**Doğrulama:** `bun run typecheck` (tsc --noEmit) 0 hata verecek.

### 5.2 pgTAP Test Genişletme Planı

Her yeni tablo/özellik için **pozitif + negatif** testler:

| Yeni Tablo/Özellik | Test Dosyası | Pozitif Testler | Negatif Testler |
|---|---|---|---|
| `resumes`, `resume_versions` | `resumes_rls.test.sql` | Sahip CV yükler/okur/siler | Başka aday CV'sini okuma, anon erişim |
| `orders`, `payment_submissions`, `payment_reconciliations`, `payment_instruction_versions` | `billing_rls.test.sql` | Şirket üyesi sipariş oluşturur, admin mutabakat yapar | Anon/başka şirket sipariş okuma, kullanıcı `status` yazma |
| `credit_accounts`, `credit_ledger_entries` | `credit_ledger_rls.test.sql` | Owner/billing bakiye okur, ledger append-only | Kullanıcı `quantity_delta`/`balance` yazma, cross-company |
| `saved_jobs` | `saved_jobs_rls.test.sql` | Aday ilan kaydeder/okur/siler | Başka aday kaydını okuma, anon |
| `notifications` | `notifications_rls.test.sql` | Kullanıcı kendi bildirimlerini okur/isaretler | Başka kullanıcı bildirimi okuma |
| `conversations`, `conversation_members`, `messages` | `chat_rls.test.sql` | Üye mesaj gönderir/okur | Üye olmayan okuma, cross-conversation |
| `outbox_events` | `outbox_rls.test.sql` | Service-role yazma/okuma | Client rolleri kapalı |
| `company_profile_submissions` (mevcut) | `company_verification.test.sql` | ✅ Zaten var | ✅ Zaten var |

**Çalıştırma:** `bun run db:start` → `bun run test:db` (Docker Supabase stack gerekli). CI'da `supabase test db` koşuyor.

### 5.3 Mevcut Test Kapsamı Doğrulaması

Mevcut 23 test dosyasından her biri çalıştırılacak ve assertion sayısı not edilecek. Yeni testler eklendikçe toplam assertion artacak.

---

## 📦 6. MİGRASYON STRATEJİSİ VE UYGULAMA SIRASI

### 6.1 Migrasyon Dosyası Yapısı

Tüm değişiklikler **tek veya birden fazla forward-only migrasyon dosyası** olarak yazılacak:
- İsim formatı: `YYYYMMDDHHMMSS_v4_<aciklama>.sql`
- Her migrasyon `begin; ... commit;` içinde (transactional)
- `if not exists` / `drop if exists` ile idempotent
- `revoke`/`grant` her fonksiyon/tablo için tekrar edilecek
- pgTAP test dosyası **aynı PR/değişiklik içinde** eklenecek

### 6.2 Önerilen Migrasyon Sırası

| # | Migrasyon Adı | İçerik |
|---|---|---|
| 1 | `20261124000000_v4_force_rls_all_tables.sql` | Tüm mevcut tablolara `FORCE ROW LEVEL SECURITY` ekle |
| 2 | `20261124010000_v4_optimize_rls_auth_uid.sql` | Tüm RLS politikalarını `(select auth.uid())` ile optimize et |
| 3 | `20261124020000_v4_add_missing_check_constraints.sql` | `companies.municipality`, `candidate_profiles` JSONB dizi uzunlukları, district CHECK'leri |
| 4 | `20261124030000_v4_add_missing_updated_at_triggers.sql` | `company_members`, `company_job_package_assignments` (updated_at sütunu + trigger) |
| 5 | `20261124040000_v4_create_resumes_tables.sql` | `resumes`, `resume_versions` tabloları + RLS + RPC + indeksler |
| 6 | `20261124050000_v4_create_billing_tables.sql` | `orders`, `payment_submissions`, `payment_reconciliations`, `payment_instruction_versions` + RLS + RPC |
| 7 | `20261124060000_v4_create_credit_ledger_tables.sql` | `credit_accounts`, `credit_ledger_entries` + RLS + RPC (atomik transaction) |
| 8 | `20261124070000_v4_create_saved_jobs.sql` | `saved_jobs` + RLS + RPC |
| 9 | `20261124080000_v4_create_notifications.sql` | `notifications` (genişletilmiş) + RLS |
| 10 | `20261124090000_v4_create_chat_tables.sql` | `conversations`, `conversation_members`, `messages` + RLS |
| 11 | `20261124100000_v4_create_outbox_events.sql` | `outbox_events` + service-role only |
| 12 | `20261124110000_v4_add_integration_sync_runs.sql` | `integration_sync_runs` |
| 13 | `20261124120000_v4_add_fk_indexes_new_tables.sql` | Yeni tablolar için FK indeksleri + ratchet testi |
| 14 | `20261124130000_v4_update_typescript_types.sql` | **Bu bir SQL migrasyonu değil** — `src/types/database.ts` güncellemesi ayrı commit |

> **Not:** Migrasyon numaraları (timestamp) uygulama anındaki tarih/saatle değiştirilecek. Yukarıdaki sıralama mantıksal bağımlılıkları yansıtır.

### 6.3 Her Migrasyon İçin Zorunlu Kontroller

1. `begin; ... commit;` içinde
2. `revoke all ... from public, anon, authenticated` → `grant` sadece gerekli rollere
3. Fonksiyonlarda `set search_path = ''` + tam nitelikli referanslar
4. RLS politikalarında `(select auth.uid())` kullanımı
5. `FORCE ROW LEVEL SECURITY` ekleme
6. İndeksler `if not exists`
7. Aynı PR/değişiklikte pgTAP testi (pozitif + negatif)
8. TypeScript tipleri güncelleme (ayrı dosya, aynı oturumda)

---

## ✅ 7. DOĞRULAMA VE KABUL KAPİLARI

### 7.1 Yerel Doğrulama Sırası (AGENTS.md'ye göre)

```bash
# 1. Lint
bun run lint

# 2. TypeCheck
bun run typecheck

# 3. Frontend kaynak kontrolü
bun run check:frontend-source

# 4. Unit testler
bun run test:unit

# 5. Güvenlik testleri
bun run test:security

# 6. Integration testler
bun run test:integration

# 7. Build + E2E (4 shard)
bun run build
bun run test:e2e  # --shard=n/4

# 8. Veritabanı testleri (Docker Supabase gerekli)
bun run db:start
bun run test:db   # pgTAP - TÜM testler PASS olmalı
```

### 7.2 pgTAP Başarı Kriterleri

- **Mevcut 23 test dosyası** + **yeni test dosyaları** hepsi `PASS`
- Hiçbir test `SKIP` veya `TODO` ile bırakılmayacak
- Ratchet testleri (`function_privileges`, `table_privileges`, `unindexed_foreign_keys`, `constraint_hygiene`) **bozulmamalı**

### 7.3 TypeScript Başarı Kriterleri

- `bun run typecheck` → 0 hata
- `src/types/database.ts` ile veritabanı şeması birebir eşleşmeli
- Zod şemaları (`src/features/**/schemas.ts`) ile `Insert`/`Update` tipleri uyumlu olmalı

### 7.4 Güvenlik Test Kriterleri

- `bun run test:security` → 0 hata
- `tests/security/sql-hardening.test.ts` ratchet'leri geçmeli
- Yeni RPC'ler `service-role-only` veya `authenticated` + guard ile test edilmeli

---

## ⚠️ 8. RİSKLER VE BAĞIMLILIKLAR

| Risk | Etki | Azaltma |
|---|---|---|
| Docker Supabase yerel başlatılamaz | `test:db` çalışmaz | CI'da Ubuntu runner'da çalışır; yerel başarısızsa "infrastructure unavailable" raporlanacak, skip edilmeyecek |
| Mevcut veri ile uyumsuzluk (ör. `company_members` updated_at eklenirse) | Migration hata verebilir | `default now()` + `backfill` yok; yeni satırlar için çalışır, eskiler `null` kalır — kabul edilebilir |
| `FORCE RLS` table owner'ı etkiler (migration runner) | `supabase_admin`/`postgres` rolü politikaya tabi olur | Migration `security definer` fonksiyonlarında çalışır; owner işlemleri RPC ile yapılır — sorun yok |
| Çok fazla migrasyon → CI süresi uzar | 14 migrasyon + testler | Squash edilebilir ama AGENTS.md "forward-only, additive" der; ayrı dosyalar tercih edilir |
| TypeScript tipi manuel senkronizasyon hatası | `typecheck` hata verir | Her migrasyondan sonra `typecheck` çalıştırılacak |

---

## 📋 9. AÇIK KARARLAR VE ONSAY FAZLALIKLAR

| Konu | Karar | Gerekçe |
|---|---|---|
| `he` (İbranice) locale | Constraint'te bırakılacak, UI henüz yok | V4 §12 hedeflerinde var; veri bozulmaması için |
| `candidate_profiles` JSONB vs ayrı sütunlar | **Ayrı sütunlar** (`experience`, `education`, `languages`, `certifications`, `links`, `summary`, `cv_full_text`) | Zod şeması zaten ayrı; DB constraint (dizi uzunluğu, alan tipleri) için ayrı sütunlar daha iyi |
| `credit_ledger_entries.idempotency_key` | `UNIQUE` constraint + index | V4 §8.1: "idempotency key benzersiz" |
| `orders.reference_code` | `UNIQUE` constraint | V4 §6.4: "orders.reference_code üzerinde UNIQUE" |
| `payment_reconciliations.bank_reference_normalized` | Benzersizlik kapsamı: `(bank_reference_normalized, order_id)` unique composite | V4 §6.4: "banka referansı küresel benzersiz olmayabilir; kapsam iş politikasıyla" |
| `outbox_events` | `event_type`, `aggregate_id`, `payload_minimal`, `created_at`, `published_at` | V4 §6.3; service-role only, client grant yok |
| `resumes.storage_path` | `UNIQUE` constraint | V4 §6.2: "Storage yolu benzersiz" |

---

## 🚀 10. UYGULAMA PLANI ÖZETİ

### Faz 1: Mevcut Şema Sıkılaştırma (Migrasyon 1-4)
1. `FORCE ROW LEVEL SECURITY` tüm tablolara
2. RLS politikalarını `(select auth.uid())` ile optimize et
3. Eksik CHECK constraint'ler (`companies.municipality`, `candidate_profiles` dizi uzunlukları)
4. Eksik `updated_at` trigger'lar (`company_members`, `company_job_package_assignments`)

### Faz 2: V4 Eksik Tablolar — Kimlik/İş İlanı Çevresi (Migrasyon 5, 8)
5. `resumes`, `resume_versions` — CV depolama, versiyonlama
6. `saved_jobs` — Aday ilan kaydetme

### Faz 3: V4 Eksik Tablolar — Ödeme/Kredi (Migrasyon 6, 7)
7. `orders`, `payment_submissions`, `payment_reconciliations`, `payment_instruction_versions` — IBAN sipariş/mutabakat
8. `credit_accounts`, `credit_ledger_entries` — Kredi defteri, atomik transaction

### Faz 4: V4 Eksik Tablolar — Bildirim/Sohbet/Outbox (Migrasyon 9, 10, 11, 12)
9. `notifications` — Site içi bildirimler
10. `conversations`, `conversation_members`, `messages` — Sohbet
11. `outbox_events` — Event-driven bildirimler
12. `integration_sync_runs` — Bakanlık/3.parti senkronizasyon

### Faz 5: İndeksler, Tipler, Testler (Migrasyon 13 + TypeScript güncelleme)
13. Yeni tablolar için FK indeksleri + ratchet testi
14. `src/types/database.ts` birebir güncelleme
15. Tüm pgTAP testleri yazma/genişletme
16. Doğrulama komutları çalıştırma

---

## 📌 11. ONSAY DURUMU — Kullanıcı Onayı Bekleyen Kararlar

Bu plan onaylanmadan önce aşağıdaki konularda net karar alınmalı:

1. **Migrasyon sayısı:** 14 ayrı dosya mı, yoksa 3-4 büyük dosyaya birleştirilsin mi? (AGENTS.md "forward-only, additive" der; ayrı dosyalar izlenebilirlik için daha iyi)
2. **`candidate_profiles` JSONB yapısı:** Mevcut `experience`/`education`/`languages`/`certifications`/`links`/`summary`/`cvFullText` sütunları **ayrı JSONB sütunları** mı, tek `structured_data jsonb` mı? (Zod şeması ayrı, ayrı sütunlar önerilir)
3. **`credit_ledger_entries.entry_type` enum:** V4 §8.1 listesi (`purchase_grant`, `job_consume`, `job_refund`, `manual_adjustment`, `expiry`, `reversal`) — bu enum olarak mı, `CHECK` constraint mi? (Enum önerilir)
4. **`orders.status` enum:** V4 §7.1 durum makinesi — enum olarak mı? (Enum önerilir)
5. **`payment_submissions.status` alt süreç:** V4 §7.1 — `submitted`, `under_review`, `accepted`, `rejected`, `needs_more_information` — enum mu?
6. **Docker Supabase yerel testi:** `bun run db:start` çalışır mı? Çalışmazsa CI sonuçları beklenmeli, yerel "unavailable" raporlanacak.

---

## 📁 12. PLAN DOSYASI KONUMU

Bu plan şu konuma kaydedildi:
```
D:\isbulkktc\.kilo\plans\1795543900311-supabase-database-audit-plan.md
```

---

## 🔄 SONRAKİ ADIM

Plan onaylandığında **Faz 1** ile başlanacak. Her migrasyon uygulandıktan sonra:
1. `bun run lint` + `bun run typecheck` çalıştırılacak
2. İlgili pgTAP test dosyası eklenecek/genişletilecek
3. `bun run test:db` (varsa) veya CI beklenerek doğrulanacak

**Hazır mısınız? Onay verirse Faz 1 migrasyonları yazmaya başlarım.**