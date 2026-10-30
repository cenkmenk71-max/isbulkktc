begin;

select plan(47);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '00000000-0000-4000-8000-00000000000a',
    'v4-candidate-a@example.test',
    '{"display_name":"Candidate A"}'
  ),
  (
    '00000000-0000-4000-8000-00000000000b',
    'v4-candidate-b@example.test',
    '{"display_name":"Candidate B"}'
  ),
  (
    '00000000-0000-4000-8000-00000000000c',
    'v4-platform-admin@example.test',
    '{"display_name":"Platform Admin"}'
  ),
  (
    '00000000-0000-4000-8000-00000000000d',
    'v4-oauth-full-name@example.test',
    '{"full_name":"LinkedIn Candidate"}'
  ),
  (
    '00000000-0000-4000-8000-00000000000e',
    'v4-oauth-name@example.test',
    '{"name":"Facebook Candidate"}'
  ),
  (
    '00000000-0000-4000-8000-00000000000f',
    'v4-oauth-long-name@example.test',
    pg_catalog.jsonb_build_object('name', pg_catalog.repeat('x', 90))
  ),
  (
    '00000000-0000-4000-8000-000000000010',
    'v4-oauth-empty-name@example.test',
    '{"display_name":" "}'
  ),
  (
    '00000000-0000-4000-8000-000000000011',
    'v4-signup-locale-fa@example.test',
    '{"display_name":"Locale Fa","locale":"fa"}'
  ),
  (
    '00000000-0000-4000-8000-000000000012',
    'v4-untrusted-locale@example.test',
    '{"display_name":"Invalid Locale","locale":"xx"}'
  );

select is(
  (select display_name from public.profiles
   where id = '00000000-0000-4000-8000-00000000000d'),
  'LinkedIn Candidate',
  'OAuth full_name metadata populates the new profile name'
);

select is(
  (select display_name from public.profiles
   where id = '00000000-0000-4000-8000-00000000000e'),
  'Facebook Candidate',
  'OAuth name metadata populates the new profile name'
);

select is(
  (select pg_catalog.char_length(display_name) from public.profiles
   where id = '00000000-0000-4000-8000-00000000000f'),
  80,
  'untrusted OAuth display names are bounded to the profile limit'
);

select is(
  (select display_name from public.profiles
   where id = '00000000-0000-4000-8000-000000000010'),
  'v4-oauth-empty-name',
  'blank OAuth metadata falls back to the email local part'
);

select is(
  (select locale from public.profiles
   where id = '00000000-0000-4000-8000-000000000011'),
  'fa',
  'an allowlisted signup locale is persisted on the new profile'
);

select is(
  (select locale from public.profiles
   where id = '00000000-0000-4000-8000-000000000012'),
  'tr',
  'an unsupported signup locale falls back to the profile default'
);

insert into public.companies (name, slug, verification_status)
values ('Verified Public Company', 'verified-public-company', 'verified');

insert into public.user_roles (user_id, role)
values ('00000000-0000-4000-8000-00000000000c', 'platform_admin');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is(
  (select pg_catalog.count(*)::integer from public.profiles),
  1,
  'candidate can read only their auth-created profile'
);

select lives_ok(
  $$update public.profiles
    set display_name = 'Candidate Updated'
    where id = (select auth.uid())$$,
  'candidate can update their own display name'
);

select ok(
  not exists (
    select 1 from public.profiles
    where id <> (select auth.uid())
  ),
  'candidate cannot read another profile'
);

select is(
  (select pg_catalog.count(*)::integer from public.user_roles),
  0,
  'a newly registered candidate receives no privileged platform role'
);

select throws_ok(
  $$update public.profiles
    set status = 'suspended'
    where id = (select auth.uid())$$,
  '42501',
  null,
  'candidates cannot modify their trusted account status'
);

select throws_ok(
  $$insert into public.user_roles (user_id, role)
    values ((select auth.uid()), 'platform_admin')$$,
  '42501',
  null,
  'authenticated users cannot grant themselves platform-admin access'
);

select lives_ok(
  $$insert into public.candidate_profiles (user_id, headline, experience)
    values (
      (select auth.uid()),
      'Aday profili',
      '[{"role":"Tasarımcı","organization":"Örnek şirket","startDate":"2023","endDate":"2025","description":"Ürün deneyimleri tasarladı."}]'::jsonb
    )$$,
  'candidate can create their own candidate profile'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.candidate_profiles
   where user_id = (select auth.uid())),
  1,
  'candidate can read their own candidate profile'
);

