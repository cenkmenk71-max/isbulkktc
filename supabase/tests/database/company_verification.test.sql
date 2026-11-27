begin;

select plan(27);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('63000000-0000-4000-8000-000000000001', 'aal2-verification-admin@example.test', '{"display_name":"Verification Admin"}'),
  ('63000000-0000-4000-8000-000000000002', 'aal1-verification-admin@example.test', '{"display_name":"AAL1 Verification Admin"}'),
  ('63000000-0000-4000-8000-000000000003', 'verification-owner@example.test', '{"display_name":"Company Owner"}'),
  ('63000000-0000-4000-8000-000000000004', 'suspended-verification-admin@example.test', '{"display_name":"Suspended Verification Admin"}');

insert into public.user_roles (user_id, role)
values
  ('63000000-0000-4000-8000-000000000001', 'platform_admin'),
  ('63000000-0000-4000-8000-000000000002', 'platform_admin'),
  ('63000000-0000-4000-8000-000000000004', 'platform_admin');

update public.profiles
set status = 'suspended'
where id = '63000000-0000-4000-8000-000000000004';

insert into public.companies (id, name, slug, verification_status)
values
  ('73000000-0000-4000-8000-000000000001', 'Pending Verification One', 'pending-verification-one', 'pending'),
  ('73000000-0000-4000-8000-000000000002', 'Pending Verification Two', 'pending-verification-two', 'pending'),
  ('73000000-0000-4000-8000-000000000003', 'Rejected Verification', 'rejected-verification', 'rejected'),
  ('73000000-0000-4000-8000-000000000004', 'Verified Company', 'verified-company', 'verified'),
  ('73000000-0000-4000-8000-000000000005', 'Suspended Company', 'suspended-company', 'suspended'),
  ('73000000-0000-4000-8000-000000000006', 'Company Without Owner', 'company-without-owner', 'pending');

insert into public.company_members (company_id, user_id, membership_role, status)
values
  ('73000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('73000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('73000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('73000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000003', 'owner', 'active'),
  ('73000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000003', 'owner', 'active');

select ok(
  not has_function_privilege('anon', 'public.admin_list_company_verifications()', 'EXECUTE'),
  'anonymous callers cannot execute the private verification queue'
);

select ok(
  has_function_privilege('authenticated', 'public.admin_list_company_verifications()', 'EXECUTE'),
  'authenticated callers reach the internally guarded verification queue'
);

select ok(
  not has_function_privilege('anon', 'public.review_company_verification(uuid, text)', 'EXECUTE'),
  'anonymous callers cannot execute the company verification writer'
);

select ok(
  has_function_privilege('authenticated', 'public.review_company_verification(uuid, text)', 'EXECUTE'),
  'authenticated callers reach the internally guarded verification writer'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$select * from public.admin_list_company_verifications()$$,
  '42501',
  null,
  'an AAL1 platform administrator cannot inspect the verification queue'
);

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000001', 'verified'
    )$$,
  '42501',
  null,
  'an AAL1 platform administrator cannot change verification'
);

set local "request.jwt.claims" =
  '{"sub":"63000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$select * from public.admin_list_company_verifications()$$,
  '42501',
  null,
  'a suspended AAL2 platform administrator cannot inspect the verification queue'
);

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000001', 'verified'
    )$$,
  '42501',
  null,
  'a suspended AAL2 platform administrator cannot change verification'
);

set local "request.jwt.claims" =
  '{"sub":"63000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$select * from public.admin_list_company_verifications()$$,
  '42501',
  null,
  'AAL2 without a platform role cannot inspect the verification queue'
);

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000001', 'verified'
    )$$,
  '42501',
  null,
  'AAL2 without a platform role cannot change verification'
);

select throws_ok(
  $$update public.companies
    set verification_status = 'verified'
    where id = '73000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'a normal authenticated caller cannot update verification_status directly'
);

set local "request.jwt.claims" =
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';

select is(
  (
    select count(*)::integer
    from public.admin_list_company_verifications()
    where id in (
      '73000000-0000-4000-8000-000000000001',
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000003'
    )
  ),
  3,
  'an active AAL2 administrator sees pending and rejected companies with active owners'
);

select is(
  (
    select count(*)::integer
    from public.admin_list_company_verifications()
    where id = '73000000-0000-4000-8000-000000000004'
  ),
  1,
  'the queue now includes verified companies with active owners'
);

select is(
  (
    select count(*)::integer
    from public.admin_list_company_verifications()
    where id in (
      '73000000-0000-4000-8000-000000000005',
      '73000000-0000-4000-8000-000000000006'
    )
  ),
  0,
  'the queue excludes suspended and ownerless companies'
);

select lives_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000001', 'verified'
    )$$,
  'an active AAL2 administrator can verify a pending company'
);

select is(
  (
    select verification_status::text
    from public.companies
    where id = '73000000-0000-4000-8000-000000000001'
  ),
  'verified',
  'the verification decision updates the company status'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where actor_id = '63000000-0000-4000-8000-000000000001'
      and action = 'company.verification.verified'
      and resource_type = 'company'
      and resource_id = '73000000-0000-4000-8000-000000000001'
  ),
  1,
  'the verification decision records the administrator and company in the audit log'
);

select is(
  (
    select metadata_redacted
    from public.audit_logs
    where action = 'company.verification.verified'
      and resource_id = '73000000-0000-4000-8000-000000000001'
  ),
  '{"previous_status":"pending","new_status":"verified"}'::jsonb,
  'the audit event contains only redacted status transition metadata'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000002', 'rejected'
    )$$,
  'an active AAL2 administrator can reject a pending company'
);

select is(
  (
    select verification_status::text
    from public.companies
    where id = '73000000-0000-4000-8000-000000000002'
  ),
  'rejected',
  'the rejection decision updates the company status'
);

select is(
  (
    select count(*)::integer
    from public.admin_list_company_verifications()
    where id in (
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000003'
    )
  ),
  2,
  'a rejected company remains in the queue for a later review'
);

select lives_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000003', 'verified'
    )$$,
  'an active AAL2 administrator can verify a previously rejected company'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action like 'company.verification.%'
      and resource_id = '73000000-0000-4000-8000-000000000003'
  ),
  1,
  'a re-review records one status transition'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000001', 'rejected'
    )$$,
  'P0002',
  null,
  'a verified company cannot be silently reclassified through the review RPC'
);

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000005', 'rejected'
    )$$,
  'P0002',
  null,
  'a suspended company cannot be changed through the verification review RPC'
);

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000001', 'suspended'
    )$$,
  '22023',
  null,
  'the review RPC accepts only verified or rejected decisions'
);

select throws_ok(
  $$select public.review_company_verification(
      '73000000-0000-4000-8000-000000000099', 'verified'
    )$$,
  'P0002',
  null,
  'the review RPC refuses an unknown company id'
);

reset role;
select * from finish();
rollback;
