# Tam Otomatik Birleşik Aday Havuzu Mimari Planı

**Plan dosyası:** `.kilo/plans/1795703200979-talent-pool-architecture.md`

## Kapsam ve Sınırlar
Sadece tasarım. Hiçbir kaynak dosya değiştirilmez, oluşturulmaz veya silmez.

## Kararlar (çözüldü)

| Soru | Karar |
|------|-------|
| Eşleştirme nerede? | **Seçenek A:** `publish_approved_job` SECURITY DEFINER içinde eşleşme döngüsü; e-posta kuyruğu `job_match_email_outbox` üzerinden `service_role` worker |
| Site üyesı e-posta nasıl? | **Seçenek B:** `v_talent_pool` email yok; ayrı `SECURITY DEFINER` RPC `get_candidate_contact(_user_id)` — sadece aktif paketli + doğrulanmış işverenler email/phone görebilir |
| Eşanlamlı genişleme? | **Hayır:** MVP'de sadece `ILIKE '%kelime%'` doğrudan eşleşmesi |

## Mevcut Şema Kanıtı (Dosya:Satır)

| Öğe | Dosya:Satır | Not |
|-----|-------------|-----|
| `candidate_profiles` | `supabase/migrations/20261013000000_v4_identity_companies_security.sql:49-59` | `user_id`, `headline`, `location`, `skills`, `visibility`, `summary`, `links`, `phone`, `cv_full_text` |
| `candidate_profiles` RLS | same:260-271 | Sadece `read_own`/`insert_own`/`update_own`. **Gap:** public okuma politikası yok |
| `profiles` | same:26-39 | `id`, `display_name`, `locale`, `status` — **yok `email`** |
| `companies` | same:61-77 + `20261014120000_v4_company_profile_review.sql:44-70` | `verification_status`, `categories`, `phone`, `public_email`, `address`, `municipality` |
| `company_members` | same:79-87 | `membership_role`, `status` |
| `company_job_package_assignments` | `supabase/migrations/20261020192000_v4_package_entitlements.sql:31-47` | `expires_at`, `revoked_at`, `max_active_jobs_snapshot` |
| `jobs` | `supabase/migrations/20261020190500_v4_jobs_applications.sql` | `title`, `district`, `status`, `published_at`, `expires_at` |
| `publish_approved_job` | `supabase/migrations/20261020192000_v4_package_entitlements.sql:226-323` | `SECURITY DEFINER`, `authenticated` execute |
| `claim_notification_email_outbox` | `supabase/migrations/20261022134000_v4_notification_worker_retry.sql:1-86` | `SECURITY DEFINER`, `service_role` only |
| `table_privileges.test.sql` | `supabase/tests/database/table_privileges.test.sql:47-74` | Ratchet: yeni tablo eklenirse buraya |
| `function_privileges.test.sql` | `supabase/tests/database/function_privileges.test.sql:214-287` | Ratchet: yeni RPC signature eklenirse buraya |

## Migration (`supabase/migrations/2026XXXXXXXXXXXX_v4_talent_pool.sql`)

### 1. RLS gap gider
```sql
create policy candidate_profiles_read_public
  on public.candidate_profiles for select to authenticated
  using (visibility = 'public');
```

### 2. `talent_pool_entries` (dış adaylar)
```sql
create table public.talent_pool_entries (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  full_name text not null check (char_length(full_name) between 2 and 80 and full_name = btrim(full_name)),
  phone text check (phone is null or char_length(phone) <= 80),
  headline text check (headline is null or char_length(headline) <= 140),
  location text check (location is null or location in ('Lefkoşa','Mağusa','Girne','Güzelyurt','İskele','Lefke')),
  summary text check (summary is null or char_length(summary) <= 2000),
  skills text[] not null default '{}' check (cardinality(skills) <= 40),
  experience jsonb not null default '[]'::jsonb check (public.is_valid_candidate_profile_section(experience, array['role','organization','location','startDate','endDate','description'], 12, 2000)),
  education jsonb not null default '[]'::jsonb check (public.is_valid_candidate_profile_section(education, array['institution','qualification','field','startDate','endDate','description'], 12, 2000)),
  languages jsonb not null default '[]'::jsonb check (public.is_valid_candidate_profile_section(languages, array['name','proficiency'], 12, 2000)),
  certifications jsonb not null default '[]'::jsonb check (public.is_valid_candidate_profile_section(certifications, array['name','issuer','issueDate','expiryDate'], 12, 2000)),
  links jsonb not null default '[]'::jsonb check (public.is_valid_candidate_profile_section(links, array['label','url'], 12, 600)),
  source text not null check (source in ('bulk_import','directory','partner')),
  source_ref text check (char_length(source_ref) <= 255),
  is_searchable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email)
);
alter table public.talent_pool_entries enable row level security;
revoke all on table public.talent_pool_entries from public, anon, authenticated;
grant select (id, email, full_name, phone, headline, location, summary, skills, experience, education, languages, certifications, links, source, source_ref, is_searchable, created_at, updated_at)
  on public.talent_pool_entries to authenticated;
create policy talent_pool_entries_read_searchable
  on public.talent_pool_entries for select to authenticated using (is_searchable);
```

