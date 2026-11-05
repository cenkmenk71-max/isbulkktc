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

select plan(20);

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
-- Bounded growth: the helper must reclaim cold rows (the migration's header
-- promised opportunistic cleanup that the first version never performed, so the
-- ledger grew one permanent row per subject).
-- ---------------------------------------------------------------------------

-- A row whose window went cold more than an hour ago, and one still inside the
-- hour. Both are seeded directly, since the helper only ever writes `now()`.
insert into public.anon_write_throttle (scope, subject_hash, window_started_at, hits)
values
  (
    'email',
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to('cold@example.test', 'UTF8')),
      'hex'
    ),
    pg_catalog.now() - interval '2 hours',
    3
  ),
  (
    'email',
    pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to('warm@example.test', 'UTF8')),
      'hex'
    ),
    pg_catalog.now() - interval '10 minutes',
    2
  );

-- Any helper call runs the cleanup; the subject here is incidental.
select public.consume_anon_write_quota('email', 'trigger@example.test', 5, 600);

select is(
  (
    select count(*)::integer
    from public.anon_write_throttle
    where scope = 'email'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('cold@example.test', 'UTF8')),
          'hex'
        )
  ),
  0,
  'a row whose window went cold more than an hour ago is reclaimed'
);

select is(
  (
    select count(*)::integer
    from public.anon_write_throttle
    where scope = 'email'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('warm@example.test', 'UTF8')),
          'hex'
        )
  ),
  1,
  'a row still inside the hour survives the cleanup'
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
-- App-forwarded address: the server action sets `x-client-ip` because
-- supabase-js sends no IP header of its own, so without it every app submission
-- shared one `unknown` bucket (issue #206). It must key the bucket, and the
-- edge headers must still win when the edge itself wrote one.
-- ---------------------------------------------------------------------------

set local "request.headers" = '{"x-client-ip":"203.0.113.7"}';
set local role anon;

select lives_ok(
  $$select public.submit_feedback(
      'Visitor', 'client-ip@example.test', 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    )$$,
  'a submission carrying the app-forwarded address is accepted'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.anon_write_throttle
    where scope = 'ip'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('203.0.113.7', 'UTF8')),
          'hex'
        )
  ),
  1,
  'the app-forwarded x-client-ip keys its own bucket, not the shared unknown one'
);

-- The edge header is written by the platform and cannot be forged, so it must
-- outrank the app-forwarded value when both are present.
set local "request.headers" = '{"cf-connecting-ip":"198.51.100.9","x-client-ip":"203.0.113.7"}';
set local role anon;

select lives_ok(
  $$select public.submit_feedback(
      'Visitor', 'edge-wins@example.test', 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    )$$,
  'a submission carrying both an edge and an app address is accepted'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.anon_write_throttle
    where scope = 'ip'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('198.51.100.9', 'UTF8')),
          'hex'
        )
  ),
  1,
  'the edge header outranks the app-forwarded x-client-ip'
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
