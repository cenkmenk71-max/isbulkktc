-- Explicit, auditable consent for the acquisition / promotional campaign.
--
-- A corporate quote request is a transactional relationship, not consent to
-- ongoing marketing. Earlier campaigns treated every new sales lead as eligible;
-- that contradicted the quote form's privacy notice. Existing rows are deliberately
-- backfilled to FALSE by the column default because no historical opt-in proof
-- exists in the database.
--
-- The eight-argument RPC remains available for already-deployed clients and
-- writes the new columns' FALSE/NULL defaults. The nine-argument overload can record an opt-in request; only the
-- service-role confirmation RPC can activate consent after an email check.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.sales_leads
  add column marketing_consent boolean not null default false,
  add column marketing_consent_requested_at timestamptz,
  add column marketing_consent_at timestamptz,
  add column marketing_consent_version text,
  add constraint sales_leads_marketing_consent_audit check (
    (
      marketing_consent = false
      and marketing_consent_at is null
      and (
        (marketing_consent_requested_at is null and marketing_consent_version is null)
        or (
          marketing_consent_requested_at is not null
          and marketing_consent_version is not null
          and pg_catalog.char_length(pg_catalog.btrim(marketing_consent_version)) between 1 and 64
        )
      )
    )
    or (
      marketing_consent = true
      and marketing_consent_requested_at is not null
      and marketing_consent_at is not null
      and marketing_consent_version is not null
      and pg_catalog.char_length(pg_catalog.btrim(marketing_consent_version)) between 1 and 64
    )
  );

comment on column public.sales_leads.marketing_consent is
  'True only when the visitor explicitly opted in to promotional email.';
comment on column public.sales_leads.marketing_consent_requested_at is
  'Timestamp when the visitor requested marketing consent confirmation; this alone is not consent.';
comment on column public.sales_leads.marketing_consent_at is
  'Timestamp of affirmative consent after the email confirmation form was submitted.';
comment on column public.sales_leads.marketing_consent_version is
  'Version key for the exact consent copy displayed at opt-in.';

-- Consent-aware overload. Keep the anonymous abuse controls in the database
-- boundary, not only in the Next.js action: visitors can call PostgREST directly.
create or replace function public.submit_sales_lead(
  _company_name text,
  _contact_name text,
  _email text,
  _phone text,
  _plan text,
  _duration_days integer,
  _note text,
  _locale text,
  _marketing_consent boolean
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
  v_marketing_consent_requested boolean := coalesce(_marketing_consent, false);
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
  -- floor so the row satisfies sales_leads.phone's check without aborting.
  v_phone := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(_phone, '')), 32), '');

  -- Preserve the server-forwarded address + edge peer split. The direct
  -- PostgREST route and the server-action route therefore share the same quotas.
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
    perform public.consume_anon_write_quota('ip', 'peer:sales|' || v_peer, 60, 600);
  end if;
  perform public.consume_anon_write_quota('email', v_email, 5, 600);

  insert into public.sales_leads (
    company_name, contact_name, email, phone, plan, duration_days, note, locale,
    marketing_consent, marketing_consent_requested_at, marketing_consent_at,
    marketing_consent_version
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
    v_locale,
    false,
    case when v_marketing_consent_requested then pg_catalog.now() else null end,
    null,
    case when v_marketing_consent_requested then 'sales-lead-marketing-v1' else null end
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_sales_lead(text, text, text, text, text, integer, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_sales_lead(text, text, text, text, text, integer, text, text, boolean)
  to anon, authenticated;

-- Only opted-in prospects can reach the promotional sender. Existing quote
-- requests and visitors who leave the box empty remain transactional-only.
-- A request is not consent. Only the service-role confirmation endpoint,
-- reached through a signed, expiring email token and an explicit POST, can
-- transition a pending request to confirmed consent.
create or replace function public.confirm_sales_lead_marketing_consent(
  _lead_id uuid,
  _consent_version text,
  _email_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $consent$
declare
  v_confirmed boolean := false;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The marketing consent confirmer role is required.'
      using errcode = '42501';
  end if;

  update public.sales_leads as lead
  set marketing_consent = true,
      marketing_consent_at = coalesce(lead.marketing_consent_at, pg_catalog.now())
  where lead.id = _lead_id
    and lead.marketing_consent_requested_at >= pg_catalog.now() - interval '14 days'
    and lead.marketing_consent_version = _consent_version
    and encode(extensions.digest(pg_catalog.lower(lead.email), 'sha256'), 'hex') = _email_hash
    and lead.marketing_consent is false
    and not exists (
      select 1 from public.email_engagement_optouts as opted_out
      where opted_out.email = pg_catalog.lower(lead.email)
    );

  if found then
    return true;
  end if;

  -- A replay of the same valid token after successful confirmation is
  -- idempotently acknowledged, but no other row/version/address can be upgraded.
  select exists (
    select 1
    from public.sales_leads as lead
    where lead.id = _lead_id
      and lead.marketing_consent is true
      and lead.marketing_consent_version = _consent_version
      and encode(extensions.digest(pg_catalog.lower(lead.email), 'sha256'), 'hex') = _email_hash
      and lead.marketing_consent_at is not null
      and not exists (
        select 1 from public.email_engagement_optouts as opted_out
        where opted_out.email = pg_catalog.lower(lead.email)
      )
  )
  into v_confirmed;

  return v_confirmed;
end;
$consent$;

revoke all on function public.confirm_sales_lead_marketing_consent(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_sales_lead_marketing_consent(uuid, text, text)
  to service_role;

create or replace function public.list_marketing_recipients(
  _after uuid,
  _batch_size integer
)
returns table (
  lead_id uuid,
  email text,
  locale text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The marketing worker role is required.'
      using errcode = '42501';
  end if;

  return query
  select l.id, l.email, l.locale
  from public.sales_leads as l
  where l.status = 'new'
    and l.marketing_consent is true
    and l.marketing_consent_at is not null
    and (_after is null or l.id > _after)
    and not exists (
      select 1 from public.email_engagement_optouts as o
      where o.email = pg_catalog.lower(l.email)
    )
  order by l.id
  limit greatest(1, least(coalesce(_batch_size, 50), 200));
end;
$$;

revoke all on function public.list_marketing_recipients(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_marketing_recipients(uuid, integer) to service_role;

commit;
