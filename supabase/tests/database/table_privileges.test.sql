begin;

-- Table-privilege ratchet for the two client roles.
--
-- `function_privileges.test.sql` pins every function a client role may execute.
-- Tables had no equivalent guard: the negative assertions were per-table and
-- partial, so a future `grant select on public.audit_logs to anon` — the same
-- shape that once leaked the engagement mailing list at the function layer —
-- would ship unnoticed. Supabase's `pg_default_acl` grants every privilege on a
-- new `public` table to `anon` / `authenticated` / `service_role`, so a table is
-- only closed when a migration explicitly revokes it. This ratchet makes that
-- requirement enforceable.
--
-- The reachable set is computed from `has_table_privilege` OR
-- `has_any_column_privilege`, so a column-scoped grant counts too (the
-- `job_packages` read is column-level). Any table a client role can touch must
-- be on the reviewed list below; a new table is closed by default, and a new
-- grant fails CI until it is added here deliberately — the same contract the
-- function ratchet already enforces.

select plan(8);

select is(
  (
    select pg_catalog.array_agg(c.relname::text order by c.relname)
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (
        has_table_privilege('anon', c.oid, 'SELECT')
        or has_table_privilege('anon', c.oid, 'INSERT')
        or has_table_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('anon', c.oid, 'DELETE')
        or has_any_column_privilege('anon', c.oid, 'SELECT')
        or has_any_column_privilege('anon', c.oid, 'INSERT')
        or has_any_column_privilege('anon', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'SELECT')
        or has_table_privilege('authenticated', c.oid, 'INSERT')
        or has_table_privilege('authenticated', c.oid, 'UPDATE')
        or has_table_privilege('authenticated', c.oid, 'DELETE')
        or has_any_column_privilege('authenticated', c.oid, 'SELECT')
        or has_any_column_privilege('authenticated', c.oid, 'INSERT')
        or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
      )
  ),
  array[
    'applications',
    'candidate_profiles',
    'companies',
    'company_directory_overrides',
    'company_members',
    'company_profile_submissions',
    'job_packages',
    'jobs',
    'notifications',
    'profiles',
    'user_roles'
  ]::text[],
  'only reviewed tables are reachable by anon/authenticated'
);

-- Named guards for the sensitive classes, so a failure says which one leaked
-- rather than only "the set changed". Each lists tables that must be fully
-- closed to both client roles (no SELECT/INSERT/UPDATE/DELETE).

select ok(
  not has_table_privilege('anon', 'public.audit_logs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.audit_logs', 'SELECT')
  and not has_table_privilege('anon', 'public.application_events', 'SELECT')
  and not has_table_privilege('authenticated', 'public.application_events', 'SELECT')
  and not has_table_privilege('anon', 'public.application_contact_shares', 'SELECT')
  and not has_table_privilege('authenticated', 'public.application_contact_shares', 'SELECT'),
  'audit, event and contact-share tables stay closed to clients'
);

select ok(
  not has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.push_subscriptions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.push_subscriptions', 'DELETE')
  and not has_table_privilege('anon', 'public.push_notification_preferences', 'SELECT')
  and not has_table_privilege('authenticated', 'public.push_notification_preferences', 'SELECT'),
  'push credentials and preferences stay behind their RPCs'
);

select ok(
  not has_table_privilege('anon', 'public.notification_email_outbox', 'SELECT')
  and not has_table_privilege('authenticated', 'public.notification_email_outbox', 'SELECT')
  and not has_table_privilege('anon', 'public.job_source_imports', 'SELECT')
  and not has_table_privilege('authenticated', 'public.job_source_imports', 'SELECT')
  and not has_table_privilege('anon', 'public.job_source_snapshots', 'SELECT')
  and not has_table_privilege('authenticated', 'public.job_source_snapshots', 'SELECT')
  and not has_table_privilege('anon', 'public._applied_migrations', 'SELECT')
  and not has_table_privilege('authenticated', 'public._applied_migrations', 'SELECT')
  and not has_table_privilege('anon', 'public.anon_write_throttle', 'SELECT')
  and not has_table_privilege('authenticated', 'public.anon_write_throttle', 'SELECT'),
  'worker, provenance and ledger tables stay closed to clients'
);

select ok(
  not has_table_privilege('anon', 'public.sales_leads', 'SELECT')
  and not has_table_privilege('authenticated', 'public.sales_leads', 'SELECT')
  and not has_table_privilege('anon', 'public.sales_leads', 'INSERT')
  and not has_table_privilege('anon', 'public.feedback_submissions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.feedback_submissions', 'SELECT')
  and not has_table_privilege('anon', 'public.email_engagement_optouts', 'SELECT')
  and not has_table_privilege('authenticated', 'public.email_engagement_optouts', 'INSERT'),
  'visitor submissions and the opt-out list stay service-role-only'
);

select ok(
  not has_table_privilege('anon', 'public.company_job_package_assignments', 'SELECT')
  and not has_table_privilege('authenticated', 'public.company_job_package_assignments', 'SELECT')
  and not has_table_privilege('anon', 'public.directory_companies', 'INSERT')
  and not has_table_privilege('authenticated', 'public.directory_companies', 'INSERT')
  and not has_table_privilege('anon', 'public.directory_locations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.directory_locations', 'INSERT')
  and not has_table_privilege('anon', 'public.faq_entries', 'INSERT')
  and not has_table_privilege('authenticated', 'public.faq_entries', 'INSERT')
  and not has_table_privilege('anon', 'public.site_content', 'INSERT')
  and not has_table_privilege('authenticated', 'public.site_content', 'INSERT')
  and not has_table_privilege('anon', 'public.listing_plans', 'INSERT')
  and not has_table_privilege('authenticated', 'public.listing_plans', 'INSERT'),
  'package-assignment, directory and managed-content tables stay admin-only'
);

-- The reviewed positive surface: a visitor can read the public catalogue, and a
-- signed-in session can read its own rows. These are table-level grants, so the
-- check is exact; it fails if a needed grant is ever revoked by accident.
select ok(
  has_table_privilege('anon', 'public.jobs', 'SELECT')
  and has_table_privilege('anon', 'public.companies', 'SELECT')
  and has_table_privilege('anon', 'public.company_directory_overrides', 'SELECT'),
  'anonymous visitors keep the public catalogue reads'
);

select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT')
  and has_table_privilege('authenticated', 'public.applications', 'SELECT')
  and has_table_privilege('authenticated', 'public.jobs', 'SELECT'),
  'signed-in sessions keep their own-row reads'
);

select * from finish();

rollback;
