# AGENTS.md

## Project: isbulkktc — Northern Cyprus (KKTC) job & career platform

Next.js 16 (App Router) + TypeScript + next-intl + Supabase. Tests: Playwright
E2E, `node:test` unit tests, pgTAP database suites.

## Package manager

Use `bun` only. Never use `npm`, `npx`, or `yarn`. The lockfile is `bun.lock`;
`npm ci` fails against it. All verification commands in this file use `bun`.

## Verify before pushing

CI (`.github/workflows/ci.yml`) runs the same steps locally, split across three
jobs plus an aggregator named "Quality, database and E2E"; it passes only when
all three did. CI triggers only on `pull_request`. Pushing a feature branch or
`main` by itself does not run the test suite; open a PR to get a CI run. A push
to `main` triggers separate production-deployment verification.

Branch protection does not require the branch to be up to date — that was tried
and caused a cascade of invalidated PRs, so it is off. Full CI is still required
on every PR.

Run locally in this order:

- `bun run lint`
- `bun run typecheck`
- `bun run check:frontend-source`
- `bun run test:unit`
- `bun run test:security`
- `bun run test:integration`
- `bun run build`, then `bun run test:e2e` (split across four Playwright shards:
  `--shard=n/4`, against `.next/standalone/server.js`)
- `bun run test:db` (pgTAP; needs the local Supabase stack via Docker)

`test:db` and `test:e2e` require infrastructure; report when unavailable. Never
mark skipped, emulated, or unavailable-infrastructure tests as passing.

Run the narrow relevant checks and inspect their complete result before
claiming anything passed.

## Next.js 16

This is NOT the Next.js you know — read the installed guide under
`node_modules/next/dist/docs/` before changing framework behavior; the installed
version is authoritative, not generic or older examples.

- Keep pages and data access server-side by default. Add `"use client"` only for
  actual browser interaction; never import server-only modules into client code.
- Treat every Server Action and Route Handler as a public, untrusted request:
  parse all input, verify the user with Supabase Auth, and authorize the
  requested resource on the server.
- Use the DAL for trusted user identity and narrow DTOs. Proxy cookie refresh is
  not an authorization check; do not gate private data with client state or
  claims alone.
- Use the Next.js 16 `proxy.ts` convention; do not create deprecated
  `middleware.ts` files. Handle `redirect()` outside `try` blocks because it
  throws to terminate control flow.
- Read request-time auth/cookies in dynamic routes; do not statically prerender
  or cache authenticated pages across users.
- Preserve dynamic rendering for user-specific routes; isolate browser
  interaction in the smallest Client Component; keep secrets/database access
  server-only.

## Deep audit workflow

Use when asked to deep-search, thoroughly audit, find mistakes, bugs, security
or logical flaws, or verify that implemented features really work.

1. Establish the requested scope and the authoritative spec. For this project,
   V4 (`docs/architecture-v4.md`) is the only architecture source; separate
   implementation status from planned requirements.
2. Trace reachable user workflows end to end: route/UI → form/action/handler →
   schema → server authentication/DAL → database function/grants/RLS → test
   coverage.
3. Search for callers, route targets and competing configuration; read complete
   relevant file ranges before judging behavior.
4. Check concrete edge cases and threat boundaries: anonymous/other-user access,
   suspended status, duplicate submissions, malformed input, redirects/cookies,
   unhandled errors and missing configuration.
5. Execute the narrow relevant test/lint/type/build command. Do not substitute
   source-pattern matches for runtime evidence or claim unavailable integrations
   were verified.
6. Fix only confirmed defects in scope when implementation is requested. Add a
   regression test and rerun verification.
7. Report findings by severity with absolute file/line links and evidence; list
   planned-but-disabled features and infrastructure blockers separately. Do not
   call an audit a security certification.

## V4 Reviewer (read-only)

Review only; do not edit files or run commands.

1. Use `docs/architecture-v4.md` as the sole product/security authority and
   `docs/architecture.md` as implementation status.
2. Trace concrete behavior through UI, server action/handler, DAL, PostgreSQL
   grants/RLS/RPC and tests. Do not infer a vulnerability from naming alone.
3. Prioritize reproducible bugs and cross-account access. Give exact absolute
   file and line references, impact, and confidence.
4. Distinguish confirmed issues, design tradeoffs, and planned/disabled scope.
   Do not report an emulator as real Supabase validation or claim certification.
5. Return only actionable findings; if no finding is evidenced, say so and state
   what was not verified.

## Supabase / database

Follow V4 (`docs/architecture-v4.md` is the sole product/security authority;
`docs/architecture.md` is implementation status). Migrations are additive and
explicit.

