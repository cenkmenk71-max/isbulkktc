begin;

-- Job match email outbox worker functions
-- Mirrors the notification_email_outbox worker pattern

create or replace function public.claim_job_match_email_outbox(_batch_size integer default 20)
returns table (
  outbox_id uuid,
  notification_id uuid,
  recipient_email text,
  recipient_locale text,
  job_title text,
  company_name text,
  match_score integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The job match email worker role is required.'
      using errcode = '42501';
  end if;

  if _batch_size not between 1 and 100 then
    raise exception 'The job match batch size is invalid.'
      using errcode = '22023';
  end if;

  return query
  with selected as (
    select o.id
    from public.job_match_email_outbox as o
    where o.sent_at is null
      and o.next_attempt_at <= pg_catalog.now()
      and (o.claimed_at is null or o.claimed_at < pg_catalog.now() - interval '5 minutes')
      and o.attempt_count < 10
    order by o.created_at
    limit _batch_size
    for update skip locked
  ),
  claimed as (
    update public.job_match_email_outbox as o
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
    j.title,
    c.name,
    n.match_score
  from claimed
  join public.job_match_notifications as n on n.id = claimed.notification_id
  join auth.users as u on u.id = n.user_id and u.email_confirmed_at is not null
  join public.profiles as p on p.id = u.id and p.status = 'active'
  join public.jobs as j on j.id = n.job_id
  join public.companies as c on c.id = j.company_id;
end;
$$;

create or replace function public.finish_job_match_email(
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
    raise exception 'The job match email worker role is required.'
      using errcode = '42501';
  end if;

  if _error_code is not null and (
    pg_catalog.char_length(_error_code) > 80
    or _error_code !~ '^[A-Za-z0-9_-]+$'
  ) then
    raise exception 'The job match error code is invalid.'
      using errcode = '22023';
  end if;

  if _error_code is null then
    if _provider_message_id is null
       or pg_catalog.char_length(_provider_message_id) > 200 then
      raise exception 'The provider message identifier is invalid.'
        using errcode = '22023';
    end if;

    update public.job_match_email_outbox
    set sent_at = pg_catalog.now(),
        claimed_at = null,
        provider_message_id = _provider_message_id,
        last_error_code = null
    where id = _outbox_id and sent_at is null;
  else
    select o.attempt_count into v_attempt_count
    from public.job_match_email_outbox as o
    where o.id = _outbox_id and o.sent_at is null
    for update;

    if not found then
      return;
    end if;

    update public.job_match_email_outbox
    set claimed_at = null,
        next_attempt_at = pg_catalog.now()
          + pg_catalog.make_interval(secs => least(3600, 30 * (2 ^ least(v_attempt_count, 7))::integer)),
        last_error_code = _error_code
    where id = _outbox_id and sent_at is null;
  end if;
end;
$$;

-- Revoke default grants and grant only to service_role
revoke all on function public.claim_job_match_email_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_job_match_email_outbox(integer)
  to service_role;

revoke all on function public.finish_job_match_email(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finish_job_match_email(uuid, text, text)
  to service_role;

commit;