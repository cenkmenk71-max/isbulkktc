begin;

-- Managed content and directory RPCs. The local stack seeds real source
-- listings and the bundled managed content before this suite runs; the
-- assertions below define their own fixtures, so the managed tables are cleared
-- first and the transaction rolls the deletion back for the E2E run that
-- follows.

select plan(34);

delete from public.directory_locations;
delete from public.directory_companies;
delete from public.faq_entries;
delete from public.site_content;
delete from public.listing_plans;
-- Audit rows from earlier writes (a manual console session, a previous suite)
-- would otherwise inflate the append count asserted at the end.
delete from public.audit_logs
where action in (
  'content.site.upsert', 'content.faq.upsert',
  'content.plan.upsert', 'content.directory.upsert'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('81000000-0000-4000-8000-000000000001', 'content-aal2-admin@example.test', '{"display_name":"Content AAL2 Admin"}'),
  ('81000000-0000-4000-8000-000000000002', 'content-aal1-admin@example.test', '{"display_name":"Content AAL1 Admin"}'),
  ('81000000-0000-4000-8000-000000000003', 'content-member@example.test', '{"display_name":"Content Member"}');

insert into public.user_roles (user_id, role)
values
  ('81000000-0000-4000-8000-000000000001', 'platform_admin'),
  ('81000000-0000-4000-8000-000000000002', 'platform_admin');

-- Anonymous reads ----------------------------------------------------------

set local role anon;

select is(
  (select count(*)::integer from public.get_public_faq('tr')),
  0,
  'the public FAQ RPC is readable by anon and starts empty'
);

select is(
  (select count(*)::integer from public.get_public_listing_plans()),
  0,
  'the public plan RPC is readable by anon and starts empty'
);

select is(
  (select count(*)::integer from public.get_public_site_content('tr')),
  0,
  'the public site-content RPC is readable by anon and starts empty'
);

select is(
  (select count(*)::integer from public.get_public_directory()),
  0,
  'the public directory RPC is readable by anon and starts empty'
);

select throws_ok(
  $$select * from public.get_public_faq('xx')$$,
  '22023',
  null,
  'an unsupported locale is rejected'
);

select throws_ok(
  $$select * from public.listing_plans$$,
  '42501',
  null,
  'anon cannot read the plan table directly'
);

select throws_ok(
  $$select * from public.directory_companies$$,
  '42501',
  null,
  'anon cannot read the directory table directly'
);

select throws_ok(
  $$select * from public.faq_entries$$,
  '42501',
  null,
  'anon cannot read the FAQ table directly'
);

reset role;

-- Administrative authorization --------------------------------------------

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$select public.admin_upsert_faq_entry(null, 'tr', 'Soru', 'Cevap', 0, true)$$,
  '42501',
  null,
  'an administrator without aal2 cannot write FAQ content'
);

select throws_ok(
  $$select * from public.admin_list_faq_entries()$$,
  '42501',
  null,
  'an administrator without aal2 cannot list FAQ content'
);

select throws_ok(
  $$select * from public.admin_list_site_content()$$,
  '42501',
  null,
  'an administrator without aal2 cannot list managed content'
);

select throws_ok(
  $$select * from public.admin_list_listing_plans()$$,
  '42501',
  null,
  'an administrator without aal2 cannot list listing plans'
);

set local "request.jwt.claims" =
  '{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$select public.admin_upsert_faq_entry(null, 'tr', 'Soru', 'Cevap', 0, true)$$,
  '42501',
  null,
  'a non-admin with aal2 cannot write FAQ content'
);

select throws_ok(
  $$select * from public.admin_list_site_content()$$,
  '42501',
  null,
  'a non-admin with aal2 cannot list managed content'
);

-- Authorized writes --------------------------------------------------------

set local "request.jwt.claims" =
  '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.admin_upsert_site_content(
      'legal.privacy', 'tr',
      '{"title":"Gizlilik","intro":"Giris","updated":"Bugun",
        "sections":[{"title":"Bolum","paragraphs":["Paragraf"]}]}'::jsonb
    )$$,
  'an aal2 administrator can publish a legal document'
);

