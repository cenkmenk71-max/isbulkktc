-- Promotional-email opt-outs.
--
-- Transactional mail (auth, feedback receipts, application notifications) is
-- exempt from consent; the engagement digest is not, so it is the only family
-- that must consult this table before every send. Keyed by lower-cased email
-- because the unsubscribe link can be followed without a session.
--
-- Readable and writable only through the service role / definer functions: a
-- visitor opts out by presenting a signed token, never by guessing an address.

create table public.email_engagement_optouts (
  email text primary key check (pg_catalog.char_length(email) between 3 and 254),
  reason text check (reason is null or pg_catalog.char_length(reason) <= 40),
  opted_out_at timestamptz not null default pg_catalog.now()
);

alter table public.email_engagement_optouts enable row level security;
revoke all on table public.email_engagement_optouts from public, anon, authenticated;
grant select, insert, delete on table public.email_engagement_optouts to service_role;

create or replace function public.opt_out_engagement(_email text, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(_email, '')));
begin
  if pg_catalog.char_length(v_email) < 3
     or pg_catalog.char_length(v_email) > 254
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'The unsubscribe address is invalid.'
      using errcode = '22023';
  end if;

  insert into public.email_engagement_optouts (email, reason, opted_out_at)
  values (
    v_email,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_reason, '')), 40), ''),
    pg_catalog.now()
  )
  on conflict (email) do update
    set reason = excluded.reason,
        opted_out_at = excluded.opted_out_at;
end;
$$;

revoke all on function public.opt_out_engagement(text, text) from public;
grant execute on function public.opt_out_engagement(text, text) to service_role;

-- Recipients for one digest batch: active profiles with a confirmed mailbox
-- that have not opted out. `_after` keyset-paginates on the user id so a caller
-- can walk the whole list without OFFSET drift.
create or replace function public.list_engagement_recipients(
  _after uuid,
  _batch_size integer
)
returns table (
  user_id uuid,
  email text,
  display_name text,
  locale text
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, u.email, p.display_name, p.locale
  from public.profiles as p
  join auth.users as u on u.id = p.id
  where p.status = 'active'
    and u.email is not null
    and u.email_confirmed_at is not null
    and u.deleted_at is null
    and (_after is null or p.id > _after)
    and not exists (
      select 1 from public.email_engagement_optouts as o
      where o.email = pg_catalog.lower(u.email)
    )
  order by p.id
  limit greatest(1, least(coalesce(_batch_size, 200), 500));
$$;

revoke all on function public.list_engagement_recipients(uuid, integer) from public;
grant execute on function public.list_engagement_recipients(uuid, integer) to service_role;
