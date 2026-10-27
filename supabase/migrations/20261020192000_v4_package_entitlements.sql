create table public.job_packages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(code) between 2 and 80),
  display_name text not null
    check (char_length(display_name) between 2 and 100 and display_name = btrim(display_name)),
  description text not null default ''
    check (char_length(description) <= 1000),
  max_active_jobs integer not null
    check (max_active_jobs between 1 and 1000),
  job_duration_days integer not null
    check (job_duration_days between 1 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger job_packages_set_updated_at
  before update on public.job_packages
  for each row execute function public.set_updated_at();

alter table public.job_packages enable row level security;
revoke all on table public.job_packages from anon, authenticated;
grant select (id, code, display_name, description, max_active_jobs, job_duration_days)
  on public.job_packages to anon, authenticated;

create policy job_packages_read_active
  on public.job_packages for select to anon, authenticated
  using (is_active);

create table public.company_job_package_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  package_id uuid not null references public.job_packages (id) on delete restrict,
  max_active_jobs_snapshot integer not null
    check (max_active_jobs_snapshot between 1 and 1000),
  job_duration_days_snapshot integer not null
    check (job_duration_days_snapshot between 1 and 365),
  assigned_by uuid not null references auth.users (id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint company_job_package_assignment_dates check (
    expires_at is null or expires_at > starts_at
  )
);

create unique index company_job_package_assignments_one_current
  on public.company_job_package_assignments (company_id)
  where revoked_at is null;
create index company_job_package_assignments_package_idx
  on public.company_job_package_assignments (package_id, company_id);

alter table public.company_job_package_assignments enable row level security;
revoke all on table public.company_job_package_assignments from anon, authenticated;

create or replace function public.admin_save_job_package(
  _package_id uuid,
  _code text,
  _display_name text,
  _description text,
  _max_active_jobs integer,
  _job_duration_days integer,
  _is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_package_id uuid;
  v_code text := pg_catalog.lower(pg_catalog.btrim(_code));
  v_name text := pg_catalog.btrim(_display_name);
  v_description text := pg_catalog.btrim(coalesce(_description, ''));
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

  if v_code is null
     or pg_catalog.char_length(v_code) not between 2 and 80
     or v_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or v_name is null
     or pg_catalog.char_length(v_name) not between 2 and 100
     or pg_catalog.char_length(v_description) > 1000
     or _max_active_jobs not between 1 and 1000
     or _job_duration_days not between 1 and 365
     or _is_active is null then
    raise exception 'The job package definition is invalid.'
      using errcode = '22023';
  end if;

  if _package_id is null then
    insert into public.job_packages (
      code, display_name, description, max_active_jobs,
      job_duration_days, is_active
    ) values (
      v_code, v_name, v_description, _max_active_jobs,
      _job_duration_days, _is_active
    )
    returning id into v_package_id;
  else
    update public.job_packages
    set code = v_code,
        display_name = v_name,
        description = v_description,
        max_active_jobs = _max_active_jobs,
        job_duration_days = _job_duration_days,
        is_active = _is_active
    where id = _package_id
    returning id into v_package_id;

    if v_package_id is null then
      raise exception 'The job package does not exist.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job_package.saved', 'job_package', v_package_id,
    pg_catalog.jsonb_build_object(
      'code', v_code,
      'is_active', _is_active,
      'max_active_jobs', _max_active_jobs,
      'job_duration_days', _job_duration_days
    )
  );

  return v_package_id;
end;
$$;

create or replace function public.admin_assign_company_job_package(
  _company_id uuid,
  _package_id uuid,
  _expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company public.companies%rowtype;
  v_package public.job_packages%rowtype;
  v_assignment_id uuid;
  v_now timestamptz := pg_catalog.now();
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

  if _company_id is null
     or _package_id is null
     or (_expires_at is not null and _expires_at <= v_now) then
    raise exception 'The package assignment is invalid.'
      using errcode = '22023';
  end if;

  select c.* into v_company
  from public.companies as c
  where c.id = _company_id
  for update;

  if not found or v_company.verification_status <> 'verified' then
    raise exception 'A verified company is required for package assignment.'
      using errcode = '42501';
  end if;

  select p.* into v_package
  from public.job_packages as p
  where p.id = _package_id and p.is_active
  for share;

  if not found then
    raise exception 'An active job package is required.'
      using errcode = '22023';
  end if;

  update public.company_job_package_assignments
  set revoked_at = v_now
  where company_id = _company_id and revoked_at is null;

  insert into public.company_job_package_assignments (
    company_id, package_id, max_active_jobs_snapshot,
    job_duration_days_snapshot, assigned_by, starts_at, expires_at
  ) values (
    _company_id, v_package.id, v_package.max_active_jobs,
    v_package.job_duration_days, v_actor, v_now, _expires_at
  )
  returning id into v_assignment_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job_package.assigned', 'company', _company_id,
    pg_catalog.jsonb_build_object(
      'package_id', v_package.id,
      'assignment_id', v_assignment_id,
      'expires_at', _expires_at
    )
  );

  return v_assignment_id;
end;
$$;

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
end;
$$;

create or replace function public.get_company_job_entitlements(_company_id uuid)
returns table (
  package_id uuid,
  package_code text,
  package_name text,
  max_active_jobs integer,
  job_duration_days integer,
  active_jobs integer,
  assignment_expires_at timestamptz
)
language plpgsql
stable
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
     or not (
       public.is_active_company_member(
         _company_id,
         array['owner', 'recruiter', 'billing']::public.company_role[]
       )
       or public.has_platform_role('platform_admin')
     ) then
    raise exception 'The company package is not available to this account.'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.code,
    p.display_name,
    a.max_active_jobs_snapshot,
    a.job_duration_days_snapshot,
    (
      select pg_catalog.count(*)::integer
      from public.jobs as j
      where j.company_id = a.company_id
        and j.status = 'published'
        and j.published_at <= pg_catalog.now()
        and j.expires_at > pg_catalog.now()
    ),
    a.expires_at
  from public.company_job_package_assignments as a
  join public.job_packages as p on p.id = a.package_id
  where a.company_id = _company_id
    and a.revoked_at is null
    and a.starts_at <= pg_catalog.now()
    and (a.expires_at is null or a.expires_at > pg_catalog.now())
    and p.is_active;
end;
$$;

revoke all on function public.admin_save_job_package(uuid, text, text, text, integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.admin_assign_company_job_package(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.publish_approved_job(uuid)
  from public, anon, authenticated;
revoke all on function public.get_company_job_entitlements(uuid)
  from public, anon, authenticated;

grant execute on function public.admin_save_job_package(uuid, text, text, text, integer, integer, boolean)
  to authenticated;
grant execute on function public.admin_assign_company_job_package(uuid, uuid, timestamptz)
  to authenticated;
grant execute on function public.publish_approved_job(uuid)
  to authenticated;
grant execute on function public.get_company_job_entitlements(uuid)
  to authenticated;