select lives_ok(
  $$update public.candidate_profiles
    set location = 'Mağusa',
        education = '[{"institution":"Örnek üniversite","qualification":"Lisans","field":"Tasarım","startDate":"2018","endDate":"2022","description":""}]'::jsonb,
        languages = '[{"name":"Türkçe","proficiency":"Ana dil"}]'::jsonb,
        certifications = '[{"name":"Erişilebilir tasarım","issuer":"Örnek kurum","issueDate":"2024","expiryDate":""}]'::jsonb
    where user_id = (select auth.uid())$$,
  'candidate can save the structured sections of their own profile'
);

-- PostgREST turns `upsert(..., { onConflict: 'user_id' })` into an INSERT with
-- `ON CONFLICT (user_id) DO UPDATE SET "user_id" = excluded."user_id"`, so the
-- update path needs UPDATE on user_id. 20261023120000 adds that grant.
select lives_ok(
  $$insert into public.candidate_profiles (user_id, headline, location, skills)
    values ((select auth.uid()), 'Upsert headline', 'Girne', array['sql']::text[])
    on conflict (user_id) do update
      set "user_id" = excluded."user_id",
          "headline" = excluded."headline",
          "location" = excluded."location",
          "skills" = excluded."skills"$$,
  'a candidate can upsert their own profile with the PostgREST conflict target'
);

select throws_ok(
  $$insert into public.candidate_profiles (user_id, headline)
    values ('00000000-0000-4000-8000-00000000000b', 'Written by someone else')
    on conflict (user_id) do update
      set "user_id" = excluded."user_id",
          "headline" = excluded."headline"$$,
  '42501',
  null,
  'the upsert grant does not let a candidate write another candidate profile'
);

select throws_ok(
  $$update public.candidate_profiles
    set user_id = '00000000-0000-4000-8000-00000000000b'
    where user_id = (select auth.uid())$$,
  '42501',
  null,
  'the upsert grant does not let a candidate hand their profile to another user'
);

select throws_ok(
  $$update public.candidate_profiles
    set location = 'Gazimağusa'
    where user_id = (select auth.uid())$$,
  '23514',
  null,
  'candidate profile location rejects the legacy Gazimağusa label'
);

select throws_ok(
  $$update public.candidate_profiles
    set location = 'Alsancak'
    where user_id = (select auth.uid())$$,
  '23514',
  null,
  'candidate profile location rejects a locality instead of one of the six districts'
);

select throws_ok(
  $$update public.candidate_profiles
    set experience = '[{"role":123}]'::jsonb
    where user_id = (select auth.uid())$$,
  '23514',
  null,
  'candidate profile sections reject invalid field types'
);

select throws_ok(
  $$update public.candidate_profiles
    set visibility = 'public'
    where user_id = (select auth.uid())$$,
  '42501',
  null,
  'candidates cannot publish a private profile directly'
);

select lives_ok(
  $$select public.create_company('A Aday Company', 'v4-candidate-a-company')$$,
  'authenticated owner creates a company through the secure transaction'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.company_members
   where user_id = (select auth.uid())
     and membership_role = 'owner'
     and status = 'active'),
  1,
  'company creation atomically establishes its initial owner membership'
);

select lives_ok(
  $$insert into public.company_profile_submissions (
      company_id,
      submitted_by,
      company_name,
      profile_description,
      categories,
      municipality,
      directory_entry_id,
      directory_location_index
    )
    select
      id,
      (select auth.uid()),
      'A Aday Company',
      'Company supplied profile information.',
      array['Technology'],
      'Mağusa',
      'ChIJTestDirectoryEntry123456789',
      0
    from public.companies
    where slug = 'v4-candidate-a-company'$$,
  'an active company owner can submit company profile details for review'
);

select throws_ok(
  $$update public.company_profile_submissions
    set municipality = 'Gazimağusa'
    where company_id = (
      select id from public.companies where slug = 'v4-candidate-a-company'
    )$$,
  '23514',
  null,
  'company profile submissions reject the legacy Gazimağusa label'
);

select throws_ok(
  $$update public.company_profile_submissions
    set municipality = 'Alsancak'
    where company_id = (
      select id from public.companies where slug = 'v4-candidate-a-company'
    )$$,
  '23514',
  null,
  'company profile submissions reject localities as district values'
);

