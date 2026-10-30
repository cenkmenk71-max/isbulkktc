begin;

-- `modified_at` is the truthful change instant the JSON-LD `dateModified` and
-- the sitemap `lastmod` depend on. It has three sources, and getting one wrong
-- silently publishes a date that never happened, so each is pinned here.
--
-- The local stack seeds real source listings before this suite runs; remove any
-- committed source data first and let the transaction roll back, leaving the
-- seed intact for the E2E run that follows.
delete from public.job_source_imports;
delete from public.jobs where publication_source = 'source_site';
delete from public.companies where slug like 'source-%';

select plan(11);

insert into auth.users (id, email, raw_user_meta_data)
values ('95000000-0000-4000-8000-000000000001', 'modified-owner@example.test',
        '{"display_name":"Modified Owner"}');

insert into public.companies (id, name, slug, verification_status)
values
  ('96000000-0000-4000-8000-000000000001', 'Modified Platform Co',
   'modified-platform-co', 'verified'),
  ('96000000-0000-4000-8000-000000000002', 'Modified Source Co',
   'source-modified-source-co', 'pending');

insert into public.company_members (company_id, user_id, membership_role)
values ('96000000-0000-4000-8000-000000000001',
        '95000000-0000-4000-8000-000000000001', 'owner');

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at, publication_source
)
values
  (
    '97000000-0000-4000-8000-000000000001',
    '96000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001',
    'Modified Platform Role', 'modified-platform-role',
    'A platform listing whose employer edit time is the modification instant.',
    'A platform listing whose employer edit time is the modification instant here.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    '95000000-0000-4000-8000-000000000001', now(),
    now() - interval '10 days', now() + interval '30 days', 'platform'
  ),
  (
    '97000000-0000-4000-8000-000000000002',
    '96000000-0000-4000-8000-000000000002',
    null,
    'Modified Upstream Role', 'modified-upstream-role',
    'A source listing that publishes a real upstream modification date.',
    'A source listing that publishes a real upstream modification date here.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    null, null,
    now() - interval '10 days', now() + interval '30 days', 'source_site'
  ),
  (
    '97000000-0000-4000-8000-000000000003',
    '96000000-0000-4000-8000-000000000002',
    null,
    'Modified Unstamped Role', 'modified-unstamped-role',
    'A source listing with no upstream modification date at all.',
    'A source listing with no upstream modification date at all in this suite.',
    'full_time', 'on_site', 'Lefkoşa', 'published',
    null, null,
    now() - interval '10 days', now() + interval '30 days', 'source_site'
  );

insert into public.job_source_imports (
  job_id, source, source_job_id, source_published_at, source_expires_at,
  source_updated_at
)
values
  (
    '97000000-0000-4000-8000-000000000002', 'iskibris', '9701',
    now() - interval '10 days', now() + interval '30 days',
    now() - interval '2 days'
  ),
  (
    '97000000-0000-4000-8000-000000000003', 'isbulkibris',
    '97000000-0000-4000-8000-000000000903',
    now() - interval '10 days', now() + interval '30 days',
    null
  );

-- A platform listing reports the employer's edit time, not its publication or
-- the moment this test ran.
select ok(
  (public.get_public_job_details('modified-platform-role')->>'modified_at')::timestamptz
    = (select updated_at from public.jobs where slug = 'modified-platform-role'),
  'a platform listing reports jobs.updated_at as modified_at'
);

select isnt(
  public.get_public_job_details('modified-platform-role')->>'modified_at',
  public.get_public_job_details('modified-platform-role')->>'published_at',
  'a platform listing modified after publication is not reported as unmodified'
);

-- An imported listing with a real upstream date reports that date.
select ok(
  (public.get_public_job_details('modified-upstream-role')->>'modified_at')::timestamptz
    = (select source_updated_at from public.job_source_imports
        where job_id = '97000000-0000-4000-8000-000000000002'),
  'an imported listing reports its upstream modification date'
);

-- With no upstream date the listing degrades to its publication instant rather
-- than to now(), so an untouched listing never looks freshly modified.
select is(
  public.get_public_job_details('modified-unstamped-role')->>'modified_at',
  public.get_public_job_details('modified-unstamped-role')->>'published_at',
  'an unstamped imported listing falls back to its publication instant'
);

-- dateModified must never precede datePosted: Google Jobs rejects it.
select ok(
  (public.get_public_job_details('modified-platform-role')->>'modified_at')::timestamptz
    >= (public.get_public_job_details('modified-platform-role')->>'published_at')::timestamptz,
  'modified_at is never earlier than published_at for a platform listing'
);

select ok(
  (public.get_public_job_details('modified-upstream-role')->>'modified_at')::timestamptz
    >= (public.get_public_job_details('modified-upstream-role')->>'published_at')::timestamptz,
  'modified_at is never earlier than published_at for an imported listing'
);

-- The search RPC exposes the same value so list/sitemap consumers agree with
-- the detail page.
select ok(
  (
    select (job->>'modified_at')::timestamptz
    from pg_catalog.jsonb_array_elements(
      public.search_public_jobs('upstream', null, null, null, 1)->'jobs'
    ) as job
    where job->>'slug' = 'modified-upstream-role'
  ) = (select source_updated_at from public.job_source_imports
        where job_id = '97000000-0000-4000-8000-000000000002'),
  'the search RPC reports the same modified_at as the detail RPC'
);

-- The provenance constraint rejects a modification that precedes publication.
select throws_ok(
  $$
    insert into public.job_source_imports (
      job_id, source, source_job_id, source_published_at, source_expires_at,
      source_updated_at
    ) values (
      '97000000-0000-4000-8000-000000000001', 'iskibris', '9702',
      now(), now() + interval '30 days', now() - interval '1 day'
    )
  $$,
  '23514',
  null,
  'a modification that precedes the upstream publication is rejected'
);

-- The change ledger keeps one row per upstream listing and rejects a bad hash.
select throws_ok(
  $$
    insert into public.job_source_snapshots (source, source_job_id, content_hash)
    values ('isbulkibris', '9703', 'not-a-sha256')
  $$,
  '23514',
  null,
  'the change ledger rejects a content hash that is not a sha256'
);

select lives_ok(
  $$
    insert into public.job_source_snapshots (source, source_job_id, content_hash)
    values ('isbulkibris', '9704', repeat('a', 64))
  $$,
  'the change ledger accepts a well-formed sha256 fingerprint'
);

select has_column(
  'public', 'job_source_imports', 'source_updated_at',
  'the provenance table carries the upstream modification instant'
);

select * from finish();

rollback;
