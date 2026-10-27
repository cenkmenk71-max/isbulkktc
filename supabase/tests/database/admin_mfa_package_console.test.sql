begin;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('61000000-0000-4000-8000-000000000001', 'aal2-admin@example.test', '{"display_name":"AAL2 Admin"}'),
  ('61000000-0000-4000-8000-000000000002', 'aal1-admin@example.test', '{"display_name":"AAL1 Admin"}'),
  ('61000000-0000-4000-8000-000000000003', 'aal2-member@example.test', '{"display_name":"Regular Member"}');

insert into public.user_roles (user_id, role)
values
  ('61000000-0000-4000-8000-000000000001', 'platform_admin'),
  ('61000000-0000-4000-8000-000000000002', 'platform_admin');

insert into public.companies (id, name, slug, verification_status)
values
  ('71000000-0000-4000-8000-000000000001', 'Console Verified Company', 'console-verified-company', 'verified'),
  ('71000000-0000-4000-8000-000000000002', 'Console Pending Company', 'console-pending-company', 'pending');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';

select ok(
  not public.has_platform_role('platform_admin'),
  'a platform administrator without aal2 is not authorized'
);

select throws_ok(
  $$select public.admin_save_job_package(
      null, 'aal1-package', 'AAL1 Package', '', 1, 7, true
    )$$,
  '42501',
  null,
  'aal1 cannot create or change a package'
);

select throws_ok(
  $$select * from public.admin_list_job_packages()$$,
  '42501',
  null,
  'aal1 cannot inspect the private package console'
);

select throws_ok(
  $$select * from public.admin_list_verified_companies()$$,
  '42501',
  null,
  'aal1 cannot inspect company assignments'
);

set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';

select ok(
  public.has_platform_role('platform_admin'),
  'an active platform administrator with aal2 is authorized'
);

select set_config(
  'test.console_package_id',
  public.admin_save_job_package(
    null, 'console-package', 'Console Package', 'Console test package.',
    3, 14, true
  )::text,
  true
);

select is(
  (select count(*)::integer from public.admin_list_job_packages()),
  1,
  'aal2 administrator can list package definitions'
);

select lives_ok(
  $$select public.admin_assign_company_job_package(
      '71000000-0000-4000-8000-000000000001',
      current_setting('test.console_package_id')::uuid,
      null
    )$$,
  'aal2 administrator can assign a package to a verified company'
);

select is(
  (
    select package_code
    from public.admin_list_verified_companies()
    where id = '71000000-0000-4000-8000-000000000001'
  ),
  'console-package',
  'aal2 administrator can inspect the company package assignment'
);

select is(
  (select count(*)::integer from public.admin_list_verified_companies()),
  1,
  'admin company console excludes unverified companies'
);

set local "request.jwt.claims" =
  '{"sub":"61000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select ok(
  not public.has_platform_role('platform_admin'),
  'aal2 alone does not grant a platform administrator role'
);

select throws_ok(
  $$select * from public.admin_list_job_packages()$$,
  '42501',
  null,
  'a non-admin with aal2 cannot inspect the package console'
);

reset role;
select * from finish();
rollback;
