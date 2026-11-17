begin;

select plan(1);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_extension as extension
    where extension.extname = 'pg_net'
  )
  or exists (
    select 1
    from pg_catalog.pg_extension as extension
    join pg_catalog.pg_namespace as extension_schema
      on extension_schema.oid = extension.extnamespace
    where extension.extname = 'pg_net'
      and extension_schema.nspname = 'extensions'
  ),
  'pg_net is absent or registered in the non-exposed extensions schema'
);

select * from finish();
rollback;
