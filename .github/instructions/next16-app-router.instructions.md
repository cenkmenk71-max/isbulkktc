---
description: "Use when changing Next.js 16 App Router pages, layouts, Route Handlers, Server Actions, authentication, Proxy, or caching."
applyTo:
  - "src/app/**/*.ts"
  - "src/app/**/*.tsx"
  - "src/features/**/*.ts"
  - "src/features/**/*.tsx"
  - "src/server/**/*.ts"
  - "proxy.ts"
---

# Next.js 16 implementation rules

- Before changing framework behavior, read the relevant installed guide under `node_modules/next/dist/docs/`; the installed Next.js version is authoritative, not generic or older examples.
- Keep pages and data access server-side by default. Add `"use client"` only for actual browser interaction, and never import server-only modules into client code.
- Treat every Server Action and Route Handler as a public, untrusted request: parse all input, verify the user with Supabase Auth, and authorize the requested resource on the server.
- Use the DAL for trusted user identity and narrow DTOs. Proxy cookie refresh is not an authorization check; do not gate private data with client state or claims alone.
- Use the Next.js 16 `proxy.ts` convention; do not create deprecated `middleware.ts` files. Handle `redirect()` outside `try` blocks because it throws to terminate control flow.
- Read request-time auth/cookies in dynamic routes; do not make authenticated pages statically prerender or cache across users.
