begin;

-- SECURITY DEFINER function to update a published job without consuming quota or changing expires_at
-- Caller must be an active owner/recruiter of the company
-- Only platform-sourced jobs in 'published' status can be updated
-- Only text/content fields can be modified (not status, published_at, expires_at, company_id, etc.)
create or replace function public.update_published_job(
  _job_id uuid,
  _title text,
  _slug text,
  _summary text,
  _description text,
  _requirements text,
  _responsibilities text,
  _job_type public.job_type,
  _workplace_mode public.workplace_mode,
  _district public.northern_cyprus_district
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_job public.jobs%rowtype;
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

  -- Lock job row and verify ownership
  select *
  into v_job
  from public.jobs
  where id = _job_id
  for update;

  if not found then
    raise exception 'Job not found.'
      using errcode = '22023';
  end if;

  -- Verify caller is active owner or recruiter of this company
  if not public.is_active_company_member(
    v_job.company_id,
    array['owner', 'recruiter']::public.company_role[]
  ) then
    raise exception 'Only active company owners or recruiters can update this job.'
      using errcode = '42501';
  end if;

  -- Only platform-sourced jobs can be updated via this function
  if v_job.publication_source <> 'platform' then
    raise exception 'Only platform-sourced jobs can be updated.'
      using errcode = '22023';
  end if;

  -- Only published jobs can be updated (not draft, pending_review, etc.)
  if v_job.status <> 'published' then
    raise exception 'Only published jobs can be updated via this function.'
      using errcode = '22023';
  end if;

  -- Validate title
  if _title is null
     or pg_catalog.char_length(pg_catalog.btrim(_title)) < 5
     or pg_catalog.char_length(pg_catalog.btrim(_title)) > 140
  then
    raise exception 'Title must be between 5 and 140 characters.'
      using errcode = '22023';
  end if;

  -- Validate slug
  if _slug is null
     or pg_catalog.char_length(_slug) < 2
     or pg_catalog.char_length(_slug) > 100
     or _slug ~ '[^a-z0-9-]'
     or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception 'Slug has an invalid format.'
      using errcode = '22023';
  end if;

  -- Check slug uniqueness (excluding current job)
  if exists (
    select 1 from public.jobs
    where slug = _slug and id <> _job_id
  ) then
    raise exception 'A job with this slug already exists.'
      using errcode = '23505';
  end if;

  -- Validate summary
  if _summary is null
     or pg_catalog.char_length(pg_catalog.btrim(_summary)) < 20
     or pg_catalog.char_length(pg_catalog.btrim(_summary)) > 500
  then
    raise exception 'Summary must be between 20 and 500 characters.'
      using errcode = '22023';
  end if;

  -- Validate description
  if _description is null
     or pg_catalog.char_length(pg_catalog.btrim(_description)) < 50
     or pg_catalog.char_length(pg_catalog.btrim(_description)) > 20000
  then
    raise exception 'Description must be between 50 and 20000 characters.'
      using errcode = '22023';
  end if;

  -- Validate requirements
  if _requirements is not null and pg_catalog.char_length(_requirements) > 10000 then
    raise exception 'Requirements must not exceed 10000 characters.'
      using errcode = '22023';
  end if;

  -- Validate responsibilities
  if _responsibilities is not null and pg_catalog.char_length(_responsibilities) > 10000 then
    raise exception 'Responsibilities must not exceed 10000 characters.'
      using errcode = '22023';
  end if;

  -- Update only the allowed fields (NOT status, published_at, expires_at, company_id, created_by, etc.)
  update public.jobs
  set title = pg_catalog.btrim(_title),
      slug = _slug,
      summary = pg_catalog.btrim(_summary),
      description = pg_catalog.btrim(_description),
      requirements = pg_catalog.btrim(_requirements),
      responsibilities = pg_catalog.btrim(_responsibilities),
      job_type = _job_type,
      workplace_mode = _workplace_mode,
      district = _district,
      updated_at = pg_catalog.now()
  where id = _job_id;

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
    'job.published.updated',
    'job',
    _job_id,
    pg_catalog.jsonb_build_object(
      'company_id', v_job.company_id,
      'title_changed', v_job.title <> pg_catalog.btrim(_title)
    )
  );
end;
$$;

-- Revoke default grants and grant only to authenticated
revoke all on function public.update_published_job(uuid, text, text, text, text, text, text, public.job_type, public.workplace_mode, public.northern_cyprus_district)
  from public, anon, authenticated;
grant execute on function public.update_published_job(uuid, text, text, text, text, text, text, public.job_type, public.workplace_mode, public.northern_cyprus_district)
  to authenticated;

commit;