begin;

create type public.order_status as enum (
  'awaiting_transfer',
  'payment_submitted',
  'payment_under_review',
  'paid',
  'rejected',
  'expired',
  'cancelled',
  'refund_pending',
  'refunded'
);

create type public.payment_submission_status as enum (
  'submitted',
  'under_review',
  'accepted',
  'rejected',
  'needs_more_information'
);

create type public.reconciliation_decision as enum ('accepted', 'rejected');

create type public.credit_entry_type as enum (
  'purchase_grant',
  'job_consume',
  'job_refund',
  'manual_adjustment',
  'expiry',
  'reversal'
);

create table public.payment_instruction_versions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_name text not null
    check (char_length(beneficiary_name) between 1 and 120),
  bank_name text not null check (char_length(bank_name) between 1 and 120),
  iban_restricted_value text not null
    check (char_length(iban_restricted_value) between 15 and 34),
  currency text not null default 'TRY'
    check (currency ~ '^[A-Z]{3}$'),
  instructions text check (instructions is null or char_length(instructions) <= 5000),
  active_from timestamptz not null default now(),
  active_to timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (active_to is null or active_to > active_from)
);

create index payment_instruction_versions_active_idx
  on public.payment_instruction_versions (active_from, active_to);
create index payment_instruction_versions_created_by_idx
  on public.payment_instruction_versions (created_by);
create unique index payment_instruction_versions_single_open_idx
  on public.payment_instruction_versions ((true))
  where active_to is null;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  status public.order_status not null default 'awaiting_transfer',
  total_minor integer not null check (total_minor > 0),
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  reference_code text not null unique
    check (char_length(reference_code) between 8 and 64),
  package_snapshot jsonb not null
    check (
      jsonb_typeof(package_snapshot) = 'object'
      and pg_catalog.pg_column_size(package_snapshot) <= 8192
    ),
  payment_instructions_version_id uuid not null
    references public.payment_instruction_versions (id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orders_company_status_idx on public.orders (company_id, status);
create index orders_payment_instructions_version_idx
  on public.orders (payment_instructions_version_id);
create index orders_expires_at_idx on public.orders (expires_at)
  where status in ('awaiting_transfer', 'payment_submitted', 'payment_under_review');
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  submitted_by uuid not null references public.profiles (id) on delete restrict,
  sender_name text not null check (char_length(sender_name) between 1 and 120),
  transfer_reference text not null
    check (char_length(transfer_reference) between 1 and 128),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'TRY' check (currency ~ '^[A-Z]{3}$'),
  transferred_at timestamptz not null,
  receipt_storage_path text
    check (receipt_storage_path is null or char_length(receipt_storage_path) <= 512),
  status public.payment_submission_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id)
);

create index payment_submissions_submitted_by_idx
  on public.payment_submissions (submitted_by);
create trigger payment_submissions_set_updated_at
  before update on public.payment_submissions
  for each row execute function public.set_updated_at();

create table public.payment_reconciliations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  submission_id uuid not null references public.payment_submissions (id) on delete restrict,
  reviewed_by uuid not null references auth.users (id) on delete restrict,
  decision public.reconciliation_decision not null,
  bank_reference_normalized text not null
    check (char_length(bank_reference_normalized) between 1 and 128),
  notes text check (notes is null or char_length(notes) <= 2000),
  reviewed_at timestamptz not null default now(),
  unique (submission_id),
  check (decision <> 'rejected' or nullif(btrim(notes), '') is not null)
);

create index payment_reconciliations_order_id_idx
  on public.payment_reconciliations (order_id);
create index payment_reconciliations_reviewed_by_idx
  on public.payment_reconciliations (reviewed_by);
create unique index payment_reconciliations_bank_ref_order_idx
  on public.payment_reconciliations (bank_reference_normalized, order_id)
  where decision = 'accepted';

create table public.credit_accounts (
  company_id uuid primary key references public.companies (id) on delete cascade,
  available_balance integer not null default 0 check (available_balance >= 0),
  updated_at timestamptz not null default now()
);

