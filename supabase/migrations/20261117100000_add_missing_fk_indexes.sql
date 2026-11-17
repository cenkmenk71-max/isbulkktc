-- Cover every public foreign key with a valid, non-partial index whose leading
-- columns match the FK. Derive the index list from the live schema instead of
-- maintaining a hand-written list that can drift from table definitions.
--
-- This is intentionally stricter than checking whether a column appears anywhere
-- in an index: PostgreSQL's referential-integrity checks need the FK columns as
-- the leading index columns, and partial indexes cannot cover every referenced row.

do $$
declare
  fk record;
  index_columns text;
  index_name text;
begin
  for fk in
    select
      con.oid as constraint_oid,
      con.conrelid as table_oid,
      con.conkey as key_columns,
      relation.relname as table_name
    from pg_catalog.pg_constraint as con
    join pg_catalog.pg_class as relation on relation.oid = con.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where con.contype = 'f'
      and namespace.nspname = 'public'
    order by relation.relname, con.conname
  loop
    if not exists (
      select 1
      from pg_catalog.pg_index as existing_index
      where existing_index.indrelid = fk.table_oid
        and existing_index.indisvalid
        and existing_index.indpred is null
        and (existing_index.indkey::int2[])[0:array_length(fk.key_columns, 1) - 1]
          = fk.key_columns
    ) then
      select string_agg(pg_catalog.format('%I', attribute.attname), ', ' order by key_column.ordinality)
        into index_columns
      from unnest(fk.key_columns) with ordinality as key_column(attnum, ordinality)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = fk.table_oid
       and attribute.attnum = key_column.attnum;

      -- Keep the name below PostgreSQL's 63-byte identifier limit and include a
      -- stable constraint hash so multiple FKs on one table cannot collide.
      index_name := pg_catalog.left(fk.table_name, 36)
        || '_fk_' || pg_catalog.substr(pg_catalog.md5(fk.constraint_oid::text), 1, 12) || '_idx';

      execute pg_catalog.format(
        'create index %I on %I.%I (%s)',
        index_name,
        'public',
        fk.table_name,
        index_columns
      );
    end if;
  end loop;
end;
$$;
