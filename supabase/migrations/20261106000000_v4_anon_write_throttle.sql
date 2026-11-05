-- Server-side throttle for the two anonymous write RPCs.
--
-- `submit_feedback` and `submit_sales_lead` are `security definer` and granted
-- to `anon` on purpose — a visitor must be able to leave feedback or request a
-- quote without an account. The only abuse control in the repo was the
-- fixed-window limiter in `src/features/abuse/**`, which runs *inside* the
-- server action, i.e. above the RPC. Anyone holding the publishable key can skip
-- the action entirely and POST straight to `/rest/v1/rpc/submit_feedback`
-- (documented in `docs/threat-model.md` and issue #139), so the limiter never
-- fires and the two tables grow without bound with attacker-chosen address and
-- free text.
--
-- This migration moves a bound to the place the attacker actually reaches: the
-- function body. Each successful call consumes a token for the caller's address
-- (the PostgREST `request.headers` claim) and, when the submission carries one,
-- for the submitted address too. The window is ten minutes with a burst of five,
-- mirroring `src/features/abuse/limits.ts` so the application limiter and the
-- database agree. Over budget, the call is rejected with SQLSTATE `54000`
-- ("program limit exceeded"), which the client maps to the same generic
-- "try again later" copy a throttled action already returns.
--
-- The throttle is a best-effort abuse control, not an authentication boundary:
-- the address comes from a header a direct caller could forge, exactly as the
-- application limiter trusts `cf-connecting-ip` / `x-forwarded-for`. The point is
-- to make scripted flooding expensive, not impossible; an attacker who rotates
-- the header can still push rows, but not from a single origin or to a single
-- victim mailbox without limit.
--
-- Deliberately a small Postgres table rather than `pg_cron` + a counter: no
-- background worker to schedule, and the cleanup is opportunistic (an expired
-- row is deleted lazily when its key is next seen), so the table stays bounded
-- without a maintenance job. Rows hold only a hashed address and a window start,
-- never the raw address.

begin;

-- ---------------------------------------------------------------------------
-- Throttle ledger
-- ---------------------------------------------------------------------------

create table if not exists public.anon_write_throttle (
  scope text not null check (scope in ('ip', 'email')),
  -- sha256 of the scope value, hex. The raw address is never stored: a leaked
  -- ledger then reveals a hash, not a visitor's mailbox or IP.
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default pg_catalog.now(),
  hits integer not null default 0 check (hits >= 0),
  primary key (scope, subject_hash)
);

create index if not exists anon_write_throttle_window_idx
  on public.anon_write_throttle (window_started_at);

alter table public.anon_write_throttle enable row level security;
revoke all on table public.anon_write_throttle from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Token bucket
-- ---------------------------------------------------------------------------

-- Consumes one token for `_scope:_subject` and returns normally while the
-- caller is under budget; raises `54000` once the burst is spent inside the
-- window. A blank subject is ignored (the caller passes the empty string when a
-- dimension does not apply, e.g. feedback with no address).
--
-- One atomic upsert does both jobs — create the row on first sight, otherwise
-- reset an elapsed window or increment — so two concurrent first-time calls
-- cannot race on the insert, and the row lock the conflict takes serialises the
-- increments. Over budget the function raises; the exception rolls the whole
-- RPC transaction back, so the counter saturates at the burst and no row is
-- written.
--
-- SECURITY DEFINER so the anonymous caller can touch the ledger without holding
-- any grant on it. It reads no caller data, so it is left unreachable to the
-- client roles below; the two submit RPCs call it internally.
create or replace function public.consume_anon_write_quota(
  _scope text,
  _subject text,
  _burst integer,
  _window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text := pg_catalog.btrim(coalesce(_subject, ''));
  v_hash text;
  v_hits integer;
begin
  if _scope not in ('ip', 'email')
     or _burst is null or _burst < 1
     or _window_seconds is null or _window_seconds < 1 then
    raise exception 'Invalid throttle configuration.'
      using errcode = '22023';
  end if;

  -- No subject means "this dimension does not apply"; nothing to count.
  if v_subject = '' then
    return;
  end if;

  v_hash := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(v_subject, 'UTF8')),
    'hex'
  );

  insert into public.anon_write_throttle as t (scope, subject_hash, window_started_at, hits)
  values (_scope, v_hash, pg_catalog.now(), 1)
  on conflict (scope, subject_hash) do update
    set window_started_at = case
          when t.window_started_at <= pg_catalog.now()
            - pg_catalog.make_interval(secs => _window_seconds)
            then pg_catalog.now()
          else t.window_started_at
        end,
        hits = case
          when t.window_started_at <= pg_catalog.now()
            - pg_catalog.make_interval(secs => _window_seconds)
            then 1
          else t.hits + 1
        end
  returning t.hits into v_hits;

  if v_hits > _burst then
    raise exception 'Too many anonymous submissions from this origin.'
      using errcode = '54000';
  end if;
