alter table public.applications
  add column first_viewed_at timestamptz,
  add column first_viewed_by uuid references public.profiles (id) on delete restrict,
  add constraint applications_first_view_consistent check (
    (first_viewed_at is null and first_viewed_by is null)
    or (first_viewed_at is not null and first_viewed_by is not null)
  );

create table public.application_contact_shares (
  application_id uuid primary key
    references public.applications (id) on delete cascade,
  candidate_id uuid not null
    references public.profiles (id) on delete restrict,
  email text not null
    check (char_length(email) between 3 and 254),
  shared_at timestamptz not null default pg_catalog.now()
);

alter table public.application_contact_shares enable row level security;
revoke all on table public.application_contact_shares from public, anon, authenticated;

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null
    references public.applications (id) on delete restrict,
  event_type text not null
    check (event_type in ('submitted', 'viewed', 'status_changed')),
  actor_id uuid references public.profiles (id) on delete set null,
  from_status text,
  to_status text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint application_events_status_change_valid check (
    (event_type = 'status_changed' and from_status is not null and to_status is not null)
    or (
      event_type = 'submitted'
      and from_status is null
      and to_status = 'submitted'
    )
    or (
      event_type = 'viewed'
      and from_status is null
      and to_status is null
    )
  )
);

create index application_events_application_recent_idx
  on public.application_events (application_id, created_at desc);

alter table public.application_events enable row level security;
revoke all on table public.application_events from public, anon, authenticated;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  application_event_id uuid not null
    references public.application_events (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  read_at timestamptz,
  unique (user_id, application_event_id)
);

create index notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
revoke all on table public.notifications from public, anon, authenticated;
grant select (id, user_id, application_event_id, created_at, read_at)
  on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notifications_read_own
  on public.notifications for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
  );

create policy notifications_mark_own_read
  on public.notifications for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
  )
  with check (
    user_id = (select auth.uid())
    and read_at is not null
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
  );

create table public.notification_email_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null
    references public.notifications (id) on delete restrict,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default pg_catalog.now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default pg_catalog.now(),
  unique (notification_id)
);

create index notification_email_outbox_pending_idx
  on public.notification_email_outbox (next_attempt_at, created_at)
  where sent_at is null;

alter table public.notification_email_outbox enable row level security;
revoke all on table public.notification_email_outbox from public, anon, authenticated;