- For each new table/function, inspect default privileges and grant the minimum
  required columns/operations. Enable RLS and add positive and negative tests
  for anon, owner, unrelated users, company members, and privileged actors as
  applicable.
- Keep `SECURITY DEFINER` functions narrowly scoped with `SET search_path = ''`,
  fully qualified objects, authenticated active-user checks, validated input, and
  revoked default/public execution.
- Never let clients assign platform roles, verification, payment state, balance,
  actor IDs, or company membership roles. Couple sensitive multi-row mutations in
  one database transaction and emit redacted audit data.
- Do not add permissive Storage policies before ownership, scanning, access, and
  retention controls are implemented.
- `revoke … from public` does not revoke `anon`/`authenticated`. Supabase's
  `pg_default_acl` grants EXECUTE on every new `public` function to `anon`,
  `authenticated`, and `service_role` explicitly. Always `revoke … from public,
  anon, authenticated` and grant back only the roles that need it.
- Exceptions: `is_valid_company_categories` and
  `is_valid_candidate_profile_section` are IMMUTABLE CHECK validators; a CHECK
  expression runs with the caller's privileges, so revoking them breaks every
  INSERT with `42501`. `supabase/tests/database/function_privileges.test.sql`
  ratchets the whole set by full signature — add any deliberately client-callable
  function there or CI fails.
- pgTAP suites must be independent of the seed. `supabase/seed-source-jobs.sql`
  commits real source listings before `supabase test db` runs. Suites that count
  or free-text-search `public.jobs` must clear committed source data at the start
  of their transaction:
  `delete from public.job_source_imports; delete from public.jobs where
  publication_source = 'source_site'; delete from public.companies where slug
  like 'source-%';`. The transaction rolls back.
- Run `bun run test:db` against the real local Supabase stack when Docker is
  available. A SQL parser or PostgreSQL emulator is not a substitute; state
  clearly when pgTAP was not run.
- Never connect a project MCP to a hosted Supabase project or run
  destructive/reset commands unless the user explicitly authorizes that target.

## Testing

- Match the test to the behavior: schema/edge cases in unit tests, authorization
  at the database boundary, user-visible flows in Playwright.
- Include negative cases for invalid input, unauthenticated users, and
  cross-account/company access wherever relevant; never prove security only by
  checking that a UI control is hidden.
- Keep fixtures synthetic. Do not use real user, candidate, payment, or
  production data.
- Run the narrowest applicable existing command and inspect its complete result.
  Use `bun run test:e2e` for the full Playwright suite and `bun run test:db`
  for Supabase/pgTAP.
- 3D/WebGL E2E is load-sensitive: give those specs generous per-test timeouts
  and rely on the CI retry budget.
- Accessible names must contain the visible text (WCAG 2.5.3). Prefer dropping a
  redundant `aria-label` over writing a longer one.

## Route Handlers

Every `route.ts` under `src/app/api/` must have `export const dynamic =
'force-dynamic';`. Error/custom responses must include `Cache-Control:
no-store`.

## File editing

When `apply_diff` fails, do not retry the same patch. Read the file from the
top with `read_file` and update it with `write_to_file`.

## Schema & tip synchronization

When a Zod schema or TypeScript interface gains a field, grep every consumer
(`src/server/dal/*.ts`, `src/features/**`, `*.test.ts`) and update them all in
the same session. Never push with `bun run typecheck` errors.

## Kilo configuration

`.kilo/kilo.jsonc` — `{"snapshot": false}`. `.kilocodeignore` is kept.

## MCP security decision

Hosted Supabase MCP, GitHub MCP, and general filesystem MCP are deliberately not
configured. The workspace's project/ref ID and production access permission are
not yet determined; adding them risks accidental remote/production access or
overly broad tool privileges. Only a narrowly scoped local/test Supabase
connection may be added later when access and target are determined.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all
differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` (resolved from this file's directory; in
monorepos the `next` package may not be visible from the repo root) before
writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at
`node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a
diff only re-creates the uncommitted change; committing it with your work keeps
the tree clean.

<!-- END:nextjs-agent-rules -->

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

- **`revoke ... from public` does not revoke `anon`/`authenticated`.** Supabase's
  `pg_default_acl` grants EXECUTE on every new `public` function to `anon`,
  `authenticated` and `service_role` explicitly. `revoke all on function … from
  public` only removes the implicit PUBLIC grant, leaving those per-role entries
  intact — which is how `list_engagement_recipients` (a full mailing-list dump:
  `user_id`, `email`, `display_name`, `locale`) and `opt_out_engagement` shipped
  callable with the publishable key. Always `revoke … from public, anon,
  authenticated` and then grant back only the roles that need it. Note the two
  exceptions that must keep their grants: `is_valid_company_categories` and
  `is_valid_candidate_profile_section` are IMMUTABLE CHECK validators, and a
  CHECK expression runs with the caller's privileges, so revoking them breaks
  every INSERT with `42501`. `supabase/tests/database/function_privileges.test.sql`
  now ratchets the whole set by full signature — add any deliberately
  client-callable function there or CI fails.

