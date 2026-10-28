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

- **Employer logos are square canvases with the mark inside.** Every
  `source_site` company logo is stored on S3 at a 1:1 ratio (verified across the
  seed), so measuring the *rendered* aspect of an uploaded logo reports ~1.0 and
  cannot detect a wide wordmark. Aspect-driven tile shaping (`EmployerLogo`)
  only triggers for locally collected `/public/logos/*.webp` artwork, which the
  collector stores at its own ratio. Don't "fix" wide logos by measuring the
  employer canvas — the padding is baked into the bitmap.

- **A DB `logo_url` is not proof the image loads.** `Kıbet`'s S3 object returns
  **403**, so the card silently falls back to a monogram. Validate new logo URLs
  with `curl -o /dev/null -w '%{http_code}'` (S3 should be 200, the employer API
  redirects 302 to `s3.simeray.com`) before trusting a seed row.

- **Auth email templates live in `supabase/templates/`.** `config.toml` points
  at them with `[auth.email.template.<name>]` / `[auth.email.notification.<name>]`
  plus `content_path`. The CLI resolves `content_path` relative to the project
  root *and* falls back to a `supabase/`-prefixed path, so keep the
  `./supabase/templates/...` form. A template name is an arbitrary TOML key, so a
  typo (e.g. `recovry`) parses silently and GoTrue just keeps its built-in
  template — cross-check the section name against the GoTrue template list
  (`confirmation`, `recovery`, `invite`, `magic_link`, `email_change`,
  `reauthentication`) when adding one.

- **`auth.email.enable_confirmations = true` gates sign-in on a verified mailbox.**
  Any E2E or manual flow that signs in must first consume the confirmation link
  from the local mail catcher (port `54324`), or Supabase answers
  `email_not_confirmed`. The sign-in action maps that code to the
  `emailNotConfirmed` message; do not fold it back into the generic
  `signInFailed` copy.

- **React 19 hides component source locations from the browser.** The component
  inspector reads component names off `fiber.type` (still available), but
  `fiber._debugSource` no longer exists and Turbopack leaves `_debugStack`
  empty. Source `file:line` therefore comes from the server:
  `src/server/devtools/component-source.ts` parses `src/**/*.tsx` with the
  TypeScript compiler API and `POST /api/devtools/component` answers with the
  declaration site. The route returns **404 outside development**; keep it that
  way so it cannot leak filesystem paths from a deployed build.

- **React Server Components are invisible to the browser.** They never appear
  in the fiber tree, carry no `_debugOwner`, and the flight payload omits source
  positions, so a fiber walk from rendered markup stops at framework internals
  (`SegmentViewNode`, `IntlProvider`, …) and reports the wrong component. The
  inspector therefore sends the whole ancestor chain plus the element's literal
  `id`/class tokens (and those of its nearest ancestors). The server tries the
  chain first and then matches the DOM hints against the JSX that produced the
  markup, preferring a hint that is unique in the source. Anything that resolves
  an element to a component must keep both paths working — `HomeJobSearch`,
  `SiteFooter`, and `HomeExperience` are server components and are only
  reachable through the DOM-hint path.

- **Dev-only UI must be gated by a static `process.env.NODE_ENV` check.**
  A bare `dynamic(() => import(...))` still emits a chunk into the production
  bundle. Wrapping the `dynamic()` call in
  `process.env.NODE_ENV === "development" ? ... : () => null` lets the minifier
  drop the unreachable `import()`, and the inspector's styles live inside the
  component (injected `<style>`) rather than in `global.css` for the same
  reason. Verify with
  `grep -rl "component-inspector" <distDir>/static/` after a build.

- **Do not run a production build in the working tree without a throwaway
  `NEXT_DIST_DIR`.** `npm run build` rewrites `tsconfig.json` and
  `next-env.d.ts` to point at the dist directory it used; both files are
  tracked, so the build leaves the tree dirty. Build with
  `NEXT_DIST_DIR=.next-<name> npm run build` and `git checkout --
  tsconfig.json next-env.d.ts` afterwards, or the diff will carry unrelated
  config churn.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
