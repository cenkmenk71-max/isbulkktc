# İşbul KKTC — Copilot workspace rules

- `AGENTS.md` is the single source of truth for all project rules. Read it first.
- Package manager: `bun` only. Never `npm`, `npx`, or `yarn`.
- The only authoritative product/system design is `docs/architecture-v4.md`; use
  `docs/architecture.md` for implemented status and release gates. Never present
  planned V4 features as implemented.
- Keep work project-scoped. Authentication is verified server-side; every Server
  Action/Route Handler is an untrusted entry point. Enforce authorization in the
  DAL and PostgreSQL grants/RLS, never in UI visibility or client metadata.
- Never expose service-role credentials, secrets, private candidate data, or
  payment data.
- For third-party library/API documentation, use the workspace Context7 MCP
  (`use context7`) when available; still obey installed Next.js docs for
  version-specific behavior.
- Run the narrow relevant checks: `bun run lint`, `bun run typecheck`,
  `bun run check:frontend-source`, `bun run test:unit`, `bun run test:security`,
  `bun run test:db`, `bun run build`, `bun run test:e2e`.
- Preserve existing work, add positive and negative tests for authorization
  changes, and update directly related documentation. Never claim a test or
  security review passed unless it actually ran.