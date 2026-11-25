begin;

select plan(15);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('a1000000-0000-4000-8000-000000000001', 'core-candidate-a@example.test', '{"display_name":"Core Candidate A"}'),
  ('a1000000-0000-4000-8000-000000000002', 'core-employer-b@example.test', '{"display_name":"Core Employer B"}'),
  ('a1000000-0000-4000-8000-000000000003', 'core-candidate-c@example.test', '{"display_name":"Core Candidate C"}'),
  ('a1000000-0000-4000-8000-000000000004', 'core-employer-d@example.test', '{"display_name":"Core Employer D"}');

insert into public.companies (id, name, slug, verification_status)
values
  ('a2000000-0000-4000-8000-000000000001', 'Core Company B', 'core-company-b', 'verified'),
  ('a2000000-0000-4000-8000-000000000002', 'Core Company D', 'core-company-d', 'verified');

insert into public.company_members (company_id, user_id, membership_role, status)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002', 'owner', 'active'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000004', 'owner', 'active');

insert into public.jobs (
  id, company_id, created_by, title, slug, summary, description, job_type,
  workplace_mode, district, status, reviewed_by, reviewed_at, published_at, expires_at
)
values
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'Core test opening', 'core-test-opening',
    'A sufficiently long summary for the core RLS test opening.',
    'A sufficiently long description for the core RLS test opening and application relationship.',
    'full_time', 'remote', 'Girne', 'published',
    'a1000000-0000-4000-8000-000000000002', now(), now(), now() + interval '30 days'
  );

insert into public.applications (id, job_id, candidate_id, cover_letter, status)
values (
  'a4000000-0000-4000-8000-000000000001',
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'A synthetic application for the conversation test.',
  'submitted'
);

insert into public.resumes (
  id, candidate_id, storage_path, original_filename, file_size_bytes, mime_type
)
values (
  'a5000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001/resume.pdf',
  'resume.pdf', 1024, 'application/pdf'
), (
  'a5000000-0000-4000-8000-000000000002',
  'a1000000-0000-4000-8000-000000000003',
  'a1000000-0000-4000-8000-000000000003/resume.pdf',
  'resume.pdf', 1024, 'application/pdf'
);

insert into public.resume_versions (resume_id, version, structured_data)
values (
  'a5000000-0000-4000-8000-000000000001',
  1,
  '{"headline":"Synthetic profile"}'::jsonb
);

insert into public.conversations (id, subject)
values ('a6000000-0000-4000-8000-000000000001', 'Unrelated conversation');

insert into public.conversation_members (conversation_id, user_id, role)
values
  ('a6000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003', 'owner'),
  ('a6000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000004', 'member');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.resumes),
  1,
  'a candidate can read only their own resume metadata'
);

select is(
  (select count(*)::integer from public.resume_versions),
  1,
  'resume versions are visible only through the owned resume'
);

select lives_ok(
  $$insert into public.saved_jobs (user_id, job_id)
    values ((select auth.uid()), 'a3000000-0000-4000-8000-000000000001')$$,
  'a candidate can save a currently published job'
);

select is(
  (select count(*)::integer from public.saved_jobs),
  1,
  'the saved job is visible to its owner'
);

select throws_ok(
  $$insert into public.saved_jobs (user_id, job_id)
    values ((select auth.uid()), 'a3000000-0000-4000-8000-000000000001')$$,
  '23505',
  null,
  'a candidate cannot save the same job twice'
);

select lives_ok(
  $$select set_config(
      'test.core_conversation_id',
      public.start_conversation(
        array[
          'a1000000-0000-4000-8000-000000000001'::uuid,
          'a1000000-0000-4000-8000-000000000002'::uuid
        ],
        'Application conversation'
      )::text,
      true
    )$$,
  'conversation creation requires a real shared application'
);

select lives_ok(
  $$select public.send_message(
      current_setting('test.core_conversation_id')::uuid,
      'A synthetic application message.',
      'text',
      '{}'::jsonb
    )$$,
  'an active conversation member can send a text message'
);

select is(
  (select count(*)::integer
   from public.messages
   where conversation_id = current_setting('test.core_conversation_id')::uuid),
  1,
  'a member can read messages in their conversation'
);

select is(
  (select count(*)::integer
   from public.messages
   where conversation_id = 'a6000000-0000-4000-8000-000000000001'),
  0,
  'a non-member cannot read another conversation'
);

select throws_ok(
  $$insert into public.messages (conversation_id, sender_id, body)
    values (
      'a6000000-0000-4000-8000-000000000001',
      (select auth.uid()),
      'A message outside the caller conversation.'
    )$$,
  '42501',
  null,
  'a candidate cannot write into a conversation they do not belong to'
);

select throws_ok(
  $$update public.resumes
    set status = 'parsed'
    where id = 'a5000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'candidates cannot set worker-owned resume processing state'
);

select throws_ok(
  $$select count(*) from public.integration_sync_runs$$,
  '42501',
  null,
  'integration synchronization logs are not exposed to authenticated users'
);

set local "request.jwt.claims" =
  '{"sub":"a1000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer
   from public.messages
   where conversation_id = current_setting('test.core_conversation_id')::uuid),
  1,
  'the matched employer can read the application conversation'
);

select is(
  (select count(*)::integer from public.resumes),
  0,
  'an employer cannot read a candidate resume metadata row'
);

reset role;
set local role anon;

select throws_ok(
  $$select count(*) from public.resumes$$,
  '42501',
  null,
  'anonymous clients cannot read resumes'
);

select * from finish();
rollback;
