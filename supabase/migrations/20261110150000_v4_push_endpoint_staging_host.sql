-- Accept Chromium's staging FCM host (`jmt17.google.com`) in the push endpoint
-- allowlist (#500).
--
-- The endpoint host is validated twice: in the app by `isAllowedPushEndpoint`
-- (`src/server/push/push-endpoint.ts`) and in the database by the
-- `register_push_subscription` RPC and the `is_allowed_push_endpoint` table
-- CHECK. All three carried the same exact-host list, and all three were missing
-- `jmt17.google.com`.
--
-- `jmt17.google.com` is not a typo: it is Chromium's *staging* FCM host
-- (`kPushMessagingStagingGcmEndpoint`,
-- `components/push_messaging/push_messaging_constants.cc`). Every non-stable
-- channel — Beta/Dev/Canary, unbranded Chromium, Android WebView — is issued an
-- endpoint there, so real devices subscribe on it. Production was missing the
-- host in all three layers, so a genuine device could not register and its push
-- was dropped at the send sink.
--
-- The fix adds the host as an *exact* match in every layer (never a
-- `.google.com` suffix, which would let a look-alike such as
-- `jmt17.google.com.evil.example` through). The two SQL layers are redefined
-- together, and the table CHECK is rebuilt so the constraint is revalidated
-- against the widened rule. `supabase db push` re-runs every file, so the
-- constraint is dropped first (`if exists`) and the delete is a no-op on a clean
-- table — the migration is idempotent like its siblings.
--
-- The signature is unchanged, so the `function_privileges` ratchet and the
-- signature-based security tests stay green.

create or replace function public.register_push_subscription(
  _endpoint text,
  _p256dh text,
  _auth_key text,
  _user_agent text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_locale text;
  v_endpoint text := pg_catalog.btrim(coalesce(_endpoint, ''));
  v_authority text;
  v_port text;
  v_host text;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active account is required.'
      using errcode = '42501';
  end if;

  if pg_catalog.char_length(v_endpoint) < 12
     or pg_catalog.char_length(v_endpoint) > 1024
     or v_endpoint !~ '^https://' then
    raise exception 'The push endpoint is invalid.'
      using errcode = '22023';
  end if;

  -- The authority ends where the URL parser ends it: at the first `/`, `\`, `?`
  -- or `#`. Take that slice, then require it to be a bare hostname and an
  -- optional all-digit port. A backslash, an `@` (URL credentials), a
  -- percent-encoded separator or any other stray character is refused here,
  -- before the allowlist, so the RPC cannot accept a host the URL parser would
  -- resolve elsewhere.
  v_authority := pg_catalog.split_part(v_endpoint, '/', 3);
  v_authority := pg_catalog.split_part(v_authority, E'\\', 1);
  v_authority := pg_catalog.split_part(v_authority, '?', 1);
  v_authority := pg_catalog.split_part(v_authority, '#', 1);

  if v_authority !~ '^[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'The push endpoint host is not a known push service.'
      using errcode = '22023';
  end if;

  -- `new URL('https://a:65536/')` throws, so the database must refuse it too:
  -- otherwise the RPC would store an endpoint the app gate rejects. The guard
  -- above already restricts the port to digits; `numeric` avoids an overflow on
  -- a long digit run.
  v_port := pg_catalog.split_part(v_authority, ':', 2);

  if v_port <> '' and v_port::numeric > 65535 then
    raise exception 'The push endpoint host is not a known push service.'
      using errcode = '22023';
  end if;

  -- A push endpoint is only ever issued by the browser's push service, so the
  -- host must be one of the known services. An IP literal, `localhost` or any
  -- other host is rejected before it can reach the table.
  v_host := pg_catalog.lower(pg_catalog.split_part(v_authority, ':', 1));

  if v_host not in (
       'fcm.googleapis.com',
       'android.googleapis.com',
       'jmt17.google.com',
       'updates.push.services.mozilla.com',
       'web.push.apple.com'
     )
     and v_host not like '%.notify.windows.com'
     and v_host not like '%.push.apple.com'
     and v_host not like '%.push.services.mozilla.com' then
    raise exception 'The push endpoint host is not a known push service.'
      using errcode = '22023';
  end if;

  if _p256dh is null or _auth_key is null
     or pg_catalog.char_length(_p256dh) not between 16 and 256
     or pg_catalog.char_length(_auth_key) not between 8 and 128 then
    raise exception 'The push keys are invalid.'
      using errcode = '22023';
  end if;

  select p.locale into v_locale from public.profiles as p where p.id = v_actor;

  -- Reassign rather than accumulate: see the header note on shared devices. The
  -- previous owner loses the row, so their notifications stop arriving on a
  -- device they no longer hold.
  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth_key,
    user_agent,
    locale
  )
  values (
    v_actor,
    v_endpoint,
    _p256dh,
    _auth_key,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_user_agent, '')), 300), ''),
    coalesce(v_locale, 'tr')
  )
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        user_agent = excluded.user_agent,
        locale = excluded.locale,
        updated_at = pg_catalog.now(),
        revoked_at = null,
        failure_count = 0;
end;
$$;

create or replace function public.is_allowed_push_endpoint(_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with candidate as (
    -- The RPC btrims before it validates and stores the trimmed value; the
    -- table check mirrors that, so a padded endpoint is judged on its trimmed
    -- form rather than on the padding.
    select pg_catalog.btrim(_endpoint) as endpoint
  ),
  parts as (
    select
      c.endpoint as endpoint,
      -- The authority ends where the URL parser ends it: at the first `/`, `\`,
      -- `?` or `#`.
      pg_catalog.split_part(
        pg_catalog.split_part(
          pg_catalog.split_part(
            pg_catalog.split_part(c.endpoint, '/', 3),
            E'\\',
            1
          ),
          '?',
          1
        ),
        '#',
        1
      ) as authority
    from candidate as c
  )
  select
    p.endpoint is not null
    and pg_catalog.char_length(p.endpoint) between 12 and 1024
    and p.endpoint ~ '^https://'
    -- A bare hostname and an optional all-digit port. `@` (URL credentials), a
    -- percent-encoded separator or any stray character fails this.
    and p.authority ~ '^[A-Za-z0-9.-]+(:[0-9]+)?$'
    -- `new URL('https://a:65536/')` throws, so refuse it here too. The port is
    -- already digits-only from the regex; `numeric` avoids an overflow.
    and (
      pg_catalog.split_part(p.authority, ':', 2) = ''
      or pg_catalog.split_part(p.authority, ':', 2)::pg_catalog.numeric <= 65535
    )
    -- The host must be a known push service.
    and (
      pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1)) in (
        'fcm.googleapis.com',
        'android.googleapis.com',
        'jmt17.google.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com'
      )
      or pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1))
           like '%.notify.windows.com'
      or pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1))
           like '%.push.apple.com'
      or pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1))
           like '%.push.services.mozilla.com'
    )
  from parts as p;
$$;

revoke all on function public.register_push_subscription(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_subscription(text, text, text, text)
  to authenticated;

revoke all on function public.is_allowed_push_endpoint(text)
  from public, anon, authenticated;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_host_allowed;

-- The helper is the exact predicate of the constraint below; with the widened
-- rule the only real row (`jmt17.google.com`) now passes, so this is a no-op on
-- production. It stays for the same reason as its sibling migration: the
-- constraint must validate without a scan failure on any database that still
-- holds a pre-allowlist row.
delete from public.push_subscriptions
where not public.is_allowed_push_endpoint(endpoint);

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host_allowed
    check (public.is_allowed_push_endpoint(endpoint));
