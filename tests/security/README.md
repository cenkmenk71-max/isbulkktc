# Security test layer (`tests/security/**`)

Adversarial tests for the boundaries in `docs/threat-model.md`. This layer is
owned by **LANE-GÜVENLİK**; it proves findings, it does not fix them. A confirmed
finding is filed against the lane that owns the code and marked `agent:blocked`.

## How it runs

These are `node:test` files executed by `tsx`. They are collected by the
`test:security` script (`tsx --test "tests/security/**/*.test.ts"`), which runs as
its own step in the `static` CI job:

```bash
bun run test:security
```

It is a separate step from `bun run test:unit` (whose globs do not reach here) so
a boundary regression is attributable at a glance.

## What is covered

| File | Boundary |
|---|---|
| `open-redirect.test.ts` | `/[locale]/install?next=` continuation stays same-origin |
| `auth-redirect-boundary.test.ts` | `/auth/callback` query values (`next`, `flow`, `sb_flow_id`) never become an off-origin path |
| `sql-hardening.test.ts` | RLS on every table (any `create [unlogged\|temp] table` form), every table revoked from the client roles, `search_path` pinned to the *empty* path (both `=` and `to` spellings, no kept schema), function grant/revoke pairing, the `admin_*` role guard, the AAL2 gate on `has_platform_role`, the in-body `auth.role()` guard on every `service_role`-only RPC, pgTAP ratchet drift |
| `client-boundary.test.ts` | no client module imports server code (static, dynamic `import()` or `require()`) or reads secrets; `server-only` markers |
| `ci-workflow-permissions.test.ts` | every `pull_request` workflow declares least-privilege permissions — **every** `permissions:` block, top-level and job-level; no `pull_request_target`; the auto-merge gate still refuses to merge a change to the workflows themselves |
| `notification-worker-auth.test.ts` | the edge worker authenticates before it inspects configuration |
| `auth-captcha-wiring.test.ts` | every captcha-protected auth flow (sign-in, sign-up, resend, reset) forwards the Turnstile token to Supabase and reads it from the widget's field |
| `cron-route-auth.test.ts` | the two Next.js cron routes (`/api/push/dispatch`, `/api/email/engagement-digest`) authenticate before any config read and fail closed |
| `unsubscribe-route-auth.test.ts` | the public unsubscribe GET verifies the HMAC before the service client, and leaks no subscription oracle |
| `security-headers.test.ts` | imports the real `next.config.ts` and asserts the full CSP (every directive present, no bare `*`, a bare `https:` only on `img-src`/`media-src`)/HSTS (`includeSubDomains`+`preload`)/`Permissions-Policy` (all six denies)/frame/coop header set, no `X-Powered-By`, the Vercel-alias noindex rule, the `/sw.js` no-cache rule, the image optimizer's `remotePatterns` allowlist (exact https hosts, no private hosts), and its `localPatterns` allowlist (drives Next's own matcher: real image paths allowed; non-image paths, encoded traversal and query strings rejected) |
| `anonymous-write-surface.test.ts` | the anon write RPCs and the control the forms carry |
| `push-endpoint-ssrf.test.ts` | the push-endpoint host allowlist (`isAllowedPushEndpoint`): rejects loopback/link-local/RFC1918/metadata/decimal-IP/local names, every writer wires it, the send sink re-checks it, and the registration route requires a session before it parses the body |
| `anonymous-rpc-throttle.test.ts` | the action throttles before the RPC and the mail fan-out (ordering, not presence); the throttle also lives inside the anon RPC bodies (a gate); the action-path IP dimension is still one shared bucket |
| `session-cookie-flags.test.ts` | the Supabase session cookie's `HttpOnly`/`Secure`/`SameSite` flags, the OAuth-intent cookie's flags, and the controls around them |
| `locale-cookie-flags.test.ts` | the `NEXT_LOCALE` locale cookie's flags, driven through the real middleware with the app's own `routing.ts` (a `todo` pins the missing `Secure`; the `HttpOnly` question is answered in the file) |
| `log-safety.test.ts` | no `console.*` call logs a credential (#418 §7). The label rule (first argument is a string/template literal or a shared event name, never a raw object/`Error`) runs on `src` + `supabase/functions`; the credential rule (`process.env.*_SECRET`, a bare `password`/`token`/`secret` value) also runs on `scripts/**`, which execute in CI with `GH_TOKEN`/`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN`. A ratchet — clean today, 6 self-tests pin the rules |
| `api-response-surface.test.ts` | the App Router API response surface (#424): `/api/build-info` returns exactly `{commit, environment}` and its own `no-store`; no source or config file adds `Access-Control-Allow-Origin` (the live header is Vercel platform behaviour, proven absent on the local standalone); every `src/app/api/**/route.ts` declares `dynamic`; every `force-static` route pairs it with `no-store` |
| `inline-script-safety.test.ts` | every `dangerouslySetInnerHTML` in `src/**` keeps the shape that makes it safe: a JSON-LD block escapes `<` (`.replace(/</g, "\u003c")`), any other block is a static string literal — a value expression (the shape DB-backed content arrives in) is rejected. Guards the stored-XSS class the live-support work (#398) introduces |
| `auth-throttle-surface.test.ts` | the credential endpoints (`signIn`, `requestPasswordReset`) consult an abuse control rather than relying on the captcha — which the hosted project does **not** enforce (`/auth/v1/token` answers `invalid_credentials` even with a bogus token). Also pins `experimental.serverActions.allowedOrigins` to stay empty, so Next.js's same-origin Server Action check remains the CSRF control |

## Findings

Tests whose assertion documents an **open** finding are marked `{ todo: "…" }`.
`node:test` reports them as `# TODO` and they do **not** fail the run, so the
suite stays green while the gap is tracked. When the owning lane ships the fix
the test passes on its own — remove the `todo` option to promote it to a gate.

| Finding | Owner | Status |
|---|---|---|
| Open redirect via dot-segment normalisation in `sanitizeNextPath` | LANE-URUN (`src/lib/pwa/destination.ts`) | **fixed** (output re-validated) |
| `src/server/email/unsubscribe-token-core.ts` lacks `import "server-only"` | LANE-URUN (`src/server/**`) | open |
| `tests/security/**` not collected by any CI job | LANE-INFRA (`.github/workflows/**`) | **fixed** (`test:security` step) |
| Anon feedback/sales forms had no captcha or rate limit | LANE-URUN (`src/features/**`) | **fixed** (rate limiter in the actions) |
| The throttle is action-only; the `anon` RPC is directly callable (#139) | LANE-SUPABASE (`supabase/**`) | **fixed** (DB throttle inside the RPC; now a gate) |
| The DB throttle's IP dimension is one shared bucket on the app path (the action sends no visitor IP) | LANE-URUN (`src/features/**`) + LANE-SUPABASE (`supabase/**`) | open (handoff #206) |
| Supabase session cookie keeps `@supabase/ssr` defaults (`httpOnly:false`, no `Secure`) | LANE-AUTH (`src/features/identity/**`, session lifecycle) | **fixed** (PR #201; now a gate) |
| `NEXT_LOCALE` locale cookie has no `Secure` flag (issue #418 §6) | LANE-İÇERİK (`src/i18n/routing.ts`) | open (`locale-cookie-flags.test.ts`; `HttpOnly` is not possible — the language switcher writes it from JS) |
| The credential endpoints (`signIn`, `requestPasswordReset`) carry no application-level throttle, and the hosted project does **not** enforce the captcha the config claims (issue #418 §7) | LANE-AUTH (`src/features/identity/**`) | open (`auth-throttle-surface.test.ts`; handoff #457) |
| `/api/build-info` is cross-origin readable (`ACAO: *`), page routes answer write methods, error paths cache (#424) | platform / framework (Vercel + Next.js); no repo file owns it | **triaged** — M-01/M-03/M-04 are Vercel platform behaviour (absent on the local standalone); M-02 is Next.js page handling and a non-GET reject would break Server Actions. Gates in `api-response-surface.test.ts`; ownership gap handed to LANE-INFRA |
| `package-lock.json` is a stale second lockfile and the only manifest Dependabot audits | LANE-INFRA (`package.json`, lockfiles) | open (handoff #188) |

### Guard self-tests

Each detector that reads source or SQL carries a self-test proving it sees the
access forms it claims to (`client-boundary`, `sql-hardening`,
`session-cookie-flags`). A guard is only as wide as its matcher; the self-test
fails when a matcher is narrowed, so a silent hole cannot be reintroduced.

Detectors also **discover their subject** rather than listing it by hand — a
hand-written list of routes, clients or RPCs silently stops covering the next
one added. `cron-route-auth` scans `src/app/api/**` for the bearer-guard shape,
`session-cookie-flags` scans `src/**` for `createServerClient(...)`,
`notification-worker-auth` scans `supabase/config.toml` for `verify_jwt = false`,
the bearer-guard header matcher is shared by both via `authorization-header.ts`
(any casing and both `.get(...)`/`[...]` forms — HTTP header names are
case-insensitive and `"Authorization"` is canonical),
`anonymous-rpc-throttle` scans the grants for `anon`-callable writers,
`auth-captcha-wiring` scans `src/features/identity/**` for captcha-protected
calls (every occurrence, not just the first), and `anonymous-write-surface`
scans `src/features/**` for the anonymous mail-sending RPC calls. Each carries a
self-test that both the known subject is found and a near-miss is rejected.

## Rules

- Attack only this sandbox and its local test data. No load, no DoS, no access to
  anything not ours.
- A finding needs a reproduction step, the observed and expected result, the
  impact, and a suggested fix — "could be" is not a finding.
- Never write outside `tests/security/**`, `docs/threat-model.md` and
  `docs/data-retention.md`.
