begin;

-- The local stack seeds real source listings (supabase/seed-source-jobs.sql)
-- before this suite runs. The assertions below count only the fixtures defined
-- in this file, so remove any committed source data first; the transaction
-- rolls back, leaving the seed intact for the E2E run that follows.
delete from public.job_source_imports;
delete from public.jobs where publication_source = 'source_site';
delete from public.companies where slug like 'source-%';

select plan(70);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'candidate-a@example.test', '{"display_name":"Candidate A"}'),
  ('10000000-0000-4000-8000-000000000002', 'candidate-b@example.test', '{"display_name":"Candidate B"}'),
  ('10000000-0000-4000-8000-000000000003', 'company-a@example.test', '{"display_name":"Company A"}'),
  ('10000000-0000-4000-8000-000000000004', 'company-b@example.test', '{"display_name":"Company B"}'),
  ('10000000-0000-4000-8000-000000000005', 'admin@example.test', '{"display_name":"Admin"}');

insert into public.user_roles (user_id, role)
values ('10000000-0000-4000-8000-000000000005', 'platform_admin');

insert into public.candidate_profiles (user_id, headline)
values
  ('10000000-0000-4000-8000-000000000001', 'Candidate A'),
  ('10000000-0000-4000-8000-000000000002', 'Candidate B'),
  ('10000000-0000-4000-8000-000000000003', 'Company A owner applicant');

insert into public.companies (id, name, slug, verification_status)
values
  ('20000000-0000-4000-8000-000000000001', 'Verified Company A', 'verified-company-a', 'verified'),
  ('20000000-0000-4000-8000-000000000002', 'Verified Company B', 'verified-company-b', 'verified'),
  ('20000000-0000-4000-8000-000000000003', 'Pending Company C', 'pending-company-c', 'pending');

insert into public.company_members (company_id, user_id, membership_role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'owner'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'owner');

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'Product Designer',
  'product-designer',
  'Design accessible digital products for people across North Cyprus.',
  'We are looking for a product designer to work with our multidisciplinary team on accessible digital products.',
  'full_time',
  'hybrid',
  'Lefkoşa',
  'published',
  '10000000-0000-4000-8000-000000000005',
  now(),
  now() - interval '1 day',
  now() + interval '30 days'
), (
  '30000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'Draft Accountant',
  'draft-accountant',
  'Join our team and support accurate daily financial operations.',
  'This position supports accounting and operations in a collaborative team.',
  'full_time',
  'on_site',
  'Girne',
  'draft',
  null,
  null,
  null,
  null
), (
  '30000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'Expired Support Agent',
  'expired-support-agent',
  'Support our customers with clear and friendly communication.',
  'This position has closed and must not appear in public search.',
  'part_time',
  'remote',
  'Mağusa',
  'expired',
  '10000000-0000-4000-8000-000000000005',
  now(),
  now() - interval '60 days',
  now() - interval '1 day'
), (
  '30000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000005',
  'Unverified Company Job',
  'unverified-company-job',
  'A validly published test job tied to a company awaiting verification.',
  'This test job must remain private because its company is still pending verification.',
  'full_time',
  'remote',
  'Lefke',
  'published',
  '10000000-0000-4000-8000-000000000005',
  now(),
  now() - interval '1 day',
  now() + interval '30 days'
);

insert into public.companies (id, name, slug, verification_status)
values (
  '20000000-0000-4000-8000-000000000004',
  'Pending Source Company',
  'pending-source-company',
  'pending'
);

update public.companies
set
  profile_description = 'Synthetic source employer profile.',
  categories = array['Retail & Trade'],
  website = 'https://example.test/',
  municipality = 'Lefkoşa',
  source_profile_url = 'https://isbulkibris.com/firmalar/source-employer',
  logo_url = 'https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3'
where id = '20000000-0000-4000-8000-000000000004';

update public.companies
set
  profile_description = 'Must not be returned for platform listings.',
  categories = array['Synthetic platform-only category'],
  website = 'https://example.test/platform',
  municipality = 'Girne',
  source_profile_url = 'https://isbulkibris.com/firmalar/verified-company',
  logo_url = 'https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3'
