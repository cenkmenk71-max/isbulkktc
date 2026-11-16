-- Payment System: Manual IBAN + Admin Reconciliation
-- Enums, Tables, RLS, RPCs, Storage Policies

-- 1. ENUMS
create type public.order_status as enum (
  'awaiting_transfer', 'payment_submitted', 'payment_under_review',
  'paid', 'rejected', 'expired', 'cancelled', 'refund_pending', 'refunded'
);

create type public.submission_status as enum (
  'submitted', 'under_review', 'accepted', 'rejected', 'needs_more_info'
);

create type public.reconciliation_decision as enum (
  'accepted', 'rejected', 'needs_more_info'
);

create type public.credit_entry_type as enum (
  'purchase_grant', 'job_consume', 'job_refund',
  'manual_adjustment', 'expiry', 'reversal'
);

-- 2. TABLES

-- Payment instruction versions (admin managed, IBAN never exposed to non-admin)
create table public.payment_instruction_versions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_name text not null
    check (char_length(beneficiary_name) between 2 and 120 and beneficiary_name = btrim(beneficiary_name)),
  bank_name text not null
    check (char_length(bank_name) between 2 and 80 and bank_name = btrim(bank_name)),
  iban_restricted_value text not null
    check (char_length(iban_restricted_value) between 15 and 34),
  currency text not null
    check (char_length(currency) = 3 and currency = upper(currency)),
  instructions text not null default ''
    check (char_length(instructions) <= 2000),
  active_from timestamptz not null default now(),
  active_to timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint payment_instruction_dates_check check (
    active_to is null or active_to > active_from
  )
);

create trigger payment_instruction_versions_set_updated_at
  before update on public.payment_instruction_versions
  for each row execute function public.set_updated_at();

-- Orders (company package purchase requests)
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  package_id uuid not null references public.job_packages (id) on delete restrict,
  status public.order_status not null default 'awaiting_transfer',
  total_minor integer not null check (total_minor >= 0),
  currency text not null check (char_length(currency) = 3 and currency = upper(currency)),
  reference_code text not null unique
    check (char_length(reference_code) between 8 and 40 and reference_code = upper(btrim(reference_code))),
  package_snapshot jsonb not null
    check (
      jsonb_typeof(package_snapshot) = 'object'
      and package_snapshot ? 'code'
      and package_snapshot ? 'display_name'
      and package_snapshot ? 'max_active_jobs'
      and package_snapshot ? 'job_duration_days'
      and package_snapshot ? 'job_credits'
      and package_snapshot ? 'price_minor'
      and package_snapshot ? 'currency'
    ),
  payment_instruction_version_id uuid references public.payment_instruction_versions (id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_expires_after_created check (expires_at > created_at)
);

create index orders_company_status_idx on public.orders (company_id, status, created_at desc);
create index orders_expires_at_idx on public.orders (expires_at) where status in ('awaiting_transfer', 'payment_submitted', 'payment_under_review');

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- Payment submissions (user submitted transfer info + receipt)
create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  submitted_by uuid not null references auth.users (id) on delete restrict,
  sender_name text not null
    check (char_length(sender_name) between 2 and 120 and sender_name = btrim(sender_name)),
  transfer_reference text not null
    check (char_length(transfer_reference) between 4 and 60 and transfer_reference = upper(btrim(transfer_reference))),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (char_length(currency) = 3 and currency = upper(currency)),
  transferred_at timestamptz not null,
  receipt_storage_path text
    check (receipt_storage_path is null or char_length(receipt_storage_path) <= 500),
  status public.submission_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, transfer_reference)
);

create index payment_submissions_order_idx on public.payment_submissions (order_id, created_at desc);
create index payment_submissions_status_idx on public.payment_submissions (status) where status in ('submitted', 'under_review');

create trigger payment_submissions_set_updated_at
  before update on public.payment_submissions
  for each row execute function public.set_updated_at();

