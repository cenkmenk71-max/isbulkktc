begin;

-- Regression guard for the client grant closed by
-- 20261031130000_v4_migration_ledger_privileges.sql.
--
-- `public._applied_migrations` is the deploy ledger. It is not created by any
-- application migration, so it kept Supabase's default ACL -- EXECUTE-equivalent
-- full rights (`arwdDxtm`) for `anon` and `authenticated` on top of the
-- service role. RLS with no policy masked that, but the grant is the only thing
-- standing between a future `using (true)` policy and public read/write access to
-- the record of which migrations ran.
--
-- These assertions pin the intended surface: the table exists, RLS is on, no
-- client role holds any privilege, and the service role can still read and write.

select plan(12);

select ok(
  pg_catalog.to_regclass('public._applied_migrations') is not null,
  'the migration ledger exists after migrations run'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public._applied_migrations'::regclass),
  'row level security is enabled on the migration ledger'
);

-- The publishable key holds nothing.
select ok(
  not has_table_privilege('anon', 'public._applied_migrations', 'SELECT'),
  'the publishable key cannot read the migration ledger'
);

select ok(
  not has_table_privilege('anon', 'public._applied_migrations', 'INSERT'),
  'the publishable key cannot append to the migration ledger'
);

select ok(
  not has_table_privilege('anon', 'public._applied_migrations', 'UPDATE'),
  'the publishable key cannot rewrite the migration ledger'
);

select ok(
  not has_table_privilege('anon', 'public._applied_migrations', 'DELETE'),
  'the publishable key cannot clear the migration ledger'
);

-- Neither does a signed-in session.
select ok(
  not has_table_privilege('authenticated', 'public._applied_migrations', 'SELECT'),
  'a signed-in session cannot read the migration ledger'
);

select ok(
  not has_table_privilege('authenticated', 'public._applied_migrations', 'INSERT'),
  'a signed-in session cannot append to the migration ledger'
);

select ok(
  not has_table_privilege('authenticated', 'public._applied_migrations', 'UPDATE'),
  'a signed-in session cannot rewrite the migration ledger'
);

select ok(
  not has_table_privilege('authenticated', 'public._applied_migrations', 'DELETE'),
  'a signed-in session cannot clear the migration ledger'
);

-- The deploy tooling still works.
select ok(
  has_table_privilege('service_role', 'public._applied_migrations', 'SELECT'),
  'the service role can still read the migration ledger'
);

select ok(
  has_table_privilege('service_role', 'public._applied_migrations', 'INSERT'),
  'the service role can still record a migration'
);

select * from finish();

rollback;