select throws_ok(
  $$select public.admin_upsert_site_content(
      'legal.privacy', 'tr', '{"title":"x"}'::jsonb
    )$$,
  null,
  null,
  'a malformed legal document is rejected at the write boundary'
);

select lives_ok(
  $$select public.admin_upsert_faq_entry(
      null, 'tr', 'Soru bir', 'Cevap bir', 1, true
    )$$,
  'an aal2 administrator can create an FAQ entry'
);

select lives_ok(
  $$select public.admin_upsert_faq_entry(
      null, 'tr', 'Taslak soru', 'Taslak cevap', 2, false
    )$$,
  'an aal2 administrator can create a draft FAQ entry'
);

select lives_ok(
  $$select public.admin_upsert_listing_plan(
      'tek-ilan', 'bireysel', 'Tek Ilan', 'Bir ilan', array['ozellik'],
      '#4b8066', 1, 290, 690, 1290, true, 1
    )$$,
  'an aal2 administrator can define a listing plan'
);

select lives_ok(
  $$select public.admin_upsert_directory_company(
      'ChIJmanagedtest0000000001', 'Managed Test Co', array['Test'],
      null, null, null, null,
      '[{"address":"Lefkosa","municipality":null,"phone":"+900000000000",
        "website":"https://managed.test","email":null}]'::jsonb
    )$$,
  'an aal2 administrator can upsert a directory company'
);

select throws_ok(
  $$select public.admin_upsert_directory_company(
      'ChIJmanagedtest0000000001', 'Managed Test Co', array['Test'],
      null, null, null, null, '"not-an-array"'::jsonb
    )$$,
  '22023',
  null,
  'a directory company whose locations are not an array is rejected'
);

select is(
  (select count(*)::integer from public.admin_list_faq_entries()),
  2,
  'the administrator sees published and draft FAQ entries'
);

select is(
  (select count(*)::integer from public.admin_list_site_content()),
  1,
  'the administrator sees the managed legal document, drafts included'
);

select is(
  (
    select document ->> 'title'
    from public.admin_list_site_content()
    where content_key = 'legal.privacy' and locale = 'tr'
  ),
  'Gizlilik',
  'the administrator sees the stored document body'
);

select is(
  (select count(*)::integer from public.admin_list_listing_plans()),
  1,
  'the administrator sees inactive plans too'
);

select is(
  (
    select price_1
    from public.admin_list_listing_plans()
    where code = 'tek-ilan'
  ),
  290,
  'the administrator sees the plan price'
);

reset role;

-- audit_logs is not readable by anon/authenticated; the owner inspects it.
select is(
  (select count(*)::integer
     from public.audit_logs
    where action in (
      'content.site.upsert', 'content.faq.upsert',
      'content.plan.upsert', 'content.directory.upsert'
    )),
  5,
  'each administrative write appends an audit row'
);

-- Published reads reflect the writes ---------------------------------------

set local role anon;

select is(
  (select count(*)::integer from public.get_public_faq('tr')),
  1,
  'only the published FAQ entry is visible publicly'
);

select is(
  (select question from public.get_public_faq('tr')),
  'Soru bir',
  'the public FAQ returns the published question text'
);

select is(
  (select count(*)::integer from public.get_public_listing_plans()),
  1,
  'the active listing plan is visible publicly'
);

select is(
  (select price_30 from public.get_public_listing_plans()),
  1290,
  'the public plan carries the managed price'
);

select is(
  (select (document ->> 'title') from public.get_public_site_content('tr', array['legal.privacy'])),
  'Gizlilik',
  'the public site-content RPC returns the managed document'
);

select is(
  (select count(*)::integer from public.get_public_directory()),
  1,
  'the managed directory company is visible publicly'
);

select is(
  (
    select locations -> 0 ->> 'website'
    from public.get_public_directory()
    where directory_entry_id = 'ChIJmanagedtest0000000001'
  ),
  'https://managed.test',
  'the public directory returns the branch website'
);

reset role;

select * from finish();
rollback;
