-- Company-name search parity between the listing and the homepage preview.
--
-- `search_public_jobs` (the /jobs listing) matches a query against the job's
-- search vector *or* the company name (`c.name ilike v_like_query`), so typing
-- a company name finds that company's vacancies. `search_public_job_previews`
-- (the homepage preview board) only matched the search vector, so the same
-- query returned "no vacancies" there. A visitor searching a company name on
-- the homepage got an empty board while the listing page found the jobs — the
-- two public entry points disagreed.
--
-- This recreates the preview RPC from its current definition, adding the same
-- escaped `ilike` company-name clause the listing already uses. The escaping
-- (`\`, `%`, `_`) keeps a literal query from acting as a wildcard, and the
-- company-name match is accent-*insensitive* only in the same way `ilike` is —
-- it is intentionally left as a plain `ilike` so both RPCs behave identically.
--
-- Idempotent: `create or replace` plus a re-grant of the same ACL.

begin;

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
      c.name as company_name,
      j.published_at
    from public.jobs as j
    join public.companies as c on c.id = j.company_id
    where j.status = 'published'
      and j.published_at <= pg_catalog.now()
      and j.expires_at > pg_catalog.now()
      and (
        (
          j.publication_source = 'platform'
          and c.verification_status = 'verified'
        )
        or (
          j.publication_source = 'source_site'
          and public.is_public_source_job(j.id)
        )
      )
      and (_district is null or j.district = _district)
      and (_job_type is null or j.job_type = _job_type)
      and (_workplace_mode is null or j.workplace_mode = _workplace_mode)
      and (
        v_query = ''
        or j.search_vector @@ pg_catalog.websearch_to_tsquery(
          'public.job_search_unaccent'::pg_catalog.regconfig,
          v_query
        )
        or c.name ilike v_like_query escape E'\\'
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

commit;