where id = '20000000-0000-4000-8000-000000000001';

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, district, status, reviewed_by, reviewed_at,
  published_at, expires_at, publication_source
)
values (
  '30000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000004',
  null,
  'Source Site Preview Role',
  'source-site-preview',
  'A public source listing used to verify safe job import behavior.',
  'This synthetic source listing checks provenance, visibility, expiration, and application controls.',
  'full_time',
  'on_site',
  'Girne',
  'published',
  null,
  null,
  now() - interval '1 day',
  now() + interval '30 days',
  'source_site'
), (
  '30000000-0000-4000-8000-000000000006',
  '20000000-0000-4000-8000-000000000004',
  null,
  'Expired Source Site Role',
  'expired-source-site-job',
  'An expired source listing must not be visible to the public.',
  'This synthetic source listing has an expired source publication window.',
  'full_time',
  'on_site',
  'Girne',
  'published',
  null,
  null,
  now() - interval '30 days',
  now() - interval '1 day',
  'source_site'
), (
  '30000000-0000-4000-8000-000000000007',
  '20000000-0000-4000-8000-000000000004',
  null,
  'Unattributed Source Site Role',
  'unattributed-source-site-job',
  'A source listing without provenance must remain private.',
  'This synthetic source listing intentionally has no provenance record.',
  'full_time',
  'on_site',
  'Girne',
  'published',
  null,
  null,
  now() - interval '1 day',
  now() + interval '30 days',
  'source_site'
);

insert into public.job_source_imports (
  job_id, source, source_job_id, source_published_at, source_expires_at
)
values
  (
    '30000000-0000-4000-8000-000000000005',
    'isbulkibris',
    '30000000-0000-4000-8000-000000000105',
    now() - interval '1 day',
    now() + interval '30 days'
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    'iskibris',
    'fixture-expired-source-job',
    now() - interval '30 days',
    now() - interval '1 day'
  );

select is(
  (select verification_status::text
   from public.companies
   where id = '20000000-0000-4000-8000-000000000004'),
  'pending',
  'source employer records are not treated as verified companies'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.jobs),
  1,
  'candidates can read only published, unexpired jobs of verified companies'
);

select is(
  (select count(*)::integer from public.applications),
  0,
  'candidates cannot read another applicant application'
);

select set_config(
  'test.application_a_id',
  public.apply_to_job(
    '30000000-0000-4000-8000-000000000001',
    'I am interested in this role.'
  )::text,
  true
);

select is(
  (select count(*)::integer from public.applications),
  1,
  'a candidate with a profile can apply to an open job'
);

select throws_ok(
  $$select public.apply_to_job(
      '30000000-0000-4000-8000-000000000001',
      'Second application'
    )$$,
  '23505',
  null,
  'a candidate cannot submit a duplicate application for one job'
);

select throws_ok(
  $$select public.apply_to_job(
      '30000000-0000-4000-8000-000000000003',
      ''
    )$$,
  '22023',
  null,
  'expired jobs reject applications'
);

select throws_ok(
  $$select public.apply_to_job(
      '30000000-0000-4000-8000-000000000004',
      ''
    )$$,
  '22023',
  null,
  'jobs of unverified companies reject applications'
);

select throws_ok(
  $$select public.transition_application(
      current_setting('test.application_a_id')::uuid,
      'shortlisted'
    )$$,
  '42501',
  null,
  'a candidate cannot assign an employer-only application status'
);

select throws_ok(
  $$update public.applications set status = 'hired'$$,
  '42501',
  null,
  'authenticated clients cannot directly update application status'
);

set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  public.is_active_company_member(
    '20000000-0000-4000-8000-000000000002',
    array['owner', 'recruiter']::public.company_role[]
  ),
  false,
  'candidate identity alone does not grant company membership'
);

select is(
  (select status from public.profiles where id = (select auth.uid())),
  'active',
  'the authenticated company owner has an active profile'
);

select is(
  (select count(*)::integer
   from public.applications
   where candidate_id = '10000000-0000-4000-8000-000000000001'),
  0,
  'a candidate cannot read another candidate application'
);

