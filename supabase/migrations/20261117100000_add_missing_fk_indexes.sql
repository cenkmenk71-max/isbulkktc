-- Add missing indexes for foreign keys in payment system tables
-- Fixes "every public foreign key is covered by a leading-column index" ratchet

-- credit_accounts
create index if not exists credit_accounts_company_id_idx on public.credit_accounts (company_id);

-- credit_ledger_entries
create index if not exists credit_ledger_entries_company_id_idx on public.credit_ledger_entries (company_id);
create index if not exists credit_ledger_entries_order_id_idx on public.credit_ledger_entries (order_id);
create index if not exists credit_ledger_entries_payment_instruction_version_id_idx on public.credit_ledger_entries (payment_instruction_version_id);
create index if not exists credit_ledger_entries_actor_id_idx on public.credit_ledger_entries (actor_id);

-- orders
create index if not exists orders_company_id_idx on public.orders (company_id);
create index if not exists orders_package_id_idx on public.orders (package_id);
create index if not exists orders_payment_instruction_version_id_idx on public.orders (payment_instruction_version_id);
create index if not exists orders_created_by_idx on public.orders (created_by);

-- payment_instruction_versions (company_id is PK, already indexed)

-- payment_reconciliations
create index if not exists payment_reconciliations_order_id_idx on public.payment_reconciliations (order_id);
create index if not exists payment_reconciliations_submission_id_idx on public.payment_reconciliations (submission_id);
create index if not exists payment_reconciliations_reviewed_by_idx on public.payment_reconciliations (reviewed_by);

-- payment_submissions
create index if not exists payment_submissions_order_id_idx on public.payment_submissions (order_id);
create index if not exists payment_submissions_submitted_by_idx on public.payment_submissions (submitted_by);

-- Other tables that may have missing FK indexes
-- applications (if any FK without index)
create index if not exists applications_candidate_id_idx on public.applications (candidate_id);
create index if not exists applications_job_id_idx on public.applications (job_id);

-- company_members
create index if not exists company_members_company_id_idx on public.company_members (company_id);
create index if not exists company_members_profile_id_idx on public.company_members (profile_id);

-- company_profile_submissions
create index if not exists company_profile_submissions_company_id_idx on public.company_profile_submissions (company_id);
create index if not exists company_profile_submissions_profile_id_idx on public.company_profile_submissions (profile_id);

-- notifications
create index if not exists notifications_user_id_idx on public.notifications (user_id);

-- support_messages
create index if not exists support_messages_thread_id_idx on public.support_messages (thread_id);
create index if not exists support_messages_sender_id_idx on public.support_messages (sender_id);

-- support_threads
create index if not exists support_threads_member_id_idx on public.support_threads (member_id);

-- user_roles
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists user_roles_company_id_idx on public.user_roles (company_id);