-- Give every foreign key a covering index.
--
-- The Supabase security/performance advisor (`unindexed_foreign_keys`, lint
-- 0001) flags fifteen `public` foreign keys with no index whose leading columns
-- match the constraint. Each one is a latent cost on two paths:
--
--   * `on delete`/`on update` on the referenced row forces a sequential scan of
--     the child table to find the rows to cascade, null out or restrict. Ten of
--     these fifteen carry a `restrict`/`cascade` rule, so deleting a `profiles`,
--     `companies` or `jobs` row scans the whole child table while it holds a
--     lock.
--   * Every join or filter on the column (`where reviewed_by = ...`,
--     `where company_id = ...` reachable only through the FK) reads the table
--     end to end.
--
-- The tables are tiny today (all under 1 MB, most under 100 rows), so nothing is
-- slow yet; the indexes cost a few pages each and turn the first burst of
-- growth into a non-event instead of a lock-wait incident. They are additive and
-- need no data backfill, so this migration is safe to apply live.
--
-- This migration covers *eighteen* constraints, not the fifteen the advisor
-- lists. The advisor treats any index whose leading column matches the FK as
-- covering, including a **partial** index, but PostgreSQL's referential-integrity
-- check issues `select 1 from only <child> where <fk> = $1 for key share`, which a
-- partial index cannot serve unless the deleted key happens to satisfy its
-- predicate. Verified with `explain (enable_seqscan=off)`: both
-- `push_subscriptions.user_id` (only `... WHERE revoked_at IS NULL`) and
-- `company_profile_submissions.company_id` (only `... WHERE status = 'pending'`)
-- fall back to a sequential scan, so the advisor misses two real gaps. The third
-- is `company_job_package_assignments.company_id`, whose only full index is
-- `(package_id, company_id)` — `company_id` is present but not leading, so the
-- RI check scans the whole index. All three get a dedicated index here, and the
-- companion pgTAP suite asserts the strict rule (leading columns, non-partial) so
-- the advisor's blind spot cannot reopen them.
--
-- `notifications_application_event_id_fkey` is the same shape: its unique index
-- is `(user_id, application_event_id)`, led by `user_id`, so it cannot serve a
-- lookup by `application_event_id` alone.
--
-- `if not exists` keeps the file re-runnable, matching the sibling throttle
-- migrations: the deploy ledger is the custom `public._applied_migrations`, so a
-- fresh `supabase db push` re-runs every file and a bare `create index` would
-- abort the second run with "relation already exists".

create index if not exists applications_reviewed_by_idx
  on public.applications (reviewed_by);

create index if not exists applications_first_viewed_by_idx
  on public.applications (first_viewed_by);

create index if not exists jobs_created_by_idx
  on public.jobs (created_by);

create index if not exists jobs_reviewed_by_idx
  on public.jobs (reviewed_by);

create index if not exists application_events_actor_id_idx
  on public.application_events (actor_id);

create index if not exists notifications_application_event_id_idx
  on public.notifications (application_event_id);

create index if not exists application_contact_shares_candidate_id_idx
  on public.application_contact_shares (candidate_id);

create index if not exists company_members_invited_by_idx
  on public.company_members (invited_by);

create index if not exists company_job_package_assignments_company_id_idx
  on public.company_job_package_assignments (company_id);

create index if not exists company_job_package_assignments_assigned_by_idx
  on public.company_job_package_assignments (assigned_by);

create index if not exists company_profile_submissions_company_id_idx
  on public.company_profile_submissions (company_id);

create index if not exists company_profile_submissions_submitted_by_idx
  on public.company_profile_submissions (submitted_by);

create index if not exists company_profile_submissions_reviewed_by_idx
  on public.company_profile_submissions (reviewed_by);

create index if not exists user_roles_granted_by_idx
  on public.user_roles (granted_by);

create index if not exists feedback_submissions_user_id_idx
  on public.feedback_submissions (user_id);

create index if not exists support_messages_author_id_idx
  on public.support_messages (author_id);

create index if not exists site_content_updated_by_idx
  on public.site_content (updated_by);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
