begin;

-- Supabase Security Advisor: v_talent_pool is a SECURITY DEFINER view that
-- joins auth.users and could leak auth.users data via PostgREST to
-- anon/authenticated roles. The talent pool is only used by the background
-- matching engine (publish_approved_job / publishApprovedJob), never exposed
-- directly, so drop the view and re-point the dependent RPC at the base tables.
drop view if exists public.v_talent_pool;

-- Re-point admin_list_talent_pool_for_company at base tables so it keeps
-- working after v_talent_pool is dropped. Same shape as before, but reads
-- candidate_profiles + talent_pool_entries directly.
create or replace function public.admin_list_talent_pool_for_company(
  _company_id uuid
)
returns table (
  id uuid,
  full_name text,
  phone text,
  headline text,
  location text,
  summary text,
  skills text[],
  experience jsonb,
  education jsonb,
  languages jsonb,
  certifications jsonb,
  links jsonb,
  email text,
  source text,
  source_ref text,
  is_searchable boolean,
  created_at timestamptz,
  updated_at timestamptz
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
     or not public.has_platform_role('platform_admin') then
    raise exception 'An active platform administrator is required.' using errcode = '42501';
  end if;

  return query
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
  select *
  from member_entries
  where is_searchable
  order by updated_at desc;
end;
$$;

revoke all on function public.admin_list_talent_pool_for_company(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_list_talent_pool_for_company(uuid)
  to authenticated;

-- admin_list_company_verifications: include verified companies so platform
-- admins can see and one-click delete them from /admin/company-profiles.
create or replace function public.admin_list_company_verifications()
returns table (
  id uuid,
  name text,
  slug text,
  verification_status public.company_verification_status,
  website text,
  phone text,
  public_email text,
  address text,
  municipality text,
  created_at timestamptz
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
    company.id,
    company.name,
    company.slug,
    company.verification_status,
    company.website,
    company.phone,
    company.public_email,
    company.address,
    company.municipality,
    company.created_at
  from public.companies as company
  where company.verification_status in ('pending', 'rejected', 'verified')
    and exists (
      select 1
      from public.company_members as member
      where member.company_id = company.id
        and member.membership_role = 'owner'
        and member.status = 'active'
    )
  order by company.created_at, company.id
  limit 50;
end;
$$;

revoke all on function public.admin_list_company_verifications()
  from public, anon, authenticated;
grant execute on function public.admin_list_company_verifications()
  to authenticated;

commit;
