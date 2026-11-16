begin;

-- This suite tests the manual IBAN payment system:
-- orders, payment_submissions, payment_reconciliations,
-- credit_accounts, credit_ledger_entries, and the
-- reconcile_payment / create_order / submit_payment RPCs.
-- It clears any seed data that might conflict; the
-- transaction rolls back, leaving the seed intact.

delete from public.job_source_imports;
delete from public.jobs where publication_source = 'source_site';
delete from public.companies where slug like 'source-%';

select plan(85);

-- 1. FIXTURES: users, roles, companies, memberships, packages, assignments
insert into auth.users (id, email, raw_user_meta_data)
values
  ('90000000-0000-4000-8000-000000000001', 'billing-owner-a@example.test', '{"display_name":"Billing Owner A"}'),
  ('90000000-0000-4000-8000-000000000002', 'billing-owner-b@example.test', '{"display_name":"Billing Owner B"}'),
  ('90000000-0000-4000-8000-000000000003', 'billing-admin@example.test', '{"display_name":"Billing Admin"}'),
  ('90000000-0000-4000-8000-000000000004', 'platform-admin@example.test', '{"display_name":"Platform Admin"}'),
  ('90000000-0000-4000-8000-000000000005', 'recruiter-member@example.test', '{"display_name":"Recruiter Member"}'),
  ('90000000-0000-4000-8000-000000000006', 'unrelated-user@example.test', '{"display_name":"Unrelated User"}');

insert into public.user_roles (user_id, role)
values
  ('90000000-0000-4000-8000-000000000003', 'billing_admin'),
  ('90000000-0000-4000-8000-000000000004', 'platform_admin');

insert into public.companies (id, name, slug, verification_status)
values
  ('a0000000-0000-4000-8000-000000000001', 'Verified Company A', 'verified-company-a', 'verified'),
  ('a0000000-0000-4000-8000-000000000002', 'Verified Company B', 'verified-company-b', 'verified'),
  ('a0000000-0000-4000-8000-000000000003', 'Pending Company C', 'pending-company-c', 'pending');

insert into public.company_members (company_id, user_id, membership_role)
values
  ('a0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'owner'),
  ('a0000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000005', 'recruiter'),
  ('a0000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', 'owner');

-- Create package and assignment via admin (AAL2)
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}';

select set_config(
  'test.payment_package_id',
  public.admin_save_job_package(
    null, 'starter-payment', 'Starter Payment', 'Package for payment tests.',
    5, 30, true
  )::text,
  true
);

select lives_ok(
  $$select public.admin_assign_company_job_package(
      'a0000000-0000-4000-8000-000000000001',
      current_setting('test.payment_package_id')::uuid,
      null
    )$$,
  'admin can assign package to verified company for payment tests'
);

-- Create active payment instruction (admin only)
select lives_ok(
  $$insert into public.payment_instruction_versions (
      beneficiary_name, bank_name, iban_restricted_value, currency, instructions,
      active_from, created_by
    ) values (
      'Test Beneficiary', 'Test Bank', 'TR123456789012345678901234', 'TRY',
      'Transfer description must include company name.',
      now(), '90000000-0000-4000-8000-000000000004'
    )$$,
  'admin can create active payment instruction'
);

select set_config(
  'test.payment_instruction_id',
  (select id::text from public.payment_instruction_versions
   where active_from <= now() and (active_to is null or active_to > now())
   order by active_from desc limit 1),
  true
);

reset role;

-- 2. RLS: authenticated users cannot directly read/write payment tables
select ok(
  not has_table_privilege('authenticated', 'public.orders', 'SELECT'),
  'authenticated users receive no direct orders table SELECT'
);
select ok(
  not has_table_privilege('authenticated', 'public.payment_submissions', 'SELECT'),
  'authenticated users receive no direct payment_submissions table SELECT'
);
select ok(
  not has_table_privilege('authenticated', 'public.payment_reconciliations', 'SELECT'),
  'authenticated users receive no direct payment_reconciliations table SELECT'
);
select ok(
  not has_table_privilege('authenticated', 'public.credit_accounts', 'SELECT'),
  'authenticated users receive no direct credit_accounts table SELECT'
);
select ok(
  not has_table_privilege('authenticated', 'public.credit_ledger_entries', 'SELECT'),
  'authenticated users receive no direct credit_ledger_entries table SELECT'
);
select ok(
  not has_table_privilege('authenticated', 'public.payment_instruction_versions', 'SELECT'),
  'authenticated users receive no direct payment_instruction_versions table SELECT'
);

