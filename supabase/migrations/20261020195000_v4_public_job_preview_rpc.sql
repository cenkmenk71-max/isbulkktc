revoke all on table public.jobs from anon;
revoke select (
  id, company_id, title, slug, summary, description, requirements,
  responsibilities, job_type, workplace_mode, district, status, published_at,
  expires_at, created_at, updated_at
) on table public.jobs from anon;

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
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(_query, ''));
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

  return query
  with filtered_jobs as materialized (
    select
      j.id,
      j.title as job_title,
      c.name as company_name,
      j.published_at
    from public.jobs as j
    join public.companies as c on c.id = j.company_id
    where j.status = 'published'
      and j.published_at <= pg_catalog.now()
      and j.expires_at > pg_catalog.now()
      and c.verification_status = 'verified'
      and (_district is null or j.district = _district)
      and (_job_type is null or j.job_type = _job_type)
      and (_workplace_mode is null or j.workplace_mode = _workplace_mode)
      and (
        v_query = ''
        or j.search_vector @@ pg_catalog.websearch_to_tsquery(
          'pg_catalog.simple'::pg_catalog.regconfig,
          v_query
        )
      )
  ),
  page_jobs as (
    select f.id, f.job_title, f.company_name, f.published_at
    from filtered_jobs as f
    order by f.published_at desc, f.id desc
    limit 6
    offset ((_page - 1) * 6)
  ),
  result_count as (
    select pg_catalog.count(*) as total_count
    from filtered_jobs
  )
  select p.job_title, p.company_name, c.total_count
  from result_count as c
  left join page_jobs as p on true
  order by p.published_at desc nulls last, p.id desc nulls last;
end;
$$;

revoke all on function public.search_public_job_previews(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_public_job_previews(text, text, text, text, integer)
  to anon, authenticated;
