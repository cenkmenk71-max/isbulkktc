-- Web Push: subscription storage, notification preferences, delivery bookkeeping.
--
-- The client-facing surface is deliberately narrow. `push_subscriptions` holds
-- the browser's push credentials, which are *capability tokens*: whoever holds
-- the endpoint plus the two keys can deliver a notification to that device. So:
--
--   * the table is revoked from `public`, `anon` and `authenticated`, and every
--     read/write goes through a `security definer` RPC that binds the row to
--     `auth.uid()`. There is no direct client grant to leak, and no RLS policy to
--     get wrong — the RPCs are the only door.
--   * `endpoint` is globally unique, not unique per user. A push endpoint
--     identifies a *browser profile*, not an account: on a shared device the
--     second person to sign in and enable notifications reuses the same
--     endpoint. Keying it per user would let one account's notification render
--     on another account's screen, so registration *reassigns* the endpoint to
--     the caller instead. That is the only ownership model that cannot leak.
--   * the private VAPID key never reaches the database or the client. It lives
--     in the server environment (`VAPID_PRIVATE_KEY`), and only the public half
--     is served to the browser.
--
-- Preferences default to the transactional categories on and promotional off,
-- because the marketing toggle is a consent decision and must start unset.

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null
    check (pg_catalog.char_length(endpoint) between 12 and 1024),
  p256dh text not null
    check (pg_catalog.char_length(p256dh) between 16 and 256),
  auth_key text not null
    check (pg_catalog.char_length(auth_key) between 8 and 128),
  user_agent text
    check (user_agent is null or pg_catalog.char_length(user_agent) <= 300),
  locale text not null default 'tr'
    check (locale in ('tr', 'en', 'ru', 'el', 'fa', 'de')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  revoked_at timestamptz,
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id)
  where revoked_at is null;

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------

create table public.push_notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  application_updates boolean not null default true,
  job_alerts boolean not null default true,
  employer_applications boolean not null default true,
  messages boolean not null default true,
  -- Promotional mail/push is the only family that needs consent, so it starts
  -- off and is turned on by an explicit choice.
  marketing boolean not null default false,
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.push_notification_preferences enable row level security;
revoke all on table public.push_notification_preferences
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delivery bookkeeping on the existing application notification feed
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column push_sent_at timestamptz,
  add column push_attempt_count integer not null default 0
    check (push_attempt_count >= 0);

create index notifications_push_pending_idx
  on public.notifications (created_at)
  where push_sent_at is null;

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

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

