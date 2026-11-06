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
| `security-headers.test.ts` | imports the real `next.config.ts` and asserts the CSP/HSTS/frame/coop header set, no wildcard `script-src`, no `X-Powered-By`, the Vercel-alias noindex rule, the `/sw.js` no-cache rule, the image optimizer's `remotePatterns` allowlist (exact https hosts, no private hosts), and its `localPatterns` allowlist (drives Next's own matcher: real image paths allowed; non-image paths, encoded traversal and query strings rejected) |
| `anonymous-write-surface.test.ts` | the anon write RPCs and the control the forms carry |
| `push-endpoint-ssrf.test.ts` | the push-endpoint host allowlist (`isAllowedPushEndpoint`): rejects loopback/link-local/RFC1918/metadata/decimal-IP/local names, every writer wires it, and the send sink re-checks it |
| `anonymous-rpc-throttle.test.ts` | the action throttles before the RPC and the mail fan-out (ordering, not presence); the throttle also lives inside the anon RPC bodies (a gate); the action-path IP dimension is still one shared bucket |
| `session-cookie-flags.test.ts` | the Supabase session cookie's `HttpOnly`/`Secure`/`SameSite` flags, the OAuth-intent cookie's flags, and the controls around them |

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
| `package-lock.json` is a stale second lockfile and the only manifest Dependabot audits | LANE-INFRA (`package.json`, lockfiles) | open (handoff #188) |

### Guard self-tests

Each detector that reads source or SQL carries a self-test proving it sees the
access forms it claims to (`client-boundary`, `sql-hardening`,
`session-cookie-flags`). A guard is only as wide as its matcher; the self-test
fails when a matcher is narrowed, so a silent hole cannot be reintroduced.

## Rules

- Attack only this sandbox and its local test data. No load, no DoS, no access to
  anything not ours.
- A finding needs a reproduction step, the observed and expected result, the
  impact, and a suggested fix — "could be" is not a finding.
- Never write outside `tests/security/**`, `docs/threat-model.md` and
  `docs/data-retention.md`.
