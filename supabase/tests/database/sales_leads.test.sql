begin;

-- `submit_sales_lead` is the anonymous entry point for corporate quote requests,
-- and `public.sales_leads` shipped with no suite at all — the RPC's normalisation
-- contract and its least-privilege surface were unpinned. This suite closes that
-- gap and records the phone-length regression fixed in
-- 20261105120000_v4_sales_lead_phone_normalization.sql: the visitor form accepts
-- any phone up to 32 characters with no minimum, but the column requires 4–32, so
-- a short value used to fail the whole INSERT with `23514`.

select plan(16);

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
