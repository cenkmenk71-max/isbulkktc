# Integration test layer (`tests/integration/**`)

The layer between `tests/unit/**` (pure functions) and `tests/e2e/**` (a browser).
It exercises the **real** server action, the **real** data-access layer, the
**real** Zod schemas and the **real** authorization helpers, and replaces only the
process edges they cannot run without — the Supabase/GoTrue client, the Resend
mailer, `next/headers`, `next/cache` and `next/navigation`.

This directory is part of the QA layer.

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
bun run test:integration
```

The script (`package.json`) passes the flag; the `Integration tests` step in the
`static` CI job runs it, so the layer is a gate. Because `tsx --test <glob>` that
matches nothing exits 0, the step's value depends on it actually collecting
tests — a green step that ran zero tests is the failure mode to watch for.

## Files

| File | What it proves |
|---|---|
| `support/harness.ts` | The faked boundary: a recording Supabase/GoTrue client, a recording mailer, and the `next/*` replacements. Not a test file. |
| `harness-builder.test.ts` | The fake `rpc(...)` reproduces the real `PostgrestBuilder` surface — a thenable with a chainable `setHeader` whose value is recorded — so an action that sets `x-client-ip` (#206) runs here instead of dying with `TypeError`. |
| `authorization-boundary.test.ts` | Every protected action refuses an anonymous caller and a wrong-role caller **before** it reaches the database; positive controls prove the guard admits the caller it should. |
| `data-path.test.ts` | The write goes to the right table bound to the caller's own id; a database error is surfaced, not swallowed; mail is best-effort. |
| `abuse-throttle.test.ts` | The actions actually call the rate limiter, keyed per address and per victim mailbox, before the RPC and its mail. |
| `push-preference-boundary.test.ts` | The read half of the push feature: the configured/unconfigured and session/no-session branches, and the coercion of an untyped preference reply. Also pins that the VAPID env helper restores an absent key by `delete`, not by writing the string `"undefined"`. |
| `push-subscription-actions.test.ts` | The write half: `savePushSubscription`/`removePushSubscription`/`savePushPreferences` call the right RPC with the caller's own keys, forward a truncated user-agent, and surface a database rejection instead of a silent `{ ok: true }`. |
| `push-subscription-route.test.ts` | `POST /api/push/subscriptions`: the session gate answers 401 before the body is read, a non-JSON body is 400, the endpoint allowlist/schema is 422, a valid body writes through `register_push_subscription`, and a write failure is 502 without reflecting the database error. |
| `qr-route.test.ts` | `GET /api/qr`: format negotiation (SVG default, PNG, unknown fallback), the cache/`Content-Type` contract, and the encoded payload **read back from the pixels** — both branches are rasterised and decoded with jsQR. Pins that the origin comes from `getAppBaseUrl()`, that an off-site `next` is replaced by the default destination, that the caller's own `format`/`version` never leak into the URL, and (finding) that a too-small pinned version throws unhandled. |

## Rules

- Real code paths first. The only mocks are the four process edges above; a new
  mock needs a reason in the PR.
- Fixtures are synthetic. No real user, candidate, payment or production data.
- A guard is only proven if a mutation makes the test red — see the PR body for
  the mutation run that proves `authorization-boundary.test.ts`.