-- anon also has no access
select ok(
  not has_table_privilege('anon', 'public.orders', 'SELECT'),
  'anon users receive no direct orders table SELECT'
);
select ok(
  not has_table_privilege('anon', 'public.payment_submissions', 'SELECT'),
  'anon users receive no direct payment_submissions table SELECT'
);
select ok(
  not has_table_privilege('anon', 'public.payment_reconciliations', 'SELECT'),
  'anon users receive no direct payment_reconciliations table SELECT'
);
select ok(
  not has_table_privilege('anon', 'public.credit_accounts', 'SELECT'),
  'anon users receive no direct credit_accounts table SELECT'
);
select ok(
  not has_table_privilege('anon', 'public.credit_ledger_entries', 'SELECT'),
  'anon users receive no direct credit_ledger_entries table SELECT'
);

-- 3. create_order RPC: company billing/owner can create order
set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config(
  'test.order_a_id',
  public.create_order(
    'a0000000-0000-4000-8000-000000000001',
    current_setting('test.payment_package_id')::uuid
  )::text,
  true
);

select is(
  (select status from public.orders where id = current_setting('test.order_a_id')::uuid),
  'awaiting_transfer',
  'new order starts in awaiting_transfer status'
);

select is(
  (select total_minor from public.orders where id = current_setting('test.order_a_id')::uuid),
  (select price_minor from public.job_packages where id = current_setting('test.payment_package_id')::uuid),
  'order total_minor matches package price_minor'
);

select is(
  (select currency from public.orders where id = current_setting('test.order_a_id')::uuid),
  (select currency from public.job_packages where id = current_setting('test.payment_package_id')::uuid),
  'order currency matches package currency'
);

select is(
  (select reference_code from public.orders where id = current_setting('test.order_a_id')::uuid) ~ '^ORD-[0-9]{8}-[A-F0-9]{6}$',
  true,
  'order reference_code follows ORD-YYYYMMDD-XXXXXX format'
);

select is(
  (select payment_instruction_version_id from public.orders where id = current_setting('test.order_a_id')::uuid)::text,
  current_setting('test.payment_instruction_id'),
  'order references active payment instruction version'
);

select ok(
  (select package_snapshot from public.orders where id = current_setting('test.order_a_id')::uuid) ? 'job_credits',
  'package_snapshot includes job_credits'
);

select ok(
  (select package_snapshot->>'code' from public.orders where id = current_setting('test.order_a_id')::uuid) = 'starter-payment',
  'package_snapshot captures package code'
);

-- 4. create_order RPC: rejected for non-member / unverified company / non-billing roles
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000005","role":"authenticated"}';

select throws_ok(
  $$select public.create_order(
      'a0000000-0000-4000-8000-000000000001',
      current_setting('test.payment_package_id')::uuid
    )$$,
  '42501',
  null,
  'recruiter (non-billing) cannot create order'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}';

select throws_ok(
  $$select public.create_order(
      'a0000000-0000-4000-8000-000000000001',
      current_setting('test.payment_package_id')::uuid
    )$$,
  '42501',
  null,
  'unrelated user cannot create order for company'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.create_order(
      'a0000000-0000-4000-8000-000000000003',
      current_setting('test.payment_package_id')::uuid
    )$$,
  '42501',
  null,
  'cannot create order for unverified company'
);

select throws_ok(
  $$select public.create_order(
      'a0000000-0000-4000-8000-000000000001',
      '00000000-0000-0000-0000-000000000000'::uuid
    )$$,
  '22023',
  null,
  'cannot create order for non-existent package'
);

