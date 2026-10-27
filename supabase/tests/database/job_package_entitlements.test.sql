begin;

select plan(23);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'package-owner-a@example.test', '{"display_name":"Package Owner A"}'),
  ('60000000-0000-4000-8000-000000000002', 'package-owner-b@example.test', '{"display_name":"Package Owner B"}'),
  ('60000000-0000-4000-8000-000000000003', 'package-admin@example.test', '{"display_name":"Package Admin"}');

insert into public.user_roles (user_id, role)
values ('60000000-0000-4000-8000-000000000003', 'platform_admin');

insert into public.companies (id, name, slug, verification_status)
values
  ('70000000-0000-4000-8000-000000000001', 'Package Company A', 'package-company-a', 'verified'),
  ('70000000-0000-4000-8000-000000000002', 'Package Company B', 'package-company-b', 'verified'),
  ('70000000-0000-4000-8000-000000000003', 'Package Company C', 'package-company-c', 'pending');

insert into public.company_members (company_id, user_id, membership_role)
values
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'owner'),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'owner');

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, status, reviewed_by, reviewed_at
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'Approved Job One', 'approved-job-one',
    'A sufficiently long description for an approved job in package tests.',
    'This approved job is used to check entitlement-aware public publishing in isolation.',
    'full_time', 'on_site', 'approved',
    '60000000-0000-4000-8000-000000000003', now()
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'Approved Job Two', 'approved-job-two',
    'A sufficiently long description for a second approved job in package tests.',
    'This second approved job checks the configured concurrent-publication ceiling.',
    'full_time', 'on_site', 'approved',
    '60000000-0000-4000-8000-000000000003', now()
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    'Approved Job Three', 'approved-job-three',
    'A sufficiently long description for an approved job with no package assignment.',
    'This job must remain unpublished because its verified company has no assigned package.',
    'full_time', 'on_site', 'approved',
    '60000000-0000-4000-8000-000000000003', now()
  );

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.job_packages),
  0,
  'no guessed package tiers are seeded'
);

select throws_ok(
  $$insert into public.job_packages (
      code, display_name, max_active_jobs, job_duration_days
    ) values ('fake', 'Fake Package', 1, 30)$$,
  '42501',
  null,
  'company users cannot directly create package definitions'
);

select throws_ok(
  $$select public.admin_save_job_package(
      null, 'starter', 'Starter', '', 1, 30, true
    )$$,
  '42501',
  null,
  'company users cannot define packages'
);

select throws_ok(
  $$select public.admin_assign_company_job_package(
      '70000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001',
      null
    )$$,
  '42501',
  null,
  'company users cannot assign packages to themselves'
);

set local "request.jwt.claims" =
  '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select set_config(
  'test.job_package_id',
  public.admin_save_job_package(
    null, 'starter', 'Starter', 'An admin-configured package.',
    1, 7, true
  )::text,
  true
);

select is(
  (select max_active_jobs from public.job_packages
   where id = current_setting('test.job_package_id')::uuid),
  1,
  'an administrator can configure the active-job entitlement'
);

select lives_ok(
  $$select public.admin_assign_company_job_package(
      '70000000-0000-4000-8000-000000000001',
      current_setting('test.job_package_id')::uuid,
      null
    )$$,
  'an administrator can assign an active package to a verified company'
);

select lives_ok(
  $$select public.admin_save_job_package(
      current_setting('test.job_package_id')::uuid,
      'starter', 'Starter', 'Updated catalog rights.',
      5, 14, true
    )$$,
  'an administrator can update current catalog terms'
);

select throws_ok(
  $$select public.admin_assign_company_job_package(
      '70000000-0000-4000-8000-000000000003',
      current_setting('test.job_package_id')::uuid,
      null
    )$$,
  '42501',
  null,
  'packages cannot be assigned to unverified companies'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.company_job_package_assignments',
    'SELECT'
  ),
  'authenticated users receive no direct assignment-table access'
);

set local "request.jwt.claims" =
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select max_active_jobs
   from public.get_company_job_entitlements(
     '70000000-0000-4000-8000-000000000001'
   )),
  1,
  'an authorized company owner sees assignment-time active-job rights'
);

select is(
  (select job_duration_days
   from public.get_company_job_entitlements(
     '70000000-0000-4000-8000-000000000001'
   )),
  7,
  'an authorized company owner sees assignment-time duration rights'
);

select throws_ok(
  $$select * from public.get_company_job_entitlements(
      '70000000-0000-4000-8000-000000000002'
    )$$,
  '42501',
  null,
  'a company owner cannot read another company package rights'
);

select lives_ok(
  $$select public.publish_approved_job(
      '80000000-0000-4000-8000-000000000001'
    )$$,
  'an approved job can be published within its assigned package rights'
);

select is(
  (select status from public.jobs
   where id = '80000000-0000-4000-8000-000000000001'),
  'published',
  'package-authorized publication records the public job state'
);

select is(
  (
    select pg_catalog.floor(
      extract(epoch from expires_at - published_at) / 86400
    )::integer
    from public.jobs
    where id = '80000000-0000-4000-8000-000000000001'
  ),
  7,
  'job expiry is derived from the assigned package duration snapshot'
);

select throws_ok(
  $$select public.publish_approved_job(
      '80000000-0000-4000-8000-000000000002'
    )$$,
  'P0001',
  null,
  'an active-job limit blocks a second concurrent publication'
);

set local "request.jwt.claims" =
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.publish_approved_job(
      '80000000-0000-4000-8000-000000000003'
    )$$,
  'P0001',
  null,
  'a verified company without a package cannot publish'
);

set local "request.jwt.claims" =
  '{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.admin_save_job_package(
      current_setting('test.job_package_id')::uuid,
      'starter', 'Starter', 'Retired package.',
      1, 7, false
    )$$,
  'an administrator can deactivate a package'
);

set local "request.jwt.claims" =
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.publish_approved_job(
      '80000000-0000-4000-8000-000000000002'
    )$$,
  'P0001',
  null,
  'deactivated packages cannot authorize new publications'
);

reset role;
set local "request.jwt.claims" =
  '{"role":"anon","iss":"supabase","aud":"authenticated"}';
set local role anon;

select is(
  (select count(*)::integer from public.job_packages),
  0,
  'anonymous visitors cannot see deactivated packages'
);

select is(
  (select count(job_title)::integer
   from public.search_public_job_previews('Approved Job One', null, null, null, 1)),
  1,
  'deactivating a package does not prematurely hide its public job preview'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.company_job_package_assignments',
    'SELECT'
  ),
  'anonymous visitors receive no direct assignment-table access'
);

select throws_ok(
  $$select * from public.company_job_package_assignments$$,
  '42501',
  null,
  'anonymous visitors cannot read company package assignments'
);

select * from finish();

rollback;
