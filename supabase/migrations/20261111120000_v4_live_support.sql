-- Live support (issue #398, Option A): our own widget, no third party, no CSP
-- change.
--
-- A visitor or a signed-in member writes a support message from our own origin;
-- the message lands in Supabase and the team reads it in the console. Nothing
-- here relaxes the Content-Security-Policy: the widget is served from the app,
-- and the optional Realtime channel rides the `wss://*.supabase.co` entry the
-- policy already allows.
--
-- Two tables, mirroring the `feedback_submissions` lifecycle split:
--
--   * `support_threads`   — one row per conversation, with the contact identity
--     (member id when signed in, otherwise the optional visitor name/email) and
--     a random, non-guessable `public_ref`.
--   * `support_messages`  — the messages in a thread, authored by a visitor or
--     by staff.
--
-- Reads:
--   * a member reads **only their own** thread and its messages (RLS below, keyed
--     on `user_id = auth.uid()`); this is also what the Realtime
--     `postgres_changes` subscription delivers, since that channel honours RLS.
--   * staff read every thread through the `admin_*` RPCs, which are gated on
--     `has_platform_role('platform_admin')` — the same AAL2-gated helper every
--     other admin console uses. No client role is given a blanket read.
--
-- Writes:
--   * a visitor/member writes through `submit_support_message` (SECURITY
--     DEFINER, granted to `anon` and `authenticated`), which validates the input
--     and consumes an abuse quota before it inserts — the same boundary control
--     `submit_feedback` carries, so a scripted caller cannot use the form as an
--     email-bomb amplifier.
--   * staff write through `admin_reply_support_thread`.
--
-- The two tables are revoked from every client role; the RPCs are the only
-- write path, exactly as `feedback_submissions` / `sales_leads` are today.

begin;

-- ---------------------------------------------------------------------------
-- Threads
-- ---------------------------------------------------------------------------

create table public.support_threads (
  id uuid primary key default gen_random_uuid(),
  -- Random, URL-safe handle the client may hold. It is not a secret (RLS is the
  -- authorization boundary), but it must not be enumerable: `gen_random_uuid`
  -- rendered without dashes is 32 hex characters, so a guessed ref is 2^122
  -- away and the console can show a short reference to the visitor.
  public_ref text not null unique check (public_ref ~ '^[0-9a-f]{32}$'),
  -- Null for an anonymous visitor; set when a signed-in member opens a thread.
  -- `on delete set null` mirrors `feedback_submissions`: a deleted account must
  -- not fail the submission or erase the support history.
  user_id uuid references public.profiles (id) on delete set null,
  visitor_name text check (
    visitor_name is null or pg_catalog.char_length(visitor_name) between 1 and 80
  ),
  visitor_email text check (
    visitor_email is null
    or pg_catalog.char_length(visitor_email) between 3 and 254
  ),
  subject text not null default 'Destek'
    check (pg_catalog.char_length(subject) between 1 and 120),
  locale text not null default 'tr'
    check (locale in ('tr', 'en', 'ru', 'el', 'fa', 'de')),
  status text not null default 'open'
    check (status in ('open', 'pending', 'closed')),
  last_message_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now()
);

create index support_threads_user_recent_idx
  on public.support_threads (user_id, last_message_at desc);

create index support_threads_recent_idx
  on public.support_threads (last_message_at desc);

alter table public.support_threads enable row level security;
revoke all on table public.support_threads from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  author_role text not null check (author_role in ('visitor', 'staff')),
  -- The profile that wrote it, when there is one; null for a visitor and for
  -- staff rows written before their profile is resolved.
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (pg_catalog.char_length(body) between 1 and 4000),
  created_at timestamptz not null default pg_catalog.now()
);

create index support_messages_thread_recent_idx
  on public.support_messages (thread_id, created_at);

alter table public.support_messages enable row level security;
revoke all on table public.support_messages from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Member read access (RLS)
--
-- A member reads only their own thread and the messages inside it. The read is
-- an ordinary `select` with the publishable key, so the Realtime
-- `postgres_changes` subscription (which honours RLS) delivers only the rows the
-- member is already allowed to see — a guessed thread id from another member
-- resolves to zero rows.
--
-- No insert/update/delete policy: every write goes through a SECURITY DEFINER
-- RPC, so a member cannot forge an author or a staff message.
-- ---------------------------------------------------------------------------

grant select on table public.support_threads to authenticated;
grant select on table public.support_messages to authenticated;

create policy support_threads_read_own
  on public.support_threads for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
  );