-- 5. submit_payment RPC: company member submits transfer info
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config(
  'test.submission_a_id',
  public.submit_payment(
    current_setting('test.order_a_id')::uuid,
    'Test Sender Name',
    'EFT123456789',
    29900,
    'TRY',
    now() - interval '1 hour',
    'private-payment-receipts/90000000-0000-4000-8000-000000000001/receipt-1.pdf'
  )::text,
  true
);

select is(
  (select status from public.payment_submissions where id = current_setting('test.submission_a_id')::uuid),
  'submitted',
  'new submission starts in submitted status'
);

select is(
  (select status from public.orders where id = current_setting('test.order_a_id')::uuid),
  'payment_submitted',
  'order status advances to payment_submitted after submission'
);

select is(
  (select transfer_reference from public.payment_submissions where id = current_setting('test.submission_a_id')::uuid),
  'EFT123456789',
  'transfer_reference is normalized to uppercase'
);

-- 6. submit_payment RPC: rejected for wrong order state / wrong company / bad data
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Create second order for Company A
select set_config(
  'test.order_b_id',
  public.create_order(
    'a0000000-0000-4000-8000-000000000001',
    current_setting('test.payment_package_id')::uuid
  )::text,
  true
);

-- Try to submit for order already in payment_submitted
select throws_ok(
  $$select public.submit_payment(
      current_setting('test.order_a_id')::uuid,
      'Another Sender',
      'EFT999999999',
      29900,
      'TRY',
      now() - interval '1 hour',
      null
    )$$,
  'P0001',
  null,
  'cannot submit payment for order not in awaiting_transfer'
);

-- Unrelated user cannot submit
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}';

select throws_ok(
  $$select public.submit_payment(
      current_setting('test.order_a_id')::uuid,
      'Unauthorized Sender',
      'EFT888888888',
      29900,
      'TRY',
      now() - interval '1 hour',
      null
    )$$,
  '42501',
  null,
  'unrelated user cannot submit payment for company order'
);

-- Invalid amount
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.submit_payment(
      current_setting('test.order_b_id')::uuid,
      'Test Sender',
      'EFT777777777',
      0,
      'TRY',
      now() - interval '1 hour',
      null
    )$$,
  '22023',
  null,
  'submission rejects zero amount'
);

-- Future transfer date
select throws_ok(
  $$select public.submit_payment(
      current_setting('test.order_b_id')::uuid,
      'Test Sender',
      'EFT666666666',
      29900,
      'TRY',
      now() + interval '2 days',
      null
    )$$,
  '22023',
  null,
  'submission rejects future transfer date'
);

-- 7. get_my_orders RPC: company member lists their orders
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.get_my_orders('a0000000-0000-4000-8000-000000000001')),
  2,
  'company owner sees both orders'
);

select is(
  (select count(*)::integer from public.get_my_orders('a0000000-0000-4000-8000-000000000002')),
  0,
  'company owner sees only their own company orders'
);

-- Unrelated user cannot list
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000006","role":"authenticated"}';

select throws_ok(
  $$select public.get_my_orders('a0000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'unrelated user cannot list company orders'
);

-- 8. get_active_payment_instruction RPC: masked for company, full for admin
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select iban_display from public.get_active_payment_instruction(false)),
  '**** **** **** 1234',
  'company member gets masked IBAN (last 4 only)'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select is(
  (select iban_display from public.get_active_payment_instruction(true)),
  'TR123456789012345678901234',
  'billing_admin with AAL2 gets full IBAN'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.get_active_payment_instruction(true)$$,
  '42501',
  null,
  'company member cannot request full IBAN'
);

-- 9. reconcile_payment RPC: AAL2 + billing_admin required
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.reconcile_payment(
      'reconcile:test:accepted',
      current_setting('test.submission_a_id')::uuid,
      'accepted',
      'BANKREF123',
      null
    )$$,
  '42501',
  null,
  'non-admin cannot reconcile payment'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}';