create trigger credit_accounts_set_updated_at
  before update on public.credit_accounts
  for each row execute function public.set_updated_at();

create table public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete restrict,
  order_id uuid references public.orders (id) on delete set null,
  job_id uuid references public.jobs (id) on delete set null,
  entry_type public.credit_entry_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 1 and 128),
  actor_id uuid not null references auth.users (id) on delete restrict,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index credit_ledger_entries_company_created_idx
  on public.credit_ledger_entries (company_id, created_at desc);
create index credit_ledger_entries_order_id_idx
  on public.credit_ledger_entries (order_id);
create index credit_ledger_entries_job_id_idx
  on public.credit_ledger_entries (job_id);
create index credit_ledger_entries_actor_id_idx
  on public.credit_ledger_entries (actor_id);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (char_length(event_type) between 1 and 100),
  aggregate_id uuid not null,
  payload_minimal jsonb not null
    check (
      jsonb_typeof(payload_minimal) = 'object'
      and pg_catalog.pg_column_size(payload_minimal) <= 16384
    ),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index outbox_events_unpublished_idx on public.outbox_events (created_at)
  where published_at is null;
create index outbox_events_aggregate_idx
  on public.outbox_events (aggregate_id, created_at);

alter table public.payment_instruction_versions enable row level security;
alter table public.payment_instruction_versions force row level security;
alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.payment_submissions enable row level security;
alter table public.payment_submissions force row level security;
alter table public.payment_reconciliations enable row level security;
alter table public.payment_reconciliations force row level security;
alter table public.credit_accounts enable row level security;
alter table public.credit_accounts force row level security;
alter table public.credit_ledger_entries enable row level security;
alter table public.credit_ledger_entries force row level security;
alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;

revoke all on table
  public.payment_instruction_versions,
  public.orders,
  public.payment_submissions,
  public.payment_reconciliations,
  public.credit_accounts,
  public.credit_ledger_entries,
  public.outbox_events
from public, anon, authenticated;

grant select on public.orders, public.payment_submissions,
  public.credit_accounts, public.credit_ledger_entries to authenticated;
grant select, insert on public.payment_submissions to service_role;
grant all on public.payment_instruction_versions, public.orders,
  public.payment_submissions, public.payment_reconciliations,
  public.credit_accounts, public.credit_ledger_entries, public.outbox_events
to service_role;

create policy orders_company_read
  on public.orders for select to authenticated
  using (public.is_active_company_member(
    company_id,
    array['owner', 'recruiter', 'billing']::public.company_role[]
  ));

create policy payment_submissions_company_read
  on public.payment_submissions for select to authenticated
  using (exists (
    select 1
    from public.orders as order_row
    where order_row.id = payment_submissions.order_id
      and public.is_active_company_member(
        order_row.company_id,
        array['owner', 'recruiter', 'billing']::public.company_role[]
      )
  ));

create policy credit_accounts_company_read
  on public.credit_accounts for select to authenticated
  using (public.is_active_company_member(
    company_id,
    array['owner', 'recruiter', 'billing']::public.company_role[]
  ));

create policy credit_ledger_company_read
  on public.credit_ledger_entries for select to authenticated
  using (public.is_active_company_member(
    company_id,
    array['owner', 'recruiter', 'billing']::public.company_role[]
  ));

