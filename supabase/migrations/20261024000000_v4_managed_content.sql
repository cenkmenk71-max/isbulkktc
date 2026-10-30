-- Managed content core.
--
-- Until now the editorial layer (legal documents, FAQ, listing plans) shipped
-- inside the deployment: legal copy lived in the locale catalogues, the FAQ in
-- `src/content/ai-visibility/faq.ts`, and the plan catalogue in a TypeScript
-- constant. That made every wording change a redeploy. This migration moves the
-- source of truth into PostgreSQL so an administrator can publish a new privacy
-- notice, FAQ entry or plan without a build.
--
-- Design rules, consistent with the rest of the schema:
--   * no table is readable by `anon`/`authenticated` directly; every read goes
--     through a `security definer` RPC that returns only public columns,
--   * writes are `security definer` RPCs gated on `public.has_platform_role`
--     (which already requires an MFA-verified administrator),
--   * every administrative write appends a redacted `audit_logs` row,
--   * `service_role` keeps direct table access for the import/seed scripts.

create table public.site_content (
  content_key text not null
    check (
      content_key ~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
      and char_length(content_key) between 2 and 120
    ),
  locale text not null
    check (locale in ('tr', 'en', 'ru', 'el', 'fa', 'de')),
  document jsonb not null default '{}'::jsonb
    check (
      jsonb_typeof(document) = 'object'
      and pg_catalog.pg_column_size(document) <= 65536
    ),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (content_key, locale)
);

create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.set_updated_at();

