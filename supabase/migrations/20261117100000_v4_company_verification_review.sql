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
  where company.verification_status in ('pending', 'rejected')
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

create or replace function public.review_company_verification(
  _company_id uuid,
  _decision text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_company public.companies%rowtype;
begin
  if v_actor_id is null
     or not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  if _decision is null or _decision not in ('verified', 'rejected') then
    raise exception 'The company verification decision is invalid.'
      using errcode = '22023';
  end if;

  select company.*
  into v_company
  from public.companies as company
  where company.id = _company_id
  for update;

  if not found then
    raise exception 'A reviewable company was not found.'
      using errcode = 'P0002';
  end if;

  if v_company.verification_status not in ('pending', 'rejected') then
    raise exception 'The company is not in a reviewable verification state.'
      using errcode = 'P0002';
  end if;

  if v_company.verification_status::text = _decision then
    return;
  end if;

  update public.companies
  set verification_status = _decision::public.company_verification_status
  where id = v_company.id;

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata_redacted
  )
  values (
    v_actor_id,
    'company.verification.' || _decision,
    'company',
    v_company.id,
    pg_catalog.jsonb_build_object(
      'previous_status', v_company.verification_status,
      'new_status', _decision
    )
  );
end;
$$;

revoke all on function public.admin_list_company_verifications()
  from public, anon, authenticated;
revoke all on function public.review_company_verification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_list_company_verifications()
  to authenticated;
grant execute on function public.review_company_verification(uuid, text)
  to authenticated;
