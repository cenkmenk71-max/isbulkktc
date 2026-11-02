begin;

select plan(45);

-- Web Push tables are capability storage: an endpoint plus its two keys is
-- enough to deliver a notification to a device. The whole client surface is
-- RPC-only, and an endpoint identifies a browser profile rather than an account
-- (so re-registering one *reassigns* it). These assertions pin both properties.

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (
    '86000000-0000-4000-8000-000000000001',
    'push-owner-a@example.test',
    pg_catalog.now(),
    '{"display_name":"Push Owner A","locale":"en"}'
  ),
  (
    '86000000-0000-4000-8000-000000000002',
    'push-owner-b@example.test',
    pg_catalog.now(),
    '{"display_name":"Push Owner B","locale":"de"}'
  ),
  (
    '86000000-0000-4000-8000-000000000003',
    'push-suspended@example.test',
    pg_catalog.now(),
    '{"display_name":"Push Suspended","locale":"tr"}'
  );

update public.profiles set status = 'suspended'
where id = '86000000-0000-4000-8000-000000000003';

insert into public.candidate_profiles (user_id)
values ('86000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- No direct table access
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.push_subscriptions', 'SELECT'),
  'the push subscription store is not readable with the publishable key'
);

select ok(
  not has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT'),
  'a signed-in session cannot read the push subscription store directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT'),
  'a signed-in session cannot insert push subscriptions directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE'),
  'a signed-in session cannot update push subscriptions directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE'),
  'a signed-in session cannot delete push subscriptions directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.push_notification_preferences', 'SELECT'),
  'push preferences have no direct authenticated grant'
);

-- ---------------------------------------------------------------------------
-- Anonymous callers are locked out of every RPC
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;

select throws_ok(
  $$select public.register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40),
      pg_catalog.repeat('A', 80),
      pg_catalog.repeat('B', 24),
      'anon'
    )$$,
  '42501',
  null,
  'an anonymous caller cannot register a push subscription'
);

select throws_ok(
  $$select * from public.list_my_push_subscriptions()$$,
  '42501',
  null,
  'an anonymous caller cannot list push subscriptions'
);

select throws_ok(
  $$select public.revoke_push_subscription('')$$,
  '42501',
  null,
  'an anonymous caller cannot revoke push subscriptions'
);

-- ---------------------------------------------------------------------------
-- Owner A registers
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40),
      pg_catalog.repeat('A', 80),
      pg_catalog.repeat('B', 24),
      'Mozilla/5.0 Test Browser'
    )$$,
  'an active account can register its own push subscription'
);

select is(
  (select count(*)::integer from public.list_my_push_subscriptions()),
  1,
  'the owner sees exactly their own subscription'
);

-- The account's locale is captured for notification copy, but it is *not* part
-- of the client-facing row: only the delivery worker needs it, so exposing it to
-- the session would be a needless leak. Read it back the way the worker does.
reset role;

select is(
  (
    select locale
    from public.push_subscriptions
    where user_id = '86000000-0000-4000-8000-000000000001'
      and revoked_at is null
  ),
  'en',
  'registering a subscription captures the account locale for notification copy'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as p
    where p.proname = 'list_my_push_subscriptions'
      and pg_catalog.pg_get_function_result(p.oid) like '%locale%'
  ),
  'the client-facing subscription row never exposes the delivery locale'
);

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- A suspended account must not be able to keep or create a delivery channel.
set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select public.register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('z', 40),
      pg_catalog.repeat('A', 80),
      pg_catalog.repeat('B', 24),
      null
    )$$,
  '42501',
  null,
  'a suspended account cannot register a push subscription'
);

-- ---------------------------------------------------------------------------
-- Malformed credentials are rejected before storage
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select public.register_push_subscription(
      'http://insecure.example.test/push',
      pg_catalog.repeat('A', 80),
      pg_catalog.repeat('B', 24),
      null
    )$$,
  '22023',
  null,
  'a non-HTTPS push endpoint is rejected'
);

