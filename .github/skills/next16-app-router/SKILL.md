---
name: next16-app-router
description: "Use when implementing or diagnosing Next.js 16 App Router pages, Proxy, Server Actions, Route Handlers, caching, server/client boundaries, or authentication."
---

# Implement a Next.js 16 change

1. Read `docs/architecture-v4.md`, `docs/architecture.md`, and the relevant code path.
2. Confirm the installed Next.js version and read the relevant guide from `node_modules/next/dist/docs/` before using framework APIs.
3. Keep user/session verification in the server DAL. Re-check authorization and validate input inside every action/handler; Proxy only refreshes cookies.
4. Prefer Server Components. Isolate browser interaction in the smallest Client Component and keep secrets/database access server-only.
5. Preserve dynamic rendering for user-specific routes; do not statically render or cross-user cache authenticated data.
6. Add a test for the observable behavior and run the narrow check, then lint/typecheck if types or framework boundaries changed.
7. Update project documentation when behavior, configuration, or release gates change.
