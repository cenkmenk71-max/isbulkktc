-- Auto-fill the candidate's profile from the identity provider (Google, LinkedIn).
--
-- Before this migration the sign-up trigger copied only `display_name` (falling
-- back to `full_name`/`name`) and `locale`. The rest of the provider payload —
-- given/family name and avatar — was dropped, so a social account landed on a
-- bare profile and the user retyped data the provider already had.
--
-- Two pieces:
--   * `profiles` gains `avatar_url`, `given_name`, `family_name`.
--   * `handle_new_auth_user` (INSERT) fills them, and `sync_oauth_profile()`
--     refreshes them on every later OAuth login.
--
-- The e-mail is deliberately *not* copied: it already lives on
-- `auth.users.email` and the session exposes it, so a second copy would be a
-- value that can drift. The profile UI reads it from the session.
--
-- `sync_oauth_profile` is SECURITY DEFINER and touches only `auth.uid()`'s own
-- row, so a caller cannot reach another account. Column privileges are
-- unchanged: `authenticated` may still update only `display_name` and `locale`,
-- so the provider-sourced columns are not user-writable through PostgREST.

alter table public.profiles
  add column if not exists avatar_url text
    check (avatar_url is null or char_length(avatar_url) <= 2048),
  add column if not exists given_name text
    check (given_name is null or char_length(given_name) <= 80),
  add column if not exists family_name text
    check (family_name is null or char_length(family_name) <= 80);

-- Shared reader for the provider claims. Google and LinkedIn OIDC both send
-- `name`/`full_name`, `given_name`, `family_name` and `picture`/`avatar_url`;
-- the coalesce order matches how each provider actually populates the keys.
create or replace function public.oauth_profile_claims(_meta jsonb)
returns table (
  display_name text,
  avatar_url text,
  given_name text,
  family_name text
)
language sql
immutable
set search_path = ''
as $$
  select
    nullif(
      pg_catalog.left(
        pg_catalog.btrim(
          pg_catalog.regexp_replace(
            coalesce(
              nullif(pg_catalog.btrim(_meta ->> 'display_name'), ''),
              nullif(pg_catalog.btrim(_meta ->> 'full_name'), ''),
              nullif(pg_catalog.btrim(_meta ->> 'name'), ''),
              pg_catalog.concat_ws(
                ' ',
                nullif(pg_catalog.btrim(_meta ->> 'given_name'), ''),
                nullif(pg_catalog.btrim(_meta ->> 'family_name'), '')
              ),
              ''
            ),
            '[[:cntrl:]]',
            '',
            'g'
          )
        ),
        80
      ),
      ''
    ),
    nullif(
      pg_catalog.left(
        coalesce(
          nullif(pg_catalog.btrim(_meta ->> 'avatar_url'), ''),
          nullif(pg_catalog.btrim(_meta ->> 'picture'), '')
        ),
        2048
      ),
      ''
    ),
    nullif(pg_catalog.left(pg_catalog.btrim(_meta ->> 'given_name'), 80), ''),
    nullif(pg_catalog.left(pg_catalog.btrim(_meta ->> 'family_name'), 80), '');
$$;

revoke all on function public.oauth_profile_claims(jsonb)
  from public, anon, authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claims record;
  v_display_name text;
  v_locale text;
begin
  select * into v_claims
  from public.oauth_profile_claims(coalesce(new.raw_user_meta_data, '{}'::jsonb));

  v_display_name := coalesce(
    nullif(v_claims.display_name, ''),
    pg_catalog.split_part(coalesce(new.email, ''), '@', 1)
  );

  v_locale := case
    when new.raw_user_meta_data ->> 'locale' in ('tr', 'en', 'ru', 'el', 'fa', 'de')
      then new.raw_user_meta_data ->> 'locale'
    else 'tr'
  end;

  insert into public.profiles (
    id, display_name, locale, avatar_url, given_name, family_name
  )
  values (
    new.id,
    case
      when pg_catalog.char_length(v_display_name) >= 2 then v_display_name
      else 'Aday'
    end,
    v_locale,
    v_claims.avatar_url,
    v_claims.given_name,
    v_claims.family_name
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated;

-- Refreshes the caller's own provider-sourced columns on each OAuth login, so a
-- returning user picks up a changed avatar or name. A null claim leaves the
-- stored value untouched.
create or replace function public.sync_oauth_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_meta jsonb;
  v_claims record;
begin
  if v_uid is null then
    return;
  end if;

  select coalesce(u.raw_user_meta_data, '{}'::jsonb)
    into v_meta
  from auth.users as u
  where u.id = v_uid;

  if not found then
    return;
  end if;

  select * into v_claims from public.oauth_profile_claims(v_meta);

  -- `display_name` is deliberately untouched: it is user-editable, so a
  -- provider rename must not overwrite a name the candidate chose themselves.
  update public.profiles
     set avatar_url = coalesce(avatar_url, v_claims.avatar_url),
         given_name = coalesce(given_name, v_claims.given_name),
         family_name = coalesce(family_name, v_claims.family_name)
   where id = v_uid
     and (
       (avatar_url is null and v_claims.avatar_url is not null)
       or (given_name is null and v_claims.given_name is not null)
       or (family_name is null and v_claims.family_name is not null)
     );
end;
$$;

revoke all on function public.sync_oauth_profile()
  from public, anon, authenticated;
grant execute on function public.sync_oauth_profile() to authenticated;
