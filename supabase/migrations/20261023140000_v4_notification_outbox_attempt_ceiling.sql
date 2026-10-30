-- The 20261022134000 rewrite of claim_notification_email_outbox dropped the
-- `attempt_count < 10` predicate that the three earlier versions of this
-- function all carried (20261022130000, ...132000, ...133000). finish_notification_email
-- keeps rescheduling a failed row with next_attempt_at = now() + backoff, so
-- without the ceiling a permanently failing outbox row is claimed and retried
-- forever, one billed Resend call per attempt.
--
-- Restore the guard. The behaviour is otherwise identical to the current body.
create or replace function public.claim_notification_email_outbox(_batch_size integer default 20)
returns table (
  outbox_id uuid,
  notification_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  recipient_locale text,
  recipient_is_candidate boolean,
  event_type text,
  job_title text,
  application_status text,
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
    join public.notifications as n on n.id = o.notification_id
    join auth.users as u
      on u.id = n.user_id
      and u.email_confirmed_at is not null
      and u.email is not null
      and pg_catalog.btrim(u.email) <> ''
    join public.profiles as p on p.id = u.id and p.status = 'active'
    where o.sent_at is null
      and o.next_attempt_at <= pg_catalog.now()
      and o.attempt_count < 10
      and (
        o.claimed_at is null
        or o.claimed_at < pg_catalog.now() - interval '5 minutes'
      )
    order by o.created_at
    limit _batch_size
    for update of o skip locked
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
    n.user_id,
    u.email::text,
    p.locale::text,
    n.user_id = a.candidate_id,
    e.event_type::text,
    j.title::text,
    a.status::text,
    e.application_id
  from claimed
  join public.notifications as n on n.id = claimed.notification_id
  join auth.users as u
    on u.id = n.user_id
    and u.email_confirmed_at is not null
    and u.email is not null
    and pg_catalog.btrim(u.email) <> ''
  join public.profiles as p on p.id = u.id and p.status = 'active'
  join public.application_events as e on e.id = n.application_event_id
  join public.applications as a on a.id = e.application_id
  join public.jobs as j on j.id = a.job_id;
end;
$$;

revoke all on function public.claim_notification_email_outbox(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_email_outbox(integer)
  to service_role;
