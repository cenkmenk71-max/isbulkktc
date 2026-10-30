begin;

-- The local stack seeds real source listings (supabase/seed-source-jobs.sql)
-- before this suite runs. The assertions below define their own fixtures, so
-- remove any committed source data first; the transaction rolls back, leaving
-- the seed intact for the E2E run that follows.
delete from public.job_source_imports;
delete from public.jobs where publication_source = 'source_site';
delete from public.companies where slug like 'source-%';

select plan(25);

insert into auth.users (id, email, raw_user_meta_data)
values ('91000000-0000-4000-8000-000000000001', 'integrity-owner@example.test',
        '{"display_name":"Integrity Owner"}');

insert into public.companies (id, name, slug, verification_status)
values
  ('92000000-0000-4000-8000-000000000001', 'Integrity Platform Co',
   'integrity-platform-co', 'verified'),
  ('92000000-0000-4000-8000-000000000002', 'Integrity Source Co',
   'source-integrity-source-co', 'pending');

insert into public.company_members (company_id, user_id, membership_role)
values ('92000000-0000-4000-8000-000000000001',
        '91000000-0000-4000-8000-000000000001', 'owner');

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at, publication_source
)
values
  (
    '93000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    '91000000-0000-4000-8000-000000000001',
    'Integrity Platform Role', 'integrity-platform-role',
    'A platform listing used to anchor the public visibility assertions.',
    'A platform listing used to anchor the public visibility assertions in this suite.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '91000000-0000-4000-8000-000000000001', now(),
    now() - interval '1 day', now() + interval '30 days', 'platform'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    null,
    'Integrity Mapped Source Role', 'integrity-mapped-source-role',
    'A source listing with valid provenance used by the visibility assertions.',
    'A source listing with valid provenance used by the visibility assertions here.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    null, null,
    now() - interval '1 day', now() + interval '30 days', 'source_site'
  ),
  (
    '93000000-0000-4000-8000-000000000003',
    '92000000-0000-4000-8000-000000000002',
    null,
    'Integrity Unmapped Source Role', 'integrity-unmapped-source-role',
    'A published source listing that has no provenance row at all.',
    'A published source listing that has no provenance row at all in this suite.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    null, null,
    now() - interval '1 day', now() + interval '30 days', 'source_site'
  ),
  (
    '93000000-0000-4000-8000-000000000004',
    '92000000-0000-4000-8000-000000000002',
    null,
    'Integrity Stale Source Role', 'integrity-stale-source-role',
    'A source listing whose provenance window already closed upstream.',
    'A source listing whose provenance window already closed upstream in this suite.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    null, null,
    now() - interval '30 days', now() + interval '30 days', 'source_site'
  );

insert into public.job_source_imports (
  job_id, source, source_job_id, source_published_at, source_expires_at
)
values
  (
    '93000000-0000-4000-8000-000000000002', 'isbulkibris',
    '30000000-0000-4000-8000-000000000901',
    now() - interval '1 day', now() + interval '30 days'
  ),
  (
    '93000000-0000-4000-8000-000000000004', 'iskibris', '901',
    now() - interval '30 days', now() - interval '1 day'
  );

set local role anon;

select is(
  (public.search_public_jobs('Integrity Mapped Source Role', null, null, null, 1)->>'total')::integer,
  1,
  'a source listing with valid provenance is publicly visible'
);

select is(
  (public.search_public_jobs('Integrity Unmapped Source Role', null, null, null, 1)->>'total')::integer,
  0,
  'a published source listing without a provenance row is never publicly visible'
);

select is(
  public.get_public_job_details('integrity-unmapped-source-role'),
  null::jsonb,
  'the public detail RPC hides an unattributed source listing'
);

select is(
  (public.search_public_jobs('Integrity Stale Source Role', null, null, null, 1)->>'total')::integer,
  0,
  'a source listing whose provenance window closed upstream is hidden even when the platform window is open'
);

select is(
  public.get_public_job_details('integrity-stale-source-role'),
  null::jsonb,
  'the public detail RPC honours the upstream provenance window, not just the platform expiry'
);

reset role;

-- An unattributed source listing is invisible, yet it still holds its unique
-- (company_id, slug) slot. This documents the operational consequence so the
-- importer's purge-then-insert ordering stays load-bearing.
select ok(
  exists (
    select 1 from public.jobs
    where slug = 'integrity-unmapped-source-role'
      and publication_source = 'source_site'
  ),
  'an unattributed source listing still occupies its slug even though it is unlisted'
);

select is(
  (
    select count(*)::integer
    from public.jobs as j
    where j.publication_source = 'source_site'
      and not exists (
        select 1 from public.job_source_imports as i where i.job_id = j.id
      )
  ),
  1,
  'the unmapped-source detector finds exactly the fixture without provenance'
);

