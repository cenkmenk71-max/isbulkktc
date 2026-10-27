create or replace function public.has_platform_role(_role public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    and exists (
      select 1
      from public.user_roles as role_row
      join public.profiles as profile_row on profile_row.id = role_row.user_id
      where role_row.user_id = (select auth.uid())
        and role_row.role = _role
        and profile_row.status = 'active'
    );
$$;

create or replace function public.admin_list_job_packages()
returns table (
  id uuid,
  code text,
  display_name text,
  description text,
  max_active_jobs integer,
  job_duration_days integer,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.code,
    p.display_name,
    p.description,
    p.max_active_jobs,
    p.job_duration_days,
    p.is_active,
    p.created_at,
    p.updated_at
  from public.job_packages as p
  order by p.max_active_jobs, p.code;
end;
$$;

create or replace function public.admin_list_verified_companies()
returns table (
  id uuid,
  name text,
  slug text,
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
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.name,
    c.slug,
    a.package_id,
    p.code,
    p.display_name,
    a.max_active_jobs_snapshot,
    a.job_duration_days_snapshot,
    (
      select pg_catalog.count(*)::integer
      from public.jobs as j
      where j.company_id = c.id
        and j.status = 'published'
        and j.published_at <= pg_catalog.now()
        and j.expires_at > pg_catalog.now()
    ),
    a.expires_at
  from public.companies as c
  left join lateral (
    select assignment.*
    from public.company_job_package_assignments as assignment
    where assignment.company_id = c.id
      and assignment.revoked_at is null
      and assignment.starts_at <= pg_catalog.now()
      and (
        assignment.expires_at is null
        or assignment.expires_at > pg_catalog.now()
      )
    order by assignment.starts_at desc
    limit 1
  ) as a on true
  left join public.job_packages as p
    on p.id = a.package_id
  where c.verification_status = 'verified'
  order by c.name, c.id;
end;
$$;

revoke all on function public.admin_list_job_packages()
  from public, anon, authenticated;
revoke all on function public.admin_list_verified_companies()
  from public, anon, authenticated;
grant execute on function public.admin_list_job_packages()
  to authenticated;
grant execute on function public.admin_list_verified_companies()
  to authenticated;
