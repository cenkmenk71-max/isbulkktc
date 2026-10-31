begin;

-- Regression guard for the EXECUTE leak closed by
-- 20261031120000_v4_function_privilege_hardening.sql.
--
-- Supabase's `pg_default_acl` grants EXECUTE on every new function in `public`
-- to `anon`, `authenticated` and `service_role`, and `revoke ... from public`
-- does NOT remove those explicit per-role entries. The two engagement RPCs
-- therefore shipped reachable with the publishable key: the first returned the
-- whole mailing list (user id, email, display name, locale) and the second let
-- anyone unsubscribe an arbitrary address.
--
-- The specific assertions below pin the two functions. The final assertion is a
-- ratchet: it enumerates every function in `public` that a client role may
-- execute and compares the set against a reviewed whitelist, so the next
-- function that forgets to revoke `anon`/`authenticated` fails CI instead of
-- shipping.

select plan(10);

-- ---------------------------------------------------------------------------
-- The two engagement RPCs are service-role-only.
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege(
    'anon',
    'public.list_engagement_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'the publishable key cannot list digest recipients'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_engagement_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'a signed-in session cannot list digest recipients'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.opt_out_engagement(text, text)',
    'EXECUTE'
  ),
  'the publishable key cannot record an opt-out directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.opt_out_engagement(text, text)',
    'EXECUTE'
  ),
  'a signed-in session cannot record an opt-out directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_engagement_recipients(uuid, integer)',
    'EXECUTE'
  ),
  'the digest worker may still list recipients'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.opt_out_engagement(text, text)',
    'EXECUTE'
  ),
  'the unsubscribe route may still record an opt-out'
);

-- ---------------------------------------------------------------------------
-- Trigger plumbing stays off the client surface.
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.set_updated_at()', 'EXECUTE'),
  'the publishable key cannot execute the updated_at trigger function'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_updated_at()',
    'EXECUTE'
  ),
  'a signed-in session cannot execute the updated_at trigger function'
);

-- The trigger itself must keep working after the revoke: it runs as the table
-- owner, so no client EXECUTE is needed. The row is written with a deliberately
-- stale `updated_at`; only a working trigger overwrites it with `now()`.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '84000000-0000-4000-8000-000000000001',
  'trigger-check@example.test',
  '{"display_name":"Trigger Check"}'
);

update public.profiles
set display_name = 'Trigger Check Renamed',
    updated_at = pg_catalog.now() - interval '1 day'
where id = '84000000-0000-4000-8000-000000000001';

select ok(
  (
    select updated_at > pg_catalog.now() - interval '1 hour'
    from public.profiles
    where id = '84000000-0000-4000-8000-000000000001'
  ),
  'the set_updated_at trigger still overwrites updated_at without a client grant'
);

-- ---------------------------------------------------------------------------
-- Ratchet: every client-executable function in `public` must be reviewed.
-- ---------------------------------------------------------------------------

-- Intentionally reachable with `anon` and/or `authenticated`:
--   * the public `get_public_*` / `search_public_*` read RPCs,
--   * the anonymous write RPCs (`submit_feedback`, `submit_sales_lead`),
--   * the `is_active_company_member` / `has_platform_role` helpers and the two
--     IMMUTABLE CHECK validators (a CHECK expression runs as the caller, so
--     revoking these would break every INSERT),
--   * the authenticated job/application/profile RPCs,
--   * the `admin_*` RPCs, which are each internally gated on
--     `has_platform_role('platform_admin')` (itself AAL2-gated).
-- Anything not on this list has leaked a grant and must be revoked explicitly.
-- The comparison uses full signatures, not bare names, so a *new overload* of an
-- already-reviewed function (a fresh entry point with its own grant) cannot slip
-- through by sharing a whitelisted name.
select is(
  (
    select pg_catalog.array_agg(
      p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')'
      order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
    )::text[]
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ),
  array[
    'admin_assign_company_job_package(_company_id uuid, _package_id uuid, _expires_at timestamp with time zone)',
    'admin_delete_directory_company(_directory_entry_id text)',
    'admin_delete_faq_entry(_id uuid)',
    'admin_list_faq_entries()',
    'admin_list_job_packages()',
    'admin_list_listing_plans()',
    'admin_list_site_content()',
    'admin_list_verified_companies()',
    'admin_save_job_package(_package_id uuid, _code text, _display_name text, _description text, _max_active_jobs integer, _job_duration_days integer, _is_active boolean)',
    'admin_upsert_directory_company(_directory_entry_id text, _name text, _categories text[], _logo_file text, _logo_domain text, _logo_width integer, _logo_height integer, _locations jsonb)',
    'admin_upsert_faq_entry(_id uuid, _locale text, _question text, _answer text, _sort_order integer, _is_published boolean)',
    'admin_upsert_listing_plan(_code text, _audience text, _name text, _blurb text, _features text[], _color text, _listing_count integer, _price_1 integer, _price_7 integer, _price_30 integer, _is_active boolean, _sort_order integer)',
    'admin_upsert_site_content(_content_key text, _locale text, _document jsonb)',
    'apply_to_job(_job_id uuid, _cover_letter text)',
    'apply_to_job(_job_id uuid, _cover_letter text, _share_contact_email boolean)',
    'create_company(company_name text, company_slug text)',
    'get_application_contact_email(_application_id uuid)',
    'get_company_application_detail(_application_id uuid)',
    'get_company_job_entitlements(_company_id uuid)',
    'get_public_directory()',
    'get_public_faq(_locale text)',
    'get_public_job_details(_slug text)',
    'get_public_listing_plans()',
    'get_public_site_content(_locale text, _keys text[])',
    'has_platform_role(_role platform_role)',
    'is_active_company_member(_company_id uuid, _allowed_roles company_role[])',
    'is_valid_candidate_profile_section(_entries jsonb, _allowed_fields text[], _maximum_entries integer, _maximum_field_length integer)',
    'is_valid_company_categories(_categories text[], _maximum_items integer, _maximum_length integer)',
    'list_company_applications(_company_id uuid)',
    'list_my_application_notifications()',
    'list_my_applications()',
    'mark_application_viewed(_application_id uuid)',
    'publish_approved_job(_job_id uuid)',
    'review_company_profile_submission(_submission_id uuid, _decision text, _review_note text)',
    'review_job(_job_id uuid, _decision text, _review_note text)',
    'search_public_job_companies()',
    'search_public_job_previews(_query text, _district text, _job_type text, _workplace_mode text, _page integer)',
    'search_public_jobs(_query text, _district text, _job_type text, _workplace_mode text, _page integer)',
    'submit_feedback(_name text, _email text, _category text, _rating integer, _message text, _locale text)',
    'submit_job_for_review(_job_id uuid)',
    'submit_sales_lead(_company_name text, _contact_name text, _email text, _phone text, _plan text, _duration_days integer, _note text, _locale text)',
    'transition_application(_application_id uuid, _next_status text)'
  ]::text[],
  'only reviewed function signatures are executable by anon/authenticated'
);

select * from finish();

rollback;