select throws_ok(
  $$select public.reconcile_payment(
      'reconcile:test:accepted',
      current_setting('test.submission_a_id')::uuid,
      'accepted',
      'BANKREF123',
      null
    )$$,
  '42501',
  null,
  'billing_admin without AAL2 cannot reconcile payment'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

-- 10. reconcile_payment: idempotency key prevents double processing
select lives_ok(
  $$select public.reconcile_payment(
      'reconcile:test-1:accepted',
      current_setting('test.submission_a_id')::uuid,
      'accepted',
      'BANKREF123',
      'Bank reference verified'
    )$$,
  'first reconciliation succeeds'
);

select throws_ok(
  $$select public.reconcile_payment(
      'reconcile:test-1:accepted',
      current_setting('test.submission_a_id')::uuid,
      'accepted',
      'BANKREF123',
      'Duplicate attempt'
    )$$,
  'P0001',
  null,
  'second reconciliation with same idempotency key fails'
);

-- Verify order is paid, submission accepted, ledger entry created
select is(
  (select status from public.orders where id = current_setting('test.order_a_id')::uuid),
  'paid',
  'order status becomes paid after accepted reconciliation'
);

select is(
  (select status from public.payment_submissions where id = current_setting('test.submission_a_id')::uuid),
  'accepted',
  'submission status becomes accepted'
);

select is(
  (select count(*)::integer from public.credit_ledger_entries
   where company_id = 'a0000000-0000-4000-8000-000000000001'
     and entry_type = 'purchase_grant'
     and idempotency_key = 'reconcile:test-1:accepted'),
  1,
  'exactly one credit ledger entry created for grant'
);

select is(
  (select quantity_delta from public.credit_ledger_entries
   where idempotency_key = 'reconcile:test-1:accepted'),
  5,
  'ledger quantity_delta matches package job_credits (5)'
);

select is(
  (select available_balance from public.credit_accounts
   where company_id = 'a0000000-0000-4000-8000-000000000001'),
  5,
  'credit_accounts balance updated to 5'
);

select is(
  (select bank_reference_normalized from public.payment_reconciliations
   where submission_id = current_setting('test.submission_a_id')::uuid),
  'BANKREF123',
  'bank_reference_normalized stored uppercase'
);

-- 11. reconcile_payment: rejected decision
-- Create new order + submission for Company B
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';

select set_config(
  'test.order_c_id',
  public.create_order(
    'a0000000-0000-4000-8000-000000000002',
    current_setting('test.payment_package_id')::uuid
  )::text,
  true
);

select set_config(
  'test.submission_b_id',
  public.submit_payment(
    current_setting('test.order_c_id')::uuid,
    'Sender B',
    'EFTB123456',
    29900,
    'TRY',
    now() - interval '1 hour',
    null
  )::text,
  true
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.reconcile_payment(
      'reconcile:test-2:rejected',
      current_setting('test.submission_b_id')::uuid,
      'rejected',
      'BANKREF456',
      'Insufficient proof'
    )$$,
  'rejected reconciliation succeeds'
);

select is(
  (select status from public.orders where id = current_setting('test.order_c_id')::uuid),
  'rejected',
  'order status becomes rejected'
);

select is(
  (select status from public.payment_submissions where id = current_setting('test.submission_b_id')::uuid),
  'rejected',
  'submission status becomes rejected'
);

select is(
  (select count(*)::integer from public.credit_ledger_entries
   where company_id = 'a0000000-0000-4000-8000-000000000002'
     and entry_type = 'purchase_grant'),
  0,
  'no credit ledger entry for rejected payment'
);

-- 12. reconcile_payment: needs_more_info decision
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';

select set_config(
  'test.order_d_id',
  public.create_order(
    'a0000000-0000-4000-8000-000000000002',
    current_setting('test.payment_package_id')::uuid
  )::text,
  true
);

select set_config(
  'test.submission_c_id',
  public.submit_payment(
    current_setting('test.order_d_id')::uuid,
    'Sender C',
    'EFTC789012',
    29900,
    'TRY',
    now() - interval '1 hour',
    null
  )::text,
  true
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.reconcile_payment(
      'reconcile:test-3:needs_more_info',
      current_setting('test.submission_c_id')::uuid,
      'needs_more_info',
      'BANKREF789',
      'Please provide full bank statement'
    )$$,
  'needs_more_info reconciliation succeeds'
);

select is(
  (select status from public.orders where id = current_setting('test.order_d_id')::uuid),
  'payment_submitted',
  'order status remains payment_submitted for needs_more_info'
);

select is(
  (select status from public.payment_submissions where id = current_setting('test.submission_c_id')::uuid),
  'needs_more_info',
  'submission status becomes needs_more_info'
);

-- 13. reconcile_payment: bank reference uniqueness across accepted payments
-- Try to use same bank reference for another order
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config(
  'test.order_e_id',
  public.create_order(
    'a0000000-0000-4000-8000-000000000001',
    current_setting('test.payment_package_id')::uuid
  )::text,
  true
);

select set_config(
  'test.submission_d_id',
  public.submit_payment(
    current_setting('test.order_e_id')::uuid,
    'Sender D',
    'EFTD345678',
    29900,
    'TRY',
    now() - interval '1 hour',
    null
  )::text,
  true
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$select public.reconcile_payment(
      'reconcile:test-4:accepted',
      current_setting('test.submission_d_id')::uuid,
      'accepted',
      'BANKREF123',  -- Same as first accepted reconciliation
      'Attempt duplicate bank ref'
    )$$,
  'P0001',
  null,
  'cannot accept payment with bank reference already used for another accepted payment'
);

-- 14. reconcile_payment: amount/currency mismatch validation
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config(
  'test.order_f_id',
  public.create_order(
    'a0000000-0000-4000-8000-000000000001',
    current_setting('test.payment_package_id')::uuid
  )::text,
  true
);

select set_config(
  'test.submission_e_id',
  public.submit_payment(
    current_setting('test.order_f_id')::uuid,
    'Sender E',
    'EFTE901234',
    10000,  -- Wrong amount
    'TRY',
    now() - interval '1 hour',
    null
  )::text,
  true
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$select public.reconcile_payment(
      'reconcile:test-5:accepted',
      current_setting('test.submission_e_id')::uuid,
      'accepted',
      'BANKREF999',
      'Wrong amount test'
    )$$,
  '22023',
  null,
  'reconciliation rejects amount mismatch'
);

-- 15. credit_ledger_entries: append-only (no UPDATE/DELETE)
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$update public.credit_ledger_entries set quantity_delta = 10 where idempotency_key = 'reconcile:test-1:accepted'$$,
  '42501',
  null,
  'credit_ledger_entries cannot be updated directly'
);

