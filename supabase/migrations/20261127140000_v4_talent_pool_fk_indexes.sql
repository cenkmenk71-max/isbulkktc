begin;

-- Covering leading-column indexes for foreign keys added by the talent pool
-- migrations, so the unindexed_foreign_keys ratchet stays green.
create index if not exists idx_job_match_notifications_job_id
  on public.job_match_notifications (job_id);

commit;
