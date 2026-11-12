begin;

select plan(16);

-- The acquisition ("marketing") campaign is promotional mail to a consented
-- prospect list (`sales_leads`), so its two RPCs are the consent gate and the
-- queue cursor. Both are asserted here against rows inserted inside the
-- transaction (rolled back with it), because neither can be exercised through
-- the publishable key.
--
-- The consent basis is stronger than the digest's: a `sales_leads` row is a
-- visitor who submitted the corporate-quote form. The 911-row company directory
-- is deliberately NOT a source, so this suite also proves a lead can be filtered
-- out by an opt-out just like a digest recipient.

-- ---------------------------------------------------------------------------
-- Least privilege: service-role only, both RPCs and the underlying table.
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon',
    'public.list_marketing_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'the publishable key cannot list marketing recipients'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_marketing_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'an authenticated session cannot list marketing recipients'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_marketing_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'the marketing worker may list recipients'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.mark_marketing_lead_contacted(uuid)',
    'EXECUTE'
  ),
  'the publishable key cannot advance a lead'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.mark_marketing_lead_contacted(uuid)',
    'EXECUTE'
  ),
  'the marketing worker may advance a lead'
);

-- ---------------------------------------------------------------------------
-- Recipient selection: only `new` leads, keyed by id, in insertion order.
-- ---------------------------------------------------------------------------

insert into public.sales_leads (id, company_name, email, locale, status) values
  ('84000000-0000-4000-8000-000000000001', 'Alpha', 'alpha@example.test', 'tr', 'new'),
  ('84000000-0000-4000-8000-000000000002', 'Beta', 'beta@example.test', 'en', 'new'),
  ('84000000-0000-4000-8000-000000000003', 'Gamma', 'gamma@example.test', 'ru', 'quoted'),
  ('84000000-0000-4000-8000-000000000004', 'Delta', 'delta@example.test', 'de', 'new');

select is(
  (select count(*)::integer from public.list_marketing_recipients(null, 100)),
  3,
  'only leads still in the `new` queue are recipients'
);

select is(
  (select locale from public.list_marketing_recipients(null, 100)
   where lead_id = '84000000-0000-4000-8000-000000000002'),
  'en',
  'a recipient carries their own locale for localized copy'
);

-- Keyset pagination: the first page must be resumable without skipping rows.
select is(
  (select count(*)::integer
   from public.list_marketing_recipients(
     (select lead_id from public.list_marketing_recipients(null, 1)),
     100
   )),
  2,
  'the batch cursor resumes after the last returned lead id'
);

-- ---------------------------------------------------------------------------
-- The opt-out list is consulted: a lead who unsubscribed is never mailed again,
-- even though the lead row is still `new`.
-- ---------------------------------------------------------------------------

insert into public.email_engagement_optouts (email, reason) values
  ('beta@example.test', 'email_link');

select is(
  (select count(*)::integer from public.list_marketing_recipients(null, 100)),
  2,
  'an opted-out address is excluded from the marketing batch'
);

-- ---------------------------------------------------------------------------
-- Advancing a lead: a `new` lead becomes `contacted`, and a lead a human
-- already moved is not clobbered.
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.mark_marketing_lead_contacted('84000000-0000-4000-8000-000000000001')$$,
  'a sent lead can be advanced out of the queue'
);

select is(
  (select status from public.sales_leads
   where id = '84000000-0000-4000-8000-000000000001'),
  'contacted',
  'the lead is marked contacted so the next run skips it'
);

select is(
  (select count(*)::integer from public.list_marketing_recipients(null, 100)),
  1,
  'a contacted lead is no longer a recipient'
);

select lives_ok(
  $$select public.mark_marketing_lead_contacted('84000000-0000-4000-8000-000000000003')$$,
  'advancing a lead a human already moved is not an error'
);

select is(
  (select status from public.sales_leads
   where id = '84000000-0000-4000-8000-000000000003'),
  'quoted',
  'the status guard leaves a non-`new` lead untouched'
);

-- ---------------------------------------------------------------------------
-- The in-body `auth.role()` guard is the second line of defence. The grant
-- alone would stop a client caller, so the assertions above cannot tell a
-- guarded body from an unguarded one: hand `anon` EXECUTE inside this
-- transaction and confirm the calls still fail closed — the exact leak that
-- shipped once through `pg_default_acl` (AGENTS.md). Rolled back with the tx.
-- ---------------------------------------------------------------------------

grant execute on function public.list_marketing_recipients(uuid, integer) to anon;
grant execute on function public.mark_marketing_lead_contacted(uuid) to anon;

set local "request.jwt.claims" = '{"role":"anon"}';
set local role anon;

select throws_ok(
  $$select * from public.list_marketing_recipients(null, 100)$$,
  '42501',
  null,
  'the recipient list re-checks the role in its own body even when anon holds EXECUTE'
);

select throws_ok(
  $$select public.mark_marketing_lead_contacted('84000000-0000-4000-8000-000000000004')$$,
  '42501',
  null,
  'advancing a lead re-checks the role in its own body even when anon holds EXECUTE'
);

reset role;

select * from finish();

rollback;
