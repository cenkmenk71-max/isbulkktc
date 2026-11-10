-- Defence in depth, second half of #282: enforce the push host rule on the
-- table, not only in the RPC.
--
-- #533 (`20261110000000`) and #536 (`20261110130000`) taught
-- `register_push_subscription` to accept only a push-service host, and to take
-- the URL authority the way the URL parser does. But the rule still lives in
-- *one* place: the RPC body. The table itself only pins the endpoint's length
-- (`check (char_length(endpoint) between 12 and 1024)`,
-- `20261102100000_v4_web_push_subscriptions.sql`). Any writer that does not go
-- through the RPC — a service-role maintenance script, a data-fix migration, a
-- future RPC — can store `https://169.254.169.254/…` or `https://evil.example/…`
-- and the database will accept it, because the only check that runs is the
-- length one.
--
-- This migration moves the rule down to the table as a CHECK constraint, so the
-- invariant holds for *every* writer, not just the reviewed one. The rule is
-- factored into an IMMUTABLE helper, `public.is_allowed_push_endpoint`, that
-- mirrors the effective RPC guard (`20261110130000`) exactly:
--
--   * the authority ends at the first `/`, `\`, `?` or `#` (what the URL parser
--     treats as the end of the host),
--   * the authority must be a bare hostname and an optional all-digit port
--     (`@`, a percent-encoded separator or any stray character is refused),
--   * the port, when present, must be <= 65535 (`new URL('https://a:65536/')`
--     throws, so the database must refuse it too),
--   * the host must be one of the known push services.
--
-- The helper is the CHECK validator, so it runs with the *caller's* privileges.
-- The only writer is the SECURITY DEFINER RPC (which runs as the owner), so the
-- helper needs no client grant — and deliberately gets none: `revoke … from
-- public, anon, authenticated` keeps it off the client surface and out of the
-- `function_privileges` ratchet. Unlike `is_valid_company_categories` /
-- `is_valid_candidate_profile_section`, no client INSERT reaches this CHECK (the
-- table is revoked from both roles), so there is no grant to preserve.
--
-- The constraint is added `not valid`: endpoints stored before the allowlist
-- shipped (before 20261110000000) could be arbitrary HTTPS URLs, and a plain
-- ADD CONSTRAINT would scan the table and abort the whole migration if any such
-- row survives. `not valid` enforces the rule on every new INSERT/UPDATE
-- immediately while leaving existing rows alone; the operator can
-- `validate constraint` once the old rows are gone (it is a metadata-only
-- operation at that point). No existing row is deleted here — that is live-data
-- surgery, not this migration's job.

create or replace function public.is_allowed_push_endpoint(_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with candidate as (
    -- The RPC btrims before it validates and stores the trimmed value; the
    -- table check mirrors that, so a padded endpoint is judged on its trimmed
    -- form rather than on the padding.
    select pg_catalog.btrim(_endpoint) as endpoint
  ),
  parts as (
    select
      c.endpoint as endpoint,
      -- The authority ends where the URL parser ends it: at the first `/`, `\`,
      -- `?` or `#`.
      pg_catalog.split_part(
        pg_catalog.split_part(
          pg_catalog.split_part(
            pg_catalog.split_part(c.endpoint, '/', 3),
            E'\\',
            1
          ),
          '?',
          1
        ),
        '#',
        1
      ) as authority
    from candidate as c
  )
  select
    p.endpoint is not null
    and pg_catalog.char_length(p.endpoint) between 12 and 1024
    and p.endpoint ~ '^https://'
    -- A bare hostname and an optional all-digit port. `@` (URL credentials), a
    -- percent-encoded separator or any stray character fails this.
    and p.authority ~ '^[A-Za-z0-9.-]+(:[0-9]+)?$'
    -- `new URL('https://a:65536/')` throws, so refuse it here too. The port is
    -- already digits-only from the regex; `numeric` avoids an overflow.
    and (
      pg_catalog.split_part(p.authority, ':', 2) = ''
      or pg_catalog.split_part(p.authority, ':', 2)::pg_catalog.numeric <= 65535
    )
    -- The host must be a known push service.
    and (
      pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1)) in (
        'fcm.googleapis.com',
        'android.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com'
      )
      or pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1))
           like '%.notify.windows.com'
      or pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1))
           like '%.push.apple.com'
      or pg_catalog.lower(pg_catalog.split_part(p.authority, ':', 1))
           like '%.push.services.mozilla.com'
    )
  from parts as p;
$$;

revoke all on function public.is_allowed_push_endpoint(text)
  from public, anon, authenticated;

-- Idempotent like its sibling migrations: this ledger is the custom
-- `public._applied_migrations`, so `supabase db push` re-runs every file. A bare
-- `add constraint` would abort the second run with "constraint already exists".
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_host_allowed;

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_host_allowed
    check (public.is_allowed_push_endpoint(endpoint)) not valid;
