-- Honor an app-forwarded visitor address in the anonymous write throttle.
--
-- `submit_feedback` / `submit_sales_lead` read the caller's address from the
-- request headers so the DB throttle (`20261106000000`) can key its IP bucket on
-- it. That works for a *direct* PostgREST caller — the edge writes
-- `cf-connecting-ip` / `x-real-ip` on the way in — but not for the application
-- path, which is the one real visitors use.
--
-- The app reaches these RPCs through `supabase-js`, and supabase-js sends no
-- address header of its own (measured against the pinned 2.118.0: the request
-- carries only `apikey`, `authorization`, `content-profile`, `content-type`,
-- `x-client-info`). The server action already resolves the visitor address with
-- `clientIp()` for its in-process limiter but does not pass it on, so the RPC's
-- extraction fell through to `'unknown'` for *every* app submission and the
-- `scope='ip'` bucket collapsed to a single row shared by the whole site —
-- five submissions in ten minutes anywhere, then a `54000` for the sixth
-- legitimate visitor (issue #206).
--
-- This migration adds `x-client-ip` to the extraction, between the edge headers
-- and `x-forwarded-for`. It is a *dedicated* name the action can set via the
-- client's `global.headers` (or `@supabase/ssr`'s request headers) without
-- colliding with a value the edge wrote. The DB change alone does not close #206
-- — the action must send the header — but it is the receiving half of the
-- contract, and `supabase/tests/database/anon_write_throttle.test.sql` pins it.
--
-- Ordering rationale: `cf-connecting-ip` and `x-real-ip` stay first because the
-- edge overwrites whatever a client sends, so they remain the most trustworthy
-- source for a direct caller. `x-client-ip` follows, then `x-forwarded-for`
-- (first hop only, as it can be appended to). A caller that supplies none still
-- degrades to one shared bucket, exactly as before; the header remains
-- forgeable, which is why this is an abuse control and not an identity boundary.
--
-- Idempotent: both functions are re-created with `create or replace` and their
-- grants re-asserted, so this is safe to replay against the hosted project (its
-- ledger is the custom `public._applied_migrations`). The signatures are
-- deliberately unchanged — a new argument would change `pg_get_function_identity_arguments`
-- and break the reviewed privilege ratchet and the client-callable whitelist.

begin;

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
  -- from the request headers: the edge-written `cf-connecting-ip`/`x-real-ip`
  -- for a direct PostgREST caller, or the app-forwarded `x-client-ip` when the
  -- server action passes the visitor address (supabase-js sends no IP header of
  -- its own, so without it every app submission shares one bucket).
  v_ip := coalesce(
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), ''),
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'x-real-ip'), ''),
    nullif(
      pg_catalog.btrim(
        pg_catalog.split_part(
          current_setting('request.headers', true)::jsonb ->> 'x-client-ip',
          ',',
          1
        )
      ),
      ''
    ),
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
  -- Same extraction order as `submit_feedback`: edge headers, then the
  -- app-forwarded `x-client-ip`, then `x-forwarded-for`.
  v_ip := coalesce(
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), ''),
    nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'x-real-ip'), ''),
    nullif(
      pg_catalog.btrim(
        pg_catalog.split_part(
          current_setting('request.headers', true)::jsonb ->> 'x-client-ip',
          ',',
          1
        )
      ),
      ''
    ),
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