- **3D/WebGL E2E is load-sensitive.** The suite renders animated Three.js scenes
  with software WebGL (`--use-angle=swiftshader`). Give those specs generous
  per-test timeouts and rely on the CI retry budget for load-related flakes.

- **Locale routing uses `localePrefix: "as-needed"`.** The default locale (`tr`)
  is unprefixed in the served URL, not only in canonical/`x-default` output.
  `src/proxy.ts` redirects a prefixed default-locale path to its bare form with
  a **308** (`/tr/jobs` → `/jobs`, `/tr/auth` → `/auth`), so `tr` has exactly one
  public URL. Only non-default locales keep their prefix (`/en/jobs`). Assert on
  URLs accordingly: a request to `/tr/...` never reaches the page, it redirects.

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

- **The Auth dashboard, not git, holds the templates production serves.** The
  dashboard writes each body and subject into the project config, and nothing
  re-syncs them, so a template pasted in by hand drifts from
  `supabase/templates/` with no test, lint or build able to see it. This is how
  the `recovery` email shipped as a 1.4 kB unbranded one-off while the repository
  held the 10.7 kB branded, six-locale version. `scripts/verify-auth-config.mjs`
  reports the drift (body *and* subject) against the live project;
  `scripts/sync-auth-templates.mjs` removes it. Run the sync after any template
  or `config.toml` subject change, then re-run the verify.

- **`auth.email.enable_confirmations = true` gates sign-in on a verified mailbox.**
  Any E2E or manual flow that signs in must first consume the confirmation link
  from the local mail catcher (port `54324`), or Supabase answers
  `email_not_confirmed`. The sign-in action maps that code to the
  `emailNotConfirmed` message; do not fold it back into the generic
  `signInFailed` copy.

- **Do not run a production build in the working tree without a throwaway
  `NEXT_DIST_DIR`.** `npm run build` rewrites `tsconfig.json` and
  `next-env.d.ts` to point at the dist directory it used; both files are
  tracked, so the build leaves the tree dirty. Build with
  `NEXT_DIST_DIR=.next-<name> npm run build` and `git checkout --
  tsconfig.json next-env.d.ts` afterwards, or the diff will carry unrelated
  config churn.

- **The visual layer has two guards; a styling change is not done until both
  pass.** `tests/e2e/accessibility.spec.ts` runs axe-core (`@axe-core/playwright`)
  over every public route in all six locales — mobile everywhere, desktop only
  for `tr`/`de`/`fa` (shared layout; `de` longest strings, `fa` RTL).
  `tests/unit/design-tokens.test.ts` holds the token contract: WCAG contrast
  floors, palette anchors, radius/type-scale sanity, and a ratchet against new
  hardcoded hex values outside `@theme`. When you legitimately add a colour,
  move it into `@theme` instead of appending to
  `tests/unit/design-token-drift.baseline.json` (that list may only shrink).

- **Accessible names must contain the visible text (WCAG 2.5.3).** Four real
  violations shipped before the axe guard existed, and none were visible to the
  eye: the brand lockup renders as `İşBul KKTC` but a `flex-direction: column`
  drops the whitespace, so its DOM text was the concatenated `İşBulKKTC`; the
  language `<summary>` shows `TR` while its `aria-label` was just
  `Arayüz dili`; the vend sound button showed `FX` under an unrelated label;
  company map links showed `Haritada gör 1` but omitted the suffix. Prefer
  dropping a redundant `aria-label` over writing a longer one — an element with
  no `aria-label` uses its visible text and cannot mismatch.

- **Prove a "no visual change" claim with pixels, not prose.** Screenshot the
  element before and after (Playwright `locator.screenshot` at
  `deviceScaleFactor: 2`) and diff the raw buffers with `sharp`. The
  accessibility fixes above measured `0/343040` pixels changed on the header,
  which is what made "the design is untouched" a fact rather than a hope.

- **Do not judge a client-rendered widget from the SSR HTML.** The Turnstile
  field (`src/features/identity/turnstile-field.tsx`) renders in an effect, so
  the server HTML only ever contains the empty
  `<div class="editorial-turnstile"><div></div></div>` container — even when the
  widget is live. Grepping the response for `challenges.cloudflare.com` or the
  site key therefore reports "captcha is off" while production is protecting
  every auth form. Confirm with a real browser (the Turnstile iframe and its
  `turnstile`/`Privacy`/`Help` links appear) before drawing a conclusion.