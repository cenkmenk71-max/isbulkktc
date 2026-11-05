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
| `sql-hardening.test.ts` | RLS on every table, pinned `search_path`, grant/revoke pairing, pgTAP ratchet drift |
| `client-boundary.test.ts` | no client module imports server code or reads secrets; `server-only` markers |
| `ci-workflow-permissions.test.ts` | every `pull_request` workflow declares least-privilege permissions; no `pull_request_target`; the auto-merge gate still refuses to merge a change to the workflows themselves |
| `notification-worker-auth.test.ts` | the edge worker authenticates before it inspects configuration |
| `anonymous-write-surface.test.ts` | the anon write RPCs and the control the forms carry |
| `anonymous-rpc-throttle.test.ts` | the throttle is in the action, but the anon RPC is directly callable |
| `session-cookie-flags.test.ts` | the Supabase session cookie's `HttpOnly`/`Secure` flags, and the controls around it |

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
| The throttle is action-only; the `anon` RPC is directly callable | LANE-SUPABASE (`supabase/**`) + LANE-URUN (`src/features/**`) | open |
| Supabase session cookie keeps `@supabase/ssr` defaults (`httpOnly:false`, no `Secure`) | LANE-AUTH (`src/features/identity/**`, session lifecycle) | open (handoff #167) |

## Rules

- Attack only this sandbox and its local test data. No load, no DoS, no access to
  anything not ours.
- A finding needs a reproduction step, the observed and expected result, the
  impact, and a suggested fix — "could be" is not a finding.
- Never write outside `tests/security/**`, `docs/threat-model.md` and
  `docs/data-retention.md`.
