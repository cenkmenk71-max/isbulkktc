begin;

-- SECURITY DEFINER RPC to delete a company and all related records.
-- Only platform_admin can call this. Writes an audit_log entry.
create or replace function public.admin_delete_company(_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_name text;
begin
  -- Only platform administrators can delete companies
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.has_platform_role('platform_admin') then
    raise exception 'Only a platform administrator can delete a company.' using errcode = '42501';
  end if;

  -- Lock the company row and capture its name for the audit log
  select name into v_company_name
  from public.companies
  where id = _company_id
  for update;

  if not found then
    raise exception 'Company not found.' using errcode = '22023';
  end if;

  -- Delete dependent rows in dependency order
  delete from public.job_match_notifications where job_id in (select id from public.jobs where company_id = _company_id);
  delete from public.job_match_email_outbox where notification_id in (select id from public.job_match_notifications where job_id in (select id from public.jobs where company_id = _company_id));
  delete from public.application_events where application_id in (select id from public.applications where job_id in (select id from public.jobs where company_id = _company_id));
  delete from public.application_contact_shares where application_id in (select id from public.applications where job_id in (select id from public.jobs where company_id = _company_id));
  delete from public.notifications where user_id in (select id from public.profiles where id in (select user_id from public.company_members where company_id = _company_id));
  delete from public.notification_email_outbox where notification_id in (select id from public.notifications where user_id in (select id from public.profiles where id in (select user_id from public.company_members where company_id = _company_id)));
  delete from public.applications where job_id in (select id from public.jobs where company_id = _company_id);
  delete from public.jobs where company_id = _company_id;
  delete from public.company_members where company_id = _company_id;
  delete from public.company_profile_submissions where company_id = _company_id;
  delete from public.credit_ledger_entries where company_id = _company_id;
  delete from public.credit_accounts where company_id = _company_id;

  -- Delete the company itself
  delete from public.companies where id = _company_id;

  -- Audit log
  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'company.deleted', 'company', _company_id,
    pg_catalog.jsonb_build_object(
      'company_name', v_company_name,
      'deleted_by', v_actor
    )
  );
end;
$$;

revoke all on function public.admin_delete_company(uuid) from public, anon, authenticated;
grant execute on function public.admin_delete_company(uuid) to authenticated;

commit;