select is(
  (
    select count(*)::integer
    from public.job_source_imports as i
    left join public.jobs as j on j.id = i.job_id
    where j.id is null
  ),
  0,
  'no provenance row can point at a missing job'
);

select is(
  (
    select count(*)::integer
    from public.companies as c
    where c.slug like 'source-%'
      and not exists (select 1 from public.jobs as j where j.company_id = c.id)
  ),
  0,
  'every source employer keeps at least one listing'
);

-- Least-privilege audit: tables that are reachable only through SECURITY
-- DEFINER RPCs must expose no direct grant to the client roles.
select ok(
  not has_table_privilege('anon', 'public.audit_logs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
  and not has_table_privilege('anon', 'public.application_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.application_events', 'SELECT')
  and not has_table_privilege('anon', 'public.application_contact_shares', 'SELECT')
  and not has_table_privilege('authenticated', 'public.application_contact_shares', 'SELECT'),
  'audit, event and contact-share tables grant nothing to anon or authenticated'
);

select ok(
  not has_table_privilege('anon', 'public.notification_email_outbox', 'SELECT')
  and not has_table_privilege('authenticated', 'public.notification_email_outbox', 'SELECT')
  and not has_table_privilege('anon', 'public.company_job_package_assignments', 'SELECT')
  and not has_table_privilege('authenticated', 'public.company_job_package_assignments', 'SELECT')
  and not has_table_privilege('anon', 'public.job_source_imports', 'SELECT')
  and not has_table_privilege('authenticated', 'public.job_source_imports', 'SELECT'),
  'outbox, package-assignment and provenance tables grant nothing to anon or authenticated'
);

select ok(
  has_table_privilege('service_role', 'public.notification_email_outbox', 'SELECT')
  and has_table_privilege('service_role', 'public.notification_email_outbox', 'UPDATE'),
  'the notification worker role keeps the access it needs'
);

-- Every public table must have RLS enabled; the audit found no exceptions, and
-- this keeps it that way as new tables land.
select is(
  (
    select count(*)::integer
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  0,
  'row level security is enabled on every public table'
);

select is(
  (
    select count(*)::integer
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
        where cfg like 'search_path=%'
      )
  ),
  0,
  'every SECURITY DEFINER function pins its search_path'
);

-- The requested index audit, pinned so a refactor cannot silently drop them.
select has_index(
  'public', 'jobs', 'jobs_public_filters_idx',
  array['district', 'job_type', 'workplace_mode', 'published_at'],
  'the published filter index survives'
);

select has_index(
  'public', 'jobs', 'jobs_public_latest_idx',
  array['published_at'],
  'the unfiltered latest-jobs listing keeps its index'
);

select has_index(
  'public', 'jobs', 'jobs_company_status_idx',
  array['company_id', 'status', 'created_at'],
  'the company/status index survives'
);

select has_index(
  'public', 'job_source_imports', 'job_source_imports_pkey',
  array['job_id'],
  'provenance lookups by job_id use the primary key'
);

select has_index(
  'public', 'companies', 'companies_slug_key', array['slug'],
  'employer slug lookups use the unique index'
);

select index_is_unique(
  'public', 'companies', 'companies_slug_key',
  'employer slugs stay unique'
);

-- publication_source is deliberately left unindexed: it is low cardinality and
-- one value dominates the catalogue, so a btree would not be chosen. This guard
-- records the decision rather than leaving it to drift.
select hasnt_index(
  'public', 'jobs', 'jobs_publication_source_idx',
  'no redundant index is added for the low-cardinality publication_source column'
);

select has_index(
  'public', 'jobs', 'jobs_public_search_idx',
  'the full-text search index survives'
);

-- A NOT VALID check constraint still guards new writes but silently skips every
-- pre-existing row, so a constraint left NOT VALID is weaker than it looks.
-- The district constraints were declared NOT VALID for the Gazimağusa -> Mağusa
-- rewrite and then validated in 20261023110000; keep them validated.
select is(
  (
    select count(*)::integer
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'c'
      and not convalidated
  ),
  0,
  'no public check constraint is left NOT VALID'
);

select ok(
  not has_function_privilege(
    'anon', 'public.is_public_source_job(uuid)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.claim_notification_email_outbox(integer)', 'EXECUTE'
  ),
  'internal provenance and worker helpers stay unreachable to anonymous visitors'
);

select ok(
  has_function_privilege(
    'anon', 'public.search_public_jobs(text,text,text,text,integer)', 'EXECUTE'
  )
  and has_function_privilege(
    'anon', 'public.get_public_job_details(text)', 'EXECUTE'
  ),
  'the intended public read RPCs stay executable by anonymous visitors'
);

reset role;
select * from finish();

rollback;
