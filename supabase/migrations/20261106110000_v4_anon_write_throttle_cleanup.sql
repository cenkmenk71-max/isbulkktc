-- Bound the throttle ledger: it promised opportunistic cleanup but never did it.
--
-- `20261106000000_v4_anon_write_throttle.sql` introduced `anon_write_throttle`
-- and its header states the table "stays bounded without a maintenance job"
-- because "an expired row is deleted lazily when its key is next seen". The
-- function body never deleted anything: `consume_anon_write_quota` only
-- upserts, so each distinct subject leaves a **permanent** row. A flood — the
-- exact traffic this control exists for — walks unbounded key space (attacker
-- addresses / submitted e-mails), so the ledger grows without limit and the
-- `anon_write_throttle_window_idx` it shipped is dead weight (nothing filters on
-- `window_started_at`).
--
-- This restores the documented behaviour: before counting, delete rows whose
-- window elapsed more than an hour ago. An hour is comfortably past every window
-- in use (the two callers pass 600 seconds), so a row can never be removed while
-- it still gates a live window; the delete simply reclaims the ones that have
-- gone cold. If a caller ever needs a window of an hour or more, raise this
-- threshold with it. It is index-assisted (`anon_write_throttle_window_idx`), so
-- the cost is proportional to the expired set, not the whole table, and it runs
-- inside the caller's transaction — the same transaction the row lock is already
-- held in, so no new isolation concern.
--
-- The window check stays keyed on `t.window_started_at`, and the cleanup is a
-- plain `delete` on the same predicate. Note the throttle is a best-effort abuse
-- control, not an identity boundary, so a forged subject can still create a row;
-- the point here is only that the rows cannot accumulate forever.
--
-- Idempotent: `create or replace` re-asserts the same signature and grants, so
-- it is safe to replay against the hosted project (its ledger is the custom
-- `public._applied_migrations`). The signature is deliberately unchanged — a new
-- argument would change `pg_get_function_identity_arguments` and break the
-- reviewed privilege ratchet and the signature-sensitive security tests.

begin;

create or replace function public.consume_anon_write_quota(
  _scope text,
  _subject text,
  _burst integer,
  _window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := pg_catalog.btrim(coalesce(_subject, ''));
  v_hash text;
  v_hits integer;
begin
  if _scope not in ('ip', 'email')
     or _burst is null or _burst < 1
     or _window_seconds is null or _window_seconds < 1 then
    raise exception 'Invalid throttle configuration.'
      using errcode = '22023';
  end if;

  -- No subject means "this dimension does not apply"; nothing to count.
  if v_subject = '' then
    return;
  end if;

  -- Opportunistic cleanup: reclaim rows whose window went cold long ago. An hour
  -- is well past the 600-second window both callers use, so a live window is
  -- never reclaimed; the delete is index-assisted on `window_started_at`.
  delete from public.anon_write_throttle as expired
  where expired.window_started_at <= pg_catalog.now() - interval '1 hour';

  v_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_subject, 'UTF8')),
    'hex'
  );

  insert into public.anon_write_throttle as t (scope, subject_hash, window_started_at, hits)
  values (_scope, v_hash, pg_catalog.now(), 1)
  on conflict (scope, subject_hash) do update
    set window_started_at = case
          when t.window_started_at <= pg_catalog.now()
            - pg_catalog.make_interval(secs => _window_seconds)
            then pg_catalog.now()
          else t.window_started_at
        end,
        hits = case
          when t.window_started_at <= pg_catalog.now()
            - pg_catalog.make_interval(secs => _window_seconds)
            then 1
          else t.hits + 1
        end
  returning t.hits into v_hits;

  if v_hits > _burst then
    raise exception 'Too many anonymous submissions from this origin.'
      using errcode = '54000';
  end if;
end;
$$;

revoke all on function public.consume_anon_write_quota(text, text, integer, integer)
  from public, anon, authenticated;

commit;
