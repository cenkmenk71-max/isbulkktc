begin;

select plan(19);

set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';

select ok(
  not has_function_privilege(
    'anon',
    'public.replace_source_job_catalogue(jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'anonymous visitors cannot replace the source catalogue'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.replace_source_job_catalogue(jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot replace the source catalogue'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.replace_source_job_catalogue(jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'the service-role worker can replace the source catalogue'
);

-- Existing source data that must survive a failed replacement.
insert into public.companies (
  id, name, slug, verification_status, profile_description, categories
) values (
  'a1000000-0000-4000-8000-000000000001',
  'Atomic Old Co',
  'source-atomic-old-co',
  'pending',
  '',
  '{}'::text[]
);

insert into public.companies (
  id, name, slug, verification_status, profile_description, categories
) values (
  'a1000000-0000-4000-8000-000000000002',
  'Atomic Retained Co',
  'source-atomic-retained-co',
  'verified',
  '',
  '{}'::text[]
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'a3000000-0000-4000-8000-000000000001',
  'atomic-retained-owner@example.test',
  '{"display_name":"Atomic Retained Owner"}'
);

insert into public.company_members (company_id, user_id, membership_role)
values (
  'a1000000-0000-4000-8000-000000000002',
  'a3000000-0000-4000-8000-000000000001',
  'owner'
);

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at, publication_source
) values (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  null,
  'Atomic Old Role',
  'atomic-old-role',
  'An old source listing summary with enough characters.',
  'An old source listing description with comfortably more than fifty characters.',
  'full_time',
  'on_site',
  'Girne',
  'published',
  null,
  null,
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '30 days',
  'source_site'
);

insert into public.job_source_imports (
  job_id, source, source_job_id, source_published_at, source_expires_at,
  source_updated_at
) values (
  'a2000000-0000-4000-8000-000000000001',
  'iskibris',
  '990001',
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '30 days',
  pg_catalog.now() - interval '12 hours'
);

insert into public.job_source_snapshots (
  source, source_job_id, content_hash, first_seen_at, last_changed_at
) values (
  'iskibris',
  '990001',
  pg_catalog.repeat('a', 64),
  pg_catalog.now() - interval '2 days',
  pg_catalog.now() - interval '1 day'
);

-- A database constraint failure happens after the function has upserted the
-- new company and deleted old source jobs. The function call must roll back all
-- of those earlier writes, not leave an empty or half-rebuilt catalogue.
select throws_ok(
  $$
    select public.replace_source_job_catalogue(
      pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'name', 'Atomic New Co',
          'slug', 'source-atomic-new-co',
          'profile_description', '',
          'categories', '[]'::jsonb,
          'website', null,
          'municipality', null,
          'source_profile_url', null,
          'logo_url', null
        ),
        pg_catalog.jsonb_build_object(
          'name', 'Atomic Retained Co',
          'slug', 'source-atomic-retained-co',
          'profile_description', '',
          'categories', '[]'::jsonb,
          'website', null,
          'municipality', null,
          'source_profile_url', null,
          'logo_url', null
        )
      ),
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'company_slug', 'source-atomic-new-co',
        'title', 'Atomic New Role',
        'slug', 'atomic-new-role',
        'summary', 'A valid summary with enough characters.',
        'description', 'A valid description that comfortably exceeds fifty characters.',
        'requirements', '',
        'responsibilities', '',
        'job_type', 'not_a_job_type',
        'workplace_mode', 'on_site',
        'district', 'Girne',
        'published_at', pg_catalog.now() - interval '1 day',
        'expires_at', pg_catalog.now() + interval '30 days',
        'source', 'iskibris',
        'source_job_id', '990002',
        'source_published_at', pg_catalog.now() - interval '1 day',
        'source_expires_at', pg_catalog.now() + interval '30 days',
        'source_updated_at', pg_catalog.now() - interval '12 hours'
      )),
      pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'source', 'iskibris',
        'source_job_id', '990002',
        'content_hash', pg_catalog.repeat('b', 64),
        'first_seen_at', pg_catalog.now() - interval '1 day',
        'last_changed_at', pg_catalog.now() - interval '12 hours'
      ))
    )
  $$,
  '23514',
  null,
  'a failed listing insert aborts the whole catalogue replacement'
);

select ok(
  exists (
    select 1 from public.jobs
    where id = 'a2000000-0000-4000-8000-000000000001'
  ),
  'the previous source job survives a failed replacement'
);

select ok(
  exists (
    select 1 from public.job_source_imports
    where job_id = 'a2000000-0000-4000-8000-000000000001'
  ),
  'the previous source mapping survives a failed replacement'
);

