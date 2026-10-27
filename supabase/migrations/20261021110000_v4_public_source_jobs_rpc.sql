begin;

create or replace function public.is_public_source_job(_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.job_source_imports as source_import
    where source_import.job_id = _job_id
      and source_import.source_published_at <= pg_catalog.now()
      and source_import.source_expires_at > pg_catalog.now()
  );
$$;

revoke all on function public.is_public_source_job(uuid)
  from public, anon, authenticated;

create or replace function public.search_public_jobs(
  _query text default '',
  _district text default null,
  _job_type text default null,
  _workplace_mode text default null,
  _page integer default 1
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.btrim(coalesce(_query, ''));
  v_like_query text;
  v_result jsonb;
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

  with filtered_jobs as materialized (
    select
      j.id,
      j.company_id,
      j.title,
      j.slug,
      j.summary,
      j.description,
      j.requirements,
      j.responsibilities,
      j.job_type,
      j.workplace_mode,
      j.district,
      j.published_at,
      j.expires_at,
      j.publication_source,
      source_import.source as source_site,
      c.name as company_name,
      c.slug as company_slug
    from public.jobs as j
    join public.companies as c on c.id = j.company_id
    left join public.job_source_imports as source_import
      on source_import.job_id = j.id
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
          'pg_catalog.simple'::pg_catalog.regconfig,
          v_query
        )
        or c.name ilike v_like_query escape E'\\'
      )
  ),
  result_count as (
    select pg_catalog.count(*) as total_count
    from filtered_jobs
  ),
  ordered_jobs as (
    select
      f.*,
      pg_catalog.row_number() over (
        order by f.published_at desc, f.id desc
      ) as row_number
    from filtered_jobs as f
  ),
  page_jobs as (
    select o.*
    from ordered_jobs as o
    cross join result_count as c
    where o.row_number > (
      least(
        _page,
        greatest(
          1,
          pg_catalog.ceil(c.total_count::numeric / 20)::integer
        )
      ) - 1
    ) * 20
      and o.row_number <= least(
        _page,
        greatest(
          1,
          pg_catalog.ceil(c.total_count::numeric / 20)::integer
        )
      ) * 20
  )
  select pg_catalog.jsonb_build_object(
    'jobs',
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', p.id,
            'company_id', p.company_id,
            'title', p.title,
            'slug', p.slug,
            'summary', p.summary,
            'description', p.description,
            'requirements', p.requirements,
            'responsibilities', p.responsibilities,
            'job_type', p.job_type,
            'workplace_mode', p.workplace_mode,
            'district', p.district,
            'published_at', p.published_at,
            'expires_at', p.expires_at,
            'publication_source', p.publication_source,
            'source_site', p.source_site,
            'company', pg_catalog.jsonb_build_object(
              'id', p.company_id,
              'name', p.company_name,
              'slug', p.company_slug
            )
          )
          order by p.published_at desc, p.id desc
        )
        from page_jobs as p
      ),
      '[]'::jsonb
    ),
    'total', c.total_count,
    'page',
    least(
      _page,
      greatest(
        1,
        pg_catalog.ceil(c.total_count::numeric / 20)::integer
      )
    ),
    'pageSize', 20
  )
  into v_result
  from result_count as c;

  return v_result;
end;
$$;

create or replace function public.get_public_job_details(_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if _slug is null
    or pg_catalog.char_length(_slug) not between 2 and 100
    or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid public job slug.';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', j.id,
    'company_id', j.company_id,
    'title', j.title,
    'slug', j.slug,
    'summary', j.summary,
    'description', j.description,
    'requirements', j.requirements,
    'responsibilities', j.responsibilities,
    'job_type', j.job_type,
    'workplace_mode', j.workplace_mode,
    'district', j.district,
    'published_at', j.published_at,
    'expires_at', j.expires_at,
    'publication_source', j.publication_source,
    'source_site', source_import.source,
    'company', pg_catalog.jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug
    )
  )
  into v_result
  from public.jobs as j
  join public.companies as c on c.id = j.company_id
  left join public.job_source_imports as source_import
    on source_import.job_id = j.id
  where j.slug = _slug
    and j.status = 'published'
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
    );

  return v_result;
end;
$$;

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

create or replace function public.search_public_job_companies()
returns table (
  company_name text,
  company_slug text,
  active_job_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.name, c.slug, pg_catalog.count(*) as active_job_count
  from public.jobs as j
  join public.companies as c on c.id = j.company_id
  where j.status = 'published'
    and j.published_at <= pg_catalog.now()
    and j.expires_at > pg_catalog.now()
    and j.publication_source = 'source_site'
    and public.is_public_source_job(j.id)
  group by c.id, c.name, c.slug
  order by c.name collate "C", c.slug;
$$;

revoke all on function public.search_public_jobs(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_public_jobs(text, text, text, text, integer)
  to anon, authenticated;

revoke all on function public.get_public_job_details(text)
  from public, anon, authenticated;
grant execute on function public.get_public_job_details(text)
  to anon, authenticated;

revoke all on function public.search_public_job_previews(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.search_public_job_previews(text, text, text, text, integer)
  to anon, authenticated;

revoke all on function public.search_public_job_companies()
  from public, anon, authenticated;
grant execute on function public.search_public_job_companies()
  to anon, authenticated;

commit;
