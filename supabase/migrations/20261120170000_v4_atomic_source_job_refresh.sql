begin;

-- Replace the imported catalogue as one database transaction.
--
-- The importer previously deleted all source jobs, then updated the snapshot
-- ledger, companies, jobs and provenance through separate PostgREST requests.
-- Any network/constraint failure after the delete could leave production with
-- an empty or partially rebuilt catalogue. A single SECURITY DEFINER RPC makes
-- the replacement all-or-nothing; the caller must be the service-role worker.

create or replace function public.replace_source_job_catalogue(
  _companies jsonb,
  _jobs jsonb,
  _snapshots jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_count integer;
  v_job_count integer;
  v_import_count integer;
  v_snapshot_count integer;
  v_deleted_job_count integer;
  v_deleted_company_count integer;
begin
  if (select auth.role()) is null
     or (select auth.role()) <> 'service_role' then
    raise exception 'The source catalogue worker role is required.'
      using errcode = '42501';
  end if;

  if pg_catalog.jsonb_typeof(_companies) is distinct from 'array'
     or pg_catalog.jsonb_typeof(_jobs) is distinct from 'array'
     or pg_catalog.jsonb_typeof(_snapshots) is distinct from 'array' then
    raise exception 'Source catalogue payloads must be JSON arrays.'
      using errcode = '22023';
  end if;

  v_company_count := pg_catalog.jsonb_array_length(_companies);
  v_job_count := pg_catalog.jsonb_array_length(_jobs);

  if v_company_count < 1 or v_company_count > 200
     or v_job_count < 1 or v_job_count > 200
     or pg_catalog.jsonb_array_length(_snapshots) <> v_job_count then
    raise exception 'Source catalogue payload sizes are invalid.'
      using errcode = '22023';
  end if;

  -- Only importer-owned companies may be changed by this worker.
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(_companies) as company_row(
      name text,
      slug text,
      profile_description text,
      categories text[],
      website text,
      municipality text,
      source_profile_url text,
      logo_url text
    )
    where company_row.slug is null
       or company_row.slug !~ '^source-[a-z0-9]+(-[a-z0-9]+)*$'
       or company_row.name is null
  ) then
    raise exception 'A source company payload is invalid.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select company_row.slug
      from pg_catalog.jsonb_to_recordset(_companies) as company_row(
        name text,
        slug text,
        profile_description text,
        categories text[],
        website text,
        municipality text,
        source_profile_url text,
        logo_url text
      )
      group by company_row.slug
      having pg_catalog.count(*) > 1
    ) as duplicate_companies
  ) then
    raise exception 'Source company slugs must be unique.'
      using errcode = '22023';
  end if;

  -- Every listing must point to one of the supplied source companies and have
  -- one unique provenance key. Table constraints remain the final validator
  -- for title, body, dates, URL and enum fields.
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(_jobs) as job_row(
      company_slug text,
      slug text,
      source text,
      source_job_id text
    )
    where job_row.company_slug is null
       or job_row.company_slug !~ '^source-[a-z0-9]+(-[a-z0-9]+)*$'
       or job_row.slug is null
       or job_row.source is null
       or job_row.source not in ('iskibris', 'isbulkibris')
       or job_row.source_job_id is null
       or pg_catalog.char_length(job_row.source_job_id) not between 1 and 128
       or not exists (
         select 1
         from pg_catalog.jsonb_to_recordset(_companies) as company_row(
           slug text
         )
         where company_row.slug = job_row.company_slug
       )
  ) then
    raise exception 'A source job payload is invalid or references an unknown company.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select job_row.source, job_row.source_job_id
      from pg_catalog.jsonb_to_recordset(_jobs) as job_row(
        source text,
        source_job_id text
      )
      group by job_row.source, job_row.source_job_id
      having pg_catalog.count(*) > 1
    ) as duplicate_jobs
  ) then
    raise exception 'Source listing identifiers must be unique.'
      using errcode = '22023';
  end if;

  -- The change ledger must describe exactly the listings being inserted.
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(_jobs) as job_row(
      source text,
      source_job_id text
    )
    where not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(_snapshots) as snapshot_row(
        source text,
        source_job_id text
      )
      where snapshot_row.source = job_row.source
        and snapshot_row.source_job_id = job_row.source_job_id
    )
  ) or exists (
    select 1
    from pg_catalog.jsonb_to_recordset(_snapshots) as snapshot_row(
      source text,
      source_job_id text
    )
    where not exists (
      select 1
      from pg_catalog.jsonb_to_recordset(_jobs) as job_row(
        source text,
        source_job_id text
      )
      where job_row.source = snapshot_row.source
        and job_row.source_job_id = snapshot_row.source_job_id
    )
  ) then
    raise exception 'Source snapshots must match the imported listings.'
      using errcode = '22023';
  end if;

  insert into public.companies as current_company (
    name,
    slug,
    verification_status,
    profile_description,
    categories,
    website,
    municipality,
    source_profile_url,
    logo_url
  )
  select
    company_row.name,
    company_row.slug,
    'pending'::public.company_verification_status,
    coalesce(company_row.profile_description, ''),
    coalesce(company_row.categories, '{}'::text[]),
    company_row.website,
    company_row.municipality,
    company_row.source_profile_url,
    company_row.logo_url
  from pg_catalog.jsonb_to_recordset(_companies) as company_row(
    name text,
    slug text,
    profile_description text,
    categories text[],
    website text,
    municipality text,
    source_profile_url text,
    logo_url text
  )
  on conflict (slug) do update
    set name = excluded.name,
        profile_description = excluded.profile_description,
        categories = excluded.categories,
        website = excluded.website,
        municipality = excluded.municipality,
        source_profile_url = excluded.source_profile_url,
        logo_url = excluded.logo_url
    -- Once a source company is verified, claimed by a member, assigned a
    -- package, or has a profile submission in review, its curated data belongs
    -- to the platform/company workflow rather than the upstream scraper.
    where current_company.verification_status = 'pending'
      and not exists (
        select 1
        from public.company_members as member_row
        where member_row.company_id = current_company.id
      )
      and not exists (
        select 1
        from public.company_job_package_assignments as assignment_row
        where assignment_row.company_id = current_company.id
      )
      and not exists (
        select 1
        from public.company_profile_submissions as submission_row
        where submission_row.company_id = current_company.id
      );

  -- This delete, the subsequent inserts, and the snapshot update all commit or
  -- roll back together because the caller invokes this function in one SQL
  -- statement.
  delete from public.jobs
  where publication_source = 'source_site';
  get diagnostics v_deleted_job_count = row_count;

  with incoming as materialized (
    select *
    from pg_catalog.jsonb_to_recordset(_jobs) as job_row(
      company_slug text,
      title text,
      slug text,
      summary text,
      description text,
      requirements text,
      responsibilities text,
      job_type text,
      workplace_mode text,
      district text,
      published_at timestamptz,
      expires_at timestamptz,
      source text,
      source_job_id text,
      source_published_at timestamptz,
      source_expires_at timestamptz,
      source_updated_at timestamptz
    )
  ),
  inserted_jobs as (
    insert into public.jobs (
      company_id,
      created_by,
      title,
      slug,
      summary,
      description,
      requirements,
      responsibilities,
      job_type,
      workplace_mode,
      district,
      status,
      reviewed_by,
      reviewed_at,
      published_at,
      expires_at,
      publication_source
    )
    select
      company_row.id,
      null,
      incoming.title,
      incoming.slug,
      incoming.summary,
      incoming.description,
      coalesce(incoming.requirements, ''),
      coalesce(incoming.responsibilities, ''),
      incoming.job_type,
      incoming.workplace_mode,
      incoming.district,
      'published',
      null,
      null,
      incoming.published_at,
      incoming.expires_at,
      'source_site'
    from incoming
    join public.companies as company_row
      on company_row.slug = incoming.company_slug
    returning id, company_id, slug
  ),
  inserted_imports as (
    insert into public.job_source_imports (
      job_id,
      source,
      source_job_id,
      source_published_at,
      source_expires_at,
      source_updated_at
    )
    select
      inserted_jobs.id,
      incoming.source,
      incoming.source_job_id,
      incoming.source_published_at,
      incoming.source_expires_at,
      incoming.source_updated_at
    from inserted_jobs
    join incoming
      on incoming.slug = inserted_jobs.slug
    join public.companies as company_row
      on company_row.id = inserted_jobs.company_id
     and company_row.slug = incoming.company_slug
    returning job_id
  )
  select pg_catalog.count(*)::integer
  into v_import_count
  from inserted_imports;

  if v_import_count <> v_job_count then
    raise exception 'The source catalogue was only partially inserted (% of %).',
      v_import_count, v_job_count
      using errcode = '23514';
  end if;

  insert into public.job_source_snapshots (
    source,
    source_job_id,
    content_hash,
    first_seen_at,
    last_changed_at
  )
  select
    snapshot_row.source,
    snapshot_row.source_job_id,
    snapshot_row.content_hash,
    snapshot_row.first_seen_at,
    snapshot_row.last_changed_at
  from pg_catalog.jsonb_to_recordset(_snapshots) as snapshot_row(
    source text,
    source_job_id text,
    content_hash text,
    first_seen_at timestamptz,
    last_changed_at timestamptz
  )
  on conflict (source, source_job_id) do update
    set content_hash = excluded.content_hash,
        first_seen_at = excluded.first_seen_at,
        last_changed_at = excluded.last_changed_at;
  get diagnostics v_snapshot_count = row_count;

  if v_snapshot_count <> v_job_count then
    raise exception 'The source change ledger was only partially updated (% of %).',
      v_snapshot_count, v_job_count
      using errcode = '23514';
  end if;

  delete from public.job_source_snapshots as stored_snapshot
  where not exists (
    select 1
    from pg_catalog.jsonb_to_recordset(_snapshots) as snapshot_row(
      source text,
      source_job_id text
    )
    where snapshot_row.source = stored_snapshot.source
      and snapshot_row.source_job_id = stored_snapshot.source_job_id
  );

  delete from public.companies as source_company
  where source_company.slug like 'source-%'
    and not exists (
      select 1
      from public.jobs as remaining_job
      where remaining_job.company_id = source_company.id
    )
    and not exists (
      select 1
      from public.company_members as member_row
      where member_row.company_id = source_company.id
    )
    and not exists (
      select 1
      from public.company_job_package_assignments as assignment_row
      where assignment_row.company_id = source_company.id
    )
    and not exists (
      select 1
      from public.company_profile_submissions as submission_row
      where submission_row.company_id = source_company.id
    );
  get diagnostics v_deleted_company_count = row_count;

  return pg_catalog.jsonb_build_object(
    'companies', v_company_count,
    'jobs', v_import_count,
    'deleted_jobs', v_deleted_job_count,
    'snapshots', v_snapshot_count,
    'deleted_companies', v_deleted_company_count
  );
end;
$$;

revoke all on function public.replace_source_job_catalogue(jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.replace_source_job_catalogue(jsonb, jsonb, jsonb)
  to service_role;

commit;
