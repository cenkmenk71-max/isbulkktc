# Security test layer (`tests/security/**`)

Adversarial tests for the boundaries in `docs/threat-model.md`. This layer is
owned by **LANE-GÜVENLİK**; it proves findings, it does not fix them. A confirmed
finding is filed against the lane that owns the code and marked `agent:blocked`.

## How it runs

These are `node:test` files executed by `tsx`, so they run inside
`bun run test:unit` (the `tests/unit/**/*.test.ts` glob does **not** reach here —
the `test:unit` script only globs `tests/unit/**` and `src/**`, so this directory
is currently collected by nothing). Until the layer is wired into a CI job it is
a documented, runnable suite rather than a gate:

```bash
bunx tsx --test "tests/security/**/*.test.ts"
```

Wiring it into the `static` CI job is **LANE-INFRA**'s file (`.github/workflows/**`,
`package.json`), so it is reported there rather than done here.

## What is covered

| File | Boundary |
|---|---|
| `open-redirect.test.ts` | `/[locale]/install?next=` continuation stays same-origin |
| `sql-hardening.test.ts` | RLS on every table, pinned `search_path`, grant/revoke pairing, pgTAP ratchet drift |
| `client-boundary.test.ts` | no client module imports server code or reads secrets; `server-only` markers |
| `notification-worker-auth.test.ts` | the edge worker authenticates before it inspects configuration |
| `anonymous-write-surface.test.ts` | the anon write RPCs and their missing abuse controls |

## Findings

Tests whose assertion documents an **open** finding are marked `{ todo: "…" }`.
`node:test` reports them as `# TODO` and they do **not** fail the run, so the
suite stays green while the gap is tracked. When the owning lane ships the fix
the test passes on its own — remove the `todo` option to promote it to a gate.

| Finding | Owner | Status |
|---|---|---|
| Open redirect via dot-segment normalisation in `sanitizeNextPath` | LANE-URUN (`src/lib/pwa/destination.ts`) | open |
| `src/server/email/unsubscribe-token-core.ts` lacks `import "server-only"` | LANE-URUN (`src/server/**`) | open |
| No captcha / rate limit on the feedback & sales mail-sending forms | LANE-URUN (`src/features/feedback/**`, `src/features/sales/**`) | open |
| `tests/security/**` not collected by any CI job | LANE-INFRA (`.github/workflows/**`) | open |

## Rules

- Attack only this sandbox and its local test data. No load, no DoS, no access to
  anything not ours.
- A finding needs a reproduction step, the observed and expected result, the
  impact, and a suggested fix — "could be" is not a finding.
- Never write outside `tests/security/**`, `docs/threat-model.md` and
  `docs/data-retention.md`.
