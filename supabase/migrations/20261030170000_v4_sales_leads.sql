-- Corporate quote / sales leads.
--
-- Mirrors `feedback_submissions`: user-generated content with its own
-- lifecycle (follow-up, conversion, retention), written only through a
-- normalising RPC and readable by the service role alone. The prospect gets a
-- receipt email; the team gets a copy. Nothing here is readable by the client.

create table public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  company_name text check (
    company_name is null or pg_catalog.char_length(company_name) between 1 and 120
  ),
  contact_name text check (
    contact_name is null or pg_catalog.char_length(contact_name) between 1 and 80
  ),
  email text not null check (pg_catalog.char_length(email) between 3 and 254),
  phone text check (
    phone is null or pg_catalog.char_length(phone) between 4 and 32
  ),
  plan text check (
    plan is null or pg_catalog.char_length(plan) between 1 and 80
  ),
  duration_days integer check (
    duration_days is null or duration_days in (1, 7, 30)
  ),
  note text check (
    note is null or pg_catalog.char_length(note) between 1 and 2000
  ),
  locale text not null default 'tr',
  status text not null default 'new'
    check (status in ('new', 'contacted', 'quoted', 'won', 'lost', 'archived')),
  created_at timestamptz not null default pg_catalog.now()
);

create index sales_leads_recent_idx
  on public.sales_leads (created_at desc);

create index sales_leads_status_idx
  on public.sales_leads (status, created_at desc);

alter table public.sales_leads enable row level security;
revoke all on table public.sales_leads from public, anon, authenticated;
grant select, update on table public.sales_leads to service_role;

create or replace function public.submit_sales_lead(
  _company_name text,
  _contact_name text,
  _email text,
  _phone text,
  _plan text,
  _duration_days integer,
  _note text,
  _locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_locale text;
  v_duration integer;
  v_id uuid;
begin
  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(_email, '')));
  if pg_catalog.char_length(v_email) < 3
     or pg_catalog.char_length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'The lead email address is invalid.'
      using errcode = '22023';
  end if;

  v_locale := case
    when _locale in ('tr', 'en', 'ru', 'el', 'fa', 'de') then _locale
    else 'tr'
  end;

  if _duration_days is null then
    v_duration := null;
  elsif _duration_days in (1, 7, 30) then
    v_duration := _duration_days;
  else
    raise exception 'The listing duration is invalid.'
      using errcode = '22023';
  end if;

  insert into public.sales_leads (
    company_name, contact_name, email, phone, plan, duration_days, note, locale
  ) values (
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_company_name, '')), 120), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_contact_name, '')), 80), ''),
    v_email,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_phone, '')), 32), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_plan, '')), 80), ''),
    v_duration,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_note, '')), 2000), ''),
    v_locale
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_sales_lead(text, text, text, text, text, integer, text, text)
  from public;
grant execute on function public.submit_sales_lead(text, text, text, text, text, integer, text, text)
  to anon, authenticated;
