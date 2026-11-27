begin;

-- publish_approved_job: match loop reads from base tables (candidate_profiles
-- joined with profiles) instead of the dropped public.v_talent_pool view, so
-- the live Supabase instance no longer references a missing relation.
create or replace function public.publish_approved_job(_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_job public.jobs%rowtype;
  v_assignment public.company_job_package_assignments%rowtype;
  v_company public.companies%rowtype;
  v_active_jobs integer;
  v_now timestamptz := pg_catalog.now();
  v_notif_id uuid;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select j.* into v_job
  from public.jobs as j
  where j.id = _job_id
  for update;

  if not found
     or not public.is_active_company_member(
       v_job.company_id,
       array['owner', 'recruiter']::public.company_role[]
     ) then
    raise exception 'The job is not available to this company member.'
      using errcode = '42501';
  end if;

  if v_job.status <> 'approved' then
    raise exception 'Only an approved job can be published.'
      using errcode = '22023';
  end if;

  select c.* into v_company
  from public.companies as c
  where c.id = v_job.company_id
  for update;

  if not found or v_company.verification_status <> 'verified' then
    raise exception 'The company must be verified to publish a job.'
      using errcode = '42501';
  end if;

  select a.* into v_assignment
  from public.company_job_package_assignments as a
  join public.job_packages as p on p.id = a.package_id and p.is_active
  where a.company_id = v_job.company_id
    and a.revoked_at is null
    and a.starts_at <= v_now
    and (a.expires_at is null or a.expires_at > v_now)
  for update of a, p;

  if not found then
    raise exception 'An active package assignment is required to publish.'
      using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::integer into v_active_jobs
  from public.jobs as j
  where j.company_id = v_job.company_id
    and j.status = 'published'
    and j.published_at <= v_now
    and j.expires_at > v_now;

  if v_active_jobs >= v_assignment.max_active_jobs_snapshot then
    raise exception 'The assigned package active-job limit has been reached.'
      using errcode = 'P0001';
  end if;

  update public.jobs
  set status = 'published',
      published_at = v_now,
      expires_at = v_now + pg_catalog.make_interval(
        days => v_assignment.job_duration_days_snapshot
      )
  where id = _job_id;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job.published', 'job', _job_id,
    pg_catalog.jsonb_build_object(
      'company_id', v_job.company_id,
      'package_assignment_id', v_assignment.id,
      'duration_days', v_assignment.job_duration_days_snapshot
    )
  );

  -- Eşleşme döngüsü: ILIKE doğrudan beceri eşleşmesi
  for v_notif_id in
    insert into public.job_match_notifications (
      user_id, job_id, match_score
    )
    select cp.user_id, _job_id, 100
    from public.candidate_profiles as cp
    join public.profiles as p on p.id = cp.user_id
    where cp.visibility = 'public'
      and p.status = 'active'
      and exists (
        select 1
        from pg_catalog.unnest(cp.skills) as skill
        where v_job.title ilike '%' || skill || '%'
           or v_job.summary ilike '%' || skill || '%'
      )
    returning id
  loop
    insert into public.job_match_email_outbox (
      notification_id
    ) values (
      v_notif_id
    );
  end loop;
end;
$$;

revoke all on function public.publish_approved_job(uuid) from public, anon, authenticated;
grant execute on function public.publish_approved_job(uuid) to authenticated;

commit;
