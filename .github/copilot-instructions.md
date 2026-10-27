# İşbul KKTC — Copilot workspace rules

- The only authoritative product/system design is [`docs/architecture-v4.md`](../docs/architecture-v4.md). Use [`docs/architecture.md`](../docs/architecture.md) for implemented status and release gates; never present planned V4 features as implemented.
- Keep work project-scoped. Follow these rules and the matching files in `.github/instructions/`; load procedural `.github/skills/` only when a task needs them.
- This project uses Next.js 16. Read the relevant installed guide in `node_modules/next/dist/docs/` before changing framework behavior; follow the installed version, including `proxy.ts` rather than legacy middleware conventions.
- Authentication is verified server-side; every Server Action/Route Handler is an untrusted entry point. Enforce authorization in the DAL and PostgreSQL grants/RLS, never in UI visibility or client metadata.
- Never expose service-role credentials, secrets, private candidate data, payment data, or Supabase production access. Do not add real IBANs, payment rules, retention periods, providers, or privileged admin paths without explicit approval.
- Use project-local Node/npm and tools on D:. Do not install global extensions, tools, agents, or user-profile customizations.
- For third-party library/API documentation, use the workspace Context7 MCP (`use context7`) when available; still obey installed Next.js docs for version-specific behavior.
- Run the narrow relevant checks. Available gates: `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db`, `npm run test:e2e`, and `npm run build`. Real Supabase database tests require Docker and Supabase CLI; report when unavailable.
- Preserve existing work, add positive and negative tests for authorization changes, and update directly related documentation. Never claim a test or security review passed unless it actually ran.
