-- 20261013000000 granted update on candidate_profiles column-by-column and left
-- user_id out, so PostgREST's `resolution=merge-duplicates` upsert fails: it emits
-- `"user_id" = excluded."user_id"` in the DO UPDATE SET list, and the update path
-- then needs UPDATE on user_id. Every profile save from
-- src/features/candidates/actions.ts hit `42501 permission denied for table
-- candidate_profiles`.
--
-- The RLS update policy is `using (auth.uid() = user_id) with check
-- (auth.uid() = user_id)`, so a row's owner cannot change: the WITH CHECK rejects
-- any new row whose user_id is not the caller's. Granting UPDATE on user_id
-- therefore adds no privilege beyond what RLS already allows.
grant update (user_id)
  on table public.candidate_profiles
to authenticated;