### 3. `v_talent_pool` (email yok, auth.users join yok)
```sql
create or replace view public.v_talent_pool as
with member_entries as (
  select cp.user_id as id, p.display_name as full_name, cp.phone, cp.headline,
         cp.location, cp.summary, cp.skills, cp.experience, cp.education,
         cp.languages, cp.certifications, cp.links,
         null as email, 'member' as source, null as source_ref, true as is_searchable, cp.updated_at
  from public.candidate_profiles as cp
  join public.profiles as p on p.id = cp.user_id
  where p.status = 'active' and cp.visibility = 'public'
  union
  select tpe.id, tpe.full_name, tpe.phone, tpe.headline, tpe.location, tpe.summary,
         tpe.skills, tpe.experience, tpe.education, tpe.languages, tpe.certifications,
         tpe.links, tpe.email, tpe.source, tpe.source_ref, tpe.is_searchable, tpe.updated_at
  from public.talent_pool_entries as tpe
  where tpe.is_searchable
    and not exists (select 1 from public.profiles p where p.email = tpe.email and p.status = 'active')
)
select * from member_entries;
```

### 4. `job_match_notifications`
```sql
create table public.job_match_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete restrict,
  match_score integer not null check (match_score between 0 and 100),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_sent_at timestamptz,
  unique (user_id, job_id)
);
alter table public.job_match_notifications enable row level security;
revoke all on table public.job_match_notifications from public, anon, authenticated;
grant select (id, user_id, job_id, match_score, created_at, read_at, email_sent_at)
  on public.job_match_notifications to authenticated;
grant update (read_at) on public.job_match_notifications to authenticated;
create policy job_match_notifications_read_own
  on public.job_match_notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy job_match_notifications_mark_own_read
  on public.job_match_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and read_at is not null);
```

### 5. `job_match_email_outbox`
```sql
create table public.job_match_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.job_match_notifications (id) on delete cascade,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  unique (notification_id)
);
alter table public.job_match_email_outbox enable row level security;
revoke all on table public.job_match_email_outbox from public, anon, authenticated;
```

### 6. `publish_approved_job` eşleşme döngüsü
Audit log satırından sonra eklenir: `INSERT ... RETURNING id INTO v_notif_id` (currval kullanilmamali), ardından `job_match_email_outbox` insert.

### 7. `get_candidate_contact` RPC
```sql
create or replace function public.get_candidate_contact(_user_id uuid)
returns table (email text, phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company public.companies%rowtype;
  v_assignment public.company_job_package_assignments%rowtype;
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select c.* into v_company
  from public.companies as c
  join public.company_members as m on m.company_id = c.id
  where m.user_id = v_actor and m.status = 'active'
    and m.membership_role in ('owner', 'recruiter')
    and c.verification_status = 'verified';

  if not found then
    raise exception 'A verified company membership is required.' using errcode = '42501';
  end if;

  select a.* into v_assignment
  from public.company_job_package_assignments as a
  where a.company_id = v_company.id and a.revoked_at is null
    and a.starts_at <= pg_catalog.now()
    and (a.expires_at is null or a.expires_at > pg_catalog.now());

  if not found then
    raise exception 'An active job package is required.' using errcode = '42501';
  end if;

  select u.email, cp.phone
  into email, phone
  from auth.users as u
  join public.candidate_profiles as cp on cp.user_id = u.id
  where u.id = _user_id;

  return;
end;
$$;

revoke all on function public.get_candidate_contact(uuid) from public, anon, authenticated;
grant execute on function public.get_candidate_contact(uuid) to authenticated;
```

### 8. `admin_bulk_import_talent_pool` RPC
`SECURITY DEFINER`, `platform_admin` gated, `service_role` execute. Talent_pool_entries upsert ile e-posta tekilleştirme.

## Dosya Değişiklikleri

| Dosya | İşlem |
|-------|-------|
| `supabase/migrations/2026XXXXXXXXXXXX_v4_talent_pool.sql` | Oluşturulur (yukarıdaki tüm DDL) |
| `supabase/tests/database/table_privileges.test.sql` | `talent_pool_entries`, `job_match_notifications`, `job_match_email_outbox` closed listesine ekle |
| `supabase/tests/database/function_privileges.test.sql` | `get_candidate_contact(uuid)` whitelist'e ekle; `admin_bulk_import_talent_pool` service_role only (whitelist'e girmez) |
| `src/features/candidates/actions.ts` | `visibility = 'public'` yazımı |
| `src/features/jobs/actions.ts` | `publishApprovedJob` eşleşme sayısı logu |
| `src/server/email/job-match-alert-render.ts` | Oluşturulur |
| `src/server/email/job-match-alert-copy.ts` | Oluşturulur (6-locale) |
| `src/server/email/mailer.ts` | `sendJobMatchAlert` (List-Unsubscribe + opt-out) |
| `src/app/[locale]/(company)/company/talent-pool/page.tsx` | Oluşturulur |
| `src/app/[locale]/(admin)/admin/talent-pool/page.tsx` | Oluşturulur |
| `src/app/[locale]/(company)/company/dashboard/page.tsx` | Navigasyon bağlantısı |
| `tests/unit/talent-pool.test.ts` | Oluşturulur |

## CI Kalite Kapıları (0 hata)
1. `bun run lint`
2. `bun run typecheck`
3. `bun run check:frontend-source`
4. `bun run test:unit`
5. `bun run test:security`
6. `bun run test:integration`
7. `bun run db:start && bun run test:db && bun run db:stop`
8. `NEXT_DIST_DIR=.next-verify NEXT_PUBLIC_APP_URL=https://isbulkktc.com bun run build` → `.next-verify` silinir

## Plan Durum
Tüm kararlar çözüldü. Plan uygulama için hazır.