-- Payment reconciliations (admin decision, written once per submission)
create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  submission_id uuid not null references public.payment_submissions (id) on delete restrict,
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  decision public.reconciliation_decision not null,
  bank_reference_normalized text not null
    check (char_length(bank_reference_normalized) between 4 and 60 and bank_reference_normalized = upper(btrim(bank_reference_normalized))),
  notes text
    check (notes is null or char_length(notes) <= 1000),
  reviewed_at timestamptz not null default now(),
  unique (order_id, submission_id)
);

create index payment_reconciliations_bank_ref_idx on public.payment_reconciliations (bank_reference_normalized) where decision = 'accepted';

-- Credit accounts (denormalized balance for fast reads)
create table public.credit_accounts (
  company_id uuid primary key references public.companies (id) on delete cascade,
  available_balance integer not null default 0 check (available_balance >= 0),
  updated_at timestamptz not null default now()
);

create trigger credit_accounts_set_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();

-- Credit ledger entries (append-only, immutable)
create table public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  job_id uuid references public.jobs (id) on delete restrict,
  entry_type public.credit_entry_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 10 and 120),
  actor_id uuid not null references auth.users (id) on delete restrict,
  reason text not null
    check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index credit_ledger_entries_company_created_idx
  on public.credit_ledger_entries (company_id, created_at desc);
create index credit_ledger_entries_order_idx
  on public.credit_ledger_entries (order_id) where order_id is not null;
create index credit_ledger_entries_job_idx
  on public.credit_ledger_entries (job_id) where job_id is not null;

-- 3. RLS ENABLE & REVOKE

alter table public.payment_instruction_versions enable row level security;
alter table public.orders enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.payment_reconciliations enable row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_ledger_entries enable row level security;

revoke all on table
  public.payment_instruction_versions,
  public.orders,
  public.payment_submissions,
  public.payment_reconciliations,
  public.credit_accounts,
  public.credit_ledger_entries
from anon, authenticated;

-- 4. GRANTS & POLICIES

-- payment_instruction_versions: admin only (full), company gets masked via RPC
grant select (id, beneficiary_name, bank_name, currency, instructions, active_from, active_to, created_by, created_at)
  on public.payment_instruction_versions to authenticated;

create policy payment_instructions_admin_read
  on public.payment_instruction_versions for select to authenticated
  using (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'));

create policy payment_instructions_admin_write
  on public.payment_instruction_versions for all to authenticated
  using (public.has_platform_role('platform_admin'))
  with check (public.has_platform_role('platform_admin'));

-- orders: company members (owner/recruiter/billing) read, admin all
grant select (id, company_id, package_id, status, total_minor, currency,
              reference_code, package_snapshot, payment_instruction_version_id,
              expires_at, created_at, updated_at)
  on public.orders to authenticated;

create policy orders_company_member_read
  on public.orders for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
    and public.is_active_company_member(
      company_id,
      array['owner','recruiter','billing']::public.company_role[]
    )
  );

create policy orders_admin_all
  on public.orders for all to authenticated
  using (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'))
  with check (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'));

-- payment_submissions: company member insert/read own, admin all
grant insert (order_id, submitted_by, sender_name, transfer_reference,
              amount_minor, currency, transferred_at, receipt_storage_path)
  on public.payment_submissions to authenticated;
grant select on public.payment_submissions to authenticated;

create policy submissions_company_member_insert
  on public.payment_submissions for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
    and submitted_by = auth.uid()
    and public.is_active_company_member(
      (select company_id from public.orders where id = order_id),
      array['owner','recruiter','billing']::public.company_role[]
    )
  );

create policy submissions_company_member_read
  on public.payment_submissions for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.status = 'active'
    )
    and public.is_active_company_member(
      (select company_id from public.orders where id = order_id),
      array['owner','recruiter','billing']::public.company_role[]
    )
  );

