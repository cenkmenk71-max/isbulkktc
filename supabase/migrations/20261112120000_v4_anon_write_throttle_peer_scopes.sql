-- Give each anonymous write form its own per-peer bucket, and bound support too.
--
-- Closes issue #621 (the `20261110160000` coarse peer cap keys on the *shared*
-- platform egress address on the app path, so feedback and sales share one
-- 25/10min site-wide ceiling) and issue #616 (`submit_support_message` never got
-- a coarse cap, so a direct caller who forges `x-client-ip` writes without
-- bound).
--
-- Background. `20261110160000` bounds a direct PostgREST caller — who can forge
-- the app-forwarded `x-client-ip` to mint a fresh primary bucket per request —
-- by *also* consuming the edge-written `cf-connecting-ip` as a coarse per-peer
-- cap (`('ip', hash(peer))`, burst 25). Two problems fell out of that:
--
--   1. On the app path (server action -> supabase-js -> PostgREST) the TCP peer
--      is the platform, so Cloudflare writes *Vercel's egress address* into
--      `cf-connecting-ip`. That value is identical for every visitor and for
--      both forms, so the cap became a single site-wide counter: the 26th real
--      anonymous write anywhere in ten minutes was rejected with the generic
--      "failed" copy (#621). The cap was never a per-visitor bound on that path.
--   2. `submit_support_message` shipped one commit later and copied only the
--      primary bucket, not the coarse cap, so a direct caller rotating a forged
--      `x-client-ip` opened one support thread per request, unbounded (#616).
--
-- This migration keeps the same shape (a coarse cap on the edge-written peer,
-- reusing `scope='ip'` with a prefixed subject — the ledger schema and its
-- `check` are untouched) but makes the bucket **per form**:
-- `('ip', hash('peer:<form>|<peer>'))`. Three forms therefore hold three
-- independent counters and can no longer lock each other out, and the burst is
-- raised to 60 — the old 25 was a *site-wide* ceiling; 60 is a per-form,
-- per-peer ceiling, still well below a flood. The primary per-visitor bucket
-- (burst 5, keyed on `x-client-ip` on the app path) is unchanged, so a normal
-- visitor is bounded per form as before.
--
-- Honest scope. The coarse cap still keys on `cf-connecting-ip`, which on the
-- *app* path is the shared platform egress — so within one form it remains a
-- form-wide ceiling, not a true per-visitor cap. Making it a genuine
-- per-visitor bound on the app path needs a signal the visitor cannot forge
-- (an app-signed header) or an edge (Cloudflare / Supabase API-gateway) IP rate
-- limit, both of which are deployment/ops work outside the database layer
-- (issue #621 acceptance criterion 4). What this migration guarantees now is
-- that the ceiling is **per form** and that every anon write path — feedback,
-- sales and support — carries one.
--
-- Note on `submit_support_message`: its widget calls Supabase directly from the
-- browser, so the edge writes the *visitor's* real address into
-- `cf-connecting-ip` there (not the platform egress). Its coarse cap is
-- therefore already a meaningful per-address bound, and adding it is a strict
-- improvement over the unbounded behaviour.
--
-- Idempotent: the three functions are re-created with `create or replace` and
-- their grants re-asserted, so this replays safely against the hosted project.
-- The signatures are unchanged, so the reviewed privilege ratchet and the
-- client-callable whitelist are unaffected.

begin;

-- ---------------------------------------------------------------------------
-- submit_feedback: per-form coarse peer cap
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
  v_peer text;
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

  -- Primary address: the app-forwarded `x-client-ip` first, because on the app
  -- path the edge-written `cf-connecting-ip` is the platform's shared egress
  -- address (#206). The edge headers remain the fallback for a direct caller.
  v_ip := coalesce(
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

  -- Coarse per-peer cap on the edge-written address, so a direct caller cannot
  -- escape the bound by rotating a forged `x-client-ip`. Scoped per form
  -- (`peer:feedback|…`) so it no longer shares one bucket with `submit_sales_lead`
  -- (#621): on the app path the peer is the platform's shared egress address, so
  -- a shared bucket was a site-wide ceiling.
  v_peer := nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), '');

  perform public.consume_anon_write_quota('ip', v_ip, 5, 600);
  if v_peer is not null and v_peer <> v_ip then
    perform public.consume_anon_write_quota('ip', 'peer:feedback|' || v_peer, 60, 600);
  end if;
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
-- submit_sales_lead: per-form coarse peer cap
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
  v_peer text;
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
  -- Same extraction order as `submit_feedback`: app-forwarded `x-client-ip`
  -- first, then the edge headers, then `x-forwarded-for`.
  v_ip := coalesce(
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

  -- Per-form coarse cap (`peer:sales|…`), independent of the feedback cap, so a
  -- busy quote form cannot throttle feedback and vice versa (#621).
  v_peer := nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), '');

  perform public.consume_anon_write_quota('ip', v_ip, 5, 600);
  if v_peer is not null and v_peer <> v_ip then
    perform public.consume_anon_write_quota('ip', 'peer:sales|' || v_peer, 60, 600);
  end if;
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

-- ---------------------------------------------------------------------------
-- submit_support_message: add the coarse peer cap (#616)
-- ---------------------------------------------------------------------------

-- Unchanged except for the coarse cap. The widget calls this RPC straight from
-- the browser, so `cf-connecting-ip` is the visitor's real address here and the
-- cap is a genuine per-address bound on the direct path; a caller who forges
-- `x-client-ip` to mint fresh primary buckets is still bounded by their edge
-- address under `peer:support|…`.
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
  v_peer text;
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

  -- Coarse per-peer cap on the edge-written address (#616). `x-client-ip` is
  -- forgeable by a direct caller, so without this a scripted caller rotates it
  -- to open one thread per request; the edge address accumulates instead. Scoped
  -- per form so support does not share a bucket with feedback or sales.
  v_peer := nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), '');

  perform public.consume_anon_write_quota('ip', v_ip, 5, 600);
  if v_peer is not null and v_peer <> v_ip then
    perform public.consume_anon_write_quota('ip', 'peer:support|' || v_peer, 60, 600);
  end if;
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

commit;
