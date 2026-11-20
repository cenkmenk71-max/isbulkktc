-- Make the project's RLS-on-create event trigger reproducible and fail closed.
--
-- Production had an out-of-band `ensure_rls` event trigger calling
-- `public.rls_auto_enable()`. Supabase documents this as an application-defined
-- event-trigger pattern; it is not a Supabase-managed built-in. Keeping the
-- function only in the live database meant fresh environments could silently
-- diverge from production.
--
-- The helper is a SECURITY DEFINER event-trigger function, not an RPC. Its
-- `event_trigger` pseudo-type return is not callable through PostgREST, but the
-- default function ACL still exposed EXECUTE to PUBLIC/anon/authenticated and
-- the Security Advisor reported it as an externally executable definer.
--
-- Recreate the event trigger from source, pin an empty search_path, qualify all
-- catalog helpers, quote identifiers, and re-raise any failure. Swallowing an
-- exception here would let CREATE TABLE succeed without RLS. The event trigger
-- is installed before client EXECUTE privileges are revoked; PostgreSQL invokes
-- event-trigger functions through the registered trigger, not through a client
-- RPC grant.
--
-- The file is intentionally re-runnable because this repository's custom
-- migration ledger can replay migration files during db push.

create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  cmd record;
  tbl name;
begin
  for cmd in
    select *
    from pg_catalog.pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        select c.relname
          into tbl
        from pg_catalog.pg_class as c
        where c.oid = cmd.objid;

        if tbl is null then
          raise exception 'Could not resolve the newly created public table for RLS enforcement.';
        end if;

        execute pg_catalog.format(
          'alter table if exists %I.%I enable row level security',
          cmd.schema_name,
          tbl
        );
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on % (SQLSTATE %)',
            cmd.object_identity,
            sqlstate;
          raise;
      end;
    else
      raise log 'rls_auto_enable: skip % (schema % is outside the enforced public schema)',
        cmd.object_identity,
        cmd.schema_name;
    end if;
  end loop;
end;
$function$;

drop event trigger if exists ensure_rls;

create event trigger ensure_rls
on ddl_command_end
when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
execute function public.rls_auto_enable();

-- The registered event trigger is the only intended invocation path.
revoke all on function public.rls_auto_enable()
  from public, anon, authenticated, service_role;
