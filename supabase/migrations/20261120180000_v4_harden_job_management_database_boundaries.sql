begin;

-- The Next.js page and Server Action both require AAL2, but the SECURITY
-- DEFINER RPC is also callable directly through the Supabase Data API.
-- Enforce the assurance level at the database authorization boundary.
create or replace function public.review_job(
  _job_id uuid,
  _decision text,
  _review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if (select auth.jwt() ->> 'aal') is distinct from 'aal2' then
    raise exception 'AAL2 authentication is required for job moderation.'
      using errcode = '42501';
  end if;

  if v_actor is null
     or not exists (
       select 1 from public.profiles as p
       where p.id = v_actor and p.status = 'active'
     )
     or not public.has_platform_role('platform_admin') then
    raise exception 'An active platform administrator is required.'
      using errcode = '42501';
  end if;

  if _decision is null
     or _decision not in ('approved', 'rejected')
     or (_review_note is not null and pg_catalog.char_length(_review_note) > 1000)
     or (_decision = 'rejected' and pg_catalog.btrim(coalesce(_review_note, '')) = '') then
    raise exception 'The moderation decision or review note is invalid.'
      using errcode = '22023';
  end if;

  update public.jobs
  set status = _decision,
      moderation_note = nullif(pg_catalog.btrim(_review_note), ''),
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now()
  where id = _job_id
    and status = 'pending_review';

  if not found then
    raise exception 'Only pending jobs can be reviewed.'
      using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_id, action, resource_type, resource_id, metadata_redacted
  ) values (
    v_actor, 'job.moderated', 'job', _job_id,
    pg_catalog.jsonb_build_object('decision', _decision)
  );
end;
$$;

-- Keep the database ownership invariant aligned with the employer DAL and
-- Server Actions. The source-import table constraint currently allows only
-- published source listings; this predicate is defense in depth if that model
-- is extended in the future.
drop policy if exists jobs_company_update_editable on public.jobs;

create policy jobs_company_update_editable
  on public.jobs for update to authenticated
  using (
    publication_source = 'platform'
    and status in ('draft', 'rejected')
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and public.is_active_company_member(
      company_id,
      array['owner', 'recruiter']::public.company_role[]
    )
  )
  with check (
    publication_source = 'platform'
    and status in ('draft', 'rejected')
    and exists (
      select 1 from public.profiles as p
      where p.id = (select auth.uid()) and p.status = 'active'
    )
    and public.is_active_company_member(
      company_id,
      array['owner', 'recruiter']::public.company_role[]
    )
  );

commit;