create table public.faq_entries (
  id uuid primary key default gen_random_uuid(),
  locale text not null
    check (locale in ('tr', 'en', 'ru', 'el', 'fa', 'de')),
  question text not null
    check (
      char_length(question) between 2 and 400
      and question = btrim(question)
    ),
  answer text not null
    check (
      char_length(answer) between 2 and 4000
      and answer = btrim(answer)
    ),
  sort_order integer not null default 0
    check (sort_order between 0 and 10000),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index faq_entries_locale_order_idx
  on public.faq_entries (locale, sort_order, created_at);

create trigger faq_entries_set_updated_at
  before update on public.faq_entries
  for each row execute function public.set_updated_at();

create table public.listing_plans (
  code text primary key
    check (
      code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and char_length(code) between 2 and 80
    ),
  audience text not null
    check (char_length(audience) between 2 and 40),
  name text not null
    check (char_length(name) between 2 and 80 and name = btrim(name)),
  blurb text not null default ''
    check (char_length(blurb) <= 400),
  features text[] not null default '{}'
    check (public.is_valid_company_categories(features, 12, 200)),
  color text not null
    check (color ~ '^#[0-9a-f]{6}$'),
  listing_count integer
    check (listing_count is null or listing_count between 1 and 1000),
  price_1 integer not null default 0 check (price_1 between 0 and 100000000),
  price_7 integer not null default 0 check (price_7 between 0 and 100000000),
  price_30 integer not null default 0 check (price_30 between 0 and 100000000),
  is_active boolean not null default true,
  sort_order integer not null default 0
    check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listing_plans_active_order_idx
  on public.listing_plans (is_active, sort_order, code);

create trigger listing_plans_set_updated_at
  before update on public.listing_plans
  for each row execute function public.set_updated_at();

alter table public.site_content enable row level security;
alter table public.faq_entries enable row level security;
alter table public.listing_plans enable row level security;

revoke all on table
  public.site_content,
  public.faq_entries,
  public.listing_plans
from anon, authenticated;

-- Public reads -------------------------------------------------------------

create or replace function public.get_public_site_content(
  _locale text,
  _keys text[] default null
)
returns table (
  content_key text,
  locale text,
  document jsonb,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if _locale is null or _locale not in ('tr', 'en', 'ru', 'el', 'fa', 'de') then
    raise exception 'An unsupported content locale was requested.'
      using errcode = '22023';
  end if;

  if _keys is not null and (
    pg_catalog.cardinality(_keys) > 200
    or exists (
      select 1 from pg_catalog.unnest(_keys) as key(value)
      where value is null or pg_catalog.char_length(value) > 120
    )
  ) then
    raise exception 'The requested content key list is invalid.'
      using errcode = '22023';
  end if;

  return query
  select
    c.content_key,
    c.locale,
    c.document,
    c.updated_at
  from public.site_content as c
  where c.locale = _locale
    and (_keys is null or c.content_key = any (_keys))
  order by c.content_key;
end;
$$;

create or replace function public.get_public_faq(_locale text)
returns table (
  id uuid,
  question text,
  answer text,
  sort_order integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if _locale is null or _locale not in ('tr', 'en', 'ru', 'el', 'fa', 'de') then
    raise exception 'An unsupported FAQ locale was requested.'
      using errcode = '22023';
  end if;

  return query
  select
    f.id,
    f.question,
    f.answer,
    f.sort_order
  from public.faq_entries as f
  where f.locale = _locale
    and f.is_published
  order by f.sort_order, f.created_at;
end;
$$;

create or replace function public.get_public_listing_plans()
returns table (
  code text,
  audience text,
  name text,
  blurb text,
  features text[],
  color text,
  listing_count integer,
  price_1 integer,
  price_7 integer,
  price_30 integer,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.code,
    p.audience,
    p.name,
    p.blurb,
    p.features,
    p.color,
    p.listing_count,
    p.price_1,
    p.price_7,
    p.price_30,
    p.sort_order
  from public.listing_plans as p
  where p.is_active
  order by p.sort_order, p.code;
$$;

-- Administrative writes ----------------------------------------------------

create or replace function public.admin_upsert_site_content(
  _content_key text,
  _locale text,
  _document jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_key text := pg_catalog.btrim(_content_key);
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  if v_key is null
     or v_key !~ '^[a-z0-9]+([._-][a-z0-9]+)*$'
     or pg_catalog.char_length(v_key) not between 2 and 120
     or _locale is null
     or _locale not in ('tr', 'en', 'ru', 'el', 'fa', 'de')
     or _document is null
     or pg_catalog.jsonb_typeof(_document) <> 'object'
     or pg_catalog.pg_column_size(_document) > 65536 then
    raise exception 'The managed content document is invalid.'
      using errcode = '22023';
  end if;

  -- Legal documents have a fixed shape (title/intro/updated/sections). Checking
  -- it here gives the administrator immediate feedback instead of a document
  -- that silently fails to parse and falls back to the bundled copy at render.
  if v_key like 'legal.%' then
    if coalesce(pg_catalog.jsonb_typeof(_document -> 'title'), 'null') <> 'string'
       or pg_catalog.char_length(_document ->> 'title') not between 1 and 300
       or coalesce(pg_catalog.jsonb_typeof(_document -> 'intro'), 'null') <> 'string'
       or pg_catalog.char_length(_document ->> 'intro') not between 1 and 2000
       or coalesce(pg_catalog.jsonb_typeof(_document -> 'updated'), 'null') <> 'string'
       or pg_catalog.char_length(_document ->> 'updated') not between 1 and 120
       or coalesce(pg_catalog.jsonb_typeof(_document -> 'sections'), 'null') <> 'array'
       or pg_catalog.jsonb_array_length(_document -> 'sections') not between 1 and 40
       or exists (
         select 1
         from pg_catalog.jsonb_array_elements(_document -> 'sections') as section(value)
         where coalesce(pg_catalog.jsonb_typeof(section.value -> 'title'), 'null') <> 'string'
           or pg_catalog.char_length(section.value ->> 'title') not between 1 and 300
           or coalesce(pg_catalog.jsonb_typeof(section.value -> 'paragraphs'), 'null') <> 'array'
           or pg_catalog.jsonb_array_length(section.value -> 'paragraphs') not between 1 and 40
       ) then
      raise exception 'The legal document is invalid.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.site_content (content_key, locale, document, updated_by)
  values (v_key, _locale, _document, v_actor)
  on conflict (content_key, locale)
  do update set document = excluded.document, updated_by = excluded.updated_by;

  insert into public.audit_logs (actor_id, action, resource_type, metadata_redacted)
  values (
    v_actor,
    'content.site.upsert',
    'site_content',
    pg_catalog.jsonb_build_object('content_key', v_key, 'locale', _locale)
  );
end;
$$;

create or replace function public.admin_upsert_faq_entry(
  _id uuid,
  _locale text,
  _question text,
  _answer text,
  _sort_order integer,
  _is_published boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_question text := pg_catalog.btrim(_question);
  v_answer text := pg_catalog.btrim(_answer);
  v_id uuid;
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  if _locale is null
     or _locale not in ('tr', 'en', 'ru', 'el', 'fa', 'de')
     or v_question is null
     or pg_catalog.char_length(v_question) not between 2 and 400
     or v_answer is null
     or pg_catalog.char_length(v_answer) not between 2 and 4000
     or _sort_order is null
     or _sort_order not between 0 and 10000
     or _is_published is null then
    raise exception 'The FAQ entry is invalid.'
      using errcode = '22023';
  end if;

  if _id is null then
    insert into public.faq_entries (locale, question, answer, sort_order, is_published)
    values (_locale, v_question, v_answer, _sort_order, _is_published)
    returning id into v_id;
  else
    update public.faq_entries
    set locale = _locale,
        question = v_question,
        answer = v_answer,
        sort_order = _sort_order,
        is_published = _is_published
    where id = _id
    returning id into v_id;

    if v_id is null then
      raise exception 'The FAQ entry to update does not exist.'
        using errcode = 'P0002';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (
    v_actor,
    'content.faq.upsert',
    'faq_entries',
    v_id,
    pg_catalog.jsonb_build_object('locale', _locale, 'sort_order', _sort_order)
  );

  return v_id;
end;
$$;

create or replace function public.admin_delete_faq_entry(_id uuid)
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

  delete from public.faq_entries where id = _id;
  if not found then
    raise exception 'The FAQ entry to delete does not exist.'
      using errcode = 'P0002';
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (v_actor, 'content.faq.delete', 'faq_entries', _id);
end;
$$;

create or replace function public.admin_upsert_listing_plan(
  _code text,
  _audience text,
  _name text,
  _blurb text,
  _features text[],
  _color text,
  _listing_count integer,
  _price_1 integer,
  _price_7 integer,
  _price_30 integer,
  _is_active boolean,
  _sort_order integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_code text := pg_catalog.lower(pg_catalog.btrim(_code));
  v_name text := pg_catalog.btrim(_name);
  v_audience text := pg_catalog.btrim(_audience);
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  if v_code is null
     or v_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or pg_catalog.char_length(v_code) not between 2 and 80
     or v_audience is null
     or pg_catalog.char_length(v_audience) not between 2 and 40
     or v_name is null
     or pg_catalog.char_length(v_name) not between 2 and 80
     or pg_catalog.char_length(pg_catalog.btrim(coalesce(_blurb, ''))) > 400
     or not public.is_valid_company_categories(coalesce(_features, '{}'), 12, 200)
     or _color is null
     or _color !~ '^#[0-9a-f]{6}$'
     or (_listing_count is not null and _listing_count not between 1 and 1000)
     or coalesce(_price_1, 0) not between 0 and 100000000
     or coalesce(_price_7, 0) not between 0 and 100000000
     or coalesce(_price_30, 0) not between 0 and 100000000
     or _is_active is null
     or coalesce(_sort_order, 0) not between 0 and 10000 then
    raise exception 'The listing plan definition is invalid.'
      using errcode = '22023';
  end if;

  insert into public.listing_plans (
    code, audience, name, blurb, features, color, listing_count,
    price_1, price_7, price_30, is_active, sort_order
  ) values (
    v_code, v_audience, v_name, pg_catalog.btrim(coalesce(_blurb, '')),
    coalesce(_features, '{}'), _color, _listing_count,
    coalesce(_price_1, 0), coalesce(_price_7, 0), coalesce(_price_30, 0),
    _is_active, coalesce(_sort_order, 0)
  )
  on conflict (code) do update set
    audience = excluded.audience,
    name = excluded.name,
    blurb = excluded.blurb,
    features = excluded.features,
    color = excluded.color,
    listing_count = excluded.listing_count,
    price_1 = excluded.price_1,
    price_7 = excluded.price_7,
    price_30 = excluded.price_30,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

  insert into public.audit_logs (actor_id, action, resource_type, metadata_redacted)
  values (
    v_actor,
    'content.plan.upsert',
    'listing_plans',
    pg_catalog.jsonb_build_object('code', v_code, 'is_active', _is_active)
  );
end;
$$;

create or replace function public.admin_list_faq_entries()
returns table (
  id uuid,
  locale text,
  question text,
  answer text,
  sort_order integer,
  is_published boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  return query
  select
    f.id,
    f.locale,
    f.question,
    f.answer,
    f.sort_order,
    f.is_published
  from public.faq_entries as f
  order by f.locale, f.sort_order, f.created_at;
end;
$$;

revoke all on function public.admin_list_faq_entries()
  from public, anon, authenticated;
grant execute on function public.admin_list_faq_entries()
  to authenticated;

revoke all on function public.get_public_site_content(text, text[])
  from public;
revoke all on function public.get_public_faq(text)
  from public;
revoke all on function public.get_public_listing_plans()
  from public;
revoke all on function public.admin_upsert_site_content(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.admin_upsert_faq_entry(uuid, text, text, text, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.admin_delete_faq_entry(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_upsert_listing_plan(text, text, text, text, text[], text, integer, integer, integer, integer, boolean, integer)
  from public, anon, authenticated;

grant execute on function public.get_public_site_content(text, text[])
  to anon, authenticated;
grant execute on function public.get_public_faq(text)
  to anon, authenticated;
grant execute on function public.get_public_listing_plans()
  to anon, authenticated;
grant execute on function public.admin_upsert_site_content(text, text, jsonb)
  to authenticated;
grant execute on function public.admin_upsert_faq_entry(uuid, text, text, text, integer, boolean)
  to authenticated;
grant execute on function public.admin_delete_faq_entry(uuid)
  to authenticated;
grant execute on function public.admin_upsert_listing_plan(text, text, text, text, text[], text, integer, integer, integer, integer, boolean, integer)
  to authenticated;
