begin;

create table public.job_source_imports (
  job_id uuid primary key references public.jobs (id) on delete cascade,
  source text not null
    check (source in ('iskibris', 'isbulkibris')),
  source_job_id text not null
    check (char_length(source_job_id) between 1 and 128),
  source_published_at timestamptz not null,
  source_expires_at timestamptz not null,
  imported_at timestamptz not null default pg_catalog.now(),
  unique (source, source_job_id),
  constraint job_source_imports_dates_consistent
    check (source_expires_at > source_published_at)
);

alter table public.job_source_imports enable row level security;
revoke all on table public.job_source_imports from public, anon, authenticated;

alter table public.jobs
  add column publication_source text not null default 'platform'
    check (publication_source in ('platform', 'source_site'));

alter table public.jobs
  alter column created_by drop not null;

alter table public.jobs
  drop constraint jobs_review_metadata_consistent;

alter table public.jobs
  add constraint jobs_review_metadata_consistent check (
    (
      status in ('approved', 'rejected', 'published', 'closed', 'expired')
      and reviewed_by is not null
      and reviewed_at is not null
      and publication_source = 'platform'
    )
    or (
      status = 'published'
      and publication_source = 'source_site'
      and reviewed_by is null
      and reviewed_at is null
      and created_by is null
    )
    or (
      status in ('draft', 'pending_review')
      and publication_source = 'platform'
      and reviewed_by is null
      and reviewed_at is null
    )
  );

commit;
