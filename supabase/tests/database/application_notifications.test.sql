begin;

select plan(23);

insert into auth.users (
  id, email, email_confirmed_at, raw_user_meta_data
) values
  (
    '80000000-0000-4000-8000-000000000001',
    'candidate@example.test',
    pg_catalog.now(),
    '{"display_name":"Candidate One"}'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    'recruiter@example.test',
    pg_catalog.now(),
    '{"display_name":"Recruiter One"}'
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    'outsider@example.test',
    pg_catalog.now(),
    '{"display_name":"Unrelated User"}'
  );

insert into public.candidate_profiles (user_id)
values ('80000000-0000-4000-8000-000000000001');

insert into public.companies (id, name, slug, verification_status)
values (
  '81000000-0000-4000-8000-000000000001',
  'Notification Test Company',
  'notification-test-company',
  'verified'
);

insert into public.company_members (company_id, user_id, membership_role)
values (
  '81000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002',
  'recruiter'
);

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description,
  job_type, workplace_mode, status, reviewed_by, reviewed_at,
  published_at, expires_at
) values (
  '82000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000002',
  'Notification Test Role',
  'notification-test-role',
  'A sufficiently detailed summary for this notification test role.',
  'A sufficiently detailed description for this notification test role and its applicants.',
  'full_time',
  'remote',
  'published',
  '80000000-0000-4000-8000-000000000002',
  pg_catalog.now(),
  pg_catalog.now() - interval '1 day',
  pg_catalog.now() + interval '30 days'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config(
  'test.application_id',
  public.apply_to_job(
    '82000000-0000-4000-8000-000000000001',
    'I would like to apply.',
    true
  )::text,
  true
);

select is(
  (select count(*)::integer
   from public.notifications
   where user_id = (select auth.uid())),
  1,
  'the candidate receives an in-app confirmation after application submission'
);

select is(
  (select event_type
   from public.list_my_application_notifications()
   limit 1),
  'submitted',
  'application confirmation is linked to an auditable submission event'
);

select throws_ok(
  $$select public.get_application_contact_email(
      current_setting('test.application_id')::uuid
    )$$,
  '42501',
  null,
  'a candidate cannot use the employer-only contact lookup'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.application_contact_shares',
    'SELECT'
  ),
  'private contact snapshots have no direct authenticated table grant'
);

set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer
   from public.notifications
   where user_id = (select auth.uid())),
  1,
  'the employer receives an in-app notification for a new application'
);

select is(
  (select count(*)::integer from public.list_company_applications(
    '81000000-0000-4000-8000-000000000001'
  )),
  1,
  'an authorized company recruiter can see the application inbox'
);

select is(
  public.get_application_contact_email(
    current_setting('test.application_id')::uuid
  ),
  'candidate@example.test',
  'the employer can access the candidate email after explicit application consent'
);

select is(
  public.mark_application_viewed(
    current_setting('test.application_id')::uuid
  ) is not null,
  true,
  'opening the application records its first employer view'
);

set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer
   from public.notifications
   where user_id = '80000000-0000-4000-8000-000000000001'),
  2,
  'the candidate receives a separate viewed notification'
);

set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select application_status
   from public.get_company_application_detail(
     current_setting('test.application_id')::uuid
   )),
  'submitted',
  'the authorized employer can load the application detail'
);

select lives_ok(
  $$select public.transition_application(
      current_setting('test.application_id')::uuid,
      'reviewing'
    )$$,
  'the employer can make a permitted application status transition'
);

set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer
   from public.notifications
   where user_id = '80000000-0000-4000-8000-000000000001'),
  3,
  'the candidate receives a notification when the employer updates status'
);

select is(
  (select application_status
   from public.list_my_applications()),
  'reviewing',
  'the candidate can track the latest application status'
);

set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}';

select throws_ok(
  $$select public.mark_application_viewed(
      current_setting('test.application_id')::uuid
    )$$,
  '42501',
  null,
  'an employer cannot mark another company application as viewed'
);

select throws_ok(
  $$select public.get_company_application_detail(
      current_setting('test.application_id')::uuid
    )$$,
  '42501',
  null,
  'an unrelated employer cannot read application details or contact data'
);

select is(
  (select count(*)::integer
   from public.notifications
   where user_id = '80000000-0000-4000-8000-000000000002'),
  0,
  'an unrelated user cannot read the company notification'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.notification_email_outbox',
    'SELECT'
  ),
  'application email queue has no authenticated table access'
);

select throws_ok(
  $$select * from public.claim_notification_email_outbox(20)$$,
  '42501',
  null,
  'authenticated users cannot claim email outbox work'
);

select throws_ok(
  $$select public.finish_notification_email(
      gen_random_uuid(),
      'untrusted-message-id',
      null
    )$$,
  '42501',
  null,
  'authenticated users cannot mark email outbox work as sent'
);

reset role;
set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;

select throws_ok(
  $$select * from public.claim_notification_email_outbox(20)$$,
  '42501',
  null,
  'anonymous users cannot claim email outbox work'
);

select throws_ok(
  $$select public.finish_notification_email(
      gen_random_uuid(),
      'untrusted-message-id',
      null
    )$$,
  '42501',
  null,
  'anonymous users cannot mark email outbox work as sent'
);

reset role;
update auth.users
set email_confirmed_at = null
where id = '80000000-0000-4000-8000-000000000002';
set local "request.jwt.claims" =
  '{"role":"service_role","iss":"supabase"}';
set local role service_role;

select is(
  (select count(*)::integer
   from public.claim_notification_email_outbox(20)),
  3,
  'the service worker claims notifications only for verified email recipients'
);

select is(
  (select count(*)::integer
   from public.notification_email_outbox as o
   join public.notifications as n on n.id = o.notification_id
   where n.user_id = '80000000-0000-4000-8000-000000000002'
     and o.attempt_count = 0
     and o.claimed_at is null),
  1,
  'unverified recipients do not consume retries or become stuck as claimed'
);

reset role;
select * from finish();
rollback;