select throws_ok(
  $$select public.register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40),
      'short',
      pg_catalog.repeat('B', 24),
      null
    )$$,
  '22023',
  null,
  'an undersized p256dh key is rejected'
);

-- ---------------------------------------------------------------------------
-- An endpoint is a browser, not an account: registering it again reassigns it
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40),
      pg_catalog.repeat('C', 80),
      pg_catalog.repeat('D', 24),
      'Second Browser'
    )$$,
  'a second account can claim the same browser endpoint'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.push_subscriptions
    where endpoint = 'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40)
  ),
  1,
  're-registering an endpoint leaves exactly one row, never two'
);

select is(
  (
    select user_id
    from public.push_subscriptions
    where endpoint = 'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40)
  ),
  '86000000-0000-4000-8000-000000000002'::uuid,
  'the endpoint is reassigned to the account that registered it last'
);

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::integer from public.list_my_push_subscriptions()),
  0,
  'the previous owner no longer sees the reassigned endpoint'
);

-- `revoke_push_subscription` is `void`, so "it did nothing" is asserted by the
-- call succeeding *and* the row surviving (checked below), not by its return
-- value — a void function casts to an empty string, never to NULL.
select lives_ok(
  $$select public.revoke_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40)
    )$$,
  'revoking an endpoint the caller does not own is a silent no-op'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.push_subscriptions
    where endpoint = 'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40)
  ),
  1,
  'a non-owner cannot delete another account''s subscription'
);

-- ---------------------------------------------------------------------------
-- Preferences default safely and are per-account
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

select is(
  (select marketing from public.get_my_push_preferences()),
  false,
  'promotional push is off until the account opts in'
);

select is(
  (select application_updates from public.get_my_push_preferences()),
  true,
  'transactional application push defaults on'
);

select lives_ok(
  $$select public.set_push_notification_preferences(true, false, true, true, true)$$,
  'an account can save its notification preferences'
);

select is(
  (select marketing from public.get_my_push_preferences()),
  true,
  'the saved preference is read back'
);

select is(
  (select job_alerts from public.get_my_push_preferences()),
  false,
  'a disabled category stays disabled'
);

set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select marketing from public.get_my_push_preferences()),
  false,
  'one account''s preferences do not leak into another account'
);

-- ---------------------------------------------------------------------------
-- Sign-out revokes every device for the caller
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.register_push_subscription(
      'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('a', 40),
      pg_catalog.repeat('A', 80),
      pg_catalog.repeat('B', 24),
      null
    )$$,
  'the original owner registers a fresh endpoint'
);

select lives_ok(
  $$select public.revoke_push_subscription('')$$,
  'sign-out revokes every subscription the caller owns'
);

select is(
  (select count(*)::integer from public.list_my_push_subscriptions()),
  0,
  'no subscription survives the sign-out revoke'
);

-- ---------------------------------------------------------------------------
-- Delivery RPCs are service-role only
-- ---------------------------------------------------------------------------

reset role;
set local "request.jwt.claims" =
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select * from public.list_push_targets_for_notification(
      '86000000-0000-4000-8000-000000000001',
      'application_updates'
    )$$,
  '42501',
  null,
  'an authenticated session cannot enumerate push targets'
);

select throws_ok(
  $$select * from public.claim_application_push_notifications(20)$$,
  '42501',
  null,
  'an authenticated session cannot claim push work'
);

select throws_ok(
  $$select public.finish_application_push_notification(gen_random_uuid(), true)$$,
  '42501',
  null,
  'an authenticated session cannot mark push work as sent'
);

select throws_ok(
  $$select public.record_push_delivery_result(gen_random_uuid(), true, false)$$,
  '42501',
  null,
  'an authenticated session cannot record push delivery results'
);

