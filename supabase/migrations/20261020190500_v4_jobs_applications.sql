create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  created_by uuid not null default auth.uid()
    references public.profiles (id) on delete restrict,
  title text not null
    check (char_length(title) between 5 and 140 and title = btrim(title)),
  slug text not null
    check (
      char_length(slug) between 2 and 100
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  summary text not null
    check (char_length(summary) between 20 and 500),
  description text not null
    check (char_length(description) between 50 and 20000),
  requirements text not null default ''
    check (char_length(requirements) <= 10000),
  responsibilities text not null default ''
    check (char_length(responsibilities) <= 10000),
  job_type text not null
    check (job_type in ('full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance')),
  workplace_mode text not null
    check (workplace_mode in ('on_site', 'hybrid', 'remote')),
  district text
    check (district is null or district in ('Lefkoşa', 'Mağusa', 'Girne', 'İskele', 'Güzelyurt', 'Lefke')),
  status text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'rejected', 'published', 'closed', 'expired')),
  moderation_note text
    check (moderation_note is null or char_length(moderation_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(requirements, '') || ' ' ||
      coalesce(responsibilities, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, slug),
  constraint jobs_publication_dates_consistent check (
    (
      status in ('published', 'closed', 'expired')
      and published_at is not null
      and expires_at is not null
      and expires_at > published_at
    )
    or (
      status not in ('published', 'closed', 'expired')
      and published_at is null
      and expires_at is null
    )
  ),
  constraint jobs_review_metadata_consistent check (
    (status in ('approved', 'rejected', 'published', 'closed', 'expired')
      and reviewed_by is not null and reviewed_at is not null)
    or (
      status in ('draft', 'pending_review')
      and reviewed_by is null
      and reviewed_at is null
    )
  )
);

create index jobs_public_search_idx on public.jobs using gin (search_vector);
create index jobs_public_filters_idx
  on public.jobs (district, job_type, workplace_mode, published_at desc)
  where status = 'published';
create index jobs_company_status_idx on public.jobs (company_id, status, created_at desc);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete restrict,
  candidate_id uuid not null references public.profiles (id) on delete restrict,
  cover_letter text not null default ''
    check (char_length(cover_letter) <= 5000),
  status text not null default 'submitted'
    check (status in ('submitted', 'reviewing', 'shortlisted', 'rejected', 'hired', 'withdrawn')),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create index applications_candidate_recent_idx
  on public.applications (candidate_id, created_at desc);
create index applications_job_status_idx on public.applications (job_id, status, created_at);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
alter table public.applications enable row level security;

revoke all on table public.jobs, public.applications from anon, authenticated;

grant select (id, company_id, title, slug, summary, description, requirements,
  responsibilities, job_type, workplace_mode, district, status, published_at,
  expires_at, created_at, updated_at)
  on public.jobs to anon;

grant select on public.jobs to authenticated;
grant insert (company_id, title, slug, summary, description, requirements,
  responsibilities, job_type, workplace_mode, district)
  on public.jobs to authenticated;
grant update (title, slug, summary, description, requirements, responsibilities,
  job_type, workplace_mode, district)
  on public.jobs to authenticated;

grant select on public.applications to authenticated;

create policy jobs_public_read
  on public.jobs for select to anon, authenticated
  using (
    status = 'published'
    and published_at <= pg_catalog.now()
    and expires_at > pg_catalog.now()
    and exists (
      select 1
      from public.companies as company_row
      where company_row.id = jobs.company_id
        and company_row.verification_status = 'verified'
    )
  );

create policy jobs_company_read
  on public.jobs for select to authenticated
  using (
    exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and public.is_active_company_member(
        company_id,
        array['owner', 'recruiter']::public.company_role[]
      )
  );

create policy jobs_platform_admin_read
  on public.jobs for select to authenticated
  using (
    public.has_platform_role('platform_admin')
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
  );

create policy jobs_company_insert_draft
  on public.jobs for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and status = 'draft'
    and reviewed_by is null
    and reviewed_at is null
    and published_at is null
    and expires_at is null
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and public.is_active_company_member(
      company_id,
      array['owner', 'recruiter']::public.company_role[]
    )
  );

create policy jobs_company_update_editable
  on public.jobs for update to authenticated
  using (
    status in ('draft', 'rejected')
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and public.is_active_company_member(
      company_id,
      array['owner', 'recruiter']::public.company_role[]
    )
  )
  with check (
    status in ('draft', 'rejected')
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and public.is_active_company_member(
      company_id,
      array['owner', 'recruiter']::public.company_role[]
    )
  );

create policy applications_candidate_read_own
  on public.applications for select to authenticated
  using (
    candidate_id = (select auth.uid())
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
  );

create policy applications_company_read_job_applicants
  on public.applications for select to authenticated
  using (
    exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and
    exists (
      select 1
      from public.jobs as job_row
      where job_row.id = applications.job_id
        and public.is_active_company_member(
          job_row.company_id,
          array['owner', 'recruiter']::public.company_role[]
        )
    )
  );

