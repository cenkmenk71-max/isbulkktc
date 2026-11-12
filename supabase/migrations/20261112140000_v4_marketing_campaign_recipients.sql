-- Acquisition ("marketing") campaign recipients.
--
-- The marketing family is promotional, so — like the engagement digest — it
-- requires consent and must never contact an address that opted out. The
-- consent basis is stronger than the digest's, though: a `sales_leads` row is
-- someone who submitted the corporate-quote form and thereby asked to be
-- contacted. The 911-row company directory is deliberately NOT a source — a
-- directory company never asked for anything, so mailing it would be cold,
-- unsolicited bulk mail (the fastest way to a spam folder, and a KVKK problem).
--
-- Read-only. The route marks a lead `contacted` after a successful send, so a
-- later run resumes from where this one stopped instead of re-mailing everyone.
-- `_after` keyset-paginates on the lead id so the caller walks the list without
-- OFFSET drift.

create or replace function public.list_marketing_recipients(
  _after uuid,
  _batch_size integer
)
returns table (
  lead_id uuid,
  email text,
  locale text
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The marketing worker role is required.'
      using errcode = '42501';
  end if;

  return query
  select l.id, l.email, l.locale
  from public.sales_leads as l
  where l.status = 'new'
    and (_after is null or l.id > _after)
    and not exists (
      select 1 from public.email_engagement_optouts as o
      where o.email = pg_catalog.lower(l.email)
    )
  order by l.id
  limit greatest(1, least(coalesce(_batch_size, 50), 200));
end;
$$;

revoke all on function public.list_marketing_recipients(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.list_marketing_recipients(uuid, integer) to service_role;

-- Advance one lead out of the `new` queue after its campaign email went out, so
-- the next run resumes instead of re-mailing. A dedicated RPC (rather than a
-- direct table update from the route) keeps `sales_leads` written only through
-- definer functions, matching `submit_sales_lead`. The `status = 'new'` guard
-- means a lead a human already moved to `quoted`/`won`/`lost` is never clobbered.
create or replace function public.mark_marketing_lead_contacted(_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'The marketing worker role is required.'
      using errcode = '42501';
  end if;

  update public.sales_leads
  set status = 'contacted'
  where id = _lead_id
    and status = 'new';
end;
$$;

revoke all on function public.mark_marketing_lead_contacted(uuid)
  from public, anon, authenticated;
grant execute on function public.mark_marketing_lead_contacted(uuid) to service_role;