select set_config(
  'test.application_b_id',
  public.apply_to_job(
    '30000000-0000-4000-8000-000000000001',
    ''
  )::text,
  true
);

select is(
  (select count(*)::integer
   from public.applications
   where candidate_id = '10000000-0000-4000-8000-000000000002'),
  1,
  'a second candidate can independently apply to the same open job'
);

select throws_ok(
  $$insert into public.jobs (
      company_id, title, slug, summary, description, job_type, workplace_mode
    ) values (
      '20000000-0000-4000-8000-000000000001',
      'Unauthorized role',
      'unauthorized-role',
      'A sufficiently long summary for a job that should not be created.',
      'A sufficiently long description that should not be allowed for an unrelated company.',
      'full_time',
      'remote'
    )$$,
  '42501',
  null,
  'a member cannot create a job for a different company'
);

set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}';

select is(
  public.is_active_company_member(
    '20000000-0000-4000-8000-000000000002',
    array['owner', 'recruiter']::public.company_role[]
  ),
  true,
  'the active company owner is recognized by the shared membership policy'
);

select lives_ok(
  $$insert into public.jobs (
      company_id, title, slug, summary, description, job_type, workplace_mode
    ) values (
      '20000000-0000-4000-8000-000000000002',
      'Operations Coordinator',
      'operations-coordinator',
      'Coordinate a friendly operations team and keep daily workflows moving.',
      'This role coordinates team workflows and customer operations across the company.',
      'full_time',
      'on_site'
    )$$,
  'an active company owner can create a draft for their own company'
);

select throws_ok(
  $$update public.jobs set status = 'published'
    where slug = 'operations-coordinator'$$,
  '42501',
  null,
  'company users cannot publish jobs by directly changing status'
);

select lives_ok(
  $$select public.submit_job_for_review(
      (select id from public.jobs where slug = 'operations-coordinator')
    )$$,
  'a verified company owner can submit a draft for moderation'
);

select is(
  (select status from public.jobs where slug = 'operations-coordinator'),
  'pending_review',
  'submission changes job status through the controlled database function'
);

select is(
  (select count(*)::integer from public.applications
   where candidate_id = '10000000-0000-4000-8000-000000000001'),
  0,
  'an unrelated company cannot inspect a different candidate application'
);

select throws_ok(
  $$select public.review_job(
      (select id from public.jobs where slug = 'operations-coordinator'),
      'approved',
      null
    )$$,
  '42501',
  null,
  'company owners cannot review their own jobs'
);

set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';

select set_config(
  'test.application_owner_id',
  public.apply_to_job(
    '30000000-0000-4000-8000-000000000001',
    'I am applying as a candidate.'
  )::text,
  true
);

select throws_ok(
  $$select public.transition_application(
      current_setting('test.application_owner_id')::uuid,
      'reviewing'
    )$$,
  '42501',
  null,
  'a company member cannot review their own candidate application'
);

select is(
  (select status
   from public.applications
   where id = current_setting('test.application_owner_id')::uuid),
  'submitted',
  'self-review rejection leaves the application unchanged'
);

select is(
  (select count(*)::integer
   from public.applications
   where job_id = '30000000-0000-4000-8000-000000000001'),
  3,
  'a company owner can read applications only for jobs owned by their company'
);

select lives_ok(
  $$select public.transition_application(
      current_setting('test.application_a_id')::uuid,
      'reviewing'
    )$$,
  'the owning company can advance an application using a valid transition'
);

select throws_ok(
  $$select public.transition_application(
      current_setting('test.application_a_id')::uuid,
      'hired'
    )$$,
  '42501',
  null,
  'the owning company cannot skip required application review transitions'
);

set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.transition_application(
      current_setting('test.application_a_id')::uuid,
      'withdrawn'
    )$$,
  'a candidate can withdraw their own application'
);

select is(
  (select status
   from public.applications
   where id = current_setting('test.application_a_id')::uuid),
  'withdrawn',
  'candidate withdrawal is persisted as an explicit application status'
);

set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}';

select is(
  (select count(*)::integer
   from public.jobs
   where status = 'pending_review'),
  1,
  'platform administrators can read the moderation queue'
);

