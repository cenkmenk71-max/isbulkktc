create type public.platform_role as enum (
  'platform_admin',
  'billing_admin'
);

create type public.company_role as enum (
  'owner',
  'recruiter',
  'billing',
  'viewer'
);

create type public.company_verification_status as enum (
  'pending',
  'verified',
  'rejected',
  'suspended'
);

create type public.membership_status as enum (
  'active',
  'pending',
  'suspended'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (
      char_length(display_name) between 2 and 80
      and display_name = btrim(display_name)
    ),
  locale text not null default 'tr'
    check (locale in ('tr', 'en', 'ru', 'el', 'fa', 'de', 'he')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.candidate_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  headline text check (headline is null or char_length(headline) <= 140),
  location text check (location is null or char_length(location) <= 120),
  skills text[] not null default '{}'
    check (cardinality(skills) <= 40),
  visibility text not null default 'private'
    check (visibility in ('private', 'public')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (
      char_length(name) between 2 and 120
      and name = btrim(name)
    ),
  slug text not null unique
    check (
      char_length(slug) between 2 and 80
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      and slug !~ '[^a-z0-9-]'
    ),
  verification_status public.company_verification_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  membership_role public.company_role not null,
  status public.membership_status not null default 'active',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_id_idx
  on public.company_members (user_id, status);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id uuid,
  metadata_redacted jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.candidate_profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table
  public.profiles,
  public.user_roles,
  public.candidate_profiles,
  public.companies,
  public.company_members,
  public.audit_logs
from anon, authenticated;

grant select on table
  public.profiles,
  public.user_roles,
  public.candidate_profiles,
  public.companies,
  public.company_members
to authenticated;

grant update (display_name, locale)
  on table public.profiles
to authenticated;

grant insert (user_id, headline, location, skills, visibility)
  on table public.candidate_profiles
to authenticated;

grant update (headline, location, skills, visibility)
  on table public.candidate_profiles
to authenticated;

grant select on table public.companies to anon;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger candidate_profiles_set_updated_at
  before update on public.candidate_profiles
  for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display_name text;
begin
  v_display_name := pg_catalog.left(
    pg_catalog.btrim(
      coalesce(
        new.raw_user_meta_data ->> 'display_name',
        pg_catalog.split_part(coalesce(new.email, ''), '@', 1),
        'Aday'
      )
    ),
    80
  );

  insert into public.profiles (id, display_name)
  values (
    new.id,
    case
      when pg_catalog.char_length(v_display_name) >= 2 then v_display_name
      else 'Aday'
    end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.has_platform_role(_role public.platform_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles as role_row
    where role_row.user_id = (select auth.uid())
      and role_row.role = _role
  );
$$;

create or replace function public.is_active_company_member(
  _company_id uuid,
  _allowed_roles public.company_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members as member_row
    where member_row.company_id = _company_id
      and member_row.user_id = (select auth.uid())
      and member_row.status = 'active'
      and (
        _allowed_roles is null
        or member_row.membership_role = any (_allowed_roles)
      )
  );
$$;

revoke all on function public.has_platform_role(public.platform_role) from public, anon, authenticated;
grant execute on function public.has_platform_role(public.platform_role) to authenticated;

revoke all on function public.is_active_company_member(uuid, public.company_role[]) from public, anon, authenticated;
grant execute on function public.is_active_company_member(uuid, public.company_role[]) to authenticated;

create policy profiles_read_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy user_roles_read_own
  on public.user_roles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy candidate_profiles_read_own
  on public.candidate_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

create policy candidate_profiles_insert_own
  on public.candidate_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy candidate_profiles_update_own
  on public.candidate_profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy companies_read_verified
  on public.companies for select to anon, authenticated
  using (verification_status = 'verified');

create policy companies_read_active_member
  on public.companies for select to authenticated
  using (public.is_active_company_member(id, null));

create policy companies_read_platform_admin
  on public.companies for select to authenticated
  using (public.has_platform_role('platform_admin'));

create policy company_members_read_own
  on public.company_members for select to authenticated
  using ((select auth.uid()) = user_id);

create policy company_members_read_company_owner
  on public.company_members for select to authenticated
  using (public.is_active_company_member(company_id, array['owner']::public.company_role[]));

create policy company_members_read_platform_admin
  on public.company_members for select to authenticated
  using (public.has_platform_role('platform_admin'));

create or replace function public.create_company(company_name text, company_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_name text := pg_catalog.btrim(company_name);
  v_slug text := pg_catalog.lower(pg_catalog.btrim(company_slug));
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.profiles as actor_profile
    where actor_profile.id = v_user_id
      and actor_profile.status = 'active'
  ) then
    raise exception 'An active account is required.'
      using errcode = '42501';
  end if;

  if v_name is null
     or pg_catalog.char_length(v_name) < 2
     or pg_catalog.char_length(v_name) > 120 then
    raise exception 'Company name must be between 2 and 120 characters.'
      using errcode = '22023';
  end if;

  if v_slug is null
     or pg_catalog.char_length(v_slug) < 2
     or pg_catalog.char_length(v_slug) > 80
     or v_slug ~ '[^a-z0-9-]'
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Company slug has an invalid format.'
      using errcode = '22023';
  end if;

  insert into public.companies (name, slug)
  values (v_name, v_slug)
  returning id into v_company_id;

  insert into public.company_members (company_id, user_id, membership_role)
  values (v_company_id, v_user_id, 'owner');

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata_redacted
  )
  values (
    v_user_id,
    'company.created',
    'company',
    v_company_id,
    pg_catalog.jsonb_build_object('verification_status', 'pending')
  );

  return v_company_id;
end;
$$;

revoke all on function public.create_company(text, text) from public, anon, authenticated;
grant execute on function public.create_company(text, text) to authenticated;

insert into storage.buckets (id, name, public)
values
  ('private-resumes', 'private-resumes', false),
  ('private-payment-receipts', 'private-payment-receipts', false),
  ('public-company-assets', 'public-company-assets', true)
on conflict (id) do update
  set name = excluded.name,
      public = excluded.public;
