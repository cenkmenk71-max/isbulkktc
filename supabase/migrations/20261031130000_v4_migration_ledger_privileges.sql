-- Bring the migration ledger under the same lock-down as every other table.
--
-- `public._applied_migrations` records which migrations the hosted project has
-- run. No migration in this repo creates it: the deploy tooling does, out of
-- band, so it never received the `revoke all ... from public, anon, authenticated`
-- that every application table gets and it kept the Supabase default ACL:
--
--   relacl = {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--             authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- RLS is on with no policy, so the grant is not exploitable today: an anon SELECT
-- returns `[]` and an anon INSERT fails 42501. But the grant is the entire
-- defence-in-depth margin -- one future `create policy ... using (true)` (the
-- shape `company_directory_overrides` already uses) would turn it into a public
-- read *and* write on the deploy ledger, letting anyone rewrite migration history
-- or forge an "already applied" marker.
--
-- Declaring the table here also closes a reproducibility gap: a fresh
-- `supabase db reset` database and the hosted project now agree on the schema.
-- `if not exists` keeps the hosted instance untouched -- its rows and column
-- defaults stay exactly as the tooling left them -- and only the ACL changes.

create table if not exists public._applied_migrations (
  id text primary key,
  applied_at timestamptz not null default pg_catalog.now()
);

alter table public._applied_migrations enable row level security;
revoke all on table public._applied_migrations
  from public, anon, authenticated;
grant select, insert on table public._applied_migrations
  to service_role;