end;
$$;

revoke all on function public.consume_anon_write_quota(text, text, integer, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_feedback: throttle before the insert
-- ---------------------------------------------------------------------------

create or replace function public.submit_feedback(
  _name text,
  _email text,
  _category text,
  _rating integer,
  _message text,
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
  v_message text;
  v_category text;
  v_locale text;
  v_rating integer;
  v_ip text;
  v_id uuid;
begin
  -- Attribute the row only to a profile that still exists. A stale session
  -- (deleted account) resolves auth.uid() to a uuid with no profiles row, and
  -- writing it would fail the whole submission with a foreign-key error.
  select id into v_actor from public.profiles where id = (select auth.uid());

  v_message := pg_catalog.btrim(coalesce(_message, ''));
  if pg_catalog.char_length(v_message) < 3
     or pg_catalog.char_length(v_message) > 4000 then
    raise exception 'The feedback message length is invalid.'
      using errcode = '22023';
  end if;

  v_category := case
    when _category in ('general', 'bug', 'feature', 'employer', 'candidate', 'other')
      then _category
    else 'general'
  end;

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
    raise exception 'The feedback email address is invalid.'
      using errcode = '22023';
  end if;

  if _rating is null then
    v_rating := null;
  elsif _rating between 1 and 5 then
    v_rating := _rating;
  else
    raise exception 'The feedback rating is invalid.'
      using errcode = '22023';
  end if;

  -- Throttle at the boundary the caller actually reaches. The address comes
  -- from the PostgREST request headers; an absent header degrades to a single
  -- shared bucket, which is coarser but still bounded.
  v_ip := coalesce(
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

  insert into public.feedback_submissions (
    user_id, name, email, category, rating, message, locale
  ) values (
    v_actor, v_name, v_email, v_category, v_rating, v_message, v_locale
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_feedback(text, text, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_feedback(text, text, text, integer, text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_sales_lead: throttle before the insert
-- ---------------------------------------------------------------------------

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
  v_phone text;
  v_locale text;
  v_duration integer;
  v_ip text;
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

  -- Clamp to the column width first, then drop anything below the four-character
  -- floor so the row satisfies `sales_leads.phone`'s check without aborting the
  -- submission.
  v_phone := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_phone, '')), 32), '');

  -- A lead always carries a required address, so both dimensions always apply.
  v_ip := coalesce(
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

  insert into public.sales_leads (
    company_name, contact_name, email, phone, plan, duration_days, note, locale
  ) values (
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_company_name, '')), 120), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_contact_name, '')), 80), ''),
    v_email,
    case
      when pg_catalog.char_length(v_phone) between 4 and 32 then v_phone
      else null
    end,
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
  from public, anon, authenticated;
grant execute on function public.submit_sales_lead(text, text, text, text, text, integer, text, text)
  to anon, authenticated;

commit;
