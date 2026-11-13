-- Drop the three out-of-band probe functions (#619).
--
-- Production carried three debug helpers that no migration ever created and the
-- repository never contained:
--
--   * `__lane_probe_headers()` — SECURITY DEFINER; returns
--     `current_setting('request.headers')::jsonb`, i.e. the caller's **entire**
--     request header set (Authorization, apikey, cookies included).
--   * `_oh_probe_headers()`   — the same header read, SECURITY INVOKER.
--   * `_oh_probe_role()`      — SECURITY DEFINER; returns the caller's
--     `auth.role()`, `auth.uid()` and `current_user`.
--
-- All three were executable by `anon` through `/rest/v1/rpc/...`, so a client on
-- the same origin (or an XSS / RSC payload) could read its own request headers —
-- the session `apikey` and cookies among them — from the public REST surface.
-- They are lane-orchestration debris (#602); the code side was already clean, so
-- this closes the code↔live gap the security advisor flagged as
-- `anon_security_definer_function_executable`.
--
-- The functions have already been dropped on Production, out of band, and the
-- matching ledger row (`20261112150000_v4_drop_probe_functions.sql`) is present.
-- This file exists so the repository matches the database and a fresh rebuild
-- reproduces the same schema; `if exists` makes re-running it a no-op.
--
-- `rls_auto_enable()` is deliberately NOT dropped. The advisor lists it in the
-- same "anon-executable SECURITY DEFINER" bucket, but it is the Supabase
-- platform's own RLS auto-enable helper (`returns event_trigger`, targeted by
-- the `ensure_rls` event trigger) and is not reachable over REST
-- (`/rest/v1/rpc/rls_auto_enable` answers HTTP 400 on the pseudo-type return).

drop function if exists public.__lane_probe_headers();
drop function if exists public._oh_probe_headers();
drop function if exists public._oh_probe_role();
