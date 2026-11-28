begin;

alter table public.applications
  add column if not exists resume_id uuid
    references public.resumes (id) on delete set null;

-- Non-partial index: the unindexed_foreign_keys pgTAP ratchet excludes partial
-- indexes (`indpred is null`), so the FK on resume_id needs a plain leading
-- column index to count as covered.
create index if not exists applications_resume_id_idx
  on public.applications (resume_id);

-- Replace the 3-argument apply_to_job in place. `CREATE OR REPLACE` with a
-- different argument list would add a second overload instead of replacing,
-- leaving both `apply_to_job(uuid, text, boolean)` and
-- `apply_to_job(uuid, text, boolean, uuid)` and making 3-argument calls
-- ambiguous ("function is not unique"). Drop the old signature first so only
-- the 4-argument form remains; only `_resume_id` carries a default so 2-arg
-- calls resolve to the pre-existing `apply_to_job(uuid, text default '')`
-- wrapper without ambiguity.
drop function if exists public.apply_to_job(uuid, text, boolean);

create or replace function public.apply_to_job(
  _job_id uuid,
  _cover_letter text,
  _share_contact_email boolean,
  _resume_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_application_id uuid;
  v_event_id uuid;
  v_company_id uuid;
  v_email text;
  v_member record;
  v_resume_candidate_id uuid;
  v_resume_status text;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not exists (
       select 1 from public.candidate_profiles as cp
       where cp.user_id = v_actor
     ) then
    raise exception 'An active candidate profile is required.'
      using errcode = '42501';
  end if;

  if _cover_letter is null
     or pg_catalog.char_length(_cover_letter) > 5000
     or _share_contact_email is null then
    raise exception 'The application details are invalid.'
      using errcode = '22023';
  end if;

  if _resume_id is not null then
    select r.candidate_id, r.status
      into v_resume_candidate_id, v_resume_status
    from public.resumes as r
    where r.id = _resume_id;

    if not found then
      raise exception 'The requested resume does not exist.'
        using errcode = '22023';
    end if;

    if v_resume_candidate_id is distinct from v_actor then
      raise exception 'The resume does not belong to this candidate.'
        using errcode = '22023';
    end if;

    if v_resume_status <> 'parsed' then
      raise exception 'Only parsed resumes can be attached to an application.'
        using errcode = '22023';
    end if;
  end if;

  select j.company_id into v_company_id
  from public.jobs as j
  join public.companies as c on c.id = j.company_id
  where j.id = _job_id
    and j.status = 'published'
    and j.published_at <= pg_catalog.now()
    and j.expires_at > pg_catalog.now()
    and c.verification_status = 'verified'
    and j.publication_source = 'platform';

  if v_company_id is null then
    raise exception 'The job is not open for applications.'
      using errcode = '22023';
  end if;

  insert into public.applications (job_id, candidate_id, cover_letter, resume_id)
  values (_job_id, v_actor, pg_catalog.btrim(_cover_letter), _resume_id)
  returning id into v_application_id;

  if _share_contact_email then
    select u.email into v_email
    from auth.users as u
    where u.id = v_actor and u.email_confirmed_at is not null;

    if v_email is null then
      raise exception 'A verified email address is required to share contact details.'
        using errcode = '22023';
    end if;

    insert into public.application_contact_shares (
      application_id, candidate_id, email
    ) values (v_application_id, v_actor, v_email);
  end if;

  insert into public.application_events (
    application_id, event_type, actor_id, to_status
  ) values (
    v_application_id, 'submitted', v_actor, 'submitted'
  )
  returning id into v_event_id;

  perform public.enqueue_application_notification(v_actor, v_event_id);

  for v_member in
    select cm.user_id
    from public.company_members as cm
    where cm.company_id = v_company_id
      and cm.status = 'active'
      and cm.membership_role in ('owner', 'recruiter')
  loop
    perform public.enqueue_application_notification(v_member.user_id, v_event_id);
  end loop;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'application.submitted', 'application', v_application_id,
    pg_catalog.jsonb_build_object('job_id', _job_id)
  );

  return v_application_id;
end;
$$;

revoke all on function public.apply_to_job(uuid, text, boolean, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_to_job(uuid, text)
  from public, anon, authenticated;
grant execute on function public.apply_to_job(uuid, text, boolean, uuid)
  to authenticated;

commit;
