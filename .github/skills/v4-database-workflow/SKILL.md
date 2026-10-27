---
name: v4-database-workflow
description: "Use when creating or reviewing Supabase/PostgreSQL migrations, RLS, grants, SECURITY DEFINER RPCs, Auth triggers, Storage policies, or pgTAP tests for V4."
---

# Change the V4 database safely

1. Read the relevant V4 data model, authorization matrix, threat-model entry and existing migration/test patterns.
2. Map roles to every read/write operation. Inspect table grants as well as RLS; RLS alone does not grant table privileges.
3. Add constraints for invariant data, fully qualified names and an empty `search_path` for privileged functions. Revoke default execution before granting only the intended role.
4. Keep privileged changes atomic, validate values and active identity in the database, and write only redacted audit metadata.
5. Add both allowed and denied pgTAP cases for each affected trust boundary. Use synthetic identities and objects.
6. Run `npm run test:db` against local Supabase. If Docker or Supabase is unavailable, report the database gate as unverified; never present an emulator as equivalent.
7. Review migration ordering, rerun app typecheck/tests if types or behavior changed, and update [`docs/architecture.md`](../../../docs/architecture.md).

Do not connect a project MCP to a hosted Supabase project or run destructive/reset commands unless the user explicitly identifies and authorizes that target.
