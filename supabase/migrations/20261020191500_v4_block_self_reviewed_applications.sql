create or replace function public.transition_application(
  _application_id uuid,
  _next_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_application public.applications%rowtype;
  v_company_id uuid;
  v_allowed boolean := false;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select a.* into v_application
  from public.applications as a
  where a.id = _application_id
  for update;

  if not found then
    raise exception 'The application does not exist.'
      using errcode = '22023';
  end if;

  select j.company_id into v_company_id
  from public.jobs as j where j.id = v_application.job_id;

  if v_application.candidate_id = v_actor
     and _next_status = 'withdrawn'
     and v_application.status in ('submitted', 'reviewing') then
    v_allowed := true;
  elsif v_application.candidate_id <> v_actor
    and public.is_active_company_member(
      v_company_id,
      array['owner', 'recruiter']::public.company_role[]
    ) then
    v_allowed :=
      (v_application.status = 'submitted' and _next_status in ('reviewing', 'shortlisted', 'rejected'))
      or (v_application.status = 'reviewing' and _next_status in ('shortlisted', 'rejected'))
      or (v_application.status = 'shortlisted' and _next_status in ('hired', 'rejected'));
  end if;

  if not v_allowed then
    raise exception 'The application status transition is not allowed.'
      using errcode = '42501';
  end if;

  update public.applications
  set status = _next_status,
      reviewed_by = case when v_application.candidate_id = v_actor then reviewed_by else v_actor end,
      reviewed_at = case when v_application.candidate_id = v_actor then reviewed_at else pg_catalog.now() end
  where id = _application_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'application.status_changed', 'application', _application_id,
    pg_catalog.jsonb_build_object(
      'from_status', v_application.status,
      'to_status', _next_status
    )
  );
end;
$$;

revoke all on function public.transition_application(uuid, text) from public, anon, authenticated;
grant execute on function public.transition_application(uuid, text) to authenticated;