create policy support_messages_read_own
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1
      from public.support_threads as t
      where t.id = support_messages.thread_id
        and t.user_id = (select auth.uid())
        and exists (
          select 1 from public.profiles as p
          where p.id = (select auth.uid()) and p.status = 'active'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Realtime publication
--
-- The widget subscribes with `postgres_changes` (never Broadcast/Presence, which
-- bypass RLS). The tables join the publication only *after* their RLS is in
-- place, and only when the publication exists, so a stack without Realtime
-- (the pgTAP database job) still applies this migration cleanly.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.support_threads;
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_support_message — the anonymous/member write path
-- ---------------------------------------------------------------------------

-- Creates a thread and its first message in one call and returns the new message
-- id (the `submit_feedback` / `submit_sales_lead` shape). The body is validated
-- and the caller is throttled on the address and the submitted address before
-- anything is written, so a direct PostgREST caller cannot drive the row count
-- or the notification email without bound.
create or replace function public.submit_support_message(
  _name text,
  _email text,
  _subject text,
  _body text,
  _locale text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_name text;
  v_email text;
  v_subject text;
  v_body text;
  v_locale text;
  v_ip text;
  v_thread_id uuid;
  v_public_ref text;
  v_message_id uuid;
begin
  -- Attribute the thread only to a profile that still exists, so a stale session
  -- (deleted account) stores an anonymous thread instead of failing on the
  -- foreign key.
  select id into v_actor from public.profiles where id = (select auth.uid());

  v_body := pg_catalog.btrim(coalesce(_body, ''));
  if pg_catalog.char_length(v_body) < 1
     or pg_catalog.char_length(v_body) > 4000 then
    raise exception 'The support message length is invalid.'
      using errcode = '22023';
  end if;

  v_subject := coalesce(
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_subject, '')), 120), ''),
    'Destek'
  );

  v_locale := case
    when _locale in ('tr', 'en', 'ru', 'el', 'fa', 'de') then _locale
    else 'tr'
  end;

  v_name := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_name, '')), 80), '');

  v_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(_email, ''))), '');
  if v_email is not null
     and (
       pg_catalog.char_length(v_email) < 3
       or pg_catalog.char_length(v_email) > 254
       or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     ) then
    raise exception 'The support email address is invalid.'
      using errcode = '22023';
  end if;

  -- Throttle at the boundary the caller reaches. The address comes from the
  -- PostgREST request headers; an absent header degrades to one shared bucket,
  -- which is coarser but still bounded.
  v_ip := coalesce(
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'x-client-ip'), ''),
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), ''),
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'x-real-ip'), ''),
    nullif(
      pg_catalog.btrim(
        pg_catalog.split_part(
          current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for',
          ',',
          1
        )
      ),
      ''
    ),
    'unknown'
  );

  perform public.consume_anon_write_quota('ip', v_ip, 5, 600);
  perform public.consume_anon_write_quota('email', v_email, 5, 600);

  v_public_ref := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  insert into public.support_threads (
    public_ref, user_id, visitor_name, visitor_email, subject, locale
  ) values (
    v_public_ref, v_actor, v_name, v_email, v_subject, v_locale
  )
  returning id into v_thread_id;

  insert into public.support_messages (thread_id, author_role, author_id, body)
  values (v_thread_id, 'visitor', v_actor, v_body)
  returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function public.submit_support_message(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_support_message(text, text, text, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_support_thread — a member reads their own thread with its messages
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the member can read the thread and messages in one call
-- without a table grant on the join; ownership is checked explicitly against
-- `auth.uid()` (the definer body bypasses RLS), so a guessed `public_ref` from
-- another member returns nothing.
create or replace function public.get_support_thread(_public_ref text)
returns table (
  id uuid,
  public_ref text,
  subject text,
  status text,
  locale text,
  last_message_at timestamptz,
  created_at timestamptz,
  messages jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'A signed-in session is required.'
      using errcode = '42501';
  end if;

  return query
  select
    t.id,
    t.public_ref,
    t.subject,
    t.status,
    t.locale,
    t.last_message_at,
    t.created_at,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', m.id,
            'author_role', m.author_role,
            'body', m.body,
            'created_at', m.created_at
          )
          order by m.created_at, m.id
        )
        from public.support_messages as m
        where m.thread_id = t.id
      ),
      '[]'::jsonb
    )
  from public.support_threads as t
  where t.public_ref = pg_catalog.btrim(coalesce(_public_ref, ''))
    and t.user_id = v_actor;
end;
$$;

revoke all on function public.get_support_thread(text)
  from public, anon, authenticated;
grant execute on function public.get_support_thread(text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_support_threads — the staff console read
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_support_threads()
returns table (
  id uuid,
  public_ref text,
  user_id uuid,
  visitor_name text,
  visitor_email text,
  subject text,
  locale text,
  status text,
  last_message_at timestamptz,
  created_at timestamptz,
  message_count integer
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
    t.id,
    t.public_ref,
    t.user_id,
    t.visitor_name,
    t.visitor_email,
    t.subject,
    t.locale,
    t.status,
    t.last_message_at,
    t.created_at,
    (
      select pg_catalog.count(*)::integer
      from public.support_messages as m
      where m.thread_id = t.id
    )
  from public.support_threads as t
  order by t.last_message_at desc, t.id;
end;
$$;

revoke all on function public.admin_list_support_threads()
  from public, anon, authenticated;
grant execute on function public.admin_list_support_threads()
  to authenticated;

-- ---------------------------------------------------------------------------
-- admin_reply_support_thread — the staff write
-- ---------------------------------------------------------------------------

-- Appends a staff message and stamps the thread as answered. Returns the new
-- message id, matching the other write RPCs.
create or replace function public.admin_reply_support_thread(
  _thread_id uuid,
  _body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
  v_actor uuid;
  v_message_id uuid;
begin
  if not public.has_platform_role('platform_admin') then
    raise exception 'An active, MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  v_body := pg_catalog.btrim(coalesce(_body, ''));
  if pg_catalog.char_length(v_body) < 1
     or pg_catalog.char_length(v_body) > 4000 then
    raise exception 'The support message length is invalid.'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.support_threads where id = _thread_id) then
    raise exception 'The support thread does not exist.'
      using errcode = '22023';
  end if;

  select id into v_actor from public.profiles where id = (select auth.uid());

  insert into public.support_messages (thread_id, author_role, author_id, body)
  values (_thread_id, 'staff', v_actor, v_body)
  returning id into v_message_id;

  update public.support_threads as t
  set last_message_at = pg_catalog.now(),
      status = case when t.status = 'closed' then 'pending' else t.status end
  where t.id = _thread_id;

  return v_message_id;
end;
$$;

revoke all on function public.admin_reply_support_thread(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_reply_support_thread(uuid, text)
  to authenticated;

commit;
