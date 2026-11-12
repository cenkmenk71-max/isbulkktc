begin;

-- Regression guard for the per-form coarse peer cap added in
-- 20261112120000_v4_anon_write_throttle_peer_scopes.sql (issues #621 and #616).
--
-- `20261110160000` bounded a direct caller who forges `x-client-ip` by also
-- consuming the edge-written `cf-connecting-ip` as a coarse cap. That cap used
-- one subject for every form (`hash(peer)` under `scope='ip'`), and on the app
-- path `cf-connecting-ip` is the platform's *shared egress* address — so it
-- became a single site-wide 25/10min ceiling shared by feedback and sales: the
-- 26th real anonymous write anywhere was rejected (#621). `submit_support_message`
-- never got the cap at all, so a direct caller rotating `x-client-ip` opened one
-- thread per request, unbounded (#616).
--
-- The fix scopes the coarse cap per form (`peer:feedback|…`, `peer:sales|…`,
-- `peer:support|…`) and raises the burst to 60, and gives support its cap. These
-- assertions fail on the pre-fix schema: the 60-feedback loop trips the shared
-- 25 cap, and the support loop is never bounded.
--
-- The ledger is not seeded and no other suite commits into it, but clear it
-- anyway so the counts below cannot depend on execution order. Everything here
-- rolls back with the transaction.

delete from public.anon_write_throttle;

select plan(10);

-- ---------------------------------------------------------------------------
-- feedback: the per-form peer cap saturates at the raised burst, not at 25.
-- ---------------------------------------------------------------------------

set local role anon;

do $$
declare
  i integer;
begin
  for i in 1..60 loop
    -- One shared edge peer (the platform egress on the app path) with a distinct
    -- app-forwarded address per call, i.e. sixty *different* visitors.
    perform pg_catalog.set_config(
      'request.headers',
      pg_catalog.json_build_object(
        'cf-connecting-ip', '198.51.100.9',
        'x-client-ip', '203.0.113.' || i
      )::text,
      true
    );
    perform public.submit_feedback(
      'Visitor', 'fb' || i || '@example.test', 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    );
  end loop;
end;
$$;

reset role;

select is(
  (select count(*)::integer from public.feedback_submissions),
  60,
  'sixty feedback submissions from distinct visitors behind one peer all succeed'
);

select is(
  (
    select hits
    from public.anon_write_throttle
    where scope = 'ip'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('peer:feedback|198.51.100.9', 'UTF8')),
          'hex'
        )
  ),
  60,
  'the feedback peer bucket saturates at the raised burst, not the old shared 25'
);

-- The 61st call from the same peer is still bounded.
set local role anon;

select throws_ok(
  $$select public.submit_feedback(
      'Visitor', 'fb-over@example.test', 'general', 5,
      'A feedback message long enough to pass validation.', 'tr'
    )$$,
  '54000',
  null,
  'the sixty-first feedback from the same peer is rejected'
);

reset role;

-- ---------------------------------------------------------------------------
-- feedback != sales: a saturated feedback bucket does not lock out sales.
-- ---------------------------------------------------------------------------

set local "request.headers" = '{"cf-connecting-ip":"198.51.100.9","x-client-ip":"198.51.100.77"}';
set local role anon;

select lives_ok(
  $$select public.submit_sales_lead(
      'Company', 'Contact', 'sales@example.test', '1234567890', 'pro', 30,
      'A note long enough to be stored.', 'tr'
    )$$,
  'a sales lead succeeds while the feedback peer bucket is saturated'
);

reset role;

select is(
  (
    select hits
    from public.anon_write_throttle
    where scope = 'ip'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('peer:sales|198.51.100.9', 'UTF8')),
          'hex'
        )
  ),
  1,
  'the sales peer bucket is separate from the feedback one (#621)'
);

-- ---------------------------------------------------------------------------
-- support: a direct caller rotating `x-client-ip` is now bounded by the peer.
-- ---------------------------------------------------------------------------

set local role anon;

do $$
declare
  i integer;
begin
  for i in 1..60 loop
    perform pg_catalog.set_config(
      'request.headers',
      pg_catalog.json_build_object(
        'cf-connecting-ip', '192.0.2.50',
        'x-client-ip', '10.9.0.' || i
      )::text,
      true
    );
    perform public.submit_support_message(
      null, null, null, 'A support message long enough to be stored ' || i, 'tr'
    );
  end loop;
end;
$$;

reset role;

select is(
  (select count(*)::integer from public.support_threads),
  60,
  'sixty support threads from one edge peer are stored inside the burst'
);

select is(
  (
    select hits
    from public.anon_write_throttle
    where scope = 'ip'
      and subject_hash =
        pg_catalog.encode(
          pg_catalog.sha256(pg_catalog.convert_to('peer:support|192.0.2.50', 'UTF8')),
          'hex'
        )
  ),
  60,
  'the support peer bucket accumulates across the forged x-client-ip values'
);

-- The bound itself: a caller who keeps rotating `x-client-ip` still hits the
-- edge-address ceiling. Before the fix this call — and every one after it —
-- would have opened another thread.
set local role anon;

select throws_ok(
  $$select public.submit_support_message(
      null, null, null, 'A support message long enough to be stored', 'tr'
    )$$,
  '54000',
  null,
  'the support peer cap bounds a direct caller rotating x-client-ip (#616)'
);

reset role;

-- ---------------------------------------------------------------------------
-- support: the primary per-visitor bucket (burst 5) still bounds one address,
-- independently of the coarse peer cap. A single address that keeps its
-- `x-client-ip` fixed saturates after five writes.
-- ---------------------------------------------------------------------------

set local "request.headers" = '{"cf-connecting-ip":"192.0.2.99","x-client-ip":"203.0.113.200"}';
set local role anon;

select throws_ok(
  $$
  do $inner$
  declare
    i integer;
  begin
    for i in 1..6 loop
      perform public.submit_support_message(
        null, null, null, 'A support message long enough to be stored ' || i, 'tr'
      );
    end loop;
  end;
  $inner$;
  $$,
  '54000',
  null,
  'the sixth support write from one fixed address trips the primary burst of 5'
);

reset role;

-- ---------------------------------------------------------------------------
-- The helper still rejects an unknown scope, so a typo cannot silently create
-- an unvalidated bucket.
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select public.consume_anon_write_quota('peer', 'x', 5, 600)$$,
  '22023',
  null,
  'the throttle helper still rejects a scope outside ip/email'
);

select * from finish();

rollback;