select ok(
  exists (
    select 1 from public.companies
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  'the previous source company survives a failed replacement'
);

select ok(
  not exists (
    select 1 from public.companies
    where slug = 'source-atomic-new-co'
  ),
  'the newly upserted company is rolled back with the failed replacement'
);

-- A valid replacement atomically swaps the previous catalogue for the new
-- company, listing, provenance row and change-ledger snapshot.
select is(
  public.replace_source_job_catalogue(
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'name', 'Atomic New Co',
        'slug', 'source-atomic-new-co',
        'profile_description', '',
        'categories', '[]'::jsonb,
        'website', null,
        'municipality', null,
        'source_profile_url', null,
        'logo_url', null
      ),
      pg_catalog.jsonb_build_object(
        'name', 'Atomic Retained Co',
        'slug', 'source-atomic-retained-co',
        'profile_description', '',
        'categories', '[]'::jsonb,
        'website', null,
        'municipality', null,
        'source_profile_url', null,
        'logo_url', null
      )
      ),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'company_slug', 'source-atomic-new-co',
      'title', 'Atomic New Role',
      'slug', 'atomic-new-role',
      'summary', 'A valid summary with enough characters.',
      'description', 'A valid description that comfortably exceeds fifty characters.',
      'requirements', '',
      'responsibilities', '',
      'job_type', 'full_time',
      'workplace_mode', 'on_site',
      'district', 'Girne',
      'published_at', pg_catalog.now() - interval '1 day',
      'expires_at', pg_catalog.now() + interval '30 days',
      'source', 'iskibris',
      'source_job_id', '990002',
      'source_published_at', pg_catalog.now() - interval '1 day',
      'source_expires_at', pg_catalog.now() + interval '30 days',
      'source_updated_at', pg_catalog.now() - interval '12 hours'
    )),
    pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'source', 'iskibris',
      'source_job_id', '990002',
      'content_hash', pg_catalog.repeat('b', 64),
      'first_seen_at', pg_catalog.now() - interval '1 day',
      'last_changed_at', pg_catalog.now() - interval '12 hours'
    ))
  )->>'jobs',
  '1',
  'the atomic replacement reports the complete imported listing count'
);

select ok(
  not exists (
    select 1 from public.jobs
    where id = 'a2000000-0000-4000-8000-000000000001'
  ),
  'the old source job is removed after a successful replacement'
);

select ok(
  not exists (
    select 1 from public.job_source_imports
    where job_id = 'a2000000-0000-4000-8000-000000000001'
  ),
  'the old source mapping is removed after a successful replacement'
);

select ok(
  not exists (
    select 1 from public.companies
    where id = 'a1000000-0000-4000-8000-000000000001'
  ),
  'an orphaned old source company is removed after replacement'
);

select ok(
  exists (
    select 1 from public.jobs as job
    join public.companies as company on company.id = job.company_id
    where job.slug = 'atomic-new-role'
      and company.slug = 'source-atomic-new-co'
      and job.publication_source = 'source_site'
      and job.status = 'published'
  ),
  'the new source listing is published under its matching source company'
);

select ok(
  exists (
    select 1 from public.job_source_imports
    where source = 'iskibris'
      and source_job_id = '990002'
      and source_updated_at is not null
  ),
  'the new listing provenance and modification timestamp are written'
);

select ok(
  exists (
    select 1 from public.job_source_snapshots
    where source = 'iskibris'
      and source_job_id = '990002'
      and content_hash = pg_catalog.repeat('b', 64)
  ),
  'the new content fingerprint is committed with the catalogue'
);

select ok(
  not exists (
    select 1 from public.job_source_snapshots
    where source = 'iskibris'
      and source_job_id = '990001'
  ),
  'stale change-ledger rows are removed only after successful replacement'
);

select ok(
  exists (
    select 1 from public.companies
    where slug = 'source-atomic-retained-co'
  ),
  'an otherwise orphaned source company with a member is retained'
);

select ok(
  (
    select verification_status = 'verified'
    from public.companies
    where slug = 'source-atomic-retained-co'
  ),
  'a source company verification decision is not reset during refresh'
);

-- The privilege grant is the first line of defence; the function body must
-- still reject an anonymous JWT if EXECUTE is accidentally re-granted later.
grant execute on function public.replace_source_job_catalogue(jsonb, jsonb, jsonb)
  to anon;
set local "request.jwt.claims" = '{"role":"anon","iss":"supabase"}';
set local role anon;

select throws_ok(
  $$
    select public.replace_source_job_catalogue(
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  '42501',
  null,
  'the worker RPC re-checks auth.role() even if anon receives EXECUTE'
);

reset role;

select * from finish();

rollback;
