-- Defence in depth for the push endpoint host (#282).
--
-- `register_push_subscription` validated the endpoint by length and `^https://`
-- only, so a signed-in visitor could store an arbitrary HTTPS URL — including a
-- loopback, RFC1918 or cloud-metadata address — straight into the table. The
-- send sink (`src/server/push/vapid.ts`) and both write paths already refuse
-- anything outside the push-service allowlist (`isAllowedPushEndpoint`,
-- `src/server/push/push-endpoint.ts`), so the SSRF is closed; but the RPC is
-- directly callable with the publishable key and a bad row is dead weight the
-- worker must skip. This pins the same host rule in the database.
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

  -- A push endpoint is only ever issued by the browser's push service, so the
  -- host must be one of the known services. An IP literal, `localhost` or any
  -- other host is rejected before it can reach the table.
  v_host := pg_catalog.lower(
    pg_catalog.split_part(pg_catalog.split_part(v_endpoint, '/', 3), ':', 1)
  );

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
