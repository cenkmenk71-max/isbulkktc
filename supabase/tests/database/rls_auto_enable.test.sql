begin;

select plan(8);

select ok(
  not has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE'),
  'anonymous callers cannot execute the internal RLS event-trigger function'
);

select ok(
  not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE'),
  'signed-in callers cannot execute the internal RLS event-trigger function'
);

select ok(
  not has_function_privilege('service_role', 'public.rls_auto_enable()', 'EXECUTE'),
  'service workers cannot execute the internal RLS event-trigger function'
);

select ok(
  has_function_privilege('postgres', 'public.rls_auto_enable()', 'EXECUTE'),
  'the function owner retains the privilege needed by the registered event trigger'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_event_trigger as e
    where e.evtname = 'ensure_rls'
      and e.evtevent = 'ddl_command_end'
      and e.evtenabled = 'O'
      and e.evtfoid = 'public.rls_auto_enable()'::regprocedure
  ),
  'ensure_rls is enabled and points at the reviewed event-trigger function'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_proc as p
    where p.oid = 'public.rls_auto_enable()'::regprocedure
      and p.prosecdef
      and p.prorettype = 'pg_catalog.event_trigger'::regtype
      and p.proconfig @> array['search_path=""']
  ),
  'the event-trigger function is SECURITY DEFINER, pseudo-typed and search-path pinned'
);

select ok(
  pg_catalog.pg_get_functiondef('public.rls_auto_enable()'::regprocedure)
    ~* 'RAISE\s*;',
  'RLS enforcement errors are re-raised instead of being swallowed'
);

drop table if exists public.__rls_auto_enable_probe;
create table public.__rls_auto_enable_probe (
  id bigint generated always as identity primary key
);

select ok(
  (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.__rls_auto_enable_probe'::regclass
  ),
  'creating a public table automatically enables RLS'
);

drop table public.__rls_auto_enable_probe;

select * from finish();

rollback;
