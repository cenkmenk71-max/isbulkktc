begin;

-- `submit_sales_lead` is the anonymous entry point for corporate quote requests,
-- and `public.sales_leads` shipped with no suite at all — the RPC's normalisation
-- contract and its least-privilege surface were unpinned. This suite closes that
-- gap and records the phone-length regression fixed in
-- 20261105120000_v4_sales_lead_phone_normalization.sql: the visitor form accepts
-- any phone up to 32 characters with no minimum, but the column requires 4–32, so
-- a short value used to fail the whole INSERT with `23514`.

select plan(25);

-- ---------------------------------------------------------------------------
-- Least privilege: the table is service-role-only, the visitor writes through
-- the RPC and nothing else.
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.sales_leads', 'SELECT'),
  'the sales-lead table is not readable with the publishable key'
);

select ok(
  not has_table_privilege('authenticated', 'public.sales_leads', 'SELECT'),
  'an authenticated session cannot read sales leads directly'
);

select ok(
  not has_table_privilege('anon', 'public.sales_leads', 'INSERT'),
  'the publishable key cannot insert sales leads directly'
);

select ok(
  has_function_privilege(
    'anon',
    'public.submit_sales_lead(text,text,text,text,text,integer,text,text)',
    'EXECUTE'
  ),
  'anonymous visitors submit leads through the RPC'
);

-- ---------------------------------------------------------------------------
-- An anonymous visitor can submit a lead, and the row is normalised.
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" = '{"role":"anon","iss":"supabase"}';

select lives_ok(
  $$select public.submit_sales_lead(
      '  Acme Ltd  ',
      'Dana Prospect',
      '  Dana@Example.TEST ',
      '+90 533 000 0000',
      'growth',
      30,
      'Please call me back about the corporate plan.',
      'en'
    )$$,
  'an anonymous visitor can submit a sales lead'
);

reset role;

select is(
  (select email from public.sales_leads where email = 'dana@example.test'),
  'dana@example.test',
  'the stored lead address is normalised to lower case and trimmed'
);

select is(
  (select phone from public.sales_leads where email = 'dana@example.test'),
  '+90 533 000 0000',
  'a valid phone number is stored as typed'
);

select is(
  (select company_name from public.sales_leads where email = 'dana@example.test'),
  'Acme Ltd',
  'the company name is trimmed before storage'
);

select is(
  (select locale from public.sales_leads where email = 'dana@example.test'),
  'en',
  'the requested locale is stored for localised copy'
);

select is(
  (select marketing_consent from public.sales_leads where email = 'dana@example.test'),
  false,
  'the legacy eight-argument RPC never infers marketing consent'
);

set local role anon;
set local "request.jwt.claims" = '{"role":"anon","iss":"supabase"}';

select lives_ok(
  $query$select public.submit_sales_lead(
      'Consent Ltd', 'Dana Consent', 'consent@example.test', null, null, null,
      null, 'tr', true
    )$query$,
  'an anonymous visitor can request promotional consent confirmation'
);

reset role;

select ok(
  (select not marketing_consent
      and marketing_consent_requested_at is not null
      and marketing_consent_at is null
      and marketing_consent_version = 'sales-lead-marketing-v1'
   from public.sales_leads
   where email = 'consent@example.test'),
  'the checkbox records a pending request, not confirmed consent'
);

set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';

select is(
  public.confirm_sales_lead_marketing_consent(
    (select id from public.sales_leads where email = 'consent@example.test'),
    'sales-lead-marketing-v1',
    encode(extensions.digest('consent@example.test', 'sha256'), 'hex')
  ),
  true,
  'the service-role confirmation action activates a pending request'
);

reset role;

select ok(
  (select marketing_consent
      and marketing_consent_requested_at is not null
      and marketing_consent_at is not null
      and marketing_consent_version = 'sales-lead-marketing-v1'
   from public.sales_leads
   where email = 'consent@example.test'),
  'confirmed consent has both request and confirmation timestamps'
);

set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';

select is(
  public.confirm_sales_lead_marketing_consent(
    (select id from public.sales_leads where email = 'consent@example.test'),
    'sales-lead-marketing-v1',
    encode(extensions.digest('consent@example.test', 'sha256'), 'hex')
  ),
  true,
  'replaying a successfully consumed confirmation link is idempotent'
);

select is(
  public.confirm_sales_lead_marketing_consent(
    (select id from public.sales_leads where email = 'consent@example.test'),
    'sales-lead-marketing-v1',
    encode(extensions.digest('different@example.test', 'sha256'), 'hex')
  ),
  false,
  'a valid signature cannot confirm a different current email address'
);

reset role;

insert into public.sales_leads (
  id, company_name, email, locale, status,
  marketing_consent_requested_at, marketing_consent_version
) values
  ('84000000-0000-4000-8000-000000000005', 'Expired', 'expired@example.test', 'tr', 'new',
   pg_catalog.now() - interval '15 days', 'sales-lead-marketing-v1'),
  ('84000000-0000-4000-8000-000000000006', 'Suppressed', 'suppressed@example.test', 'tr', 'new',
   pg_catalog.now(), 'sales-lead-marketing-v1');

insert into public.email_engagement_optouts (email, reason)
values ('suppressed@example.test', 'email_link');

set local role service_role;
set local "request.jwt.claims" = '{"role":"service_role","iss":"supabase"}';

select is(
  public.confirm_sales_lead_marketing_consent(
    '84000000-0000-4000-8000-000000000005',
    'sales-lead-marketing-v1',
    encode(extensions.digest('expired@example.test', 'sha256'), 'hex')
  ),
  false,
  'an expired pending request cannot be confirmed'
);

select is(
  public.confirm_sales_lead_marketing_consent(
    '84000000-0000-4000-8000-000000000006',
    'sales-lead-marketing-v1',
    encode(extensions.digest('suppressed@example.test', 'sha256'), 'hex')
  ),
  false,
  'a previously suppressed address cannot be opted back in by an old token'
);

reset role;

-- ---------------------------------------------------------------------------
-- Regression: a phone shorter than the column floor must not abort the lead.
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" = '{"role":"anon","iss":"supabase"}';

select lives_ok(
  $$select public.submit_sales_lead(
      null, null, 'short-phone@example.test', '12', null, null, null, 'tr'
    )$$,
  'a phone below the column floor does not fail the submission'
);

reset role;

select is(
  (select count(*)::integer from public.sales_leads
   where email = 'short-phone@example.test'),
  1,
  'the lead is stored even though its phone was unusable'
);

select is(
  (select phone from public.sales_leads where email = 'short-phone@example.test'),
  null,
  'the unusable phone is dropped rather than stored'
);

-- ---------------------------------------------------------------------------
-- Validation and normalisation boundaries.
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" = '{"role":"anon","iss":"supabase"}';

select throws_ok(
  $$select public.submit_sales_lead(
      null, null, 'not-an-email', null, null, null, null, 'tr'
    )$$,
  '22023',
  null,
  'a malformed address is rejected'
);

select throws_ok(
  $$select public.submit_sales_lead(
      null, null, 'duration@example.test', null, null, 5, null, 'tr'
    )$$,
  '22023',
  null,
  'an unsupported listing duration is rejected'
);

select lives_ok(
  $$select public.submit_sales_lead(
      null, null, 'fallback-locale@example.test', null, null, null, null, 'zz'
    )$$,
  'an unknown locale does not fail the submission'
);

reset role;

select is(
  (select locale from public.sales_leads where email = 'fallback-locale@example.test'),
  'tr',
  'an unknown locale falls back to the default'
);

select * from finish();

rollback;
