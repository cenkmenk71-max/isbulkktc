begin;

select plan(8);

insert into auth.users (
  id, email, email_confirmed_at, raw_user_meta_data
) values
  (
    '80000000-0000-4000-8000-000000000001',
    'resume-candidate@example.test',
    pg_catalog.now(),
    '{"display_name":"Resume Candidate"}'
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    'other-candidate@example.test',
    pg_catalog.now(),
    '{"display_name":"Other Candidate"}'
  );

insert into public.candidate_profiles (user_id)
values
  ('80000000-0000-4000-8000-000000000001'),
  ('80000000-0000-4000-8000-000000000003');

insert into public.companies (id, name, slug, verification_status)
values (
  '81000000-0000-4000-8000-000000000001',
  'Resume Attachment Company',
  'resume-attachment-company',
  'verified'
);

insert into public.jobs (id, company_id, created_by, title, slug, summary, description, job_type, workplace_mode, status, reviewed_by, reviewed_at, published_at, expires_at)
values
  (
    '82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001', 'Parsed Resume Role', 'parsed-resume-role',
    'A sufficiently detailed summary for the parsed resume test role.',
    'A sufficiently detailed description for the parsed resume test role.',
    'full_time', 'remote', 'published',
    '80000000-0000-4000-8000-000000000001', pg_catalog.now(),
    pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '30 days'
  ),
  (
    '82000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001', 'Uploaded Resume Role', 'uploaded-resume-role',
    'A sufficiently detailed summary for the uploaded resume test role.',
    'A sufficiently detailed description for the uploaded resume test role.',
    'full_time', 'remote', 'published',
    '80000000-0000-4000-8000-000000000001', pg_catalog.now(),
    pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '30 days'
  ),
  (
    '82000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001', 'Other Candidate Resume Role', 'other-candidate-resume-role',
    'A sufficiently detailed summary for the other candidate resume test role.',
    'A sufficiently detailed description for the other candidate resume test role.',
    'full_time', 'remote', 'published',
    '80000000-0000-4000-8000-000000000001', pg_catalog.now(),
    pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '30 days'
  ),
  (
    '82000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001', 'No Resume Role', 'no-resume-role',
    'A sufficiently detailed summary for the no resume test role.',
    'A sufficiently detailed description for the no resume test role.',
    'full_time', 'remote', 'published',
    '80000000-0000-4000-8000-000000000001', pg_catalog.now(),
    pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '30 days'
  ),
  (
    '82000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001', 'Duplicate Role', 'duplicate-role',
    'A sufficiently detailed summary for the duplicate test role.',
    'A sufficiently detailed description for the duplicate test role.',
    'full_time', 'remote', 'published',
    '80000000-0000-4000-8000-000000000001', pg_catalog.now(),
    pg_catalog.now() - interval '1 day', pg_catalog.now() + interval '30 days'
  );

insert into public.resumes (id, candidate_id, storage_path, original_filename, file_size_bytes, mime_type, status)
values
  (
    '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001/parsed.pdf', 'parsed.pdf', 1024, 'application/pdf', 'parsed'
  ),
  (
    '90000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000001/uploaded.pdf', 'uploaded.pdf', 1024, 'application/pdf', 'uploaded'
  ),
  (
    '90000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000003/parsed.pdf', 'parsed.pdf', 1024, 'application/pdf', 'parsed'
  );

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.apply_to_job(
      '82000000-0000-4000-8000-000000000001',
      'I would like to apply with my CV.',
      true,
      '90000000-0000-4000-8000-000000000001'
    )$$,
  'apply_to_job accepts an owned, parsed resume_id'
);

select is(
  (select resume_id from public.applications where job_id = '82000000-0000-4000-8000-000000000001'),
  '90000000-0000-4000-8000-000000000001',
  'the attached resume is stored on the application row'
);

select throws_ok(
  $$select public.apply_to_job(
      '82000000-0000-4000-8000-000000000002',
      'This resume is not parsed yet.',
      false,
      '90000000-0000-4000-8000-000000000002'
    )$$,
  '22023',
  null,
  'apply_to_job rejects a resume whose status is not parsed'
);

select throws_ok(
  $$select public.apply_to_job(
      '82000000-0000-4000-8000-000000000003',
      "This resume belongs to someone else.",
      false,
      '90000000-0000-4000-8000-000000000003'
    )$$,
  '22023',
  null,
  'apply_to_job rejects a resume owned by another candidate'
);

select lives_ok(
  $$select public.apply_to_job(
      '82000000-0000-4000-8000-000000000004',
      'No CV attached.',
      false,
      null
    )$$,
  'apply_to_job accepts a null resume_id'
);

select is(
  (select resume_id from public.applications where job_id = '82000000-0000-4000-8000-000000000004'),
  null,
  'a null resume_id is stored as null on the application row'
);

select lives_ok(
  $$select public.apply_to_job(
      '82000000-0000-4000-8000-000000000005',
      'First application to this role.',
      false,
      null
    )$$,
  'the first application to a role is accepted'
);

select throws_ok(
  $$select public.apply_to_job(
      '82000000-0000-4000-8000-000000000005',
      'A second application to the same role.',
      false,
      null
    )$$,
  '23505',
  null,
  'a duplicate application to the same role is rejected'
);

commit;