select throws_ok(
  $$delete from public.credit_ledger_entries where idempotency_key = 'reconcile:test-1:accepted'$$,
  '42501',
  null,
  'credit_ledger_entries cannot be deleted directly'
);

-- 16. credit_accounts: balance matches ledger sum
select is(
  (select available_balance from public.credit_accounts
   where company_id = 'a0000000-0000-4000-8000-000000000001'),
  (select sum(quantity_delta)::integer from public.credit_ledger_entries
   where company_id = 'a0000000-0000-4000-8000-000000000001'),
  'credit_accounts balance equals sum of credit_ledger_entries for Company A'
);

-- 17. RLS: billing_admin can read all reconciliations/ledger
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select is(
  (select count(*)::integer from public.payment_reconciliations),
  3,
  'billing_admin can read all payment_reconciliations'
);

select is(
  (select count(*)::integer from public.credit_ledger_entries),
  1,
  'billing_admin can read all credit_ledger_entries'
);

-- 18. RLS: platform_admin can read all reconciliations/ledger
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}';

select is(
  (select count(*)::integer from public.payment_reconciliations),
  3,
  'platform_admin can read all payment_reconciliations'
);

select is(
  (select count(*)::integer from public.credit_ledger_entries),
  1,
  'platform_admin can read all credit_ledger_entries'
);

-- 19. RLS: company member can read only their company ledger/orders
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::integer from public.credit_ledger_entries),
  1,
  'company owner sees only their company ledger entries'
);

select is(
  (select count(*)::integer from public.orders),
  3,
  'company owner sees only their company orders (A has 3, B has 2)'
);

