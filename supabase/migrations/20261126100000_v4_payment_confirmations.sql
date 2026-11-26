begin;

create table public.payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  package_id uuid not null references public.job_packages (id) on delete restrict,
  amount integer not null check (amount > 0),
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  reference_code text check (reference_code is null or char_length(reference_code) <= 64),
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index payment_confirmations_company_idx on public.payment_confirmations (company_id);
create index payment_confirmations_package_idx on public.payment_confirmations (package_id);
create index payment_confirmations_requested_idx on public.payment_confirmations (requested_at desc);

alter table public.payment_confirmations enable row level security;
alter table public.payment_confirmations force row level security;

revoke all on table public.payment_confirmations from public, anon, authenticated;

grant select on public.payment_confirmations to authenticated, service_role;
grant insert on public.payment_confirmations to authenticated;
grant delete on public.payment_confirmations to service_role;

create policy payment_confirmations_admin_read
  on public.payment_confirmations for select to authenticated
  using (public.has_platform_role('platform_admin'));

create policy payment_confirmations_company_read
  on public.payment_confirmations for select to authenticated
  using (public.is_active_company_member(
    company_id,
    array['owner', 'recruiter', 'billing']::public.company_role[]
  ));

create policy payment_confirmations_company_insert
  on public.payment_confirmations for insert to authenticated
  with check (public.is_active_company_member(
    company_id,
    array['owner', 'recruiter', 'billing']::public.company_role[]
  ));

create or replace function public.create_payment_confirmation(
  _company_id uuid,
  _package_id uuid,
  _amount integer,
  _currency text default 'TRY',
  _reference_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  created_id uuid;
  company_row public.companies%rowtype;
  package_row public.job_packages%rowtype;
begin
  if auth.role() <> 'authenticated' or actor_id is null then
    raise exception 'An authenticated active company member is required.'
      using errcode = '42501';
  end if;

  select *
  into company_row
  from public.companies
  where id = _company_id;

  if not found
     or not public.is_active_company_member(
       _company_id,
       array['owner', 'recruiter', 'billing']::public.company_role[]
     )
     or company_row.verification_status <> 'verified'
  then
    raise exception 'A verified company with an active member is required.'
      using errcode = '42501';
  end if;

  select *
  into package_row
  from public.job_packages
  where id = _package_id and is_active;

  if not found then
    raise exception 'The selected package is not available.'
      using errcode = '22023';
  end if;

  if _amount <= 0 then
    raise exception 'The amount must be positive.'
      using errcode = '22023';
  end if;

  insert into public.payment_confirmations (
    company_id, package_id, amount, currency, reference_code
  )
  values (
    _company_id, _package_id, _amount, _currency, nullif(btrim(_reference_code), '')
  )
  returning id into created_id;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (
    actor_id,
    'payment_confirmation.created',
    'payment_confirmation',
    created_id,
    jsonb_build_object('company_id', _company_id, 'package_id', _package_id, 'amount', _amount)
  );

  return created_id;
end;
$$;

create or replace function public.admin_confirm_payment(
  _confirmation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  effective_actor uuid;
  confirmation_row public.payment_confirmations%rowtype;
  company_row public.companies%rowtype;
  package_row public.job_packages%rowtype;
begin
  if auth.role() = 'service_role' then
    effective_actor := null;
  elsif auth.role() = 'authenticated'
        and public.has_platform_role('platform_admin') then
    effective_actor := actor_id;
  else
    raise exception 'An MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  select *
  into confirmation_row
  from public.payment_confirmations
  where id = _confirmation_id
  for update;

  if not found then
    raise exception 'The payment confirmation was not found.'
      using errcode = '22023';
  end if;

  select *
  into company_row
  from public.companies
  where id = confirmation_row.company_id;

  if not found then
    raise exception 'The associated company no longer exists.'
      using errcode = '22023';
  end if;

  select *
  into package_row
  from public.job_packages
  where id = confirmation_row.package_id and is_active;

  if not found then
    raise exception 'The associated package is no longer active.'
      using errcode = '22023';
  end if;

  perform public.admin_assign_company_job_package(
    confirmation_row.company_id,
    confirmation_row.package_id,
    null
  );

  delete from public.payment_confirmations
  where id = _confirmation_id;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (
    effective_actor ?? actor_id,
    'payment_confirmation.confirmed',
    'payment_confirmation',
    _confirmation_id,
    jsonb_build_object(
      'company_id', confirmation_row.company_id,
      'package_id', confirmation_row.package_id,
      'package_code', package_row.code,
      'max_active_jobs', package_row.max_active_jobs
    )
  );
end;
$$;

revoke all on function public.create_payment_confirmation(uuid, uuid, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.admin_confirm_payment(uuid)
  from public, anon, authenticated;

grant execute on function public.create_payment_confirmation(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.admin_confirm_payment(uuid) to authenticated, service_role;

commit;