create or replace function public.create_order(
  _company_id uuid,
  _listing_plan_code text,
  _duration_days integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  plan_row record;
  instruction_row public.payment_instruction_versions%rowtype;
  price_minor integer;
  created_id uuid;
begin
  if auth.role() <> 'authenticated'
     or actor_id is null
     or not public.is_active_company_member(
       _company_id,
       array['owner', 'recruiter', 'billing']::public.company_role[]
     )
     or not exists (
       select 1
       from public.companies as company_row
       where company_row.id = _company_id
         and company_row.verification_status = 'verified'
     )
     or _duration_days not in (1, 7, 30)
  then
    raise exception 'An authorized active company member and a supported duration are required.'
      using errcode = '42501';
  end if;

  select code, name, listing_count, price_1, price_7, price_30
  into plan_row
  from public.listing_plans
  where code = _listing_plan_code
    and audience = 'employer'
    and is_active;

  if not found or plan_row.listing_count is null then
    raise exception 'The selected listing plan is unavailable.'
      using errcode = '22023';
  end if;

  price_minor := case _duration_days
    when 1 then plan_row.price_1
    when 7 then plan_row.price_7
    else plan_row.price_30
  end;
  if price_minor <= 0 then
    raise exception 'The selected listing plan has no payable price.'
      using errcode = '22023';
  end if;

  select *
  into instruction_row
  from public.payment_instruction_versions
  where active_from <= now()
    and (active_to is null or active_to > now())
  order by active_from desc, created_at desc
  limit 1
  for share;

  if not found then
    raise exception 'Payment instructions are not configured.'
      using errcode = '55000';
  end if;

  insert into public.orders (
    company_id, total_minor, currency, reference_code, package_snapshot,
    payment_instructions_version_id, expires_at
  )
  values (
    _company_id,
    price_minor,
    instruction_row.currency,
    'ORD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    jsonb_build_object(
      'plan_code', plan_row.code,
      'name', plan_row.name,
      'job_credits', plan_row.listing_count,
      'duration_days', _duration_days,
      'total_minor', price_minor,
      'currency', instruction_row.currency
    ),
    instruction_row.id,
    now() + interval '48 hours'
  )
  returning id into created_id;

  insert into public.credit_accounts (company_id)
  values (_company_id)
  on conflict (company_id) do nothing;

  insert into public.outbox_events (event_type, aggregate_id, payload_minimal)
  values (
    'billing.order_created',
    created_id,
    jsonb_build_object('company_id', _company_id, 'status', 'awaiting_transfer')
  );

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  )
  values (
    actor_id,
    'billing.order_created',
    'order',
    created_id,
    jsonb_build_object('company_id', _company_id, 'plan_code', plan_row.code)
  );

  return created_id;
end;
$$;

create or replace function public.submit_payment(
  _order_id uuid,
  _sender_name text,
  _transfer_reference text,
  _amount_minor integer,
  _currency text,
  _transferred_at timestamptz,
  _receipt_storage_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  order_row public.orders%rowtype;
  created_id uuid;
begin
  if auth.role() <> 'authenticated' or actor_id is null then
    raise exception 'A verified company session is required.'
      using errcode = '42501';
  end if;

  select *
  into order_row
  from public.orders
  where id = _order_id
  for update;

  if not found
     or not public.is_active_company_member(
       order_row.company_id,
       array['owner', 'recruiter', 'billing']::public.company_role[]
     )
     or order_row.status not in ('awaiting_transfer', 'payment_submitted')
     or order_row.expires_at <= now()
     or _currency <> order_row.currency
     or _receipt_storage_path is not null
  then
    raise exception 'The order cannot accept this payment submission.'
      using errcode = '42501';
  end if;

  insert into public.payment_submissions (
    order_id, submitted_by, sender_name, transfer_reference, amount_minor,
    currency, transferred_at
  )
  values (
    _order_id, actor_id, btrim(_sender_name), btrim(_transfer_reference),
    _amount_minor, _currency, _transferred_at
  )
  returning id into created_id;

  update public.orders
  set status = 'payment_submitted'
  where id = _order_id;

  insert into public.outbox_events (event_type, aggregate_id, payload_minimal)
  values (
    'billing.payment_submitted',
    _order_id,
    jsonb_build_object('submission_id', created_id, 'company_id', order_row.company_id)
  );

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  )
  values (
    actor_id,
    'billing.payment_submitted',
    'order',
    _order_id,
    jsonb_build_object('submission_id', created_id)
  );

  return created_id;
end;
$$;

