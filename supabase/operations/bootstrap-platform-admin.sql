begin;

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('isbulkktc:initial-platform-admin', 0)
);

do $bootstrap$
declare
  v_user_id constant uuid := '00000000-0000-0000-0000-000000000000';
  v_confirmed_at timestamptz;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Replace the bootstrap UUID with the verified operator account UUID.';
  end if;

  select u.email_confirmed_at
  into v_confirmed_at
  from auth.users as u
  join public.profiles as p on p.id = u.id
  where u.id = v_user_id
    and p.status = 'active';

  if not found or v_confirmed_at is null then
    raise exception 'The selected account must exist, be active, and have a confirmed email.';
  end if;

  if exists (
    select 1
    from public.user_roles as role_row
    where role_row.role = 'platform_admin'
  ) then
    raise exception 'A platform administrator already exists; initial bootstrap is single-use.';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (v_user_id, 'platform_admin', null);

  insert into public.audit_logs (
    actor_id,
    action,
    resource_type,
    resource_id,
    metadata_redacted
  ) values (
    null,
    'platform_admin.initial_bootstrap',
    'user',
    v_user_id,
    pg_catalog.jsonb_build_object(
      'method', 'supabase_dashboard_sql_editor',
      'operator_recorded_externally', true
    )
  );
end;
$bootstrap$;

commit;