select lives_ok(
  $$select public.review_job(
      (select id from public.jobs where slug = 'operations-coordinator'),
      'approved',
      null
    )$$,
  'platform administrators can approve a pending job'
);

select is(
  (select status from public.jobs where slug = 'operations-coordinator'),
  'approved',
  'moderation records approval without bypassing publication and credit gates'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (public.search_public_jobs('Product', null, null, null, 1)->>'total')::integer,
  1,
  'authenticated candidates can use the same public job search RPC'
);

reset role;
set local "request.jwt.claims" =
  '{"role":"anon","iss":"supabase","aud":"authenticated"}';
set local role anon;

select is(
  (select count(job_title)::integer
   from public.search_public_job_previews(
     'Product',
     'Lefkoşa',
     'full_time',
     'hybrid',
     1
   )),
  1,
  'anonymous visitors can search the public job preview using supported filters'
);

select is(
  (select company_name
   from public.search_public_job_previews(
     'Product',
     'Lefkoşa',
     'full_time',
     'hybrid',
     1
   )
   where job_title is not null),
  'Verified Company A',
  'the anonymous job preview returns the verified company name'
);

select ok(
  not has_column_privilege('anon', 'public.jobs', 'title', 'SELECT'),
  'anonymous visitors receive no direct jobs column grants'
);

select throws_ok(
  $$select description from public.jobs limit 1$$,
  '42501',
  null,
  'anonymous visitors cannot read job details directly'
);

select is(
  (select total_count
   from public.search_public_job_previews('Unverified Company Job', null, null, null, 1)
   limit 1),
  0::bigint,
  'the public preview excludes jobs belonging to unverified companies'
);

select ok(
  has_function_privilege(
    'anon',
    'public.search_public_jobs(text,text,text,text,integer)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.search_public_jobs(text,text,text,text,integer)',
    'EXECUTE'
  ),
  'only the intended public roles can execute the detailed public job search'
);

select is(
  public.search_public_jobs('Product', 'Lefkoşa', 'full_time', 'hybrid', 1)
    #>> '{jobs,0,company,name}',
  'Verified Company A',
  'anonymous visitors can search and receive only explicitly selected verified company details'
);

select is(
  (public.search_public_jobs('Verified Company A', null, null, null, 1)->>'total')::integer,
  1,
  'public job search matches verified company names as well as job content'
);

select is(
  (public.search_public_jobs('Product', 'Girne', null, null, 1)->>'total')::integer,
  0,
  'public job search applies district filters to published listings'
);

select is(
  pg_catalog.jsonb_array_length(
    public.search_public_jobs('Unverified Company Job', null, null, null, 1)->'jobs'
  ),
  0,
  'public detailed search excludes jobs belonging to unverified companies'
);

select is(
  (public.search_public_jobs('Draft Accountant', null, null, null, 1)->>'total')::integer,
  0,
  'public detailed search excludes draft jobs'
);

select is(
  public.get_public_job_details('product-designer')->>'description',
  'We are looking for a product designer to work with our multidisciplinary team on accessible digital products.',
  'anonymous visitors can load the full details of an active public job'
);

select is(
  public.get_public_job_details('unverified-company-job'),
  null::jsonb,
  'public job detail lookup does not reveal jobs for unverified companies'
);

select is(
  public.get_public_job_details('expired-support-agent'),
  null::jsonb,
  'public job detail lookup does not reveal expired listings'
);

select throws_ok(
  $$select public.get_public_job_details('../private')$$,
  '22023',
  'Invalid public job slug.',
  'the public job detail RPC rejects malformed slugs'
);

select throws_ok(
  $$select public.search_public_jobs('', 'Invalid District', null, null, 1)$$,
  '22023',
  'Invalid public job search filters.',
  'the detailed public search RPC rejects unsupported filters'
);

select throws_ok(
  $$select public.search_public_jobs('', null, null, null, 1001)$$,
  '22023',
  'Invalid public job search filters.',
  'the detailed public search RPC enforces its page bound'
);

