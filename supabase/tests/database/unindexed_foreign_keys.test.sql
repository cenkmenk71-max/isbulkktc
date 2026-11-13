begin;

-- Ratchet: every foreign key in `public` must have a covering index.
--
-- Supabase's advisor (`unindexed_foreign_keys`, lint 0001) flagged fifteen
-- constraints before 20261112160000 added the missing indexes. Left as a
-- point-in-time cleanup the same gap returns the next time a column gains a
-- foreign key, so this pins the invariant instead of the individual indexes.
--
-- "Covering" means an index whose *leading* columns are exactly the constraint's
-- columns — the shape a `on delete`/`on update` action needs to find the child
-- rows without a sequential scan. An index that merely contains the column later
-- (for example `notifications (user_id, application_event_id)`) does not count:
-- its leading column is `user_id`, so it cannot serve a lookup by
-- `application_event_id` alone. A partial index is excluded for the same reason
-- the advisor excludes it — it does not cover every row.
--
-- The assertion is computed from the catalogue, so it also covers foreign keys
-- added by future migrations without editing this file.

select plan(1);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint as con
    join pg_catalog.pg_class as child on child.oid = con.conrelid
    join pg_catalog.pg_namespace as n on n.oid = child.relnamespace
    where con.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1
        from pg_catalog.pg_index as x
        where x.indrelid = con.conrelid
          and x.indisvalid
          and x.indpred is null
          and (x.indkey::int2[])[0:array_length(con.conkey, 1) - 1] = con.conkey
      )
  ),
  0,
  'every public foreign key is covered by a leading-column index'
);

select * from finish();
rollback;
