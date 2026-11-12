-- Accent-insensitive public job search.
--
-- Turkish place names, roles and skill words are written with diacritics
-- ("İnşaat mühendisi", "Mağusa", "Güzelyurt") but visitors type the ASCII
-- spelling ("insaat", "magusa"). `pg_catalog.simple` folds case but not
-- accents, so a query that omits a diacritic matches nothing: the listing page
-- renders an empty board, answers `noindex`, and the URL piles up under
-- "Excluded by noindex tag" in Search Console.
--
-- Fix: index and query through one text search configuration that runs the
-- `unaccent` dictionary before the `simple` stemmer, so both sides fold
-- "inşaat" and "insaat" to the same token. A custom configuration is used
-- rather than wrapping `to_tsvector` in `unaccent()` because a generated column
-- requires an IMMUTABLE expression and `unaccent(text)` is only STABLE; a text
-- search dictionary is invoked by the indexable `to_tsvector(regconfig, text)`
-- and keeps the generated column and its GIN index intact.
--
-- The configuration copies `simple` and only the word token types are
-- re-mapped; every other token type (numbers, emails, urls, ...) keeps
-- `simple`'s behaviour.
--
-- The three public RPCs are re-created from their most recent definitions
-- (search_public_jobs and get_public_job_details from
-- 20261024100000_v4_job_modified_at.sql, search_public_job_previews from
-- 20261021110000_v4_public_source_jobs_rpc.sql), swapping the hard-coded
-- `pg_catalog.simple` for the shared configuration so the query side folds the
-- same way the stored vector does.

begin;

create extension if not exists unaccent with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_ts_config as c
    join pg_catalog.pg_namespace as n on n.oid = c.cfgnamespace
    where n.nspname = 'public' and c.cfgname = 'job_search_unaccent'
  ) then
    create text search configuration public.job_search_unaccent
      (copy = pg_catalog.simple);
  end if;
end;
$$;

alter text search configuration public.job_search_unaccent
  alter mapping for
    asciiword, asciihword, hword_asciipart,
    word, hword, hword_part,
    numword, numhword, hword_numpart
  with extensions.unaccent, pg_catalog.simple;

-- Rebuild the stored search vector through the new configuration. The GIN index
-- is dropped first because it depends on the column expression being replaced,
-- and re-created once the new expression is in place.
drop index if exists public.jobs_public_search_idx;

alter table public.jobs
  alter column search_vector
  set expression as (
    pg_catalog.to_tsvector(
      'public.job_search_unaccent'::pg_catalog.regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(requirements, '') || ' ' ||
      coalesce(responsibilities, '')
    )
  );

create index jobs_public_search_idx on public.jobs using gin (search_vector);


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
      case
        when j.publication_source = 'platform' then j.updated_at
        else coalesce(
          source_import.source_updated_at,
          source_import.source_published_at,
          j.published_at
        )
      end as modified_at,
      j.publication_source,
      source_import.source as source_site,
      source_import.source_job_id,
      c.name as company_name,
      c.slug as company_slug,
      c.profile_description as company_profile_description,
      c.categories as company_categories,
      c.website as company_website,
      c.municipality as company_municipality,
      c.source_profile_url as company_source_profile_url,
      c.logo_url as company_logo_url
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
          'public.job_search_unaccent'::pg_catalog.regconfig,
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
            'modified_at', p.modified_at,
            'publication_source', p.publication_source,
            'source_site', p.source_site,
            'source_listing_url',
              case
                when p.source_site = 'iskibris'
                  and p.source_job_id ~ '^[0-9]{1,18}$'
                  then 'https://www.iskibris.com/jobs/' || p.source_job_id
                when p.source_site = 'isbulkibris'
                  and p.source_job_id ~
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then 'https://isbulkibris.com/jobs/' || p.source_job_id
                else null
              end,
            'company', pg_catalog.jsonb_build_object(
              'id', p.company_id,
              'name', p.company_name,
              'slug', p.company_slug,
              'profile_description',
                case
                  when p.publication_source = 'source_site'
                    then nullif(p.company_profile_description, '')
                  else null
                end,
              'categories',
                case
                  when p.publication_source = 'source_site'
                    then p.company_categories
                  else '{}'::text[]
                end,
              'website',
                case
                  when p.publication_source = 'source_site'
                    then p.company_website
                  else null
                end,
              'municipality',
                case
                  when p.publication_source = 'source_site'
                    then p.company_municipality
                  else null
                end,
              'source_profile_url',
                case
                  when p.publication_source = 'source_site'
                    then p.company_source_profile_url
                  else null
                end,
              'logo_url',
                case
                  when p.publication_source = 'source_site'
                    then p.company_logo_url
                  else null
                end
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
    'modified_at',
      case
        when j.publication_source = 'platform' then j.updated_at
        else coalesce(
          source_import.source_updated_at,
          source_import.source_published_at,
          j.published_at
        )
      end,
    'publication_source', j.publication_source,
    'source_site', source_import.source,
    'source_listing_url',
      case
        when source_import.source = 'iskibris'
          and source_import.source_job_id ~ '^[0-9]{1,18}$'
          then 'https://www.iskibris.com/jobs/' || source_import.source_job_id
        when source_import.source = 'isbulkibris'
          and source_import.source_job_id ~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then 'https://isbulkibris.com/jobs/' || source_import.source_job_id
        else null
      end,
    'company', pg_catalog.jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'slug', c.slug,
      'profile_description',
        case
          when j.publication_source = 'source_site'
            then nullif(c.profile_description, '')
          else null
        end,
      'categories',
        case
          when j.publication_source = 'source_site'
            then c.categories
          else '{}'::text[]
        end,
      'website',
        case
          when j.publication_source = 'source_site' then c.website
          else null
        end,
      'municipality',
        case
          when j.publication_source = 'source_site' then c.municipality
          else null
        end,
      'source_profile_url',
        case
          when j.publication_source = 'source_site' then c.source_profile_url
          else null
        end,
      'logo_url',
        case
          when j.publication_source = 'source_site' then c.logo_url
          else null
        end
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
          'public.job_search_unaccent'::pg_catalog.regconfig,
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

commit;
