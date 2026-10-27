create or replace function public.list_my_application_notifications()
returns table (
  notification_id uuid,
  event_type text,
  application_id uuid,
  job_title text,
  application_status text,
  created_at timestamptz,
  read_at timestamptz
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
  select n.id, e.event_type, e.application_id, j.title, e.to_status,
         n.created_at, n.read_at
  from public.notifications as n
  join public.application_events as e on e.id = n.application_event_id
  join public.applications as a on a.id = e.application_id
  join public.jobs as j on j.id = a.job_id
  where n.user_id = v_actor
  order by n.created_at desc
  limit 100;
end;
$$;

revoke all on function public.list_my_application_notifications()
  from public, anon, authenticated;
grant execute on function public.list_my_application_notifications()
  to authenticated;
