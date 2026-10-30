begin;

select plan(11);

-- The engagement digest is the only promotional family, so its consent gate has
-- to hold independently of any seed data: these rows are inserted inside the
-- transaction and rolled back with it. Profiles are created by the
-- `on_auth_user_created` trigger, so locale and display name travel in the
-- metadata rather than a second insert.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (
    '83000000-0000-4000-8000-000000000001',
    'subscriber@example.test',
    pg_catalog.now(),
    '{"display_name":"Subscriber One","locale":"en"}'
  ),
  (
    '83000000-0000-4000-8000-000000000002',
    'unconfirmed@example.test',
    null,
    '{"display_name":"Unconfirmed One","locale":"tr"}'
  ),
  (
    '83000000-0000-4000-8000-000000000003',
    'suspended@example.test',
    pg_catalog.now(),
    '{"display_name":"Suspended One","locale":"tr"}'
  ),
  (
    '83000000-0000-4000-8000-000000000004',
    'second@example.test',
    pg_catalog.now(),
    '{"display_name":"Second One","locale":"de"}'
  );

update public.profiles set status = 'suspended'
where id = '83000000-0000-4000-8000-000000000003';

-- The opt-out table is not reachable with the publishable key, so the negative
-- privilege assertions below have to be checked before any row exists.
select ok(
  not has_table_privilege('anon', 'public.email_engagement_optouts', 'SELECT'),
  'the opt-out list is not readable with the publishable key'
);

select ok(
  not has_table_privilege('authenticated', 'public.email_engagement_optouts', 'INSERT'),
  'an authenticated session cannot write opt-outs directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_engagement_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'the digest worker may list recipients'
);

select is(
  (select count(*)::integer from public.list_engagement_recipients(null, 100)),
  2,
  'only active profiles with a confirmed mailbox are digest recipients'
);

select is(
  (select locale from public.list_engagement_recipients(null, 100)
   where user_id = '83000000-0000-4000-8000-000000000001'),
  'en',
  'the recipient carries their own locale for localized copy'
);

select throws_ok(
  $$select public.opt_out_engagement('not-an-email', null)$$,
  '22023',
  null,
  'an invalid address cannot be recorded as an opt-out'
);

select lives_ok(
  $$select public.opt_out_engagement('  Subscriber@Example.TEST  ', 'email_link')$$,
  'a valid address is recorded as an opt-out'
);

select is(
  (select email from public.email_engagement_optouts
   where email = 'subscriber@example.test'),
  'subscriber@example.test',
  'the stored opt-out address is normalised to lower case and trimmed'
);

select is(
  (select count(*)::integer from public.list_engagement_recipients(null, 100)),
  1,
  'an opted-out address is excluded from the next digest batch'
);

select lives_ok(
  $$select public.opt_out_engagement('subscriber@example.test', 'email_link')$$,
  'opting out twice is idempotent rather than an error'
);

-- Keyset pagination: the first page must be resumable without skipping rows.
select is(
  (select count(*)::integer
   from public.list_engagement_recipients(
     (select user_id from public.list_engagement_recipients(null, 1)),
     100
   )),
  0,
  'the batch cursor resumes after the last returned user id'
);

select * from finish();

rollback;
