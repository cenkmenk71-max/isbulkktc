-- Bound `cron.job_run_details`: the per-minute worker logs a row every minute and
-- nothing ever reclaims them.
--
-- `docs/runbooks/production-launch.md` §4 schedules the notification worker
-- `send-application-notifications` every minute (`* * * * *`) through
-- `cron.schedule` — an operator step, so the schedule exists only in Production
-- and in no migration. `pg_cron` records every execution in
-- `cron.job_run_details`, and the version the hosted project ships (pg_cron
-- 1.6.4) has no retention setting: `cron.alter_job` takes only
-- `(job_id, schedule, command, database, username, active)` and `cron.job`
-- carries no `job_run_details_retention` column, so the per-job retention added
-- in pg_cron 1.6 is unavailable. The log grows by 1,440 rows a day and is never
-- pruned.
--
-- The cost is not theoretical. At the time of this migration the log held 22,953
-- rows and 26 MB — more than half of the 45 MB database on the free plan, whose
-- included disk is 500 MB. Left alone it crosses that ceiling and the project
-- stops accepting writes, which takes the whole site down: the same "silently
-- grows until it breaks" failure this repository already ratchets against for
-- its own tables.
--
-- The fix is a housekeeping job that reclaims rows older than three days. Three
-- days is well past the log's operational use — `production-launch.md` §4 step 6
-- reads it only to confirm the schedule is firing — while keeping the table near
-- a few thousand rows (about 5 MB), so a burst of failures stays inspectable
-- without the log dominating the database.
--
-- The job is created with `cron.schedule(job_name, ...)`, which replaces any job
-- of the same name, so re-running this file against the hosted project (whose
-- `supabase db push` re-runs every migration, see `production-launch.md` §2)
-- converges instead of piling up duplicate jobs. The backlog is reclaimed inline
-- as well, so applying this file drops the existing rows immediately rather than
-- waiting for the first scheduled pass. `postgres` — the role this file runs as
-- and the one `production-launch.md` §4 uses — owns the schedule and can delete
-- from `cron.job_run_details`, which is owned by `supabase_admin`.
--
-- Everything is wrapped in a `to_regclass` guard because the local stack and CI
-- do not enable `pg_cron`: on a fresh `supabase db push` the `cron` schema does
-- not exist, and an unguarded `delete from cron.job_run_details` or a call to
-- `cron.schedule` would abort the migration partway. The guarded branch is only
-- parsed when it runs, so the references stay unresolved until pg_cron is
-- present.
--
-- This file cannot be exercised by the pgTAP suite for the same reason — the
-- local stack has no `cron.schedule` to assert against. The invariant it
-- establishes, that every scheduled job reclaims its own run history, is instead
-- ratcheted live by `scripts/system-health.mjs`, which warns when a `cron.job`
-- command does not prune `cron.job_run_details`.

do $cron$
begin
  if pg_catalog.to_regclass('cron.job_run_details') is null then
    -- pg_cron is not enabled here (a fresh `supabase db push` on a development
    -- branch): there is no log to bound and no `cron.schedule` to call.
    return;
  end if;

  -- Reclaim the existing backlog now, index-assisted on `start_time`.
  delete from cron.job_run_details
  where start_time < pg_catalog.now() - interval '3 days';

  -- Keep it reclaimed. The job prunes older-than-three-days rows hourly and is
  -- named, so `cron.schedule` replaces rather than duplicates it on a re-run.
  perform cron.schedule(
    'cron-run-details-retention',
    '17 * * * *',
    $job$
    delete from cron.job_run_details
    where start_time < pg_catalog.now() - interval '3 days';
    $job$
  );
end
$cron$;