select throws_ok(
  $$select * from public.search_public_job_previews('', 'Invalid District', null, null, 1)$$,
  '22023',
  'Invalid public job search filters.',
  'the public preview RPC rejects unsupported filters'
);

select ok(
  not has_table_privilege('anon', 'public.applications', 'SELECT'),
  'anonymous visitors receive no application table grant'
);

select throws_ok(
  $$select id from public.applications limit 1$$,
  '42501',
  null,
  'anonymous visitors cannot read applications'
);

select is(
  (public.search_public_jobs('Source Site Preview Role', null, null, null, 1)->>'total')::integer,
  1,
  'anonymous visitors can find an active source listing through the public search RPC'
);

select is(
  public.get_public_job_details('source-site-preview')->>'source_site',
  'isbulkibris',
  'public job details disclose the source site for imported listings'
);

select is(
  public.get_public_job_details('source-site-preview')->>'source_listing_url',
  'https://isbulkibris.com/jobs/30000000-0000-4000-8000-000000000105',
  'source job details link to the exact public source listing'
);

select is(
  public.get_public_job_details('source-site-preview')
    #>> '{company,logo_url}',
  'https://api.isbulkibris.com/api/employer/logo/2fbccd9f-9949-4297-bdcc-a951f0a759a3',
  'source job details expose the allowlisted source employer logo'
);

select is(
  public.get_public_job_details('source-site-preview')
    #>> '{company,source_profile_url}',
  'https://isbulkibris.com/firmalar/source-employer',
  'source job details expose the allowlisted source company profile'
);

select is(
  (
    select profile_description
    from public.search_public_job_companies()
    where company_slug = 'pending-source-company'
  ),
  'Synthetic source employer profile.',
  'the public source-employer directory includes the source profile description'
);

select is(
  (
    select source_listing_url
    from public.search_public_job_companies()
    where company_slug = 'pending-source-company'
  ),
  'https://isbulkibris.com/jobs/30000000-0000-4000-8000-000000000105',
  'the public source-employer directory links to a source job with valid provenance'
);

select is(
  public.search_public_jobs('Product', null, null, null, 1)
    #>> '{jobs,0,company,logo_url}',
  null::text,
  'platform job search redacts source employer logo metadata'
);

reset role;

select throws_ok(
  $$update public.companies
    set logo_url = 'https://attacker.example/logo.png'
    where id = '20000000-0000-4000-8000-000000000004'$$,
  '23514',
  null,
  'company logo URLs are restricted to reviewed source hosts and paths'
);

select throws_ok(
  $$update public.companies
    set source_profile_url = 'https://attacker.example/company'
    where id = '20000000-0000-4000-8000-000000000004'$$,
  '23514',
  null,
  'source company profile links reject unapproved hosts'
);

set local role anon;

select is(
  (select count(job_title)::integer
   from public.search_public_job_previews('Source Site Preview Role', null, null, null, 1)),
  1,
  'homepage previews include active source listings'
);

select is(
  public.get_public_job_details('expired-source-site-job'),
  null::jsonb,
  'expired source listings are excluded from public job details'
);

select is(
  public.get_public_job_details('unattributed-source-site-job'),
  null::jsonb,
  'source listings without provenance are excluded from public job details'
);

select is(
  (select count(*)::integer
   from public.companies
   where slug = 'pending-source-company'),
  0,
  'anonymous company-directory reads do not expose pending source employers'
);

select ok(
  not has_table_privilege('anon', 'public.job_source_imports', 'SELECT'),
  'anonymous visitors receive no direct source provenance table grant'
);

select throws_ok(
  $$select job_id from public.job_source_imports limit 1$$,
  '42501',
  null,
  'anonymous visitors cannot read source provenance records directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.is_public_source_job(uuid)',
    'EXECUTE'
  ),
  'anonymous visitors cannot execute the internal source provenance helper'
);

set local "request.jwt.claims" =
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select public.apply_to_job(
      '30000000-0000-4000-8000-000000000005',
      'I am interested in this source role.'
    )$$,
  '22023',
  null,
  'source listings without a verified İşBul employer reject in-platform applications'
);

select * from finish();

rollback;