create or replace function public.revoke_push_subscription(_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_endpoint text := pg_catalog.btrim(coalesce(_endpoint, ''));
begin
  if v_actor is null then
    raise exception 'An active account is required.'
      using errcode = '42501';
  end if;

  -- A null endpoint means "revoke everything this account owns", which is what
  -- sign-out does: the browser subscription is dropped first, then every row for
  -- the caller, so a stale row cannot keep a device subscribed.
  if v_endpoint = '' then
    delete from public.push_subscriptions where user_id = v_actor;
    return;
  end if;

  delete from public.push_subscriptions
  where user_id = v_actor
    and endpoint = v_endpoint;
end;
$$;

revoke all on function public.revoke_push_subscription(text)
  from public, anon, authenticated;
grant execute on function public.revoke_push_subscription(text) to authenticated;

create or replace function public.set_push_notification_preferences(
  _application_updates boolean,
  _job_alerts boolean,
  _employer_applications boolean,
  _messages boolean,
  _marketing boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active account is required.'
      using errcode = '42501';
  end if;

  insert into public.push_notification_preferences (
    user_id,
    application_updates,
    job_alerts,
    employer_applications,
    messages,
    marketing
  )
  values (
    v_actor,
    coalesce(_application_updates, true),
    coalesce(_job_alerts, true),
    coalesce(_employer_applications, true),
    coalesce(_messages, true),
    coalesce(_marketing, false)
  )
  on conflict (user_id) do update
    set application_updates = excluded.application_updates,
        job_alerts = excluded.job_alerts,
        employer_applications = excluded.employer_applications,
        messages = excluded.messages,
        marketing = excluded.marketing,
        updated_at = pg_catalog.now();
end;
$$;

revoke all on function public.set_push_notification_preferences(boolean, boolean, boolean, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.set_push_notification_preferences(boolean, boolean, boolean, boolean, boolean)
  to authenticated;

create or replace function public.list_my_push_subscriptions()
returns table (
  endpoint text,
  user_agent text,
  created_at timestamptz,
  last_success_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select s.endpoint, s.user_agent, s.created_at, s.last_success_at
  from public.push_subscriptions as s
  where s.user_id = (select auth.uid())
    and s.revoked_at is null
  order by s.created_at desc;
$$;

revoke all on function public.list_my_push_subscriptions()
  from public, anon, authenticated;
grant execute on function public.list_my_push_subscriptions() to authenticated;

create or replace function public.get_my_push_preferences()
returns table (
  application_updates boolean,
  job_alerts boolean,
  employer_applications boolean,
  messages boolean,
  marketing boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    coalesce(p.application_updates, true),
    coalesce(p.job_alerts, true),
    coalesce(p.employer_applications, true),
    coalesce(p.messages, true),
    coalesce(p.marketing, false)
  from (select (select auth.uid()) as uid) as me
  left join public.push_notification_preferences as p on p.user_id = me.uid;
$$;

revoke all on function public.get_my_push_preferences()
  from public, anon, authenticated;
grant execute on function public.get_my_push_preferences() to authenticated;

-- ---------------------------------------------------------------------------
-- Service-role delivery RPCs
-- ---------------------------------------------------------------------------

-- Targets for one notification: the recipient's live subscriptions, minus the
-- ones whose category the recipient turned off. The category is passed in by the
-- worker rather than inferred, so a new event type has to name its toggle.
create or replace function public.list_push_targets_for_notification(
  _user_id uuid,
  _category text
)
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  locale text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The push worker role is required.'
      using errcode = '42501';
  end if;

  if _category not in (
    'application_updates',
    'job_alerts',
    'employer_applications',
    'messages',
    'marketing'
  ) then
    raise exception 'The notification category is unknown.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.push_notification_preferences as p
    where p.user_id = _user_id
      and case _category
        when 'application_updates' then p.application_updates
        when 'job_alerts' then p.job_alerts
        when 'employer_applications' then p.employer_applications
        when 'messages' then p.messages
        when 'marketing' then p.marketing
      end
  ) then
    -- No preference row means the defaults apply: everything transactional on,
    -- marketing off. An explicit row with the toggle false opts out.
    if exists (
      select 1
      from public.push_notification_preferences as p
      where p.user_id = _user_id
    ) then
      return;
    end if;
    if _category = 'marketing' then
      return;
    end if;
  end if;

  return query
  select s.id, s.endpoint, s.p256dh, s.auth_key, s.locale
  from public.push_subscriptions as s
  where s.user_id = _user_id
    and s.revoked_at is null
    and s.failure_count < 10
  order by s.created_at;
end;
$$;

revoke all on function public.list_push_targets_for_notification(uuid, text)
  from public, anon, authenticated;
grant execute on function public.list_push_targets_for_notification(uuid, text)
  to service_role;

-- One batch of application notifications that have not been pushed yet.
create or replace function public.claim_application_push_notifications(
  _batch_size integer default 20
)
returns table (
  notification_id uuid,
  user_id uuid,
  event_type text,
  job_title text,
  application_status text,
  application_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The push worker role is required.'
      using errcode = '42501';
  end if;

  if _batch_size not between 1 and 100 then
    raise exception 'The push batch size is invalid.'
      using errcode = '22023';
  end if;

  return query
  with selected as (
    select n.id
    from public.notifications as n
    join public.profiles as p on p.id = n.user_id and p.status = 'active'
    where n.push_sent_at is null
      and n.push_attempt_count < 5
    order by n.created_at
    limit _batch_size
    for update of n skip locked
  ),
  claimed as (
    update public.notifications as n
    set push_attempt_count = n.push_attempt_count + 1
    from selected
    where n.id = selected.id
    returning n.id, n.user_id, n.application_event_id
  )
  select
    claimed.id,
    claimed.user_id,
    e.event_type,
    j.title,
    e.to_status,
    e.application_id
  from claimed
  join public.application_events as e on e.id = claimed.application_event_id
  join public.applications as a on a.id = e.application_id
  join public.jobs as j on j.id = a.job_id;
end;
$$;

revoke all on function public.claim_application_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_application_push_notifications(integer)
  to service_role;

create or replace function public.finish_application_push_notification(
  _notification_id uuid,
  _delivered boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The push worker role is required.'
      using errcode = '42501';
  end if;

  update public.notifications
  set push_sent_at = case
        when _delivered then pg_catalog.now()
        else push_sent_at
      end
  where id = _notification_id;
end;
$$;

revoke all on function public.finish_application_push_notification(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_application_push_notification(uuid, boolean)
  to service_role;

-- The worker reports per-subscription outcomes so an expired endpoint is retired
-- once instead of being retried until the failure ceiling.
create or replace function public.record_push_delivery_result(
  _subscription_id uuid,
  _delivered boolean,
  _permanent_failure boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The push worker role is required.'
      using errcode = '42501';
  end if;

  update public.push_subscriptions
  set last_success_at = case when _delivered then pg_catalog.now() else last_success_at end,
      last_failure_at = case when _delivered then last_failure_at else pg_catalog.now() end,
      failure_count = case when _delivered then 0 else failure_count + 1 end,
      revoked_at = case
        when _permanent_failure then pg_catalog.now()
        else revoked_at
      end,
      updated_at = pg_catalog.now()
  where id = _subscription_id;
end;
$$;

revoke all on function public.record_push_delivery_result(uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.record_push_delivery_result(uuid, boolean, boolean)
  to service_role;