-- ---------------------------------------------------------------------------
-- Target selection respects the recipient's toggles
-- ---------------------------------------------------------------------------

reset role;
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_key, locale)
values (
  '86000000-0000-4000-8000-000000000001',
  'https://fcm.googleapis.com/fcm/send/' || pg_catalog.repeat('q', 40),
  pg_catalog.repeat('A', 80),
  pg_catalog.repeat('B', 24),
  'en'
);

set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.list_push_targets_for_notification(
      '86000000-0000-4000-8000-000000000001',
      'application_updates'
    )
  ),
  1,
  'a transactional category targets the account''s live subscription by default'
);

select is(
  (
    select count(*)::integer
    from public.list_push_targets_for_notification(
      '86000000-0000-4000-8000-000000000001',
      'marketing'
    )
  ),
  0,
  'a promotional category targets nobody until the account opts in'
);

select throws_ok(
  $$select * from public.list_push_targets_for_notification(
      '86000000-0000-4000-8000-000000000001',
      'not_a_category'
    )$$,
  '22023',
  null,
  'an unknown notification category is rejected'
);

-- A revoked subscription is never targeted.
reset role;
update public.push_subscriptions
set revoked_at = pg_catalog.now()
where user_id = '86000000-0000-4000-8000-000000000001';

set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.list_push_targets_for_notification(
      '86000000-0000-4000-8000-000000000001',
      'application_updates'
    )
  ),
  0,
  'a revoked subscription is never a push target'
);

-- ---------------------------------------------------------------------------
-- Application notifications are claimed once and finished once
-- ---------------------------------------------------------------------------

reset role;
insert into public.companies (id, name, slug, verification_status)
values (
  '87000000-0000-4000-8000-000000000001',
  'Push Test Company',
  'push-test-company',
  'verified'
);

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, status, reviewed_by, reviewed_at,
  published_at, expires_at
) values (
  '88000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000002',
  'Push Test Role',
  'push-test-role',
  'A sufficiently detailed summary for the push notification test role.',
  'A sufficiently detailed description for the push notification test role and its applicants.',
  'full_time',
  'remote',
  'published',
  '86000000-0000-4000-8000-000000000002',
  pg_catalog.now(),
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '30 days'
);

insert into public.applications (id, job_id, candidate_id, status)
values (
  '89000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  'reviewing'
);

insert into public.application_events (
  id, application_id, event_type, from_status, to_status
) values (
  '8a000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  'status_changed',
  'submitted',
  'reviewing'
);

insert into public.notifications (id, user_id, application_event_id)
values (
  '8b000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  '8a000000-0000-4000-8000-000000000001'
);

set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';
set local role service_role;

select is(
  (
    select count(*)::integer
    from public.claim_application_push_notifications(20)
  ),
  1,
  'the worker claims a pending application notification'
);

reset role;

select is(
  (
    select push_attempt_count
    from public.notifications
    where id = '8b000000-0000-4000-8000-000000000001'
  ),
  1,
  'claiming a notification increments its attempt count'
);

set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';
set local role service_role;

select lives_ok(
  $$select public.finish_application_push_notification(
      '8b000000-0000-4000-8000-000000000001',
      true
    )$$,
  'the worker can mark a notification as pushed'
);

select is(
  (
    select count(*)::integer
    from public.claim_application_push_notifications(20)
  ),
  0,
  'a delivered notification is not claimed a second time'
);

select lives_ok(
  $$select public.record_push_delivery_result(
      (
        select id
        from public.push_subscriptions
        where user_id = '86000000-0000-4000-8000-000000000001'
      ),
      false,
      true
    )$$,
  'the worker can record a permanent delivery failure'
);

reset role;

select ok(
  (
    select revoked_at is not null
    from public.push_subscriptions
    where user_id = '86000000-0000-4000-8000-000000000001'
  ),
  'a permanently failed endpoint is revoked instead of retried forever'
);

select * from finish();

rollback;
