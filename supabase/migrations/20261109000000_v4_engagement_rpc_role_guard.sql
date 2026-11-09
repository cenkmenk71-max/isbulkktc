-- Give the two engagement RPCs the same in-body `auth.role()` guard that the
-- other six `service_role`-only worker RPCs already carry.
--
-- The primary control on these two functions is the revoke in
-- 20261031120000_v4_function_privilege_hardening.sql (`revoke ... from public,
-- anon, authenticated` + `grant execute ... to service_role`), and it still
-- holds. But Supabase's `pg_default_acl` re-grants EXECUTE to the client roles
-- on every new function, and this repository has already shipped a migration
-- that left those per-role entries in place — that is how
-- `list_engagement_recipients` (a full mailing-list dump: user_id, email,
-- display_name, locale) and `opt_out_engagement` (an unauthenticated write to
-- the opt-out list) were reachable with the publishable key. The four push RPCs
-- and the two outbox RPCs treat the grant as the first line and re-check the
-- role in their own body as the second, so they fail closed even if a future
-- grant re-opens them; these two did not. `tests/security/sql-hardening.test.ts`
-- tracks the gap as a `todo` and promotes it to a gate once this lands.
--
-- The guard is the `raise` form, matching the six siblings. It is spelled
-- `<> 'service_role'` rather than a `where (select auth.role()) = 'service_role'`
-- filter for two reasons: a caller with no JWT (`auth.role()` IS NULL — the
-- shape a local psql session and the pgTAP suite use) must still pass, and a
-- client caller must fail loudly with `42501` instead of silently receiving an
-- empty result set.
--
-- Signatures are unchanged (`create or replace`), so the privilege ratchet in
-- `function_privileges.test.sql` and the signature-pinned `tests/security/*`
-- suites stay green. `create or replace` preserves the existing ACL, so the
-- service-role-only grant is neither dropped nor re-opened.

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
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The engagement worker role is required.'
      using errcode = '42501';
  end if;

  -- `u.email` is `varchar(255)`; PL/pgSQL's `return query` needs the projection
  -- to match the declared `text` column exactly, unlike the `language sql` body
  -- this replaces (which coerced it). Cast so the signature stays `text`.
  return query
  select p.id, u.email::text, p.display_name, p.locale
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
end;
$$;

create or replace function public.opt_out_engagement(_email text, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(_email, '')));
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The engagement worker role is required.'
      using errcode = '42501';
  end if;

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
