-- Speeds up the unfiltered "latest jobs" listing, which is the default view of
-- the public search RPCs. Measured on a 60k-row catalogue: the planner fell back
-- to a parallel sequential scan plus a top-N sort (~82 ms, ~5.4k buffers) because
-- jobs_public_filters_idx is only usable once a district/job_type/workplace_mode
-- predicate is present. The partial index below turns that into an index scan
-- (~0.06 ms, 7 buffers).
--
-- Deliberately NOT indexed: jobs.publication_source. It has two values and
-- 'source_site' already dominates the catalogue, so a btree is never chosen;
-- the provenance predicate stays satisfied by job_source_imports_pkey.
create index jobs_public_latest_idx
  on public.jobs (published_at desc)
  where status = 'published';
