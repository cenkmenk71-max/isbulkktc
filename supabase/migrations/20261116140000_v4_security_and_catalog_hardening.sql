-- Security & Catalog Hardening (Madde 2.2, 2.6, 2.14)
-- 1. Re-assert EXECUTE revoke on engagement RPCs (service_role only)
-- 2. Add price_minor, currency, job_credits to job_packages; grant SELECT on price_minor, currency to anon/authenticated
-- 3. Create unique index on jobs.slug for published jobs (safe: partial, avoids existing draft conflicts)

-- 1. Engagement RPCs: ensure only service_role can execute
-- The 20261031120000_v4_function_privilege_hardening.sql migration already revoked
-- from public, anon, authenticated and granted to service_role. Supabase's
-- pg_default_acl re-grants EXECUTE to client roles on every new function, and
-- the in-body auth.role() guard (20261109000000) is the second line of defence.
-- This re-assertion is idempotent and ensures the grant surface stays closed.

revoke all on function public.list_engagement_recipients(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_engagement_recipients(uuid, integer)
  to service_role;

revoke all on function public.opt_out_engagement(text, text)
  from public, anon, authenticated;
grant execute on function public.opt_out_engagement(text, text)
  to service_role;

-- 2. job_packages: add pricing columns and grant column-level SELECT
-- The payment system (20261116120000_v4_payment_system.sql) references
-- price_minor, currency, and job_credits on job_packages. Add them with
-- sensible defaults so existing packages remain valid.

alter table public.job_packages
  add column if not exists price_minor integer not null default 0
    check (price_minor >= 0),
  add column if not exists currency text not null default 'TRY'
    check (char_length(currency) = 3 and currency = upper(currency)),
  add column if not exists job_credits integer not null default 1
    check (job_credits between 1 and 1000);

-- Extend column-level grants so anon/authenticated can read prices
-- (id, code, display_name, description, max_active_jobs, job_duration_days
--  were already granted in 20261020192000_v4_package_entitlements.sql)
grant select (price_minor, currency) on public.job_packages to anon, authenticated;

-- Update admin_save_job_package to accept and set the new columns
create or replace function public.admin_save_job_package(
  _package_id uuid,
  _code text,
  _display_name text,
  _description text,
  _max_active_jobs integer,
  _job_duration_days integer,
  _is_active boolean,
  _price_minor integer default 0,
  _currency text default 'TRY',
  _job_credits integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_package_id uuid;
  v_code text := pg_catalog.lower(pg_catalog.btrim(_code));
  v_name text := pg_catalog.btrim(_display_name);
  v_description text := pg_catalog.btrim(coalesce(_description, ''));
  v_price_minor integer := _price_minor;
  v_currency text := pg_catalog.upper(pg_catalog.btrim(_currency));
  v_job_credits integer := _job_credits;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.has_platform_role('platform_admin') then
    raise exception 'An active platform administrator is required.'
      using errcode = '42501';
  end if;

  if v_code is null
     or pg_catalog.char_length(v_code) not between 2 and 80
     or v_code !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or v_name is null
     or pg_catalog.char_length(v_name) not between 2 and 100
     or pg_catalog.char_length(v_description) > 1000
     or _max_active_jobs not between 1 and 1000
     or _job_duration_days not between 1 and 365
     or _is_active is null
     or v_price_minor < 0
     or pg_catalog.char_length(v_currency) <> 3
     or v_currency <> pg_catalog.upper(v_currency)
     or v_job_credits not between 1 and 1000 then
    raise exception 'The job package definition is invalid.'
      using errcode = '22023';
  end if;

  if _package_id is null then
    insert into public.job_packages (
      code, display_name, description, max_active_jobs,
      job_duration_days, is_active, price_minor, currency, job_credits
    ) values (
      v_code, v_name, v_description, _max_active_jobs,
      _job_duration_days, _is_active, v_price_minor, v_currency, v_job_credits
    )
    returning id into v_package_id;
  else
    update public.job_packages
    set code = v_code,
        display_name = v_name,
        description = v_description,
        max_active_jobs = _max_active_jobs,
        job_duration_days = _job_duration_days,
        is_active = _is_active,
        price_minor = v_price_minor,
        currency = v_currency,
        job_credits = v_job_credits
    where id = _package_id
    returning id into v_package_id;

    if v_package_id is null then
      raise exception 'The job package does not exist.'
        using errcode = '22023';
    end if;
  end if;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job_package.saved', 'job_package', v_package_id,
    pg_catalog.jsonb_build_object(
      'code', v_code,
      'is_active', _is_active,
      'max_active_jobs', _max_active_jobs,
      'job_duration_days', _job_duration_days,
      'price_minor', v_price_minor,
      'currency', v_currency,
      'job_credits', v_job_credits
    )
  );

  return v_package_id;
end;
$$;

-- Revoke from client roles, grant to authenticated (admin only via internal check)
revoke all on function public.admin_save_job_package(uuid, text, text, text, integer, integer, boolean, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_save_job_package(uuid, text, text, text, integer, integer, boolean, integer, text, integer)
  to authenticated;

-- 3. jobs: unique slug for published jobs (partial index, safe for existing drafts)
-- A global unique constraint on slug would fail if different companies already
-- use the same slug in draft/rejected states. The partial index on published
-- jobs enforces the business rule (no two live jobs share a slug) without
-- touching historical data. Draft/rejected jobs keep the per-company unique
-- constraint from 20261020190500_v4_jobs_applications.sql.
create unique index if not exists jobs_slug_published_unique
  on public.jobs (slug)
  where status = 'published';