select set_config(
  'test.company_a_id',
  (
    select id::text
    from public.companies
    where slug = 'v4-candidate-a-company'
  ),
  true
);

select is(
  (select pg_catalog.count(*)::integer
   from public.company_profile_submissions
   where company_id = (
     select id from public.companies where slug = 'v4-candidate-a-company'
   )
     and status = 'pending'),
  1,
  'company owners can read their pending profile submission'
);

select throws_ok(
  $$update public.company_profile_submissions
    set status = 'approved'
    where company_id = (
      select id from public.companies where slug = 'v4-candidate-a-company'
    )$$,
  '42501',
  null,
  'company owners cannot approve their own profile submissions'
);

select throws_ok(
  $$insert into public.companies (name, slug)
    values ('Untrusted Company', 'untrusted-company')$$,
  '42501',
  null,
  'clients cannot bypass the company-creation RPC'
);

select throws_ok(
  $$insert into public.company_members (company_id, user_id, membership_role)
    select id, (select auth.uid()), 'owner'
    from public.companies
    where slug = 'v4-candidate-a-company'$$,
  '42501',
  null,
  'clients cannot assign or promote company memberships directly'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}';

select ok(
  not exists (
    select 1 from public.profiles
    where id <> (select auth.uid())
  ),
  'a second candidate cannot read the first candidate profile'
);

select ok(
  not exists (
    select 1 from public.candidate_profiles
    where user_id = '00000000-0000-4000-8000-00000000000a'
  ),
  'a second candidate cannot read another candidate personal profile'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.company_profile_submissions
   where company_id = current_setting('test.company_a_id')::uuid),
  0,
  'an unrelated company user cannot read a pending profile submission'
);

select throws_ok(
  $$insert into public.company_profile_submissions (
      company_id,
      submitted_by,
      company_name
    )
    select
      current_setting('test.company_a_id')::uuid,
      (select auth.uid()),
      'Unauthorized company update'
  $$,
  '42501',
  null,
  'an unrelated candidate cannot submit a profile for another company'
);

select throws_ok(
  $$select public.review_company_profile_submission(
      (select id from public.company_profile_submissions limit 1),
      'approved',
      null
    )$$,
  '42501',
  null,
  'ordinary candidates cannot use the privileged company profile review function'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.companies
   where slug = 'v4-candidate-a-company'),
  0,
  'an unrelated candidate cannot see an unverified company'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.companies
   where slug = 'verified-public-company'),
  1,
  'a public verified company is visible to authenticated visitors'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.review_company_profile_submission(
      (
        select id
        from public.company_profile_submissions
        where company_name = 'A Aday Company'
      ),
      'approved',
      'Company details reviewed'
    )$$,
  'an active platform administrator can approve a company profile submission'
);

select is(
  (select status::text
   from public.company_profile_submissions
   where company_name = 'A Aday Company'),
  'approved',
  'approved submissions record the administrator decision'
);

select is(
  (select verification_status::text
   from public.companies
   where slug = 'v4-candidate-a-company'),
  'pending',
  'publishing directory information does not falsely verify the company'
);

select throws_ok(
  $$insert into storage.objects (bucket_id, name)
    values ('private-resumes', (select auth.uid())::text || '/resume.pdf')$$,
  '42501',
  null,
  'private resume uploads remain denied until the scanning/access flow is approved'
);

select throws_ok(
  $$select id from public.audit_logs limit 1$$,
  '42501',
  null,
  'ordinary company users cannot read privileged audit records'
);

set local "request.jwt.claims" =
  '{"role":"anon","iss":"supabase","aud":"authenticated"}';
reset role;
set local role anon;

select throws_ok(
  $$select id from public.profiles limit 1$$,
  '42501',
  null,
  'anonymous clients have no direct access to candidate profiles'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.companies
   where slug = 'verified-public-company'),
  1,
  'anonymous visitors can read public verified companies'
);

select is(
  (select pg_catalog.count(*)::integer
   from public.company_directory_overrides
   where directory_entry_id = 'ChIJTestDirectoryEntry123456789'),
  1,
  'anonymous visitors can read only approved public directory profile overrides'
);

select throws_ok(
  $$select company_name from public.company_profile_submissions limit 1$$,
  '42501',
  null,
  'anonymous visitors cannot read private company profile submissions'
);

select * from finish();

rollback;
