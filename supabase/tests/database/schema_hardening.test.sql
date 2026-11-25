begin;

select plan(8);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation.relnamespace
    where namespace_row.nspname = 'public'
      and relation.relname = any (array[
        'profiles', 'user_roles', 'candidate_profiles', 'companies',
        'company_members', 'audit_logs', 'jobs', 'applications',
        'job_packages', 'company_job_package_assignments',
        'company_profile_submissions', 'company_directory_overrides',
        'application_events', 'notifications', 'notification_email_outbox',
        'feedback_submissions', 'sales_leads', 'push_subscriptions',
        'push_notification_preferences', 'support_threads', 'support_messages',
        'site_content', 'faq_entries', 'listing_plans', 'job_source_imports',
        'application_contact_shares', 'resumes', 'resume_versions', 'saved_jobs',
        'conversations', 'conversation_members', 'messages', 'integration_sync_runs',
        'payment_instruction_versions', 'orders', 'payment_submissions',
        'payment_reconciliations', 'credit_accounts', 'credit_ledger_entries',
        'outbox_events'
      ]::text[])
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  40,
  'all current and newly added application tables enforce RLS'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_attribute as column_row
    join pg_catalog.pg_class as table_row on table_row.oid = column_row.attrelid
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'candidate_profiles'
      and column_row.attname = any (array[
        'summary', 'links', 'cv_full_text', 'phone', 'job_type_preference',
        'workplace_mode_preference', 'salary_expectation', 'availability'
      ]::text[])
      and column_row.attnum > 0
      and not column_row.attisdropped
  ),
  8,
  'candidate profile additions match the schema and database types'
);

select ok(
  (
    select bool_and(
      case column_row.attname
        when 'job_type_preference' then column_row.atttypid = 'text[]'::regtype and column_row.attnotnull
        when 'workplace_mode_preference' then column_row.atttypid = 'text[]'::regtype and column_row.attnotnull
        when 'phone' then column_row.atttypid = 'text'::regtype and not column_row.attnotnull
        when 'salary_expectation' then column_row.atttypid = 'text'::regtype and not column_row.attnotnull
        when 'availability' then column_row.atttypid = 'text'::regtype and not column_row.attnotnull
        else true
      end
    )
    from pg_catalog.pg_attribute as column_row
    join pg_catalog.pg_class as table_row on table_row.oid = column_row.attrelid
    join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'candidate_profiles'
      and column_row.attname = any (array[
        'phone', 'job_type_preference', 'workplace_mode_preference',
        'salary_expectation', 'availability'
      ]::text[])
      and column_row.attnum > 0
      and not column_row.attisdropped
  ),
  'candidate preference SQL types and nullability match the Zod contract'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_attribute as column_row
    where column_row.attrelid = 'public.candidate_profiles'::regclass
      and column_row.attname = 'summary'
      and column_row.atttypid = 'text'::regtype
      and not column_row.attnotnull
  )
  and exists (
    select 1
    from pg_catalog.pg_attribute as column_row
    join pg_catalog.pg_attrdef as default_row
      on default_row.adrelid = column_row.attrelid
      and default_row.adnum = column_row.attnum
    where column_row.attrelid = 'public.candidate_profiles'::regclass
      and column_row.attname = 'links'
      and column_row.atttypid = 'jsonb'::regtype
      and column_row.attnotnull
      and pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid) = '''[]''::jsonb'
  )
  and exists (
    select 1
    from pg_catalog.pg_attribute as column_row
    where column_row.attrelid = 'public.candidate_profiles'::regclass
      and column_row.attname = 'cv_full_text'
      and column_row.atttypid = 'text'::regtype
      and not column_row.attnotnull
  ),
  'summary, links and raw-CV columns have the required SQL types, nullability and default'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.candidate_profiles'::regclass
      and constraint_row.conname = 'candidate_profiles_summary_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%char_length(summary) <= 2000%'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.candidate_profiles'::regclass
      and constraint_row.conname = 'candidate_profiles_links_section_valid_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%is_valid_candidate_profile_section%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%label%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%url%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%12%'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%600%'
  )
  and exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'public.candidate_profiles'::regclass
      and constraint_row.conname = 'candidate_profiles_cv_full_text_length_check'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%char_length(cv_full_text) <= 100000%'
  ),
  'candidate text and structured-link checks match their schema limits'
);

select ok(
  (
    select pg_catalog.bool_and(
      has_column_privilege('authenticated', 'public.candidate_profiles', column_name, 'INSERT')
      and has_column_privilege('authenticated', 'public.candidate_profiles', column_name, 'UPDATE')
    )
    from unnest(array[
      'summary', 'links', 'cv_full_text', 'phone', 'job_type_preference',
      'workplace_mode_preference', 'salary_expectation', 'availability'
    ]::text[]) as granted_columns(column_name)
  )
  and not has_table_privilege('authenticated', 'public.candidate_profiles', 'INSERT')
  and not has_table_privilege('authenticated', 'public.candidate_profiles', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.candidate_profiles', 'visibility', 'INSERT')
  and not has_column_privilege('authenticated', 'public.candidate_profiles', 'visibility', 'UPDATE'),
  'authenticated can write only the approved profile columns, never visibility'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conname in (
      'candidate_profiles_location_northern_cyprus_district',
      'companies_municipality_northern_cyprus_district',
      'company_profile_submissions_municipality_northern_cyprus_district',
      'company_directory_overrides_municipality_northern_cyprus_district'
    )
      and constraint_row.convalidated
  ),
  4,
  'all existing Northern Cyprus district constraints remain present'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as foreign_key
    join pg_catalog.pg_class as child on child.oid = foreign_key.conrelid
    join pg_catalog.pg_attribute as column_row
      on column_row.attrelid = child.oid
      and column_row.attnum = foreign_key.conkey[1]
    join pg_catalog.pg_index as index_row
      on index_row.indrelid = child.oid
      and index_row.indisvalid
      and index_row.indpred is null
      and (index_row.indkey::int2[])[0] = column_row.attnum
    where child.relname = 'notification_email_outbox'
      and foreign_key.contype = 'f'
      and column_row.attname = 'notification_id'
  ),
  'notification_email_outbox.notification_id remains covered by its unique FK index'
);

select * from finish();
rollback;
