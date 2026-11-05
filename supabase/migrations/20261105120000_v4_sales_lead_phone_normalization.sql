-- `submit_sales_lead` stored a phone number shorter than the column's floor and
-- let the INSERT fail on the check constraint.
--
-- The visitor form (`src/features/sales/sales-lead-form.tsx`) and its zod schema
-- (`src/features/sales/schemas.ts`) accept any phone string up to 32 characters
-- with no minimum length. The RPC mirrored only the upper bound — it stored
-- `nullif(left(btrim(_phone), 32), '')` — while `sales_leads.phone` requires
-- `char_length between 4 and 32`. A visitor who typed a bare "12" therefore hit
-- `23514`, the action mapped it to its generic `failed` copy, and the lead was
-- lost with no way for the prospect to tell why.
--
-- The column rule is correct (a 1–3 character phone is not a phone number), so
-- the fix belongs at the RPC: drop a value below the floor exactly as an empty
-- value is already dropped, instead of rejecting the whole submission. The
-- upper bound stays clamped to 32.
--
-- Idempotent: `create or replace` re-asserts the same definition, so this
-- migration is safe to re-run against the hosted project, where the migration
-- ledger is the custom `public._applied_migrations` table and every migration is
-- replayed. It must be approved by the owner before any live `db push`; this
-- branch carries the SQL only.

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
