begin;

-- Accent-insensitive public job search.
--
-- Turkish job titles and place names carry diacritics ("İnşaat mühendisi",
-- "Mağaza", "Mağusa") while visitors type the ASCII spelling. Before the fix the
-- query side and the stored vector both used `pg_catalog.simple`, which folds
-- case but not accents, so an ASCII query matched nothing: the listing rendered
-- an empty board and answered `noindex`. These assertions pin that both
-- spellings now fold to the same token, on the index and on the query, so the
-- noindex-excluded URLs stop being produced.
--
-- The local stack seeds real source listings before this suite runs; remove any
-- committed source data first and let the transaction roll back, leaving the
-- seed intact for the E2E run that follows.
delete from public.job_source_imports;
delete from public.jobs where publication_source = 'source_site';
delete from public.companies where slug like 'source-%';

select plan(11);

select has_extension('unaccent', 'the unaccent extension is installed');

select ok(
  exists (
    select 1
    from pg_catalog.pg_ts_config as c
    join pg_catalog.pg_namespace as n on n.oid = c.cfgnamespace
    where n.nspname = 'public' and c.cfgname = 'job_search_unaccent'
  ),
  'the shared accent-folding text search configuration exists'
);

select ok(
  (
    select pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    from pg_catalog.pg_attrdef as d
    join pg_catalog.pg_attribute as a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = 'public.jobs'::pg_catalog.regclass
      and a.attname = 'search_vector'
  ) like '%job_search_unaccent%',
  'the stored search vector is generated through the accent-folding configuration'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'jobs_public_search_idx'
  ),
  'the GIN search index survives the expression change'
);

select is(
  pg_catalog.websearch_to_tsquery(
    'public.job_search_unaccent'::pg_catalog.regconfig, 'insaat'
  )::text,
  pg_catalog.websearch_to_tsquery(
    'public.job_search_unaccent'::pg_catalog.regconfig, 'inşaat'
  )::text,
  'ASCII and accented queries fold to the same tsquery'
);

insert into auth.users (id, email, raw_user_meta_data)
values ('94000000-0000-4000-8000-000000000001', 'unaccent-owner@example.test',
        '{"display_name":"Unaccent Owner"}');

insert into public.companies (id, name, slug, verification_status)
values ('95000000-0000-4000-8000-000000000001', 'Unaccent Co',
        'unaccent-co', 'verified');

insert into public.company_members (company_id, user_id, membership_role)
values ('95000000-0000-4000-8000-000000000001',
        '94000000-0000-4000-8000-000000000001', 'owner');

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at, publication_source
)
values
  (
    '96000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'İnşaat Mühendisi', 'unaccent-insaat-muhendisi',
    'Şantiye deneyimi olan inşaat mühendisi aranıyor.',
    'Şantiye deneyimi olan inşaat mühendisi aranıyor; başvurular Lefkoşa ofisine yapılır.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '94000000-0000-4000-8000-000000000001', now(),
    now() - interval '1 day', now() + interval '30 days', 'platform'
  ),
  (
    '96000000-0000-4000-8000-000000000002',
    '95000000-0000-4000-8000-000000000001',
    '94000000-0000-4000-8000-000000000001',
    'Mağaza Satış Temsilcisi', 'unaccent-magaza-satis',
    'Mağaza içinde müşteri karşılayacak satış temsilcisi aranıyor.',
    'Mağaza içinde müşteri karşılayacak satış temsilcisi aranıyor; tam zamanlı pozisyon.',
    'full_time', 'on_site', 'Mağusa', 'published',
    '94000000-0000-4000-8000-000000000001', now(),
    now() - interval '1 day', now() + interval '30 days', 'platform'
  );

set local role anon;

-- Absolute totals are not asserted: the platform seed may contain accented
-- words too. Symmetry plus per-slug presence pins the behaviour without
-- depending on how much seed data happens to match.
select is(
  (public.search_public_jobs('insaat', null, null, null, 1)->>'total')::integer,
  (public.search_public_jobs('inşaat', null, null, null, 1)->>'total')::integer,
  'an ASCII query matches as many jobs as its accented spelling'
);

select ok(
  exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.search_public_jobs('insaat', null, null, null, 1)->'jobs'
    ) as job
    where job->>'slug' = 'unaccent-insaat-muhendisi'
  ),
  'the ASCII spelling finds the job whose title carries a dotted capital İ'
);

select ok(
  exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.search_public_jobs('magaza', null, null, null, 1)->'jobs'
    ) as job
    where job->>'slug' = 'unaccent-magaza-satis'
  ),
  'an ASCII query folds the cedilla in the job title'
);

select ok(
  exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.search_public_jobs('musteri', null, null, null, 1)->'jobs'
    ) as job
    where job->>'slug' = 'unaccent-magaza-satis'
  ),
  'an ASCII query folds the accents inside the job body text'
);

select ok(
  exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      public.search_public_jobs('inşaat', null, null, null, 1)->'jobs'
    ) as job
    where job->>'slug' = 'unaccent-insaat-muhendisi'
  ),
  'the accented spelling keeps matching after the change'
);

select is(
  (
    select pg_catalog.max(p.total_count)::integer
    from public.search_public_job_previews('magaza', null, null, null, 1) as p
  ),
  (
    select pg_catalog.max(p.total_count)::integer
    from public.search_public_job_previews('mağaza', null, null, null, 1) as p
  ),
  'the preview RPC folds accents on the query side too'
);

reset role;
select * from finish();

rollback;
