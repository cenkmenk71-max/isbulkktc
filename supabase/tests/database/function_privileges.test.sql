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

select plan(17);

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

select ok(
  not has_function_privilege('anon', 'public.confirm_sales_lead_marketing_consent(uuid, text, text)', 'EXECUTE'),
  'anonymous visitors cannot confirm marketing consent directly'
);

select ok(
  not has_function_privilege('authenticated', 'public.confirm_sales_lead_marketing_consent(uuid, text, text)', 'EXECUTE'),
  'signed-in clients cannot confirm marketing consent directly'
);

select ok(
  has_function_privilege('service_role', 'public.confirm_sales_lead_marketing_consent(uuid, text, text)', 'EXECUTE'),
  'only the server confirmation endpoint can activate marketing consent'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.replace_source_job_catalogue(jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'anonymous visitors cannot replace the imported job catalogue'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.replace_source_job_catalogue(jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'signed-in clients cannot replace the imported job catalogue'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.replace_source_job_catalogue(jsonb, jsonb, jsonb)',
    'EXECUTE'
  ),
  'only the source catalogue worker can replace imported listings'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_resume_status(uuid, text, jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.update_resume_status(uuid, text, jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.update_resume_status(uuid, text, jsonb)',
    'EXECUTE'
  ),
  'resume processing status remains service-role-only'
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
--   * the anonymous write RPCs (`submit_feedback`, `submit_sales_lead`,
--     `submit_support_message`),
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
    'adjust_credit_balance(_company_id uuid, _quantity_delta integer, _entry_type credit_entry_type, _idempotency_key text, _reason text, _actor_id uuid)',
    'admin_assign_company_job_package(_company_id uuid, _package_id uuid, _expires_at timestamp with time zone)',
    'admin_delete_directory_company(_directory_entry_id text)',
    'admin_delete_faq_entry(_id uuid)',
    'admin_list_company_verifications()',
    'admin_list_faq_entries()',
    'admin_list_job_packages()',
    'admin_list_listing_plans()',
    'admin_list_site_content()',
    'admin_list_support_threads()',
    'admin_list_verified_companies()',
    'admin_reconcile_payment(_order_id uuid, _submission_id uuid, _decision reconciliation_decision, _bank_reference_normalized text, _notes text, _reviewed_by uuid)',
    'admin_reply_support_thread(_thread_id uuid, _body text)',
    'admin_save_job_package(_package_id uuid, _code text, _display_name text, _description text, _max_active_jobs integer, _job_duration_days integer, _is_active boolean)',
    'admin_save_payment_instructions(_beneficiary_name text, _bank_name text, _iban_restricted_value text, _currency text, _instructions text, _active_from timestamp with time zone, _active_to timestamp with time zone, _created_by uuid)',
    'admin_upsert_directory_company(_directory_entry_id text, _name text, _categories text[], _logo_file text, _logo_domain text, _logo_width integer, _logo_height integer, _locations jsonb)',
    'admin_upsert_faq_entry(_id uuid, _locale text, _question text, _answer text, _sort_order integer, _is_published boolean)',
    'admin_upsert_listing_plan(_code text, _audience text, _name text, _blurb text, _features text[], _color text, _listing_count integer, _price_1 integer, _price_7 integer, _price_30 integer, _is_active boolean, _sort_order integer)',
    'admin_upsert_site_content(_content_key text, _locale text, _document jsonb)',
    'apply_to_job(_job_id uuid, _cover_letter text)',
    'apply_to_job(_job_id uuid, _cover_letter text, _share_contact_email boolean)',
    'archive_conversation(_conversation_id uuid)',
    'create_company(company_name text, company_slug text)',
    'create_order(_company_id uuid, _listing_plan_code text, _duration_days integer)',
    'create_resume(_candidate_id uuid, _storage_path text, _original_filename text, _file_size_bytes bigint, _mime_type text, _page_count integer)',
    'get_application_contact_email(_application_id uuid)',
    'get_company_application_detail(_application_id uuid)',
    'get_company_credit_ledger(_company_id uuid, _limit integer, _offset integer)',
    'get_company_job_entitlements(_company_id uuid)',
    'get_my_push_preferences()',
    'get_order_payment_instructions(_order_id uuid)',
    'get_public_directory()',
    'get_public_faq(_locale text)',
    'get_public_job_details(_slug text)',
    'get_public_listing_plans()',
    'get_public_site_content(_locale text, _keys text[])',
    'get_support_thread(_public_ref text)',
    'has_platform_role(_role platform_role)',
    'is_active_company_member(_company_id uuid, _allowed_roles company_role[])',
    'is_valid_candidate_profile_section(_entries jsonb, _allowed_fields text[], _maximum_entries integer, _maximum_field_length integer)',
    'is_valid_company_categories(_categories text[], _maximum_items integer, _maximum_length integer)',
    'list_company_applications(_company_id uuid)',
    'list_my_application_notifications()',
    'list_my_applications()',
    'list_my_push_subscriptions()',
    'mark_application_viewed(_application_id uuid)',
    'publish_approved_job(_job_id uuid)',
    'register_push_subscription(_endpoint text, _p256dh text, _auth_key text, _user_agent text)',
    'review_company_profile_submission(_submission_id uuid, _decision text, _review_note text)',
    'review_company_verification(_company_id uuid, _decision text)',
    'review_job(_job_id uuid, _decision text, _review_note text)',
    'review_payment_submission(_order_id uuid, _submission_id uuid)',
    'revoke_push_subscription(_endpoint text)',
    'search_public_job_companies()',
    'search_public_job_previews(_query text, _district text, _job_type text, _workplace_mode text, _page integer)',
    'search_public_jobs(_query text, _district text, _job_type text, _workplace_mode text, _page integer)',
    'send_message(_conversation_id uuid, _body text, _message_type text, _metadata jsonb)',
    'set_push_notification_preferences(_application_updates boolean, _job_alerts boolean, _employer_applications boolean, _messages boolean, _marketing boolean)',
    'start_conversation(_participant_ids uuid[], _subject text)',
    'submit_feedback(_name text, _email text, _category text, _rating integer, _message text, _locale text)',
    'submit_job_for_review(_job_id uuid)',
    'submit_payment(_order_id uuid, _sender_name text, _transfer_reference text, _amount_minor integer, _currency text, _transferred_at timestamp with time zone, _receipt_storage_path text)',
    'submit_sales_lead(_company_name text, _contact_name text, _email text, _phone text, _plan text, _duration_days integer, _note text, _locale text)',
    'submit_sales_lead(_company_name text, _contact_name text, _email text, _phone text, _plan text, _duration_days integer, _note text, _locale text, _marketing_consent boolean)',
    'submit_support_message(_name text, _email text, _subject text, _body text, _locale text)',
    'sync_oauth_profile()',
    'transition_application(_application_id uuid, _next_status text)'
  ]::text[],
  'only reviewed function signatures are executable by anon/authenticated'
);

select * from finish();

rollback;
