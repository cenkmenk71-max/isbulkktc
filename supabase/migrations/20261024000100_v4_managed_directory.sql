-- Company directory as managed data.
--
-- The public directory (911 companies, 913 branches) used to ship as a 340 KB
-- JSON bundle inside the deployment, merged at request time with the approved
-- `company_directory_overrides`. That made every directory correction a rebuild.
-- This migration makes PostgreSQL the source of truth: the JSON stays only as the
-- import/seed input, and the page reads the table through a public RPC.
--
-- Visibility rules are unchanged: `anon` reads only the public projection RPC,
-- never the table. Administrators (MFA-verified `platform_admin`) write through
-- RPCs that append an audit row. `service_role` keeps direct access so the
-- import script and the seed can bulk-load the fixture.

create table public.directory_companies (
  directory_entry_id text primary key
    check (char_length(directory_entry_id) between 8 and 128),
  name text not null
    check (
      char_length(name) between 2 and 160
      and name = btrim(name)
    ),
  categories text[] not null default '{}'
    check (public.is_valid_company_categories(categories, 12, 80)),
  logo_file text
    check (logo_file is null or logo_file ~ '^/logos/[A-Za-z0-9_-]+\.webp$'),
  logo_domain text
    check (logo_domain is null or char_length(logo_domain) between 3 and 253),
  logo_width integer
    check (logo_width is null or logo_width between 1 and 10000),
  logo_height integer
    check (logo_height is null or logo_height between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger directory_companies_set_updated_at
  before update on public.directory_companies
  for each row execute function public.set_updated_at();

create table public.directory_locations (
  directory_entry_id text not null
    references public.directory_companies (directory_entry_id) on delete cascade,
  location_index integer not null
    check (location_index >= 0),
  address text
    check (address is null or char_length(address) <= 240),
  municipality text
    check (municipality is null or char_length(municipality) <= 120),
  phone text
    check (phone is null or char_length(phone) <= 80),
  website text
    check (
      website is null
      or (
        char_length(website) <= 2048
        and website ~* '^https?://[^[:space:]]+$'
      )
    ),
  email text
    check (
      email is null
      or (
        char_length(email) <= 254
        and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  primary key (directory_entry_id, location_index)
);

create index directory_locations_website_idx
  on public.directory_locations (website)
  where website is not null;

alter table public.directory_companies enable row level security;
alter table public.directory_locations enable row level security;

revoke all on table
  public.directory_companies,
  public.directory_locations
from anon, authenticated;

-- Public read --------------------------------------------------------------

create or replace function public.get_public_directory()
returns table (
  directory_entry_id text,
  name text,
  categories text[],
  logo_file text,
  logo_width integer,
  logo_height integer,
  locations jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.directory_entry_id,
    c.name,
    c.categories,
    c.logo_file,
    c.logo_width,
    c.logo_height,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'address', l.address,
            'municipality', l.municipality,
            'phone', l.phone,
            'website', l.website,
            'email', l.email
          )
          order by l.location_index
        )
        from public.directory_locations as l
        where l.directory_entry_id = c.directory_entry_id
      ),
      '[]'::jsonb
    ) as locations
  from public.directory_companies as c
  order by c.name, c.directory_entry_id;
$$;

-- Administrative write -----------------------------------------------------

create or replace function public.admin_upsert_directory_company(
  _directory_entry_id text,
  _name text,
  _categories text[],
  _logo_file text,
  _logo_domain text,
  _logo_width integer,
  _logo_height integer,
  _locations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_id text := pg_catalog.btrim(_directory_entry_id);
  v_name text := pg_catalog.btrim(_name);
  v_location jsonb;
  v_index integer := 0;
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  if v_id is null
     or pg_catalog.char_length(v_id) not between 8 and 128
     or v_name is null
     or pg_catalog.char_length(v_name) not between 2 and 160
     or not public.is_valid_company_categories(coalesce(_categories, '{}'), 12, 80)
     or (_logo_file is not null and _logo_file !~ '^/logos/[A-Za-z0-9_-]+\.webp$')
     or (_logo_domain is not null and pg_catalog.char_length(_logo_domain) not between 3 and 253)
     or (_logo_width is not null and _logo_width not between 1 and 10000)
     or (_logo_height is not null and _logo_height not between 1 and 10000)
     or _locations is null
     or pg_catalog.jsonb_typeof(_locations) <> 'array'
     or pg_catalog.jsonb_array_length(_locations) > 20 then
    raise exception 'The directory company definition is invalid.'
      using errcode = '22023';
  end if;

  insert into public.directory_companies (
    directory_entry_id, name, categories,
    logo_file, logo_domain, logo_width, logo_height
  ) values (
    v_id, v_name, coalesce(_categories, '{}'),
    _logo_file, _logo_domain, _logo_width, _logo_height
  )
  on conflict (directory_entry_id) do update set
    name = excluded.name,
    categories = excluded.categories,
    logo_file = excluded.logo_file,
    logo_domain = excluded.logo_domain,
    logo_width = excluded.logo_width,
    logo_height = excluded.logo_height;

  delete from public.directory_locations
  where directory_entry_id = v_id;

  for v_location in select value from pg_catalog.jsonb_array_elements(_locations)
  loop
    insert into public.directory_locations (
      directory_entry_id, location_index, address, municipality, phone, website, email
    ) values (
      v_id,
      v_index,
      nullif(pg_catalog.btrim(v_location ->> 'address'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'municipality'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'phone'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'website'), ''),
      nullif(pg_catalog.btrim(v_location ->> 'email'), '')
    );
    v_index := v_index + 1;
  end loop;

  insert into public.audit_logs (actor_id, action, resource_type, metadata_redacted)
  values (
    v_actor,
    'content.directory.upsert',
    'directory_companies',
    pg_catalog.jsonb_build_object(
      'directory_entry_id', v_id,
      'location_count', v_index
    )
  );
end;
$$;

create or replace function public.admin_delete_directory_company(
  _directory_entry_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  delete from public.directory_companies
  where directory_entry_id = _directory_entry_id;

  if not found then
    raise exception 'The directory company to delete does not exist.'
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, metadata_redacted)
  values (
    v_actor,
    'content.directory.delete',
    'directory_companies',
    pg_catalog.jsonb_build_object('directory_entry_id', _directory_entry_id)
  );
end;
$$;

revoke all on function public.get_public_directory()
  from public;
revoke all on function public.admin_upsert_directory_company(text, text, text[], text, text, integer, integer, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_delete_directory_company(text)
  from public, anon, authenticated;

grant execute on function public.get_public_directory()
  to anon, authenticated;
grant execute on function public.admin_upsert_directory_company(text, text, text[], text, text, integer, integer, jsonb)
  to authenticated;
grant execute on function public.admin_delete_directory_company(text)
  to authenticated;
