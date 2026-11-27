begin;

-- PGRST202 forward fix: re-define the company review / deletion RPCs with the
-- exact signatures the Server Actions in src/features/companies/actions.ts call,
-- each protected by SECURITY DEFINER, set search_path = '' and
-- has_platform_role('platform_admin'). Idempotent (create or replace).

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
    raise exception 'A reviewable company was not found.' using errcode = 'P0002';
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
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
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

create or replace function public.review_company_profile_submission(
  _submission_id uuid,
  _decision text,
  _review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_submission public.company_profile_submissions%rowtype;
  v_previous_entry_id text;
  v_previous_location_index integer;
begin
  if v_actor_id is null
     or not public.has_platform_role('platform_admin')
     or not exists (
       select 1
       from public.profiles as actor
       where actor.id = v_actor_id and actor.status = 'active'
     ) then
    raise exception 'An active platform administrator is required.' using errcode = '42501';
  end if;

  if _decision is null
     or _decision not in ('approved', 'rejected')
     or char_length(coalesce(_review_note, '')) > 1000 then
    raise exception 'The review decision or note is invalid.' using errcode = '22023';
  end if;

  select submission.*
  into v_submission
  from public.company_profile_submissions as submission
  where submission.id = _submission_id
    and submission.status = 'pending'
  for update;

  if not found then
    raise exception 'A pending company profile submission was not found.' using errcode = 'P0002';
  end if;

  select company.directory_entry_id, company.directory_location_index
  into v_previous_entry_id, v_previous_location_index
  from public.companies as company
  where company.id = v_submission.company_id
  for update;

  update public.company_profile_submissions
  set status = _decision::public.company_profile_submission_status,
      review_note = nullif(pg_catalog.btrim(_review_note), ''),
      reviewed_by = v_actor_id,
      reviewed_at = pg_catalog.now()
  where id = v_submission.id;

  if _decision = 'approved' then
    update public.companies
    set name = v_submission.company_name,
        profile_description = v_submission.profile_description,
        categories = v_submission.categories,
        website = v_submission.website,
        phone = v_submission.phone,
        public_email = v_submission.public_email,
        address = v_submission.address,
        municipality = v_submission.municipality,
        directory_entry_id = v_submission.directory_entry_id,
        directory_location_index = v_submission.directory_location_index,
        updated_at = pg_catalog.now()
    where id = v_submission.company_id;

    if v_previous_entry_id is not null
       and (
         v_previous_entry_id is distinct from v_submission.directory_entry_id
         or v_previous_location_index is distinct from v_submission.directory_location_index
       ) then
      delete from public.company_directory_overrides
      where directory_entry_id = v_previous_entry_id
        and directory_location_index = v_previous_location_index;
    end if;

    if v_submission.directory_entry_id is not null then
      insert into public.company_directory_overrides (
        directory_entry_id, directory_location_index, company_name,
        profile_description, categories, website, phone, public_email,
        address, municipality
      ) values (
        v_submission.directory_entry_id,
        v_submission.directory_location_index,
        v_submission.company_name,
        v_submission.profile_description,
        v_submission.categories,
        v_submission.website,
        v_submission.phone,
        v_submission.public_email,
        v_submission.address,
        v_submission.municipality
      )
      on conflict (directory_entry_id, directory_location_index)
      do update set
        company_name = excluded.company_name,
        profile_description = excluded.profile_description,
        categories = excluded.categories,
        website = excluded.website,
        phone = excluded.phone,
        public_email = excluded.public_email,
        address = excluded.address,
        municipality = excluded.municipality,
        updated_at = pg_catalog.now();
    end if;
  end if;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor_id,
    'company.profile.' || _decision,
    'company_profile_submission',
    v_submission.id,
    pg_catalog.jsonb_build_object('status', _decision)
  );
end;
$$;

-- Idempotent re-definition of admin_delete_company with the signature the
-- delete form calls (_company_id uuid).
create or replace function public.admin_delete_company(_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_name text;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.has_platform_role('platform_admin') then
    raise exception 'Only a platform administrator can delete a company.' using errcode = '42501';
  end if;

  select name into v_company_name
  from public.companies
  where id = _company_id
  for update;

  if not found then
    raise exception 'Company not found.' using errcode = '22023';
  end if;

  delete from public.job_match_notifications where job_id in (select id from public.jobs where company_id = _company_id);
  delete from public.job_match_email_outbox where notification_id in (select id from public.job_match_notifications where job_id in (select id from public.jobs where company_id = _company_id));
  delete from public.application_events where application_id in (select id from public.applications where job_id in (select id from public.jobs where company_id = _company_id));
  delete from public.application_contact_shares where application_id in (select id from public.applications where job_id in (select id from public.jobs where company_id = _company_id));
  delete from public.notifications where user_id in (select id from public.profiles where id in (select user_id from public.company_members where company_id = _company_id));
  delete from public.notification_email_outbox where notification_id in (select id from public.notifications where user_id in (select id from public.profiles where id in (select user_id from public.company_members where company_id = _company_id)));
  delete from public.applications where job_id in (select id from public.jobs where company_id = _company_id);
  delete from public.jobs where company_id = _company_id;
  delete from public.company_members where company_id = _company_id;
  delete from public.company_profile_submissions where company_id = _company_id;
  delete from public.credit_ledger_entries where company_id = _company_id;
  delete from public.credit_accounts where company_id = _company_id;

  delete from public.companies where id = _company_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'company.deleted', 'company', _company_id,
    pg_catalog.jsonb_build_object('company_name', v_company_name, 'deleted_by', v_actor)
  );
end;
$$;

-- Fix admin_bulk_import_talent_pool so an authenticated platform_admin (not only
-- service_role) can invoke it from the admin UI. The service_role path is kept.
create or replace function public.admin_bulk_import_talent_pool(_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text := (select auth.role());
  v_count integer := 0;
  v_entry record;
begin
  if v_role = 'service_role' then
    null; -- service role calls are fully authorised
  elsif v_role = 'authenticated' then
    if v_actor is null
       or not exists (
         select 1 from public.profiles as p
         where p.id = v_actor and p.status = 'active'
       )
       or not public.has_platform_role('platform_admin') then
      raise exception 'An active platform administrator is required.' using errcode = '42501';
    end if;
  else
    raise exception 'The service role or an authenticated platform administrator is required.' using errcode = '42501';
  end if;

  if _entries is null or pg_catalog.jsonb_typeof(_entries) <> 'array' then
    raise exception 'The import payload must be a JSON array.' using errcode = '22023';
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

revoke all on function public.review_company_verification(uuid, text) from public, anon, authenticated;
grant execute on function public.review_company_verification(uuid, text) to authenticated;

revoke all on function public.review_company_profile_submission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_company_profile_submission(uuid, text, text) to authenticated;

revoke all on function public.admin_delete_company(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_company(uuid) to authenticated;

revoke all on function public.admin_bulk_import_talent_pool(jsonb) from public, anon, authenticated;
grant execute on function public.admin_bulk_import_talent_pool(jsonb) to authenticated;

commit;
