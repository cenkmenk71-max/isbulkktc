-- Make the anonymous write throttle key on the app-forwarded visitor address.
--
-- `20261106100000_v4_anon_write_throttle_client_ip.sql` added `x-client-ip` to
-- the extraction but placed it *after* the edge headers, which left issue #206
-- open on the path real visitors use. The reason is the one the migration's own
-- note missed: on the app path the RPC is called by the Next.js server action
-- through `supabase-js`, so the TCP peer of the PostgREST request is the
-- platform (Vercel), and Cloudflare writes *that* address into
-- `cf-connecting-ip`. The header is unforgeable and identical for every
-- visitor, so ordering it first collapsed the `scope='ip'` bucket onto a single
-- row shared by the whole site: the sixth feedback/sales submission anywhere in
-- ten minutes was rejected with the generic "failed" copy. `x-client-ip` — the
-- only per-visitor signal the app has — was never reached.
--
-- This migration reverses the order for the *primary* bucket: the app-forwarded
-- `x-client-ip` now wins, and the edge headers are the fallback. A direct
-- PostgREST caller carries none of the app's headers, so it still resolves to
-- the edge-written `cf-connecting-ip`.
--
-- That reordering alone would *weaken* the control on the direct path: a caller
-- who reaches PostgREST directly can set `x-client-ip` (the edge passes an
-- unknown header through verbatim) and rotate it per request to mint a fresh
-- bucket each time — the unbounded-storage half of #139 that
-- `20261106000000` closed. To keep that bound, the request's edge-written
-- `cf-connecting-ip` is *also* consumed, as a coarse per-peer cap with a wider
-- burst, whenever it is present and differs from the primary address. A direct
-- attacker is therefore still bounded by their real address, while the app path
-- gets a meaningful per-visitor bucket.
--
-- Consequence to keep in mind: on the app path the coarse cap keys on the
-- platform's shared egress address, so it doubles as a site-wide ceiling of
-- `_peer_burst` submissions per window. That is deliberate — it is the price of
-- bounding a direct caller who forges `x-client-ip` — and the burst is set well
-- above realistic feedback/quote volume. The value stays a best-effort abuse
-- control, not an identity boundary: both names remain forgeable, and the point
-- is to make scripted flooding expensive, not impossible.
--
-- Idempotent: both functions are re-created with `create or replace` and their
-- grants re-asserted, so this is safe to replay against the hosted project (its
-- ledger is the custom `public._applied_migrations`). The signatures are
-- deliberately unchanged — a new argument would change
-- `pg_get_function_identity_arguments` and break the reviewed privilege ratchet
-- and the client-callable whitelist. The coarse cap reuses the existing `'ip'`
-- scope (its subject is a different hash), so the ledger's schema and the
-- helper's `check` are untouched.

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
  -- escape the bound by rotating a forged `x-client-ip`.
  v_peer := nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), '');

  perform public.consume_anon_write_quota('ip', v_ip, 5, 600);
  if v_peer is not null and v_peer <> v_ip then
    perform public.consume_anon_write_quota('ip', v_peer, 25, 600);
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

  v_peer := nullif(pg_catalog.btrim(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip'), '');

  perform public.consume_anon_write_quota('ip', v_ip, 5, 600);
  if v_peer is not null and v_peer <> v_ip then
    perform public.consume_anon_write_quota('ip', v_peer, 25, 600);
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

commit;
