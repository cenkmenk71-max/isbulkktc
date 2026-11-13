begin;

-- Constraint-hygiene ratchet: no table may carry two constraints that mean the
-- same thing.
--
-- This exists because Production held exactly such a pair — `public.push_subscriptions`
-- had both `push_subscriptions_endpoint_host_allowed` and an auto-named twin
-- `push_subscriptions_endpoint_host_check`, each `check (public.is_allowed_push_endpoint(endpoint))`.
-- The twin came from an earlier revision of a migration that added the check
-- inline (Postgres auto-names it `<table>_<column>_check`); the revision was
-- rewritten to name the constraint explicitly and to re-add it behind
-- `drop constraint if exists push_subscriptions_endpoint_host_allowed`, so on a
-- database that already held the auto-named version the drop matched nothing and
-- the twin survived. A fresh rebuild never runs the earlier revision, so the
-- repository's own suite — which builds from migrations — could not see it, and
-- the drift lived in Production for four push migrations.
--
-- The duplicate is not merely cosmetic: the allowlist predicate is evaluated
-- twice on every insert and update to the table, and the schema silently
-- diverges from a rebuild. A per-constraint test cannot catch it — the specific
-- name would have to be known in advance — so the guard is structural: group
-- every `public` constraint by table and definition and require no group of more
-- than one. A deliberately duplicated constraint (or another auto-named twin
-- from a rewritten migration) fails CI until it is removed.
--
-- `pg_get_constraintdef` distinguishes the kinds, so a `PRIMARY KEY (x)` and a
-- `UNIQUE (x)` on the same column — a different intent — are not flagged.

select plan(1);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_constraint
    where connamespace = 'public'::regnamespace
    group by conrelid, pg_catalog.pg_get_constraintdef(oid)
    having pg_catalog.count(*) > 1
  ),
  'no table in public carries two constraints with the same definition'
);

select * from finish();
rollback;
