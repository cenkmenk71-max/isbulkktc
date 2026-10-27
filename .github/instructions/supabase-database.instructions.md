---
description: "Use when changing Supabase PostgreSQL schema, migrations, grants, RLS, RPCs, Auth triggers, Storage, or pgTAP tests."
applyTo: "supabase/**/*.sql"
---

# Supabase database rules

- Follow V4 and the threat model. Migrations are additive and explicit; do not edit the preserved `docs/architecture-v4.md` source.
- For each new table/function, inspect default privileges and explicitly grant the minimum required columns/operations. Enable RLS and add positive and negative tests for anon, owner, unrelated users, company members, and privileged actors as applicable.
- Keep `SECURITY DEFINER` functions narrowly scoped with `SET search_path = ''`, fully qualified objects, authenticated active-user checks, validated input, and revoked default/public execution.
- Never let clients assign platform roles, verification, payment state, balance, actor IDs, or company membership roles. Couple sensitive multi-row mutations in one database transaction and emit redacted audit data.
- Do not add permissive Storage policies before ownership, scanning, access and retention controls are implemented.
- Run `npm run test:db` against the real local Supabase stack when Docker is available. A SQL parser or PostgreSQL emulator is not a substitute; state clearly when pgTAP was not run.
