-- Backfill the OAuth name columns for accounts created before the reader
-- learned to derive them (20261031150000_v4_oauth_derived_names.sql).
--
-- The trigger `handle_new_auth_user` fills `given_name` / `family_name` on
-- insert, and `sync_oauth_profile` refreshes them on the next social sign-in,
-- but neither touches an account that is never used again. Every Google account
-- created before that migration therefore keeps two null columns until it signs
-- in, and the account card shows a name next to two empty fields.
--
-- The update only reads the account's own provider metadata and only fills a
-- null column (`coalesce`), so an explicit value is never overwritten and an
-- e-mail account (no name in metadata) is left untouched. The metadata is the
-- user's own, read from `auth.users`; nothing is copied between accounts.
--
-- On a fresh `supabase db reset` there are no pre-existing users, so this is a
-- no-op — it exists so the hosted project and a rebuilt database stay in step.

update public.profiles p
set
  given_name = coalesce(p.given_name, c.given_name),
  family_name = coalesce(p.family_name, c.family_name)
from auth.users u
cross join lateral public.oauth_profile_claims(u.raw_user_meta_data) c
where
  u.id = p.id
  and (c.given_name is not null or c.family_name is not null)
  and (p.given_name is null or p.family_name is null);