create or replace function public.enqueue_application_notification(
  _user_id uuid,
  _event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications (user_id, application_event_id)
  values (_user_id, _event_id)
  on conflict (user_id, application_event_id) do nothing
  returning id into v_notification_id;

  if v_notification_id is not null then
    insert into public.notification_email_outbox (notification_id)
    values (v_notification_id)
    on conflict (notification_id) do nothing;
  end if;
end;
$$;

revoke all on function public.enqueue_application_notification(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.apply_to_job(
  _job_id uuid,
  _cover_letter text,
  _share_contact_email boolean
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

  if _cover_letter is null or pg_catalog.char_length(_cover_letter) > 5000
     or _share_contact_email is null then
    raise exception 'The application details are invalid.'
      using errcode = '22023';
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

  insert into public.applications (job_id, candidate_id, cover_letter)
  values (_job_id, v_actor, pg_catalog.btrim(_cover_letter))
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

create or replace function public.apply_to_job(
  _job_id uuid,
  _cover_letter text default ''
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.apply_to_job(_job_id, _cover_letter, false);
$$;

create or replace function public.mark_application_viewed(_application_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid;
  v_viewed_at timestamptz;
  v_event_id uuid;
  v_candidate_id uuid;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select j.company_id, a.candidate_id
    into v_company_id, v_candidate_id
  from public.applications as a
  join public.jobs as j on j.id = a.job_id
  where a.id = _application_id;

  if v_company_id is null
     or not public.is_active_company_member(
       v_company_id,
       array['owner', 'recruiter']::public.company_role[]
     ) then
    raise exception 'The application is not available to this company member.'
      using errcode = '42501';
  end if;

  update public.applications
  set first_viewed_at = pg_catalog.now(),
      first_viewed_by = v_actor
  where id = _application_id and first_viewed_at is null
  returning first_viewed_at into v_viewed_at;

  if v_viewed_at is not null then
    insert into public.application_events (
      application_id, event_type, actor_id
    ) values (_application_id, 'viewed', v_actor)
    returning id into v_event_id;

    perform public.enqueue_application_notification(v_candidate_id, v_event_id);

    insert into public.audit_logs (
      actor_id, action, resource_type, resource_id, metadata_redacted
    ) values (
      v_actor, 'application.viewed', 'application', _application_id,
      '{}'::jsonb
    );
  else
    select a.first_viewed_at into v_viewed_at
    from public.applications as a where a.id = _application_id;
  end if;

  return v_viewed_at;
end;
$$;

create or replace function public.get_application_contact_email(
  _application_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_contact_email text;
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  select s.email into v_contact_email
  from public.application_contact_shares as s
  join public.applications as a on a.id = s.application_id
  join public.jobs as j on j.id = a.job_id
  where a.id = _application_id
    and public.is_active_company_member(
      j.company_id,
      array['owner', 'recruiter']::public.company_role[]
    );

  if not found then
    raise exception 'The candidate did not share contact details or access is denied.'
      using errcode = '42501';
  end if;

  return v_contact_email;
end;
$$;

create or replace function public.list_my_applications()
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  job_slug text,
  application_status text,
  submitted_at timestamptz,
  first_viewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.job_id, j.title, j.slug, a.status, a.created_at, a.first_viewed_at
  from public.applications as a
  join public.jobs as j on j.id = a.job_id
  where a.candidate_id = v_actor
  order by a.created_at desc
  limit 100;
end;
$$;

create or replace function public.list_company_applications(_company_id uuid)
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  candidate_name text,
  application_status text,
  submitted_at timestamptz,
  first_viewed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.is_active_company_member(
       _company_id,
       array['owner', 'recruiter']::public.company_role[]
     ) then
    raise exception 'An active job-recruiting company member is required.'
      using errcode = '42501';
  end if;

  return query
  select a.id, a.job_id, j.title, p.display_name, a.status, a.created_at, a.first_viewed_at
  from public.applications as a
  join public.jobs as j on j.id = a.job_id
  join public.profiles as p on p.id = a.candidate_id
  where j.company_id = _company_id
  order by a.created_at desc
  limit 100;
end;
$$;

create or replace function public.get_company_application_detail(_application_id uuid)
returns table (
  application_id uuid,
  job_id uuid,
  job_title text,
  candidate_name text,
  cover_letter text,
  application_status text,
  submitted_at timestamptz,
  first_viewed_at timestamptz,
  contact_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     ) then
    raise exception 'An active authenticated account is required.'
      using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.job_id,
    j.title,
    p.display_name,
    a.cover_letter,
    a.status,
    a.created_at,
    a.first_viewed_at,
    s.email
  from public.applications as a
  join public.jobs as j on j.id = a.job_id
  join public.profiles as p on p.id = a.candidate_id
  left join public.application_contact_shares as s
    on s.application_id = a.id and s.candidate_id = a.candidate_id
  where a.id = _application_id
    and public.is_active_company_member(
      j.company_id,
      array['owner', 'recruiter']::public.company_role[]
    );

  if not found then
    raise exception 'The application is not available to this company member.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.claim_notification_email_outbox(_batch_size integer default 20)
returns table (
  outbox_id uuid,
  notification_id uuid,
  recipient_email text,
  recipient_locale text,
  event_type text,
  job_title text,
  application_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The notification worker role is required.'
      using errcode = '42501';
  end if;

  if _batch_size not between 1 and 100 then
    raise exception 'The notification batch size is invalid.'
      using errcode = '22023';
  end if;

  return query
  with selected as (
    select o.id
    from public.notification_email_outbox as o
    where o.sent_at is null
      and o.next_attempt_at <= pg_catalog.now()
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '5 minutes')
      and o.attempt_count < 10
    order by o.created_at
    limit _batch_size
    for update skip locked
  ),
  claimed as (
    update public.notification_email_outbox as o
    set claimed_at = pg_catalog.now(),
        attempt_count = o.attempt_count + 1
    from selected
    where o.id = selected.id
    returning o.id, o.notification_id
  )
  select
    claimed.id,
    n.id,
    u.email,
    p.locale,
    e.event_type,
    j.title,
    e.application_id
  from claimed
  join public.notifications as n on n.id = claimed.notification_id
  join auth.users as u on u.id = n.user_id and u.email_confirmed_at is not null
  join public.profiles as p on p.id = u.id and p.status = 'active'
  join public.application_events as e on e.id = n.application_event_id
  join public.applications as a on a.id = e.application_id
  join public.jobs as j on j.id = a.job_id;
end;
$$;

create or replace function public.finish_notification_email(
  _outbox_id uuid,
  _provider_message_id text,
  _error_code text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt_count integer;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The notification worker role is required.'
      using errcode = '42501';
  end if;

  if _error_code is not null and (
    pg_catalog.char_length(_error_code) > 80
    or _error_code !~ '^[A-Za-z0-9_-]+$'
  ) then
    raise exception 'The notification error code is invalid.'
      using errcode = '22023';
  end if;

  if _error_code is null then
    if _provider_message_id is null
       or pg_catalog.char_length(_provider_message_id) > 200 then
      raise exception 'The provider message identifier is invalid.'
        using errcode = '22023';
    end if;

    update public.notification_email_outbox
    set sent_at = pg_catalog.now(),
        claimed_at = null,
        provider_message_id = _provider_message_id,
        last_error_code = null
    where id = _outbox_id and sent_at is null;
  else
    select o.attempt_count into v_attempt_count
    from public.notification_email_outbox as o
    where o.id = _outbox_id and o.sent_at is null
    for update;

    if not found then
      return;
    end if;

    update public.notification_email_outbox
    set claimed_at = null,
        next_attempt_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => least(3600, 30 * (2 ^ least(v_attempt_count, 7))::integer)),
        last_error_code = _error_code
    where id = _outbox_id and sent_at is null;
  end if;
end;
$$;

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
  v_event_id uuid;
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

  insert into public.application_events (
    application_id, event_type, actor_id, from_status, to_status
  ) values (
    _application_id, 'status_changed', v_actor, v_application.status, _next_status
  )
  returning id into v_event_id;

  perform public.enqueue_application_notification(v_application.candidate_id, v_event_id);

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

revoke all on function public.apply_to_job(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.apply_to_job(uuid, text)
  from public, anon, authenticated;
revoke all on function public.mark_application_viewed(uuid)
  from public, anon, authenticated;
revoke all on function public.get_application_contact_email(uuid)
  from public, anon, authenticated;
revoke all on function public.transition_application(uuid, text)
  from public, anon, authenticated;
revoke all on function public.list_my_applications()
  from public, anon, authenticated;
revoke all on function public.list_company_applications(uuid)
  from public, anon, authenticated;
revoke all on function public.get_company_application_detail(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_notification_email_outbox(integer)
  from public, anon, authenticated;
revoke all on function public.finish_notification_email(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_to_job(uuid, text, boolean) to authenticated;
grant execute on function public.apply_to_job(uuid, text) to authenticated;
grant execute on function public.mark_application_viewed(uuid) to authenticated;
grant execute on function public.get_application_contact_email(uuid) to authenticated;
grant execute on function public.list_my_applications() to authenticated;
grant execute on function public.list_company_applications(uuid) to authenticated;
grant execute on function public.get_company_application_detail(uuid) to authenticated;
grant execute on function public.claim_notification_email_outbox(integer) to service_role;
grant execute on function public.finish_notification_email(uuid, text, text) to service_role;
grant execute on function public.transition_application(uuid, text) to authenticated;
