begin;

-- Company-name search parity between the listing and the homepage preview.
--
-- `search_public_jobs` matches a query against the search vector *or* the
-- company name; `search_public_job_previews` only matched the search vector.
-- A visitor who typed a company name on the homepage therefore saw an empty
-- board while the /jobs listing found that company's vacancies. These
-- assertions pin that a company-name query returns the same jobs on both
-- public entry points, and that a literal `%`/`_` is not treated as a wildcard
-- (the two RPCs escape identically).
--
-- The local stack seeds real source listings (supabase/seed-source-jobs.sql)
-- before this suite runs. The assertions below define their own fixtures, so
-- remove any committed source data first; the transaction rolls back, leaving
-- the seed intact for the E2E run that follows.
delete from public.job_source_imports;
delete from public.jobs where publication_source = 'source_site';
delete from public.companies where slug like 'source-%';

select plan(8);

insert into auth.users (id, email, raw_user_meta_data)
values ('94000000-0000-4000-8000-0000000000c1', 'company-search-owner@example.test',
        '{"display_name":"Company Search Owner"}');

insert into public.companies (id, name, slug, verification_status)
values ('95000000-0000-4000-8000-0000000000c1', 'Kuzeykent Yazılım',
        'kuzeykent-yazilim', 'verified');

insert into public.company_members (company_id, user_id, membership_role)
values ('95000000-0000-4000-8000-0000000000c1',
        '94000000-0000-4000-8000-0000000000c1', 'owner');

-- The company name token ("Kuzeykent") appears nowhere in the job text, so the
-- only way either RPC can return this row for the query is by matching the
-- company name.
insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at, publication_source
)
values (
  '96000000-0000-4000-8000-0000000000c1',
  '95000000-0000-4000-8000-0000000000c1',
  '94000000-0000-4000-8000-0000000000c1',
  'Frontend Developer', 'company-search-frontend-developer',
  'React ile arayüz geliştirecek geliştirici aranıyor.',
  'React ve TypeScript ile arayüz geliştirecek geliştirici aranıyor; tam zamanlı.',
  'full_time', 'on_site', 'Lefkoşa', 'published',
  '94000000-0000-4000-8000-0000000000c1', now(),
  now() - interval '1 day', now() + interval '30 days', 'platform'
);

set local role anon;

-- 1. The listing finds the job by company name alone.
select ok(
  exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.search_public_jobs('Kuzeykent', null, null, null, 1)->'jobs'
    ) as job
    where job->>'slug' = 'company-search-frontend-developer'
  ),
  'the listing RPC matches a job by its company name'
);

-- 2. The preview finds the same job by company name (the regression).
select ok(
  exists (
    select 1
    from public.search_public_job_previews('Kuzeykent', null, null, null, 1) as p
    where p.job_title = 'Frontend Developer'
      and p.company_name = 'Kuzeykent Yazılım'
  ),
  'the preview RPC matches a job by its company name'
);

-- 3. Both RPCs agree on the total for a company-name query.
select is(
  (public.search_public_jobs('Kuzeykent', null, null, null, 1)->>'total')::integer,
  (
    select pg_catalog.max(p.total_count)::integer
    from public.search_public_job_previews('Kuzeykent', null, null, null, 1) as p
  ),
  'the listing and preview agree on the total for a company-name query'
);

-- 4. `ilike` is case-insensitive on the preview too.
select ok(
  exists (
    select 1
    from public.search_public_job_previews('kuzeykent', null, null, null, 1) as p
    where p.job_title = 'Frontend Developer'
  ),
  'the preview RPC folds case on a company-name query'
);

-- 5. A query that matches neither the job text nor the company name returns
--    nothing from the preview (the company clause did not match everything).
select is(
  (
    select pg_catalog.max(p.total_count)::integer
    from public.search_public_job_previews('zzzzznomatch', null, null, null, 1) as p
  ),
  0,
  'an unmatched query returns no preview rows'
);

-- 6. A literal `%` is not a wildcard: the preview total equals the listing
--    total, and neither counts every job.
select is(
  (
    select pg_catalog.max(p.total_count)::integer
    from public.search_public_job_previews('%', null, null, null, 1) as p
  ),
  (public.search_public_jobs('%', null, null, null, 1)->>'total')::integer,
  'a literal percent sign is escaped identically on both RPCs'
);

-- 7. A literal `_` is not a single-character wildcard either.
select is(
  (
    select pg_catalog.max(p.total_count)::integer
    from public.search_public_job_previews('_', null, null, null, 1) as p
  ),
  (public.search_public_jobs('_', null, null, null, 1)->>'total')::integer,
  'a literal underscore is escaped identically on both RPCs'
);

-- 8. The seeded job is still returned by its own title (no regression on the
--    vector path).
select ok(
  exists (
    select 1
    from public.search_public_job_previews('developer', null, null, null, 1) as p
    where p.job_title = 'Frontend Developer'
  ),
  'the preview RPC still matches on the job text'
);

reset role;
select * from finish();

rollback;