create policy submissions_admin_all
  on public.payment_submissions for all to authenticated
  using (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'))
  with check (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'));

-- payment_reconciliations: billing_admin/platform_admin only
grant select, insert on public.payment_reconciliations to authenticated;

create policy reconciliations_admin_all
  on public.payment_reconciliations for all to authenticated
  using (public.has_platform_role('billing_admin') or public.has_platform_role('platform_admin'))
  with check (public.has_platform_role('billing_admin') or public.has_platform_role('platform_admin'));

-- credit_accounts: company member read own, admin read all
grant select on public.credit_accounts to authenticated;

create policy credit_accounts_company_read
  on public.credit_accounts for select to authenticated
  using (
    public.is_active_company_member(company_id, array['owner','recruiter','billing']::public.company_role[])
  );

create policy credit_accounts_admin_read
  on public.credit_accounts for select to authenticated
  using (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'));

-- credit_ledger_entries: company member read own, admin all
grant select on public.credit_ledger_entries to authenticated;

create policy credit_ledger_company_read
  on public.credit_ledger_entries for select to authenticated
  using (
    public.is_active_company_member(company_id, array['owner','recruiter','billing']::public.company_role[])
  );

create policy credit_ledger_admin_all
  on public.credit_ledger_entries for all to authenticated
  using (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'))
  with check (public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin'));

-- 5. RPC FUNCTIONS

-- reconcile_payment: atomic, idempotent, AAL2 + billing_admin required
create or replace function public.reconcile_payment(
  _reconciliation_idempotency_key text,
  _submission_id uuid,
  _decision public.reconciliation_decision,
  _bank_reference_normalized text,
  _notes text default null
)
returns public.payment_reconciliations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_submission public.payment_submissions%rowtype;
  v_order public.orders%rowtype;
  v_package public.job_packages%rowtype;
  v_assignment public.company_job_package_assignments%rowtype;
  v_reconciliation public.payment_reconciliations%rowtype;
  v_idempotency_key text := lower(btrim(_reconciliation_idempotency_key));
  v_norm_bank_ref text := upper(btrim(_bank_reference_normalized));
begin
  -- 1. AAL2 + billing_admin enforcement
  if v_actor is null
     or (select auth.jwt() ->> 'aal') <> 'aal2'
     or not exists (
       select 1 from public.user_roles
       where user_id = v_actor and role = 'billing_admin'
     )
     or not exists (
       select 1 from public.profiles where id = v_actor and status = 'active'
     ) then
    raise exception 'Active AAL2-verified billing administrator required.'
      using errcode = '42501';
  end if;

  -- 2. Idempotency check
  if exists (select 1 from public.credit_ledger_entries
             where idempotency_key = v_idempotency_key) then
    raise exception 'This reconciliation has already been processed.'
      using errcode = 'P0001';
  end if;

  -- 3. Lock submission + order
  select s.* into v_submission
  from public.payment_submissions s
  where s.id = _submission_id
  for update of s;

  if not found then
    raise exception 'Submission not found.' using errcode = '22023';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = v_submission.order_id
  for update of o;

  if not found then
    raise exception 'Submission not found.' using errcode = '22023';
  end if;

  if v_order.status not in ('payment_submitted','payment_under_review') then
    raise exception 'Order is not in a reconcilable state.' using errcode = 'P0001';
  end if;

  if v_submission.status not in ('submitted','under_review') then
    raise exception 'Submission already processed.' using errcode = 'P0001';
  end if;

  -- 4. Amount/currency match
  if v_submission.amount_minor <> v_order.total_minor
     or v_submission.currency <> v_order.currency then
    raise exception 'Amount/currency mismatch between submission and order.'
      using errcode = '22023';
  end if;

  -- 5. Bank reference uniqueness (across accepted payments)
  if exists (
    select 1 from public.payment_reconciliations pr
    join public.payment_submissions ps on ps.id = pr.submission_id
    where pr.bank_reference_normalized = v_norm_bank_ref
      and pr.decision = 'accepted'
      and ps.order_id <> v_order.id
  ) then
    raise exception 'Bank reference already used for another accepted payment.'
      using errcode = 'P0001';
  end if;

  -- 6. REJECTED
  if _decision = 'rejected' then
    update public.payment_submissions
    set status = 'rejected', updated_at = now()
    where id = _submission_id;

    update public.orders
    set status = 'rejected', updated_at = now()
    where id = v_order.id;

    insert into public.payment_reconciliations (
      order_id, submission_id, reviewed_by, decision,
      bank_reference_normalized, notes
    ) values (
      v_order.id, _submission_id, v_actor, _decision,
      v_norm_bank_ref, _notes
    )
    returning * into v_reconciliation;

    insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
    values (v_actor, 'payment.rejected', 'order', v_order.id,
      jsonb_build_object('submission_id', _submission_id, 'bank_ref', v_norm_bank_ref));

    return v_reconciliation;
  end if;

  -- 7. NEEDS_MORE_INFO
  if _decision = 'needs_more_info' then
    update public.payment_submissions
    set status = 'needs_more_info', updated_at = now()
    where id = _submission_id;

    insert into public.payment_reconciliations (
      order_id, submission_id, reviewed_by, decision,
      bank_reference_normalized, notes
    ) values (
      v_order.id, _submission_id, v_actor, _decision,
      v_norm_bank_ref, _notes
    )
    returning * into v_reconciliation;

    insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
    values (v_actor, 'payment.needs_more_info', 'order', v_order.id,
      jsonb_build_object('submission_id', _submission_id));

    return v_reconciliation;
  end if;

  -- 8. ACCEPTED - atomic credit grant
  select p.* into v_package
  from public.job_packages p
  where p.id = v_order.package_id and p.is_active
  for share;

  if not found then
    raise exception 'Package no longer active.' using errcode = 'P0001';
  end if;

  select a.* into v_assignment
  from public.company_job_package_assignments a
  where a.company_id = v_order.company_id
    and a.revoked_at is null
    and a.starts_at <= now()
    and (a.expires_at is null or a.expires_at > now())
  for share;

  if not found then
    raise exception 'No active package assignment for company.' using errcode = 'P0001';
  end if;

  -- 8a. Reconciliation record
  insert into public.payment_reconciliations (
    order_id, submission_id, reviewed_by, decision,
    bank_reference_normalized, notes
  ) values (
    v_order.id, _submission_id, v_actor, _decision,
    v_norm_bank_ref, _notes
  )
  returning * into v_reconciliation;

  -- 8b. Order -> paid
  update public.orders
  set status = 'paid', updated_at = now()
  where id = v_order.id;

  -- 8c. Submission -> accepted
  update public.payment_submissions
  set status = 'accepted', updated_at = now()
  where id = _submission_id;

  -- 8d. Credit ledger: purchase_grant
  insert into public.credit_ledger_entries (
    company_id, order_id, entry_type, quantity_delta,
    idempotency_key, actor_id, reason
  ) values (
    v_order.company_id, v_order.id, 'purchase_grant',
    v_package.job_credits,
    v_idempotency_key, v_actor,
    'Package credit grant via order ' || v_order.reference_code
  );

  -- 8e. Credit account balance (upsert)
  insert into public.credit_accounts (company_id, available_balance, updated_at)
  values (v_order.company_id, v_package.job_credits, now())
  on conflict (company_id) do update set
    available_balance = credit_accounts.available_balance + v_package.job_credits,
    updated_at = now();

  -- 8f. Audit
  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (v_actor, 'payment.accepted', 'order', v_order.id,
    jsonb_build_object(
      'submission_id', _submission_id,
      'bank_ref', v_norm_bank_ref,
      'credits_granted', v_package.job_credits,
      'package_code', v_package.code
    ));

  -- 8g. Outbox event
  insert into public.outbox_events (event_type, aggregate_id, payload_minimal)
  values ('payment.accepted', v_order.id,
    jsonb_build_object('company_id', v_order.company_id, 'credits', v_package.job_credits));

  return v_reconciliation;
end;
$$;

-- create_order: company billing/owner creates order
create or replace function public.create_order(
  _company_id uuid,
  _package_id uuid
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_company public.companies%rowtype;
  v_package public.job_packages%rowtype;
  v_instruction public.payment_instruction_versions%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz := now();
  v_ref_code text;
  v_snapshot jsonb;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  -- Verify company membership (owner/recruiter/billing)
  if not public.is_active_company_member(
    _company_id, array['owner','recruiter','billing']::public.company_role[]
  ) then
    raise exception 'Company membership with billing permission required.'
      using errcode = '42501';
  end if;

  select c.* into v_company
  from public.companies c
  where c.id = _company_id
  for share;

  if not found or v_company.verification_status <> 'verified' then
    raise exception 'A verified company is required.'
      using errcode = '42501';
  end if;

  select p.* into v_package
  from public.job_packages p
  where p.id = _package_id and p.is_active
  for share;

  if not found then
    raise exception 'Active package not found.'
      using errcode = '22023';
  end if;

  -- Active payment instruction
  select i.* into v_instruction
  from public.payment_instruction_versions i
  where i.active_from <= v_now
    and (i.active_to is null or i.active_to > v_now)
  order by i.active_from desc
  limit 1
  for share;

  if not found then
    raise exception 'No active payment instruction available.'
      using errcode = 'P0001';
  end if;

  -- Generate reference code: ORD-YYYYMMDD-XXXXXX
  v_ref_code := 'ORD-' || to_char(v_now, 'YYYYMMDD') || '-' || upper(substring(md5(gen_random_uuid()::text) from 1 for 6));

  -- Package snapshot (immutable copy)
  v_snapshot := jsonb_build_object(
    'code', v_package.code,
    'display_name', v_package.display_name,
    'max_active_jobs', v_package.max_active_jobs,
    'job_duration_days', v_package.job_duration_days,
    'job_credits', v_package.job_credits,
    'price_minor', v_package.price_minor,
    'currency', v_package.currency
  );

  insert into public.orders (
    company_id, package_id, status, total_minor, currency,
    reference_code, package_snapshot, payment_instruction_version_id, expires_at
  ) values (
    _company_id, v_package.id, 'awaiting_transfer',
    v_package.price_minor, v_package.currency,
    v_ref_code, v_snapshot, v_instruction.id,
    v_now + interval '7 days' -- 7 days to pay
  )
  returning * into v_order;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (v_actor, 'order.created', 'order', v_order.id,
    jsonb_build_object('package_id', v_package.id, 'reference_code', v_ref_code));

  return v_order;
end;
$$;

-- submit_payment: company member submits transfer info + receipt
create or replace function public.submit_payment(
  _order_id uuid,
  _sender_name text,
  _transfer_reference text,
  _amount_minor integer,
  _currency text,
  _transferred_at timestamptz,
  _receipt_storage_path text default null
)
returns public.payment_submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_order public.orders%rowtype;
  v_submission public.payment_submissions%rowtype;
  v_norm_ref text := upper(btrim(_transfer_reference));
  v_norm_sender text := btrim(_sender_name);
  v_norm_currency text := upper(btrim(_currency));
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select o.* into v_order
  from public.orders o
  where o.id = _order_id
  for share;

  if not found then
    raise exception 'Order not found.' using errcode = '22023';
  end if;

  if not public.is_active_company_member(
    v_order.company_id, array['owner','recruiter','billing']::public.company_role[]
  ) then
    raise exception 'Not authorized for this company.'
      using errcode = '42501';
  end if;

  if v_order.status <> 'awaiting_transfer' then
    raise exception 'Order is not awaiting transfer.'
      using errcode = 'P0001';
  end if;

  if _amount_minor <= 0 or v_norm_currency = '' or v_norm_sender = '' or v_norm_ref = '' then
    raise exception 'Invalid payment submission data.'
      using errcode = '22023';
  end if;

  if _transferred_at > now() + interval '1 day' then
    raise exception 'Transfer date cannot be in the future.'
      using errcode = '22023';
  end if;

  insert into public.payment_submissions (
    order_id, submitted_by, sender_name, transfer_reference,
    amount_minor, currency, transferred_at, receipt_storage_path, status
  ) values (
    _order_id, v_actor, v_norm_sender, v_norm_ref,
    _amount_minor, v_norm_currency, _transferred_at, _receipt_storage_path, 'submitted'
  )
  returning * into v_submission;

  update public.orders
  set status = 'payment_submitted', updated_at = now()
  where id = _order_id;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (v_actor, 'payment.submitted', 'order', _order_id,
    jsonb_build_object('submission_id', v_submission.id, 'transfer_reference', v_norm_ref));

  return v_submission;
end;
$$;

-- get_my_orders: company member lists their orders
create or replace function public.get_my_orders(_company_id uuid)
returns setof public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  if not public.is_active_company_member(
    _company_id, array['owner','recruiter','billing']::public.company_role[]
  ) then
    raise exception 'Not authorized for this company.'
      using errcode = '42501';
  end if;

  return query
  select o.*
  from public.orders o
  where o.company_id = _company_id
  order by o.created_at desc;
end;
$$;

-- get_active_payment_instruction: returns masked IBAN for company, full for admin
create or replace function public.get_active_payment_instruction(
  _for_admin boolean default false
)
returns table (
  id uuid,
  beneficiary_name text,
  bank_name text,
  iban_display text,
  currency text,
  instructions text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_instruction public.payment_instruction_versions%rowtype;
  v_is_admin boolean;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  v_is_admin := public.has_platform_role('platform_admin') or public.has_platform_role('billing_admin');

  if _for_admin and not v_is_admin then
    raise exception 'Admin access required for full IBAN.'
      using errcode = '42501';
  end if;

  select i.* into v_instruction
  from public.payment_instruction_versions i
  where i.active_from <= now()
    and (i.active_to is null or i.active_to > now())
  order by i.active_from desc
  limit 1
  for share;

  if not found then
    return;
  end if;

  if _for_admin and v_is_admin then
    return query select v_instruction.id, v_instruction.beneficiary_name, v_instruction.bank_name,
      v_instruction.iban_restricted_value, v_instruction.currency, v_instruction.instructions;
  else
    -- Masked: show only last 4 chars
    return query select v_instruction.id, v_instruction.beneficiary_name, v_instruction.bank_name,
      '**** **** **** ' || right(v_instruction.iban_restricted_value, 4),
      v_instruction.currency, v_instruction.instructions;
  end if;
end;
$$;

-- 6. RPC GRANTS

revoke all on function public.reconcile_payment(text, uuid, public.reconciliation_decision, text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_payment(text, uuid, public.reconciliation_decision, text, text)
  to authenticated;

revoke all on function public.create_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_order(uuid, uuid)
  to authenticated;

revoke all on function public.submit_payment(uuid, text, text, integer, text, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.submit_payment(uuid, text, text, integer, text, timestamptz, text)
  to authenticated;

revoke all on function public.get_my_orders(uuid)
  from public, anon, authenticated;
grant execute on function public.get_my_orders(uuid)
  to authenticated;

revoke all on function public.get_active_payment_instruction(boolean)
  from public, anon, authenticated;
grant execute on function public.get_active_payment_instruction(boolean)
  to authenticated;

-- 6. ADMIN RPCs

-- admin_list_payment_console_orders: billing_admin/platform_admin lists all orders with submissions/reconciliations
create or replace function public.admin_list_payment_console_orders()
returns table (
  id uuid,
  company_id uuid,
  package_id uuid,
  status public.order_status,
  total_minor integer,
  currency text,
  reference_code text,
  package_snapshot jsonb,
  payment_instruction_version_id uuid,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  company_name text,
  company_slug text,
  package_name text,
  package_code text,
  submission_id uuid,
  submission_status public.submission_status,
  submission_sender_name text,
  submission_transfer_reference text,
  submission_amount_minor integer,
  submission_currency text,
  submission_receipt_path text,
  submission_created_at timestamptz,
  reconciliation_id uuid,
  reconciliation_decision public.reconciliation_decision,
  reconciliation_notes text,
  reconciliation_reviewed_at timestamptz,
  reconciliation_bank_ref text,
  reviewed_by_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.status = 'active'
     )
     or not (
       exists (select 1 from public.user_roles where user_id = v_actor and role = 'billing_admin')
       or exists (select 1 from public.user_roles where user_id = v_actor and role = 'platform_admin')
     ) then
    raise exception 'Active billing administrator required.' using errcode = '42501';
  end if;

  return query
  select
    o.id,
    o.company_id,
    o.package_id,
    o.status,
    o.total_minor,
    o.currency,
    o.reference_code,
    o.package_snapshot,
    o.payment_instruction_version_id,
    o.expires_at,
    o.created_at,
    o.updated_at,
    c.name as company_name,
    c.slug as company_slug,
    p.display_name as package_name,
    p.code as package_code,
    s.id as submission_id,
    s.status as submission_status,
    s.sender_name as submission_sender_name,
    s.transfer_reference as submission_transfer_reference,
    s.amount_minor as submission_amount_minor,
    s.currency as submission_currency,
    s.receipt_storage_path as submission_receipt_path,
    s.created_at as submission_created_at,
    r.id as reconciliation_id,
    r.decision as reconciliation_decision,
    r.notes as reconciliation_notes,
    r.reviewed_at as reconciliation_reviewed_at,
    r.bank_reference_normalized as reconciliation_bank_ref,
    pr.display_name as reviewed_by_name
  from public.orders o
  join public.companies c on c.id = o.company_id
  join public.job_packages p on p.id = o.package_id
  left join public.payment_submissions s on s.order_id = o.id
  left join public.payment_reconciliations r on r.order_id = o.id and r.submission_id = s.id
  left join public.profiles pr on pr.id = r.reviewed_by
  order by o.created_at desc;
end;
$$;

-- admin_list_payment_instructions: billing_admin/platform_admin lists all instruction versions
create or replace function public.admin_list_payment_instructions()
returns table (
  id uuid,
  beneficiary_name text,
  bank_name text,
  iban_restricted_value text,
  currency text,
  instructions text,
  active_from timestamptz,
  active_to timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.status = 'active'
     )
     or not (
       exists (select 1 from public.user_roles where user_id = v_actor and role = 'billing_admin')
       or exists (select 1 from public.user_roles where user_id = v_actor and role = 'platform_admin')
     ) then
    raise exception 'Active billing administrator required.' using errcode = '42501';
  end if;

  return query
  select
    i.id,
    i.beneficiary_name,
    i.bank_name,
    i.iban_restricted_value,
    i.currency,
    i.instructions,
    i.active_from,
    i.active_to,
    i.created_by,
    i.created_at,
    i.updated_at
  from public.payment_instruction_versions i
  order by i.active_from desc;
end;
$$;

-- admin_save_payment_instruction: platform_admin creates/updates instruction version
create or replace function public.admin_save_payment_instruction(
  _instruction_id uuid,
  _beneficiary_name text,
  _bank_name text,
  _iban_restricted_value text,
  _currency text,
  _instructions text,
  _active_from timestamptz,
  _active_to timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_instruction_id uuid;
  v_norm_iban text := upper(btrim(_iban_restricted_value));
  v_norm_currency text := upper(btrim(_currency));
  v_norm_beneficiary text := btrim(_beneficiary_name);
  v_norm_bank text := btrim(_bank_name);
  v_norm_instructions text := btrim(coalesce(_instructions, ''));
  v_active_from timestamptz := _active_from;
  v_active_to timestamptz := _active_to;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.status = 'active'
     )
     or not exists (select 1 from public.user_roles where user_id = v_actor and role = 'platform_admin') then
    raise exception 'An active platform administrator is required.' using errcode = '42501';
  end if;

  if v_norm_beneficiary is null
     or char_length(v_norm_beneficiary) not between 2 and 120 then
    raise exception 'Invalid beneficiary name.' using errcode = '22023';
  end if;
  if v_norm_bank is null
     or char_length(v_norm_bank) not between 2 and 80 then
    raise exception 'Invalid bank name.' using errcode = '22023';
  end if;
  if v_norm_iban is null
     or char_length(v_norm_iban) not between 15 and 34 then
    raise exception 'Invalid IBAN.' using errcode = '22023';
  end if;
  if char_length(v_norm_currency) <> 3 or v_norm_currency <> upper(v_norm_currency) then
    raise exception 'Invalid currency code.' using errcode = '22023';
  end if;
  if char_length(v_norm_instructions) > 2000 then
    raise exception 'Instructions too long.' using errcode = '22023';
  end if;
  if v_active_to is not null and v_active_to <= v_active_from then
    raise exception 'active_to must be after active_from.' using errcode = '22023';
  end if;

  if _instruction_id is null then
    insert into public.payment_instruction_versions (
      beneficiary_name, bank_name, iban_restricted_value, currency,
      instructions, active_from, active_to, created_by
    ) values (
      v_norm_beneficiary, v_norm_bank, v_norm_iban, v_norm_currency,
      v_norm_instructions, v_active_from, v_active_to, v_actor
    )
    returning id into v_instruction_id;
  else
    update public.payment_instruction_versions
    set beneficiary_name = v_norm_beneficiary,
        bank_name = v_norm_bank,
        iban_restricted_value = v_norm_iban,
        currency = v_norm_currency,
        instructions = v_norm_instructions,
        active_from = v_active_from,
        active_to = v_active_to
    where id = _instruction_id
    returning id into v_instruction_id;

    if v_instruction_id is null then
      raise exception 'Payment instruction not found.' using errcode = '22023';
    end if;
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (v_actor, 'payment_instruction.saved', 'payment_instruction_version', v_instruction_id,
    jsonb_build_object(
      'beneficiary_name', v_norm_beneficiary,
      'bank_name', v_norm_bank,
      'currency', v_norm_currency,
      'active_from', v_active_from,
      'active_to', v_active_to
    ));

  return v_instruction_id;
end;
$$;

-- admin_delete_payment_instruction: platform_admin deletes instruction version (only if not referenced)
create or replace function public.admin_delete_payment_instruction(_instruction_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_ref_count integer;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.status = 'active'
     )
     or not exists (select 1 from public.user_roles where user_id = v_actor and role = 'platform_admin') then
    raise exception 'An active platform administrator is required.' using errcode = '42501';
  end if;

  select count(*) into v_ref_count
  from public.orders
  where payment_instruction_version_id = _instruction_id;

  if v_ref_count > 0 then
    raise exception 'Cannot delete instruction version referenced by orders.' using errcode = 'P0001';
  end if;

  delete from public.payment_instruction_versions where id = _instruction_id;

  if not found then
    raise exception 'Payment instruction not found.' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (v_actor, 'payment_instruction.deleted', 'payment_instruction_version', _instruction_id, '{}'::jsonb);
end;
$$;

-- 7. RPC GRANTS (extended)

revoke all on function public.admin_list_payment_console_orders()
  from public, anon, authenticated;
grant execute on function public.admin_list_payment_console_orders()
  to authenticated;

revoke all on function public.admin_list_payment_instructions()
  from public, anon, authenticated;
grant execute on function public.admin_list_payment_instructions()
  to authenticated;

revoke all on function public.admin_save_payment_instruction(uuid, text, text, text, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_save_payment_instruction(uuid, text, text, text, text, text, timestamptz, timestamptz)
  to authenticated;

revoke all on function public.admin_delete_payment_instruction(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_delete_payment_instruction(uuid)
  to authenticated;

-- 8. STORAGE POLICIES for private-payment-receipts

-- Bucket already created in 20261013000000_v4_identity_companies_security.sql
-- Policies:
create policy receipts_owner_read
  on storage.objects for select to authenticated
  using (
    bucket_id = 'private-payment-receipts'
    and (auth.uid() = owner
         or public.has_platform_role('billing_admin')
         or public.has_platform_role('platform_admin'))
  );

create policy receipts_owner_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'private-payment-receipts'
    and auth.uid() = owner
  );

create policy receipts_owner_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'private-payment-receipts'
    and auth.uid() = owner
  )
  with check (
    bucket_id = 'private-payment-receipts'
    and auth.uid() = owner
  );

create policy receipts_admin_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'private-payment-receipts'
    and (public.has_platform_role('billing_admin')
         or public.has_platform_role('platform_admin'))
  );