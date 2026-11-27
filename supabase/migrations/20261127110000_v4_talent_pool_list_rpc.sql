begin;

-- SECURITY DEFINER RPC to list talent pool entries for a company.
-- Caller must be an active owner/recruiter of the company.
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
  select
    vtp.id,
    vtp.full_name,
    vtp.phone,
    vtp.headline,
    vtp.location,
    vtp.summary,
    vtp.skills,
    vtp.experience,
    vtp.education,
    vtp.languages,
    vtp.certifications,
    vtp.links,
    vtp.email,
    vtp.source,
    vtp.source_ref,
    vtp.is_searchable,
    vtp.created_at,
    vtp.updated_at
  from public.v_talent_pool as vtp
  where vtp.is_searchable
  order by vtp.updated_at desc;
end;
$$;

revoke all on function public.admin_list_talent_pool_for_company(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_list_talent_pool_for_company(uuid)
  to authenticated;

commit;