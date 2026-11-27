begin;

-- Recreate search_public_job_previews with the extended return column set
-- (job_title, company_name, job_slug, job_summary, job_type, workplace_mode,
--  district, total_count). The earlier 20261021110000 migration narrowed the
--  return type to 3 columns, which cannot be altered via CREATE OR REPLACE
--  FUNCTION (42P13). Dropping and recreating here restores the extended shape
--  while preserving the exact WHERE / source_site / company-name search from
--  20261021110000_v4_public_source_jobs_rpc.sql.

drop function if exists public.search_public_job_previews(text, text, text, text, integer);

create or replace function public.search_public_job_previews(
  _query text default '',
  _district text default null,
  _job_type text default null,
  _workplace_mode text default null,
  _page integer default 1
)
returns table (
  job_title text,
  company_name text,
  job_slug text,
  job_summary text,
  job_type text,
  workplace_mode text,
  district text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(_query, ''));
  v_like_query text;
begin
  if pg_catalog.char_length(v_query) > 160
     or _page is null
     or _page < 1
     or _page > 1000
     or (
       _district is not null
       and _district not in (
         'Lefkoşa', 'Mağusa', 'Girne', 'İskele', 'Güzelyurt', 'Lefke'
       )
     )
     or (
       _job_type is not null
       and _job_type not in (
         'full_time', 'part_time', 'contract', 'temporary', 'internship', 'freelance'
       )
     )
     or (
       _workplace_mode is not null
       and _workplace_mode not in ('on_site', 'hybrid', 'remote')
     )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid public job search filters.';
  end if;

  v_like_query := '%' ||
    pg_catalog.replace(
      pg_catalog.replace(
        pg_catalog.replace(v_query, E'\\', E'\\\\'),
        '%',
        E'\\%'
      ),
      '_',
      E'\\_'
    ) || '%';

  return query
  with filtered_jobs as materialized (
    select
      j.id,
      j.title as job_title,
      j.slug as job_slug,
      j.summary as job_summary,
      j.job_type,
      j.workplace_mode,
      j.district,
      c.name as company_name,
      j.published_at
    from public.jobs as j
    join public.companies as c on c.id = j.company_id
    where j.status = 'published'
      and j.published_at <= pg_catalog.now()
      and j.expires_at > pg_catalog.now()
      and (
        (
          c.verification_status = 'verified'
        )
        or (
          public.is_public_source_job(j.id)
        )
      )
      and (_district is null or j.district = _district)
      and (_job_type is null or j.job_type = _job_type)
      and (_workplace_mode is null or j.workplace_mode = _workplace_mode)
      and (
        v_query = ''
        or j.search_vector @@ pg_catalog.websearch_to_tsquery(
          'pg_catalog.simple'::pg_catalog.regconfig,
          v_query
        )
        or c.name ilike v_like_query escape E'\\'
      )
  ),
  page_jobs as (
    select f.id, f.job_title, f.job_slug, f.job_summary, f.job_type, f.workplace_mode, f.district, f.company_name, f.published_at
    from filtered_jobs as f
    order by f.published_at desc, f.id desc
    limit 6
    offset ((_page - 1) * 6)
  ),
  result_count as (
    select pg_catalog.count(*) as total_count
    from filtered_jobs
  )
  select p.job_title, p.company_name, p.job_slug, p.job_summary, p.job_type, p.workplace_mode, p.district, c.total_count
  from result_count as c
  left join page_jobs as p on true
  order by p.published_at desc nulls last, p.id desc nulls last;
end;
$$;

revoke all on function public.search_public_job_previews(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_public_job_previews(text, text, text, text, integer)
  to anon, authenticated;

commit;
