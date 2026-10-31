-- Close an EXECUTE leak on the engagement-digest RPCs.
--
-- Supabase ships a `pg_default_acl` entry that grants EXECUTE on every new
-- function in `public` to `anon`, `authenticated` and `service_role`. A
-- `revoke all on function ... from public` only removes the implicit PUBLIC
-- grant (the `=X/...` entry in `proacl`); it leaves the *explicit* per-role
-- entries that the default ACL created. 20261030180000 used exactly that
-- insufficient form, so both functions stayed callable with the publishable key:
--
--   * `list_engagement_recipients` returns `user_id`, `email`, `display_name`
--     and `locale` for every active, confirmed account. `curl` with the anon key
--     therefore dumped the whole mailing list — a PII disclosure, and the
--     `_after`/`_batch_size` arguments made it a clean full-table walk.
--   * `opt_out_engagement` let anyone with the publishable key unsubscribe an
--     arbitrary address by writing it to `email_engagement_optouts`, with no
--     signature to prove ownership of the mailbox.
--
-- Both are service-role-only by design: the digest route builds its recipient
-- list with the service client and the unsubscribe route verifies an HMAC before
-- calling the RPC. Revoke from every client role and re-assert service_role.
--
-- `set_updated_at()` is a trigger function with the same leaked grant. It is
-- harmless (it errors when called outside a trigger, proven by hand), but a
-- trigger runs as the table owner regardless of EXECUTE, so no client ever needs
-- it. Revoke it too; the UPDATE path is covered by the pgTAP suite.
--
-- Deliberately NOT touched: `is_valid_company_categories` and
-- `is_valid_candidate_profile_section`. They are IMMUTABLE validators used in
-- CHECK constraints, and a CHECK expression runs with the caller's privileges —
-- revoking EXECUTE makes every INSERT fail with `42501`. They are granted on
-- purpose.

revoke all on function public.list_engagement_recipients(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_engagement_recipients(uuid, integer)
  to service_role;

revoke all on function public.opt_out_engagement(text, text)
  from public, anon, authenticated;
grant execute on function public.opt_out_engagement(text, text)
  to service_role;

revoke all on function public.set_updated_at()
  from public, anon, authenticated;
