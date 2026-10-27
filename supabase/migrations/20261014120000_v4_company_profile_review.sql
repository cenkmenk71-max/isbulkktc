create type public.company_profile_submission_status as enum (
  'pending',
  'approved',
  'rejected'
);

create or replace function public.is_valid_company_categories(
  _categories text[],
  _maximum_items integer,
  _maximum_length integer
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_category text;
begin
  if _categories is null
     or pg_catalog.cardinality(_categories) > _maximum_items then
    return false;
  end if;

  foreach v_category in array _categories
  loop
    if v_category is null
       or v_category <> pg_catalog.btrim(v_category)
       or pg_catalog.char_length(v_category) < 1
       or pg_catalog.char_length(v_category) > _maximum_length then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.is_valid_company_categories(text[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.is_valid_company_categories(text[], integer, integer)
  to authenticated;

alter table public.companies
  add column profile_description text not null default ''
    check (char_length(profile_description) <= 2000),
  add column categories text[] not null default '{}'
    check (public.is_valid_company_categories(categories, 12, 80)),
  add column website text
    check (
      website is null
      or (
        char_length(website) <= 2048
        and website ~* '^https?://[^[:space:]]+$'
      )
    ),
  add column phone text
    check (phone is null or char_length(phone) <= 80),
  add column public_email text
    check (
      public_email is null
      or (
        char_length(public_email) <= 254
        and public_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  add column address text
    check (address is null or char_length(address) <= 240),
  add column municipality text
    check (municipality is null or char_length(municipality) <= 120),
  add column directory_entry_id text
    check (directory_entry_id is null or char_length(directory_entry_id) between 8 and 128),
  add column directory_location_index integer
    check (directory_location_index is null or directory_location_index >= 0),
  add constraint companies_directory_claim_pair
    check (
      (directory_entry_id is null and directory_location_index is null)
      or (directory_entry_id is not null and directory_location_index is not null)
    );

create unique index companies_directory_claim_unique
  on public.companies (directory_entry_id, directory_location_index)
  where directory_entry_id is not null;

create table public.company_profile_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  submitted_by uuid not null references public.profiles (id) on delete cascade,
  company_name text not null
    check (
      char_length(company_name) between 2 and 120
      and company_name = btrim(company_name)
    ),
  profile_description text not null default ''
    check (char_length(profile_description) <= 2000),
  categories text[] not null default '{}'
    check (public.is_valid_company_categories(categories, 12, 80)),
  website text
    check (
      website is null
      or (
        char_length(website) <= 2048
        and website ~* '^https?://[^[:space:]]+$'
      )
    ),
  phone text
    check (phone is null or char_length(phone) <= 80),
  public_email text
    check (
      public_email is null
      or (
        char_length(public_email) <= 254
        and public_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  address text
    check (address is null or char_length(address) <= 240),
  municipality text
    check (municipality is null or char_length(municipality) <= 120),
  directory_entry_id text
    check (directory_entry_id is null or char_length(directory_entry_id) between 8 and 128),
  directory_location_index integer
    check (directory_location_index is null or directory_location_index >= 0),
  status public.company_profile_submission_status not null default 'pending',
  review_note text
    check (review_note is null or char_length(review_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_profile_submission_directory_pair
    check (
      (directory_entry_id is null and directory_location_index is null)
      or (directory_entry_id is not null and directory_location_index is not null)
    )
);

create unique index company_profile_submissions_one_pending_per_company
  on public.company_profile_submissions (company_id)
  where status = 'pending';

create table public.company_directory_overrides (
  directory_entry_id text not null
    check (char_length(directory_entry_id) between 8 and 128),
  directory_location_index integer not null
    check (directory_location_index >= 0),
  company_name text not null
    check (char_length(company_name) between 2 and 120),
  profile_description text not null default ''
    check (char_length(profile_description) <= 2000),
  categories text[] not null default '{}'
    check (public.is_valid_company_categories(categories, 12, 80)),
  website text
    check (
      website is null
      or (
        char_length(website) <= 2048
        and website ~* '^https?://[^[:space:]]+$'
      )
    ),
  phone text
    check (phone is null or char_length(phone) <= 80),
  public_email text
    check (
      public_email is null
      or (
        char_length(public_email) <= 254
        and public_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ),
  address text
    check (address is null or char_length(address) <= 240),
  municipality text
    check (municipality is null or char_length(municipality) <= 120),
  updated_at timestamptz not null default now(),
  primary key (directory_entry_id, directory_location_index)
);

alter table public.company_profile_submissions enable row level security;
alter table public.company_directory_overrides enable row level security;

revoke all on table
  public.company_profile_submissions,
  public.company_directory_overrides
from anon, authenticated;

grant select, insert, update on table public.company_profile_submissions
  to authenticated;
grant select on table public.company_directory_overrides
  to anon, authenticated;

grant insert (
  company_id,
  submitted_by,
  company_name,
  profile_description,
  categories,
  website,
  phone,
  public_email,
  address,
  municipality,
  directory_entry_id,
  directory_location_index
)
  on public.company_profile_submissions
  to authenticated;

grant update (
  company_name,
  profile_description,
  categories,
  website,
  phone,
  public_email,
  address,
  municipality,
  directory_entry_id,
  directory_location_index
)
  on public.company_profile_submissions
  to authenticated;

create policy company_profile_submissions_read_owner_or_admin
  on public.company_profile_submissions
  for select to authenticated
  using (
    public.is_active_company_member(
      company_id,
      array['owner']::public.company_role[]
    )
    or public.has_platform_role('platform_admin')
  );

create policy company_profile_submissions_insert_active_owner
  on public.company_profile_submissions
  for insert to authenticated
  with check (
    submitted_by = (select auth.uid())
    and public.is_active_company_member(
      company_id,
      array['owner']::public.company_role[]
    )
    and exists (
      select 1
      from public.profiles as actor
      where actor.id = (select auth.uid())
        and actor.status = 'active'
    )
  );

create policy company_profile_submissions_update_pending_owner
  on public.company_profile_submissions
  for update to authenticated
  using (
    status = 'pending'
    and submitted_by = (select auth.uid())
    and public.is_active_company_member(
      company_id,
      array['owner']::public.company_role[]
    )
    and exists (
      select 1
      from public.profiles as actor
      where actor.id = (select auth.uid())
        and actor.status = 'active'
    )
  )
  with check (
    status = 'pending'
    and submitted_by = (select auth.uid())
    and public.is_active_company_member(
      company_id,
      array['owner']::public.company_role[]
    )
    and exists (
      select 1
      from public.profiles as actor
      where actor.id = (select auth.uid())
        and actor.status = 'active'
    )
  );

create policy company_directory_overrides_read_public
  on public.company_directory_overrides
  for select to anon, authenticated
  using (true);

create trigger company_profile_submissions_set_updated_at
  before update on public.company_profile_submissions
  for each row execute function public.set_updated_at();

create or replace function public.review_company_profile_submission(
  _submission_id uuid,
  _decision text,
  _review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_submission public.company_profile_submissions%rowtype;
  v_previous_entry_id text;
  v_previous_location_index integer;
begin
  if v_actor_id is null
     or not public.has_platform_role('platform_admin')
     or not exists (
       select 1
       from public.profiles as actor
       where actor.id = v_actor_id
         and actor.status = 'active'
     ) then
    raise exception 'An active platform administrator is required.'
      using errcode = '42501';
  end if;

  if _decision is null
     or _decision not in ('approved', 'rejected')
     or char_length(coalesce(_review_note, '')) > 1000 then
    raise exception 'The review decision or note is invalid.'
      using errcode = '22023';
  end if;

  select submission.*
  into v_submission
  from public.company_profile_submissions as submission
  where submission.id = _submission_id
    and submission.status = 'pending'
  for update;

  if not found then
    raise exception 'A pending company profile submission was not found.'
      using errcode = 'P0002';
  end if;

  select company.directory_entry_id, company.directory_location_index
  into v_previous_entry_id, v_previous_location_index
  from public.companies as company
  where company.id = v_submission.company_id
  for update;

  update public.company_profile_submissions
  set status = _decision::public.company_profile_submission_status,
      review_note = nullif(pg_catalog.btrim(_review_note), ''),
      reviewed_by = v_actor_id,
      reviewed_at = pg_catalog.now()
  where id = v_submission.id;

  if _decision = 'approved' then
    update public.companies
    set name = v_submission.company_name,
        profile_description = v_submission.profile_description,
        categories = v_submission.categories,
        website = v_submission.website,
        phone = v_submission.phone,
        public_email = v_submission.public_email,
        address = v_submission.address,
        municipality = v_submission.municipality,
        directory_entry_id = v_submission.directory_entry_id,
        directory_location_index = v_submission.directory_location_index,
        updated_at = pg_catalog.now()
    where id = v_submission.company_id;

    if v_previous_entry_id is not null
       and (
         v_previous_entry_id is distinct from v_submission.directory_entry_id
         or v_previous_location_index is distinct from v_submission.directory_location_index
       ) then
      delete from public.company_directory_overrides
      where directory_entry_id = v_previous_entry_id
        and directory_location_index = v_previous_location_index;
    end if;

    if v_submission.directory_entry_id is not null then
      insert into public.company_directory_overrides (
        directory_entry_id,
        directory_location_index,
        company_name,
        profile_description,
        categories,
        website,
        phone,
        public_email,
        address,
        municipality
      )
      values (
        v_submission.directory_entry_id,
        v_submission.directory_location_index,
        v_submission.company_name,
        v_submission.profile_description,
        v_submission.categories,
        v_submission.website,
        v_submission.phone,
        v_submission.public_email,
        v_submission.address,
        v_submission.municipality
      )
      on conflict (directory_entry_id, directory_location_index)
      do update set
        company_name = excluded.company_name,
        profile_description = excluded.profile_description,
        categories = excluded.categories,
        website = excluded.website,
        phone = excluded.phone,
        public_email = excluded.public_email,
        address = excluded.address,
        municipality = excluded.municipality,
        updated_at = pg_catalog.now();
    end if;
  end if;

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata_redacted
  )
  values (
    v_actor_id,
    'company.profile.' || _decision,
    'company_profile_submission',
    v_submission.id,
    pg_catalog.jsonb_build_object('status', _decision)
  );
end;
$$;

revoke all on function public.review_company_profile_submission(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.review_company_profile_submission(uuid, text, text)
  to authenticated;
