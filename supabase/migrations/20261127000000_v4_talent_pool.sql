-- 1. RLS gap gider: candidate_profiles public okuma
create policy candidate_profiles_read_public
  on public.candidate_profiles for select to authenticated
  using (visibility = 'public');

-- 2. talent_pool_entries (dış adaylar)
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

-- 3. v_talent_pool (email yok, auth.users join yok)
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
    and not exists (select 1 from auth.users u where u.email = tpe.email)
)
select * from member_entries;

-- 4. job_match_notifications
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

-- 5. job_match_email_outbox
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

-- 6. publish_approved_job: eşleşme döngüsü + e-posta kuyusu
create or replace function public.publish_approved_job(_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.jobs%rowtype;
  v_assignment public.company_job_package_assignments%rowtype;
  v_company public.companies%rowtype;
  v_active_jobs integer;
  v_now timestamptz := pg_catalog.now();
  v_notif_id uuid;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select j.* into v_job
  from public.jobs as j
  where j.id = _job_id
  for update;

  if not found
     or not public.is_active_company_member(
       v_job.company_id,
       array['owner', 'recruiter']::public.company_role[]
     ) then
    raise exception 'The job is not available to this company member.'
      using errcode = '42501';
  end if;

  if v_job.status <> 'approved' then
    raise exception 'Only an approved job can be published.'
      using errcode = '22023';
  end if;

  select c.* into v_company
  from public.companies as c
  where c.id = v_job.company_id
  for update;

  if not found or v_company.verification_status <> 'verified' then
    raise exception 'The company must be verified to publish a job.'
      using errcode = '42501';
  end if;

  select a.* into v_assignment
  from public.company_job_package_assignments as a
  join public.job_packages as p on p.id = a.package_id and p.is_active
  where a.company_id = v_job.company_id
    and a.revoked_at is null
    and a.starts_at <= v_now
    and (a.expires_at is null or a.expires_at > v_now)
  for update of a, p;

  if not found then
    raise exception 'An active package assignment is required to publish.'
      using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::integer into v_active_jobs
  from public.jobs as j
  where j.company_id = v_job.company_id
    and j.status = 'published'
    and j.published_at <= v_now
    and j.expires_at > v_now;

  if v_active_jobs >= v_assignment.max_active_jobs_snapshot then
    raise exception 'The assigned package active-job limit has been reached.'
      using errcode = 'P0001';
  end if;

  update public.jobs
  set status = 'published',
      published_at = v_now,
      expires_at = v_now + pg_catalog.make_interval(
        days => v_assignment.job_duration_days_snapshot
      )
  where id = _job_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job.published', 'job', _job_id,
    pg_catalog.jsonb_build_object(
      'company_id', v_job.company_id,
      'package_assignment_id', v_assignment.id,
      'duration_days', v_assignment.job_duration_days_snapshot
    )
  );

  -- Eşleşme döngüsü: ILIKE doğrudan beceri eşleşmesi
  for v_notif_id in
    insert into public.job_match_notifications (
      user_id, job_id, match_score
    )
    select vtp.id, _job_id, 100
    from public.v_talent_pool as vtp
    where vtp.is_searchable
      and vtp.email is null
      and exists (
        select 1
        from pg_catalog.unnest(vtp.skills) as skill
        where v_job.title ilike '%' || skill || '%'
           or v_job.summary ilike '%' || skill || '%'
      )
    returning id
  loop
    insert into public.job_match_email_outbox (
      notification_id
    ) values (
      v_notif_id
    );
  end loop;
end;
$$;

revoke all on function public.publish_approved_job(uuid) from public, anon, authenticated;
grant execute on function public.publish_approved_job(uuid) to authenticated;

-- 7. get_candidate_contact RPC
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

-- 8. admin_bulk_import_talent_pool RPC
create or replace function public.admin_bulk_import_talent_pool(
  _entries jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_count integer := 0;
  v_entry record;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The service role is required.' using errcode = '42501';
  end if;

  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.has_platform_role('platform_admin') then
    raise exception 'An active platform administrator is required.'
      using errcode = '42501';
  end if;

  if _entries is null or pg_catalog.jsonb_typeof(_entries) <> 'array' then
    raise exception 'The import payload must be a JSON array.'
      using errcode = '22023';
  end if;

  for v_entry in
    select value as entry
    from pg_catalog.jsonb_array_elements(_entries) as value
  loop
    insert into public.talent_pool_entries (
      email, full_name, phone, headline, location, summary, skills,
      experience, education, languages, certifications, links,
      source, source_ref, is_searchable
    ) values (
      (v_entry.entry ->> 'email')::text,
      (v_entry.entry ->> 'full_name')::text,
      (v_entry.entry ->> 'phone')::text,
      (v_entry.entry ->> 'headline')::text,
      (v_entry.entry ->> 'location')::text,
      (v_entry.entry ->> 'summary')::text,
      coalesce((v_entry.entry -> 'skills')::text[], '{}'),
      coalesce((v_entry.entry -> 'experience')::jsonb, '[]'::jsonb),
      coalesce((v_entry.entry -> 'education')::jsonb, '[]'::jsonb),
      coalesce((v_entry.entry -> 'languages')::jsonb, '[]'::jsonb),
      coalesce((v_entry.entry -> 'certifications')::jsonb, '[]'::jsonb),
      coalesce((v_entry.entry -> 'links')::jsonb, '[]'::jsonb),
      coalesce((v_entry.entry ->> 'source')::text, 'bulk_import'),
      (v_entry.entry ->> 'source_ref')::text,
      coalesce((v_entry.entry ->> 'is_searchable')::boolean, true)
    )
    on conflict (email) do update set
      full_name = excluded.full_name,
      phone = excluded.phone,
      headline = excluded.headline,
      location = excluded.location,
      summary = excluded.summary,
      skills = excluded.skills,
      experience = excluded.experience,
      education = excluded.education,
      languages = excluded.languages,
      certifications = excluded.certifications,
      links = excluded.links,
      source = excluded.source,
      source_ref = excluded.source_ref,
      is_searchable = excluded.is_searchable,
      updated_at = pg_catalog.now();

    v_count := v_count + 1;
  end loop;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'talent_pool.bulk_import', 'talent_pool_entries', null,
    pg_catalog.jsonb_build_object('count', v_count)
  );

  return v_count;
end;
$$;

revoke all on function public.admin_bulk_import_talent_pool(jsonb) from public, anon, authenticated;
grant execute on function public.admin_bulk_import_talent_pool(jsonb) to service_role;
