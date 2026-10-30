begin;

-- Pins the companies.url check constraints against the exact values the source
-- importers write. Two shapes used to slip through the TypeScript sanitizers and
-- only failed at the database, taking the whole import batch down with them.
select plan(13);

insert into public.companies (id, name, slug, verification_status)
values ('94000000-0000-4000-8000-000000000001', 'Constraint Probe Co',
        'constraint-probe-co', 'pending');

-- Accepted: the shapes the sanitizers are expected to emit.
select lives_ok(
  $$update public.companies
       set source_profile_url = 'https://www.iskibris.com/companies/2334'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  'a numeric iskibris company profile URL is accepted'
);

select lives_ok(
  $$update public.companies
       set source_profile_url = 'https://isbulkibris.com/firmalar/parvistamare-development'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  'a slugged isbulkibris company profile URL is accepted'
);

select lives_ok(
  $$update public.companies
       set logo_url = 'https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  'a UUID employer logo URL is accepted'
);

select lives_ok(
  $$update public.companies
       set logo_url = 'https://innovia-iskibris.s3.eu-west-2.amazonaws.com/49419_635fd4d64828e.png'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  'a stripped iskibris CDN logo URL is accepted'
);

-- Rejected: the shapes the sanitizers must never emit.
select throws_ok(
  $$update public.companies
       set source_profile_url = 'https://www.iskibris.com/companies/'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an iskibris profile URL without a company id is rejected'
);

select throws_ok(
  $$update public.companies
       set logo_url = 'https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3?w=100'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an employer logo URL carrying a query string is rejected'
);

select throws_ok(
  $$update public.companies
       set logo_url = 'https://innovia-iskibris.s3.eu-west-2.amazonaws.com/49419_635fd4d64828e-thumb.png'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an employer logo URL with a bare -thumb suffix is rejected'
);

select lives_ok(
  $$update public.companies
       set logo_url = 'https://innovia-iskibris.s3.eu-west-2.amazonaws.com/49419_635fd4d64828e-thumb@2.png'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  'a sized -thumb@2 logo URL is still accepted by the constraint'
);

select throws_ok(
  $$update public.companies
       set logo_url = 'https://innovia-iskibris.s3.eu-west-2.amazonaws.com/49419_635fd4d64828e.gif'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an employer logo URL with an unsupported extension is rejected'
);

select throws_ok(
  $$update public.companies
       set source_profile_url = 'https://evil.example.com/companies/2334'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'a company profile URL on an unapproved host is rejected'
);

select throws_ok(
  $$update public.companies
       set logo_url = 'https://evil.example.com/logo.png'
     where id = '94000000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'an employer logo URL on an unapproved host is rejected'
);

-- The importer writes source listings with no review metadata; the constraint
-- must keep accepting exactly that tuple.
insert into public.companies (id, name, slug, verification_status)
values ('94000000-0000-4000-8000-000000000002', 'Constraint Source Co',
        'source-constraint-source-co', 'pending');

select lives_ok(
  $$insert into public.jobs (
      company_id, created_by, title, slug, summary, description,
      job_type, workplace_mode, status, published_at, expires_at, publication_source
    ) values (
      '94000000-0000-4000-8000-000000000002', null, 'Constraint Source Role',
      'constraint-source-role',
      'A summary long enough to satisfy the twenty character minimum.',
      'A description long enough to satisfy the fifty character minimum used here.',
      'full_time', 'on_site', 'published',
      now() - interval '1 day', now() + interval '30 days', 'source_site'
    )$$,
  'an imported source listing without review metadata is accepted'
);

select throws_ok(
  $$insert into public.jobs (
      company_id, created_by, title, slug, summary, description,
      job_type, workplace_mode, status, published_at, expires_at, publication_source
    ) values (
      '94000000-0000-4000-8000-000000000002', null, 'Constraint Bad Source Role',
      'constraint-bad-source-role',
      'A summary long enough to satisfy the twenty character minimum.',
      'A description long enough to satisfy the fifty character minimum used here.',
      'full_time', 'on_site', 'published',
      now() - interval '1 day', now() + interval '30 days', 'platform'
    )$$,
  '23514',
  null,
  'a published platform listing without review metadata is rejected'
);

select * from finish();

rollback;