set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer from public.credit_ledger_entries),
  0,
  'Company B owner sees no ledger entries (all rejected/pending)'
);

-- 20. Direct table writes blocked for authenticated users
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$insert into public.orders (company_id, package_id, status, total_minor, currency, reference_code, package_snapshot, expires_at)
    values ('a0000000-0000-4000-8000-000000000001', current_setting('test.payment_package_id')::uuid, 'awaiting_transfer', 29900, 'TRY', 'ORD-20261116-TEST01', '{}'::jsonb, now() + interval '7 days')$$,
  '42501',
  null,
  'authenticated users cannot directly insert orders'
);

select throws_ok(
  $$insert into public.payment_submissions (order_id, submitted_by, sender_name, transfer_reference, amount_minor, currency, transferred_at)
    values (current_setting('test.order_a_id')::uuid, '90000000-0000-4000-8000-000000000001', 'Test', 'EFTTEST', 29900, 'TRY', now())$$,
  '42501',
  null,
  'authenticated users cannot directly insert payment_submissions'
);

select throws_ok(
  $$insert into public.payment_reconciliations (order_id, submission_id, reviewed_by, decision, bank_reference_normalized)
    values (current_setting('test.order_a_id')::uuid, current_setting('test.submission_a_id')::uuid, '90000000-0000-4000-8000-000000000001', 'accepted', 'BANKREFTEST')$$,
  '42501',
  null,
  'authenticated users cannot directly insert payment_reconciliations'
);

select throws_ok(
  $$insert into public.credit_ledger_entries (company_id, entry_type, quantity_delta, idempotency_key, actor_id, reason)
    values ('a0000000-0000-4000-8000-000000000001', 'purchase_grant', 5, 'manual:test', '90000000-0000-4000-8000-000000000001', 'test')$$,
  '42501',
  null,
  'authenticated users cannot directly insert credit_ledger_entries'
);

select throws_ok(
  $$insert into public.payment_instruction_versions (beneficiary_name, bank_name, iban_restricted_value, currency, created_by)
    values ('Test', 'Test', 'TR000000000000000000000000', 'TRY', '90000000-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'authenticated users cannot directly insert payment_instruction_versions'
);

-- 21. Constraints: reference_code unique, transfer_reference unique per order
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select throws_ok(
  $$insert into public.orders (company_id, package_id, status, total_minor, currency, reference_code, package_snapshot, expires_at)
    values ('a0000000-0000-4000-8000-000000000001', current_setting('test.payment_package_id')::uuid, 'awaiting_transfer', 29900, 'TRY', 'ORD-20261116-ABC123', '{}'::jsonb, now() + interval '7 days')$$,
  '23505',
  null,
  'orders.reference_code unique constraint enforced'
);

-- 22. Audit logs created for payment actions
set local "request.jwt.claims" =
  '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select is(
  (select count(*)::integer from public.audit_logs
   where action = 'payment.accepted' and resource_id = current_setting('test.order_a_id')::uuid),
  1,
  'audit log records payment.accepted'
);

select is(
  (select count(*)::integer from public.audit_logs
   where action = 'payment.rejected' and resource_id = current_setting('test.order_c_id')::uuid),
  1,
  'audit log records payment.rejected'
);

select is(
  (select count(*)::integer from public.audit_logs
   where action = 'payment.needs_more_info' and resource_id = current_setting('test.order_d_id')::uuid),
  1,
  'audit log records payment.needs_more_info'
);

select is(
  (select count(*)::integer from public.audit_logs
   where action = 'order.created' and resource_id = current_setting('test.order_a_id')::uuid),
  1,
  'audit log records order.created'
);

select is(
  (select count(*)::integer from public.audit_logs
   where action = 'payment.submitted' and resource_id = current_setting('test.order_a_id')::uuid),
  1,
  'audit log records payment.submitted'
);

-- 23. Outbox event created for accepted payment
select is(
  (select count(*)::integer from public.outbox_events
   where event_type = 'payment.accepted' and aggregate_id = current_setting('test.order_a_id')::uuid),
  1,
  'outbox event created for payment.accepted'
);

reset role;
select * from finish();
rollback;