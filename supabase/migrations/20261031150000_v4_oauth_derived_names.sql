-- Google never sends `given_name` / `family_name`.
--
-- Supabase stores a Google profile as `name`, `full_name` and `picture` (plus
-- `avatar_url`) — it does *not* split the name into the OIDC pair. Only LinkedIn
-- (`linkedin_oidc`) sends `given_name` / `family_name`. Verified against the live
-- project: every Google identity carries `full_name`/`name`, every LinkedIn
-- identity carries the pair.
--
-- The claims reader therefore produced a display name from `full_name` but left
-- `given_name` and `family_name` null for *every* Google account, so the account
-- card showed a name next to two empty "Ad" / "Soyad" fields for the provider
-- most social sign-ups actually use.
--
-- `oauth_profile_claims` now derives the pair from `full_name` when the provider
-- did not split it. Nothing else changes: `handle_new_auth_user` fills the
-- columns on insert and `sync_oauth_profile` backfills them on the next social
-- sign-in, so accounts created before this migration heal themselves. An
-- explicit provider pair still wins, and a single-token name yields no family
-- name rather than an empty string.

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
  with claims as (
    select
      nullif(pg_catalog.btrim(_meta ->> 'display_name'), '') as meta_display_name,
      nullif(pg_catalog.btrim(_meta ->> 'given_name'), '') as meta_given_name,
      nullif(pg_catalog.btrim(_meta ->> 'family_name'), '') as meta_family_name,
      nullif(
        coalesce(
          nullif(pg_catalog.btrim(_meta ->> 'full_name'), ''),
          nullif(pg_catalog.btrim(_meta ->> 'name'), '')
        ),
        ''
      ) as full_name
  ),
  derived as (
    select
      claims.*,
      pg_catalog.split_part(claims.full_name, ' ', 1) as first_token
    from claims
  )
  select
    nullif(
      pg_catalog.left(
        pg_catalog.btrim(
          pg_catalog.regexp_replace(
            coalesce(
              derived.meta_display_name,
              derived.full_name,
              pg_catalog.concat_ws(
                ' ',
                derived.meta_given_name,
                derived.meta_family_name
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
    nullif(
      pg_catalog.left(
        coalesce(
          derived.meta_given_name,
          nullif(derived.first_token, '')
        ),
        80
      ),
      ''
    ),
    nullif(
      pg_catalog.left(
        coalesce(
          derived.meta_family_name,
          nullif(
            pg_catalog.btrim(
              pg_catalog.substr(
                derived.full_name,
                pg_catalog.char_length(derived.first_token) + 2
              )
            ),
            ''
          )
        ),
        80
      ),
      ''
    )
  from derived;
$$;

revoke all on function public.oauth_profile_claims(jsonb)
  from public, anon, authenticated;
