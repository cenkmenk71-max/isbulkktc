# Integration test layer (`tests/integration/**`)

The layer between `tests/unit/**` (pure functions) and `tests/e2e/**` (a browser).
It exercises the **real** server action, the **real** data-access layer, the
**real** Zod schemas and the **real** authorization helpers, and replaces only the
process edges they cannot run without — the Supabase/GoTrue client, the Resend
mailer, `next/headers`, `next/cache` and `next/navigation`.

Owned by **LANE-QA**. See `docs/lanes/08-qa.md` and `docs/lanes/AUDIT.md`.

## Why it exists

A missing `getCurrentUser()` guard, a write to the wrong table, or an error
swallowed into a success state is invisible to both neighbouring layers: the unit
test never calls the action, and the E2E test only ever clicks as a signed-in
user. This layer closes that gap by asserting on the **boundary call log** — not
just on the returned value. "The row was saved" means "an upsert to
`candidate_profiles` was attempted with `user_id` set to the session id", which a
value-only assertion cannot distinguish from an unauthorized write that happened
to return success.

## How it runs

The suite uses Node's experimental module mocking, which `node:test` only exposes
behind a flag:

```bash
tsx --experimental-test-module-mocks --test "tests/integration/**/*.test.ts"
```

> **Not yet a gate.** `package.json` and `.github/workflows/**` belong to
> LANE-INFRA, so this layer is not wired into a script or a CI job yet. Until it
> is, it is a documented, runnable suite rather than a gate. The wiring is tracked
> in the issue linked from the PR that added this directory.

`tsx --test <glob>` that matches nothing exits 0, so when the script is added,
confirm from the CI step output that the tests actually ran (a green step that
collected zero tests is the failure mode this note guards against).

## Files

| File | What it proves |
|---|---|
| `support/harness.ts` | The faked boundary: a recording Supabase/GoTrue client, a recording mailer, and the `next/*` replacements. Not a test file. |
| `authorization-boundary.test.ts` | Every protected action refuses an anonymous caller and a wrong-role caller **before** it reaches the database; positive controls prove the guard admits the caller it should. |
| `data-path.test.ts` | The write goes to the right table bound to the caller's own id; a database error is surfaced, not swallowed; mail is best-effort. |
| `abuse-throttle.test.ts` | The actions actually call the rate limiter, keyed per address and per victim mailbox, before the RPC and its mail. |

## Rules

- Real code paths first. The only mocks are the four process edges above; a new
  mock needs a reason in the PR.
- Fixtures are synthetic. No real user, candidate, payment or production data.
- A guard is only proven if a mutation makes the test red — see the PR body for
  the mutation run that proves `authorization-boundary.test.ts`.
