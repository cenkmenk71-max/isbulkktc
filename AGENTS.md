# AGENTS.md

## Project: isbulkktc — Northern Cyprus (KKTC) job & career platform

Next.js 16 (App Router) + TypeScript + next-intl + Supabase. Tests: Playwright
E2E, `node:test` unit tests, pgTAP database suites.

## Verify before pushing

CI (`.github/workflows/ci.yml`, job "Quality, database and E2E") runs the same
steps locally. Run them in this order:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run build`, then `npm run test:e2e` (E2E runs against the production
  standalone server at `.next/standalone/server.js`)
- `npm run test:db` (pgTAP; needs the local Supabase stack via Docker)

CI triggers only on `pull_request` and on `push` to `main`. Pushing a feature
branch by itself starts nothing — open a PR to get a run.

## Gotchas worth remembering

- **Canonical URLs must be absolute strings.** In `src/lib/seo.ts`,
  `alternates.canonical` is built with `getLocalizedPageUrl(...).toString()`.
  Passing a `URL` instance makes Next.js treat it as a *base* and re-resolve it
  against the request pathname, so the default-locale path `/freelance` emitted
  a `/tr/freelance` canonical. The dev server hides this (its pathname is
  already unprefixed); the production standalone server used by CI exposes it.
  `alternates.languages` already used strings, which is why only canonical broke.

- **pgTAP suites must be independent of the seed.** `supabase/seed-source-jobs.sql`
  commits real source listings before `supabase test db` runs. Suites that count
  or free-text-search `public.jobs` must clear committed source data at the start
  of their transaction (`delete from public.job_source_imports; delete from
  public.jobs where publication_source = 'source_site'; delete from public.companies
  where slug like 'source-%';`). The transaction rolls back, so the seed survives
  for the E2E run that follows.

- **3D/WebGL E2E is load-sensitive.** The suite renders animated Three.js scenes
  with software WebGL (`--use-angle=swiftshader`). Give those specs generous
  per-test timeouts and rely on the CI retry budget for load-related flakes.

- **Locale routing uses `localePrefix: "as-needed"`.** The default locale (`tr`)
  is unprefixed in canonical/`x-default` output but prefixed in the served URL.
  Keep this in mind when asserting on URLs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
