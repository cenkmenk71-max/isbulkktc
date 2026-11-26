begin;

-- SECURITY DEFINER function to finalize company profile with auto-verification
-- Caller must be an active owner of the company
create or replace function public.finalize_company_profile(
  _company_id uuid,
  _company_name text,
  _profile_description text,
  _categories text[],
  _website text,
  _phone text,
  _public_email text,
  _address text,
  _municipality text,
  _directory_entry_id text default null,
  _directory_location_index integer default null
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
  -- Require authenticated active user
  if v_actor_id is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor_id and p.status = 'active'
     )
  then
    raise exception 'An authenticated active user is required.'
      using errcode = '42501';
  end if;

  -- Lock company row and verify ownership
  select *
  into v_company
  from public.companies
  where id = _company_id
  for update;

  if not found then
    raise exception 'Company not found.'
      using errcode = '22023';
  end if;

  -- Verify caller is active owner of this company
  if not public.is_active_company_member(
    _company_id,
    array['owner']::public.company_role[]
  ) then
    raise exception 'Only the active company owner can finalize the profile.'
      using errcode = '42501';
  end if;

  -- Validate company name
  if _company_name is null
     or pg_catalog.char_length(pg_catalog.btrim(_company_name)) < 2
     or pg_catalog.char_length(pg_catalog.btrim(_company_name)) > 120
  then
    raise exception 'Company name must be between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  -- Validate profile description
  if _profile_description is not null
     and pg_catalog.char_length(_profile_description) > 2000
  then
    raise exception 'Profile description must not exceed 2000 characters.'
      using errcode = '22023';
  end if;

  -- Validate categories array
  if _categories is not null then
    if cardinality(_categories) > 12 then
      raise exception 'Maximum 12 categories allowed.'
        using errcode = '22023';
    end if;
    if exists (
      select 1 from pg_catalog.unnest(_categories) as cat(val)
      where cat.val is null
         or pg_catalog.char_length(cat.val) < 1
         or pg_catalog.char_length(cat.val) > 80
    ) then
      raise exception 'Each category must be between 1 and 80 characters.'
        using errcode = '22023';
    end if;
  end if;

  -- Validate website URL
  if _website is not null and _website <> '' then
    begin
      if not (_website ~* '^https?://') then
        raise exception 'Website must be a valid HTTP/HTTPS URL.'
          using errcode = '22023';
      end if;
    exception when others then
      raise exception 'Website must be a valid URL.'
        using errcode = '22023';
    end;
  end if;

  -- Validate phone
  if _phone is not null and pg_catalog.char_length(_phone) > 80 then
    raise exception 'Phone must not exceed 80 characters.'
      using errcode = '22023';
  end if;

  -- Validate public email
  if _public_email is not null and _public_email <> '' then
    if not (_public_email ~* '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$') then
      raise exception 'Public email must be a valid email address.'
        using errcode = '22023';
    end if;
  end if;

  -- Validate address
  if _address is not null and pg_catalog.char_length(_address) > 240 then
    raise exception 'Address must not exceed 240 characters.'
      using errcode = '22023';
  end if;

  -- Validate municipality
  if _municipality is not null and pg_catalog.char_length(_municipality) > 120 then
    raise exception 'Municipality must not exceed 120 characters.'
      using errcode = '22023';
  end if;

  -- Update company with verified status and all profile data
  update public.companies
  set name = pg_catalog.btrim(_company_name),
      verification_status = 'verified',
      profile_description = nullif(pg_catalog.btrim(_profile_description), ''),
      categories = _categories,
      website = nullif(_website, ''),
      phone = nullif(_phone, ''),
      public_email = nullif(_public_email, ''),
      address = nullif(_address, ''),
      municipality = nullif(_municipality, ''),
      directory_entry_id = _directory_entry_id,
      directory_location_index = _directory_location_index,
      updated_at = pg_catalog.now()
  where id = _company_id;

  -- Audit log
  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata_redacted
  )
  values (
    v_actor_id,
    'company.profile.auto_verified',
    'company',
    _company_id,
    pg_catalog.jsonb_build_object(
      'verification_status', 'verified',
      'profile_updated', true
    )
  );
end;
$$;

-- Revoke default grants and grant only to authenticated
revoke all on function public.finalize_company_profile(uuid, text, text, text[], text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.finalize_company_profile(uuid, text, text, text[], text, text, text, text, text, text, integer)
  to authenticated;

commit;