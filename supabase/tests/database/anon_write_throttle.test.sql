begin;

-- Regression guard for the server-side throttle added in
-- 20261106000000_v4_anon_write_throttle.sql.
--
-- `submit_feedback` and `submit_sales_lead` are `anon`-callable and the only
-- abuse control used to live in the server action, above the RPC, so a direct
-- PostgREST call bypassed it entirely (issue #139). The throttle now runs inside
-- the RPC, keyed on the caller's address and the submitted address.
--
-- The ledger is not seeded and no other suite commits into it, but clear it
-- anyway so the counts below cannot depend on execution order. Everything here
-- rolls back with the transaction.

delete from public.anon_write_throttle;

select plan(14);

-- ---------------------------------------------------------------------------
-- Least privilege: the ledger and the helper are invisible to clients.
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.anon_write_throttle', 'SELECT'),
  'the throttle ledger is not readable with the publishable key'
);

select ok(
  not has_table_privilege('authenticated', 'public.anon_write_throttle', 'SELECT'),
  'a signed-in session cannot read the throttle ledger'
);

select ok(
  not has_table_privilege('anon', 'public.anon_write_throttle', 'INSERT'),
  'the publishable key cannot write the throttle ledger directly'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.consume_anon_write_quota(text, text, integer, integer)',
    'EXECUTE'
  ),
  'anonymous visitors cannot drive the throttle helper directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.consume_anon_write_quota(text, text, integer, integer)',
    'EXECUTE'
  ),
  'a signed-in session cannot drive the throttle helper directly'
);

-- ---------------------------------------------------------------------------
-- The helper: burst, reset and the blank-subject no-op.
-- ---------------------------------------------------------------------------

-- Spend the email budget for one address.
select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600);
select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600);
select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600);
select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600);
select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600);

select throws_ok(
  $$select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600)$$,
  '54000',
  null,
  'the sixth hit inside the window is rejected'
);

select is(
  (
    select count(*)::integer
    from public.anon_write_throttle
    where scope = 'email'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('unit@example.test', 'UTF8')),
          'hex'
        )
  ),
  1,
  'the ledger keeps one hashed row per subject, never the raw address'
);

select lives_ok(
  $$select public.consume_anon_write_quota('ip', '', 5, 600)$$,
  'a blank subject is a no-op rather than a bucket'
);

-- Age the window and confirm the counter resets instead of staying spent.
update public.anon_write_throttle
set window_started_at = pg_catalog.now() - interval '11 minutes'
where scope = 'email'
  and subject_hash =
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to('unit@example.test', 'UTF8')),
      'hex'
    );

select lives_ok(
  $$select public.consume_anon_write_quota('email', 'unit@example.test', 5, 600)$$,
  'an elapsed window resets the counter'
);

-- ---------------------------------------------------------------------------
-- Integration: the address dimension through `submit_feedback`.
-- ---------------------------------------------------------------------------

set local "request.headers" = '{"cf-connecting-ip":"10.0.0.1"}';
set local role anon;

select public.submit_feedback(
  'Visitor', 'ip-limit@example.test', 'general', 5,
  'A feedback message long enough to pass validation.', 'tr'
);
select public.submit_feedback(
  'Visitor', 'ip-limit@example.test', 'general', 5,
  'A feedback message long enough to pass validation.', 'tr'
);
select public.submit_feedback(
  'Visitor', 'ip-limit@example.test', 'general', 5,
  'A feedback message long enough to pass validation.', 'tr'
);
select public.submit_feedback(
  'Visitor', 'ip-limit@example.test', 'general', 5,
  'A feedback message long enough to pass validation.', 'tr'
);
select public.submit_feedback(
  'Visitor', 'ip-limit@example.test', 'general', 5,
  'A feedback message long enough to pass validation.', 'tr'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.feedback_submissions
    where email = 'ip-limit@example.test'
  ),
  5,
  'five submissions from one origin are stored inside the window'
);

set local role anon;

select throws_ok(
  $$select public.submit_feedback(
      'Visitor', 'ip-limit@example.test', 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    )$$,
  '54000',
  null,
  'the sixth submission from the same origin is throttled at the RPC'
);

reset role;

-- ---------------------------------------------------------------------------
-- Header precedence: a forwarded chain keys on its leftmost hop.
-- ---------------------------------------------------------------------------

set local "request.headers" = '{"x-forwarded-for":"9.9.9.9, 10.10.10.10"}';
set local role anon;

select lives_ok(
  $$select public.submit_feedback(
      'Visitor', 'forwarded@example.test', 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    )$$,
  'a submission behind a forwarded chain is accepted'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.anon_write_throttle
    where scope = 'ip'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('9.9.9.9', 'UTF8')),
          'hex'
        )
  ),
  1,
  'the leftmost forwarded address is the bucket key, not the appended hop'
);

-- ---------------------------------------------------------------------------
-- A submission with no address still passes (only the origin dimension applies).
-- ---------------------------------------------------------------------------

set local "request.headers" = '{"cf-connecting-ip":"10.0.0.9"}';
set local role anon;

select lives_ok(
  $$select public.submit_feedback(
      'Visitor', null, 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    )$$,
  'feedback without an address is accepted and skips the address bucket'
);

reset role;

select * from finish();

rollback;
