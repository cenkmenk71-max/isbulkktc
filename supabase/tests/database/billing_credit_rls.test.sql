begin;

select plan(17);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('b1000000-0000-4000-8000-000000000001', 'billing-owner-a@example.test', '{"display_name":"Billing Owner A"}'),
  ('b1000000-0000-4000-8000-000000000002', 'billing-owner-b@example.test', '{"display_name":"Billing Owner B"}'),
  ('b1000000-0000-4000-8000-000000000003', 'billing-platform-admin@example.test', '{"display_name":"Billing Platform Admin"}');

insert into public.user_roles (user_id, role)
values ('b1000000-0000-4000-8000-000000000003', 'platform_admin');

insert into public.companies (id, name, slug, verification_status)
values
  ('b2000000-0000-4000-8000-000000000001', 'Billing Company A', 'billing-company-a', 'verified'),
  ('b2000000-0000-4000-8000-000000000002', 'Billing Company B', 'billing-company-b', 'verified');

insert into public.company_members (company_id, user_id, membership_role, status)
values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'owner', 'active');

insert into public.listing_plans (
  code, audience, name, listing_count, price_1, price_7, price_30,
  color, is_active, sort_order
)
values (
  'billing-test', 'employer', 'Billing test plan', 3, 100, 200, 300,
  '#336699', true, 0
);

insert into public.payment_instruction_versions (
  beneficiary_name, bank_name, iban_restricted_value, currency,
  active_from, created_by
)
values (
  'Synthetic Beneficiary', 'Synthetic Bank', 'TR000000000000000000000000',
  'TRY', now() - interval '1 day', 'b1000000-0000-4000-8000-000000000003'
);

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}';

select set_config(
  'test.billing_order_id',
  public.create_order(
    'b2000000-0000-4000-8000-000000000001',
    'billing-test',
    1
  )::text,
  true
);

select is(
  (select total_minor from public.orders
   where id = current_setting('test.billing_order_id')::uuid),
  100,
  'the order price is selected from the server-managed listing plan'
);

select is(
  (select package_snapshot ->> 'job_credits' from public.orders
   where id = current_setting('test.billing_order_id')::uuid),
  '3',
  'the order snapshots the plan credit quantity'
);

select is(
  (select count(*)::integer from public.orders),
  1,
  'a company member can read their own order'
);

select is(
  (
    select iban_restricted_value || '|' || reference_code
    from public.get_order_payment_instructions(
      current_setting('test.billing_order_id')::uuid
    )
  ),
  'TR000000000000000000000000|' ||
    (select reference_code from public.orders
     where id = current_setting('test.billing_order_id')::uuid),
  'payment instructions are returned only for the authorized order snapshot'
);

select lives_ok(
  $$select set_config(
      'test.billing_submission_id',
      public.submit_payment(
        current_setting('test.billing_order_id')::uuid,
        'Synthetic Sender',
        'transfer-test-001',
        100,
        'TRY',
        now() - interval '1 hour',
        null
      )::text,
      true
    )$$,
  'an authorized company member can submit a transfer for their own order'
);

select throws_ok(
  $$insert into public.payment_submissions (
      order_id, submitted_by, sender_name, transfer_reference, amount_minor,
      currency, transferred_at
    )
    values (
      current_setting('test.billing_order_id')::uuid,
      (select auth.uid()),
      'Synthetic Sender',
      'direct-write',
      100,
      'TRY',
      now()
    )$$,
  '42501',
  null,
  'payment submissions must go through the validated RPC'
);

set local "request.jwt.claims" =
  '{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::integer from public.orders),
  0,
  'a different company cannot read the order'
);

select throws_ok(
  $$select * from public.get_order_payment_instructions(
      current_setting('test.billing_order_id')::uuid
    )$$,
  '42501',
  null,
  'a different company cannot retrieve payment instructions'
);

select throws_ok(
  $$select public.review_payment_submission(
      current_setting('test.billing_order_id')::uuid,
      current_setting('test.billing_submission_id')::uuid
    )$$,
  '42501',
  null,
  'a non-admin company member cannot begin payment review'
);

set local "request.jwt.claims" =
  '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}';

select lives_ok(
  $$select public.review_payment_submission(
      current_setting('test.billing_order_id')::uuid,
      current_setting('test.billing_submission_id')::uuid
    )$$,
  'an MFA-verified platform administrator can begin payment review'
);

select lives_ok(
  $$select public.admin_reconcile_payment(
      current_setting('test.billing_order_id')::uuid,
      current_setting('test.billing_submission_id')::uuid,
      'accepted',
      'BANK-REFERENCE-001',
      null
    )$$,
  'a verified payment reconciliation records the order and credit grant atomically'
);

select is(
  (select status::text from public.orders
   where id = current_setting('test.billing_order_id')::uuid),
  'paid',
  'a reconciled payment moves the order to paid'
);

select is(
  (select available_balance from public.credit_accounts
   where company_id = 'b2000000-0000-4000-8000-000000000001'),
  3,
  'the paid order grants its snapshotted credits exactly once'
);

select is(
  (select entry_type::text || ':' || quantity_delta::text
   from public.credit_ledger_entries
   where order_id = current_setting('test.billing_order_id')::uuid),
  'purchase_grant:3',
  'the credit grant is recorded in the ledger'
);

select throws_ok(
  $$select public.admin_reconcile_payment(
      current_setting('test.billing_order_id')::uuid,
      current_setting('test.billing_submission_id')::uuid,
      'accepted',
      'BANK-REFERENCE-001',
      null
    )$$,
  '22023',
  null,
  'a paid order cannot be reconciled or credited a second time'
);

select throws_ok(
  $$update public.credit_ledger_entries
    set quantity_delta = 99
    where order_id = current_setting('test.billing_order_id')::uuid$$,
  '42501',
  null,
  'client roles cannot mutate credit ledger entries'
);

select throws_ok(
  $$select count(*) from public.payment_reconciliations$$,
  '42501',
  null,
  'payment reconciliation records are not directly readable by clients'
);

select * from finish();
rollback;
