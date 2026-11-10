-- Close the divergence between the two push-endpoint validators (#536, #282).
--
-- The endpoint host is validated twice: in the app by `isAllowedPushEndpoint`
-- (`src/server/push/push-endpoint.ts`, a real `new URL(...).hostname` parse) and
-- in the database by this RPC. #533 (`20261110000000_v4_push_endpoint_host_allowlist.sql`)
-- gave the RPC the same allowlist, but the two layers disagree on which endpoint
-- reaches it, because the RPC took the host with
-- `split_part(split_part(endpoint, '/', 3), ':', 1)` — a split of the *raw*
-- string, where a backslash, an `@`, a percent-encoded separator or a stray port
-- is an ordinary host character:
--
--   endpoint                                 raw host segment              RPC   app
--   https://evil.com\.push.apple.com/x       evil.com\.push.apple.com      ACC   rej
--   https://evil.com%2f.push.apple.com/x     evil.com%2f.push.apple.com    ACC   rej
--   https://evil.com%5c.push.apple.com/x     evil.com%5c.push.apple.com    ACC   rej
--   https://evil.com@x.push.apple.com/x      evil.com@x.push.apple.com     ACC   rej
--   https://fcm.googleapis.com:65536/x       fcm.googleapis.com            ACC   rej
--   https://fcm.googleapis.com\evil.com/x    fcm.googleapis.com\evil.com   rej   ACC
--
-- The RPC is directly callable with the publishable key, so an attacker could
-- store such a row without going through the app. It is not an SSRF today (the
-- send sink re-checks `isAllowedPushEndpoint` before `webpush.sendNotification`,
-- `src/server/push/vapid.ts`), but the guard does not enforce the rule it claims
-- to, so the "defence in depth" layer is not a defence at all.
--
-- Fix: take the authority the way the URL parser does — it ends at the first
-- `/`, `\`, `?` or `#` — then require it to be a bare hostname and an optional
-- all-digit port before the allowlist is consulted. `@` (URL credentials) and a
-- percent-encoded separator are not hostname characters, so those shapes are
-- refused here, and a port above 65535 (which `new URL('https://a:65536/')`
-- also refuses) is refused too. The two layers therefore agree on the whole
-- divergent set above, in both directions. The exact-host and suffix lists are
-- unchanged.
--
-- The authority is still seeded with `split_part(v_endpoint, '/', 3)`, so the
-- parity ratchet in `tests/security/push-endpoint-sql-parity.test.ts` keeps
-- finding the shape it mirrors. That test's `todo` stays until its (old-rule)
-- mirror is updated to this rule by the security layer — this migration does not edit
-- another module's file. The signature is unchanged, so the `function_privileges`
-- ratchet and the signature-based security tests stay green.

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

revoke all on function public.register_push_subscription(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_push_subscription(text, text, text, text)
  to authenticated;