create or replace function public.submit_job_for_review(_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.jobs%rowtype;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select job_row.* into v_job
  from public.jobs as job_row
  where job_row.id = _job_id
  for update;

  if not found
     or not public.is_active_company_member(
       v_job.company_id,
       array['owner', 'recruiter']::public.company_role[]
     ) then
    raise exception 'The job is not available to this company member.'
      using errcode = '42501';
  end if;

  if v_job.status not in ('draft', 'rejected') then
    raise exception 'Only draft or rejected jobs can be submitted.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.companies as c
    where c.id = v_job.company_id
      and c.verification_status = 'verified'
  ) then
    raise exception 'The company must be verified before job review.'
      using errcode = '42501';
  end if;

  update public.jobs
  set status = 'pending_review',
      moderation_note = null,
      reviewed_by = null,
      reviewed_at = null
  where id = _job_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job.submitted_for_review', 'job', _job_id,
    pg_catalog.jsonb_build_object('from_status', v_job.status, 'to_status', 'pending_review')
  );
end;
$$;

create or replace function public.review_job(
  _job_id uuid,
  _decision text,
  _review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.has_platform_role('platform_admin') then
    raise exception 'An active platform administrator is required.'
      using errcode = '42501';
  end if;

  if _decision not in ('approved', 'rejected')
     or (_review_note is not null and pg_catalog.char_length(_review_note) > 1000)
     or (_decision = 'rejected' and pg_catalog.btrim(coalesce(_review_note, '')) = '') then
    raise exception 'The moderation decision or review note is invalid.'
      using errcode = '22023';
  end if;

  update public.jobs
  set status = _decision,
      moderation_note = nullif(pg_catalog.btrim(_review_note), ''),
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now()
  where id = _job_id
    and status = 'pending_review';

  if not found then
    raise exception 'Only pending jobs can be reviewed.'
      using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job.moderated', 'job', _job_id,
    pg_catalog.jsonb_build_object('decision', _decision)
  );
end;
$$;

create or replace function public.apply_to_job(
  _job_id uuid,
  _cover_letter text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_application_id uuid;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not exists (
       select 1 from public.candidate_profiles as cp
       where cp.user_id = v_actor
     ) then
    raise exception 'An active candidate profile is required.'
      using errcode = '42501';
  end if;

  if _cover_letter is null or pg_catalog.char_length(_cover_letter) > 5000 then
    raise exception 'The cover letter exceeds the allowed length.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.jobs as j
    join public.companies as c on c.id = j.company_id
    where j.id = _job_id
      and j.status = 'published'
      and j.published_at <= pg_catalog.now()
      and j.expires_at > pg_catalog.now()
      and c.verification_status = 'verified'
  ) then
    raise exception 'The job is not open for applications.'
      using errcode = '22023';
  end if;

  insert into public.applications (job_id, candidate_id, cover_letter)
  values (_job_id, v_actor, pg_catalog.btrim(_cover_letter))
  returning id into v_application_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'application.submitted', 'application', v_application_id,
    pg_catalog.jsonb_build_object('job_id', _job_id)
  );

  return v_application_id;
end;
$$;

create or replace function public.transition_application(
  _application_id uuid,
  _next_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_company_id uuid;
  v_allowed boolean := false;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select a.* into v_application
  from public.applications as a
  where a.id = _application_id
  for update;

  if not found then
    raise exception 'The application does not exist.'
      using errcode = '22023';
  end if;

  select j.company_id into v_company_id
  from public.jobs as j where j.id = v_application.job_id;

  if v_application.candidate_id = v_actor
     and _next_status = 'withdrawn'
     and v_application.status in ('submitted', 'reviewing') then
    v_allowed := true;
  elsif v_application.candidate_id <> v_actor
    and public.is_active_company_member(
    v_company_id,
    array['owner', 'recruiter']::public.company_role[]
  ) then
    v_allowed :=
      (v_application.status = 'submitted' and _next_status in ('reviewing', 'shortlisted', 'rejected'))
      or (v_application.status = 'reviewing' and _next_status in ('shortlisted', 'rejected'))
      or (v_application.status = 'shortlisted' and _next_status in ('hired', 'rejected'));
  end if;

  if not v_allowed then
    raise exception 'The application status transition is not allowed.'
      using errcode = '42501';
  end if;

  update public.applications
  set status = _next_status,
      reviewed_by = case when v_application.candidate_id = v_actor then reviewed_by else v_actor end,
      reviewed_at = case when v_application.candidate_id = v_actor then reviewed_at else pg_catalog.now() end
  where id = _application_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'application.status_changed', 'application', _application_id,
    pg_catalog.jsonb_build_object(
      'from_status', v_application.status,
      'to_status', _next_status
    )
  );
end;
$$;

revoke all on function public.submit_job_for_review(uuid) from public, anon, authenticated;
revoke all on function public.review_job(uuid, text, text) from public, anon, authenticated;
revoke all on function public.apply_to_job(uuid, text) from public, anon, authenticated;
revoke all on function public.transition_application(uuid, text) from public, anon, authenticated;

grant execute on function public.submit_job_for_review(uuid) to authenticated;
grant execute on function public.review_job(uuid, text, text) to authenticated;
grant execute on function public.apply_to_job(uuid, text) to authenticated;
grant execute on function public.transition_application(uuid, text) to authenticated;