create or replace function public.get_order_payment_instructions(_order_id uuid)
returns table (
  beneficiary_name text,
  bank_name text,
  iban_restricted_value text,
  currency text,
  instructions text,
  reference_code text,
  total_minor integer,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'authenticated'
     or not exists (
       select 1
       from public.orders as order_row
       where order_row.id = _order_id
         and public.is_active_company_member(
           order_row.company_id,
           array['owner', 'recruiter', 'billing']::public.company_role[]
         )
     )
  then
    raise exception 'The order is not available to this company member.'
      using errcode = '42501';
  end if;

  return query
  select instruction_row.beneficiary_name,
         instruction_row.bank_name,
         instruction_row.iban_restricted_value,
         order_row.currency,
         instruction_row.instructions,
         order_row.reference_code,
         order_row.total_minor,
         order_row.expires_at
  from public.orders as order_row
  join public.payment_instruction_versions as instruction_row
    on instruction_row.id = order_row.payment_instructions_version_id
  where order_row.id = _order_id;
end;
$$;

create or replace function public.admin_save_payment_instructions(
  _beneficiary_name text,
  _bank_name text,
  _iban_restricted_value text,
  _currency text default 'TRY',
  _instructions text default null,
  _active_from timestamptz default now(),
  _active_to timestamptz default null,
  _created_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  effective_actor uuid;
  created_id uuid;
begin
  if auth.role() = 'service_role' then
    effective_actor := _created_by;
  elsif auth.role() = 'authenticated'
        and public.has_platform_role('platform_admin') then
    effective_actor := actor_id;
  else
    raise exception 'An MFA-verified platform administrator is required.'
      using errcode = '42501';
  end if;

  if effective_actor is null or not exists (
    select 1 from auth.users where id = effective_actor
  ) then
    raise exception 'A valid payment-instruction actor is required.'
      using errcode = '22023';
  end if;

  update public.payment_instruction_versions
  set active_to = _active_from
  where active_from < _active_from
    and (active_to is null or active_to > _active_from);

  insert into public.payment_instruction_versions (
    beneficiary_name, bank_name, iban_restricted_value, currency,
    instructions, active_from, active_to, created_by
  )
  values (
    btrim(_beneficiary_name), btrim(_bank_name), upper(btrim(_iban_restricted_value)),
    _currency, nullif(btrim(_instructions), ''), _active_from, _active_to, effective_actor
  )
  returning id into created_id;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (
    effective_actor,
    'payment_instructions.updated',
    'payment_instruction_version',
    created_id,
    jsonb_build_object('currency', _currency)
  );

  return created_id;
end;
$$;

create or replace function public.admin_reconcile_payment(
  _order_id uuid,
  _submission_id uuid,
  _decision public.reconciliation_decision,
  _bank_reference_normalized text,
  _notes text default null,
  _reviewed_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  effective_actor uuid;
  order_row public.orders%rowtype;
  submission_row public.payment_submissions%rowtype;
  credit_count integer;
begin
  if auth.role() = 'service_role' then
    effective_actor := _reviewed_by;
  elsif auth.role() = 'authenticated'
        and public.has_platform_role('platform_admin') then
    effective_actor := actor_id;
  else
    raise exception 'An MFA-verified payment operator is required.'
      using errcode = '42501';
  end if;

  if effective_actor is null or not exists (
    select 1 from auth.users where id = effective_actor
  ) then
    raise exception 'A valid reconciliation actor is required.'
      using errcode = '22023';
  end if;

  select * into order_row
  from public.orders
  where id = _order_id
  for update;

  select * into submission_row
  from public.payment_submissions
  where id = _submission_id and order_id = _order_id
  for update;

  if order_row.id is null
     or submission_row.id is null
     or order_row.status <> 'payment_under_review'
  then
    raise exception 'The payment is not available for reconciliation.'
      using errcode = '22023';
  end if;

  if _decision = 'rejected' and nullif(btrim(_notes), '') is null then
    raise exception 'A rejection reason is required.'
      using errcode = '22023';
  end if;

  if _decision = 'accepted'
     and (
       submission_row.amount_minor <> order_row.total_minor
       or submission_row.currency <> order_row.currency
     )
  then
    raise exception 'The submitted transfer does not match the order amount and currency.'
      using errcode = '22023';
  end if;

  insert into public.payment_reconciliations (
    order_id, submission_id, reviewed_by, decision,
    bank_reference_normalized, notes
  )
  values (
    _order_id, _submission_id, effective_actor, _decision,
    upper(btrim(_bank_reference_normalized)), nullif(btrim(_notes), '')
  );

  if _decision = 'accepted' then
    credit_count := (order_row.package_snapshot ->> 'job_credits')::integer;
    if credit_count <= 0 then
      raise exception 'The order package has invalid credit quantity.'
        using errcode = '23514';
    end if;

    insert into public.credit_accounts (company_id, available_balance)
    values (order_row.company_id, credit_count)
    on conflict (company_id)
    do update set available_balance =
      public.credit_accounts.available_balance + excluded.available_balance;

    insert into public.credit_ledger_entries (
      company_id, order_id, entry_type, quantity_delta,
      idempotency_key, actor_id, reason
    )
    values (
      order_row.company_id, _order_id, 'purchase_grant', credit_count,
      'purchase:' || _order_id::text, effective_actor, 'Verified bank payment'
    );

    update public.orders set status = 'paid' where id = _order_id;
    update public.payment_submissions set status = 'accepted'
    where id = _submission_id;
  else
    update public.orders set status = 'rejected' where id = _order_id;
    update public.payment_submissions set status = 'rejected'
    where id = _submission_id;
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id, metadata_redacted)
  values (
    effective_actor,
    'payment.reconciled',
    'order',
    _order_id,
    jsonb_build_object('decision', _decision, 'submission_id', _submission_id)
  );

  insert into public.outbox_events (event_type, aggregate_id, payload_minimal)
  values (
    'billing.payment_reconciled',
    _order_id,
    jsonb_build_object('decision', _decision, 'company_id', order_row.company_id)
  );
end;
$$;

create or replace function public.review_payment_submission(
  _order_id uuid,
  _submission_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if auth.role() <> 'authenticated'
     or not public.has_platform_role('platform_admin')
  then
    raise exception 'An MFA-verified payment operator is required.'
      using errcode = '42501';
  end if;

  update public.orders
  set status = 'payment_under_review'
  where id = _order_id and status = 'payment_submitted';

  if not found then
    raise exception 'The order is not awaiting payment review.'
      using errcode = '22023';
  end if;

  update public.payment_submissions
  set status = 'under_review'
  where id = _submission_id
    and order_id = _order_id
    and status = 'submitted';

  if not found then
    raise exception 'The payment submission is not awaiting review.'
      using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_id, action, resource_type, resource_id)
  values (actor_id, 'payment.review_started', 'order', _order_id);
end;
$$;

create or replace function public.get_company_credit_ledger(
  _company_id uuid,
  _limit integer default 50,
  _offset integer default 0
)
returns table (
  id uuid,
  company_id uuid,
  order_id uuid,
  job_id uuid,
  entry_type public.credit_entry_type,
  quantity_delta integer,
  idempotency_key text,
  actor_id uuid,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'authenticated'
     or (
       not public.is_active_company_member(
         _company_id,
         array['owner', 'recruiter', 'billing']::public.company_role[]
       )
       and not public.has_platform_role('platform_admin')
     )
     or _limit < 1 or _limit > 100 or _offset < 0
  then
    raise exception 'An authorized company member and valid page are required.'
      using errcode = '42501';
  end if;

  return query
  select entry.id, entry.company_id, entry.order_id, entry.job_id,
         entry.entry_type, entry.quantity_delta, entry.idempotency_key,
         entry.actor_id, entry.reason, entry.created_at
  from public.credit_ledger_entries as entry
  where entry.company_id = _company_id
  order by entry.created_at desc, entry.id desc
  limit _limit offset _offset;
end;
$$;

create or replace function public.adjust_credit_balance(
  _company_id uuid,
  _quantity_delta integer,
  _entry_type public.credit_entry_type,
  _idempotency_key text,
  _reason text,
  _actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  effective_actor uuid;
begin
  if auth.role() = 'service_role' then
    effective_actor := _actor_id;
  elsif auth.role() = 'authenticated'
        and public.has_platform_role('billing_admin') then
    effective_actor := actor_id;
  else
    raise exception 'An MFA-verified billing administrator is required.'
      using errcode = '42501';
  end if;

  if effective_actor is null
     or _quantity_delta = 0
     or _entry_type not in ('manual_adjustment', 'reversal', 'expiry')
     or nullif(btrim(_reason), '') is null
     or not exists (select 1 from auth.users where id = effective_actor)
  then
    raise exception 'The credit adjustment is invalid.'
      using errcode = '22023';
  end if;

  insert into public.credit_accounts (company_id)
  values (_company_id)
  on conflict (company_id) do nothing;

  update public.credit_accounts
  set available_balance = available_balance + _quantity_delta
  where company_id = _company_id
    and available_balance + _quantity_delta >= 0;

  if not found then
    raise exception 'The adjustment would make the credit balance negative.'
      using errcode = '23514';
  end if;

  insert into public.credit_ledger_entries (
    company_id, entry_type, quantity_delta, idempotency_key, actor_id, reason
  )
  values (
    _company_id, _entry_type, _quantity_delta, btrim(_idempotency_key),
    effective_actor, btrim(_reason)
  );

  insert into public.audit_logs (actor_id, action, resource_type, metadata_redacted)
  values (
    effective_actor,
    'credit.balance_adjusted',
    'credit_account',
    jsonb_build_object('company_id', _company_id, 'entry_type', _entry_type)
  );
end;
$$;

create or replace function public.publish_outbox_event(
  _event_type text,
  _aggregate_id uuid,
  _payload_minimal jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the outbox publisher may create events.'
      using errcode = '42501';
  end if;

  insert into public.outbox_events (event_type, aggregate_id, payload_minimal)
  values (_event_type, _aggregate_id, _payload_minimal)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.prevent_credit_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Credit ledger rows are immutable.'
    using errcode = '55000';
end;
$$;

create trigger credit_ledger_entries_immutable
  before update or delete on public.credit_ledger_entries
  for each row execute function public.prevent_credit_ledger_mutation();

revoke all on function public.create_order(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.submit_payment(uuid, text, text, integer, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.get_order_payment_instructions(uuid)
  from public, anon, authenticated;
revoke all on function public.admin_save_payment_instructions(text, text, text, text, text, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.admin_reconcile_payment(uuid, uuid, public.reconciliation_decision, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.review_payment_submission(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_company_credit_ledger(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.adjust_credit_balance(uuid, integer, public.credit_entry_type, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.publish_outbox_event(text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.prevent_credit_ledger_mutation()
  from public, anon, authenticated;

grant execute on function public.create_order(uuid, text, integer) to authenticated;
grant execute on function public.submit_payment(uuid, text, text, integer, text, timestamptz, text)
  to authenticated;
grant execute on function public.get_order_payment_instructions(uuid) to authenticated;
grant execute on function public.admin_save_payment_instructions(text, text, text, text, text, timestamptz, timestamptz, uuid)
  to authenticated, service_role;
grant execute on function public.admin_reconcile_payment(uuid, uuid, public.reconciliation_decision, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.review_payment_submission(uuid, uuid)
  to authenticated;
grant execute on function public.get_company_credit_ledger(uuid, integer, integer)
  to authenticated;
grant execute on function public.adjust_credit_balance(uuid, integer, public.credit_entry_type, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.publish_outbox_event(text, uuid, jsonb)
  to service_role;

commit;
