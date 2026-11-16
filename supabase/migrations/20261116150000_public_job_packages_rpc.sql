-- Public job packages RPC for /packages page
-- Reads from job_packages with price_minor, currency, job_credits

create or replace function public.get_public_job_packages()
returns table (
  id uuid,
  code text,
  display_name text,
  description text,
  max_active_jobs integer,
  job_duration_days integer,
  is_active boolean,
  price_minor integer,
  currency text,
  job_credits integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.code,
    p.display_name,
    p.description,
    p.max_active_jobs,
    p.job_duration_days,
    p.is_active,
    p.price_minor,
    p.currency,
    p.job_credits,
    p.created_at,
    p.updated_at
  from public.job_packages as p
  where p.is_active
  order by p.price_minor, p.code;
$$;

revoke all on function public.get_public_job_packages() from public, anon, authenticated;
grant execute on function public.get_public_job_packages() to anon, authenticated;