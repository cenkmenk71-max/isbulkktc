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
| `qr-render-capacity-surface.test.ts` | the `/api/qr` render capacity boundary: a `next` inside the 2048-character cap but past the version-40 byte ceiling, and a pinned `version` below what the payload needs, both reach an unhandled `qrcode` throw (proven at the generator level + a static route error-path detector; the route cannot be imported without the `react-server` condition) |
| `auth-redirect-boundary.test.ts` | `/auth/callback` query values (`next`, `flow`, `sb_flow_id`) never become an off-origin path |
| `sql-hardening.test.ts` | RLS on every table (any `create [unlogged\|temp] table` form), every table revoked from the client roles, `search_path` pinned to the *empty* path (both `=` and `to` spellings, no kept schema), function grant/revoke pairing, the `admin_*` role guard, the AAL2 gate on `has_platform_role`, the in-body `auth.role()` guard on every `service_role`-only RPC, pgTAP ratchet drift |
| `storage-bucket-privacy.test.ts` | every declared bucket is private unless it is on the explicit public allowlist; the two private buckets (`private-resumes`, `private-payment-receipts`) stay `public=false`; no `storage.objects` policy exists (default deny); no `update storage.buckets` flips a bucket to public |
| `client-boundary.test.ts` | no client module imports server code (static, dynamic `import()` or `require()`) or reads secrets; `server-only` markers |
| `ci-workflow-permissions.test.ts` | every `pull_request` workflow declares least-privilege permissions — **every** `permissions:` block, top-level and job-level; no `pull_request_target`; the auto-merge gate still refuses to merge a change to the workflows themselves |
| `notification-worker-auth.test.ts` | the edge worker authenticates before it inspects configuration |
| `auth-captcha-wiring.test.ts` | every captcha-protected auth flow (sign-in, sign-up, resend, reset) forwards the Turnstile token to Supabase and reads it from the widget's field |
| `cron-route-auth.test.ts` | the two Next.js cron routes (`/api/push/dispatch`, `/api/email/engagement-digest`) authenticate before any config read and fail closed |
| `unsubscribe-route-auth.test.ts` | the public unsubscribe GET verifies the HMAC before the service client, and leaks no subscription oracle |
| `security-headers.test.ts` | imports the real `next.config.ts` and asserts the full CSP (every directive present, no bare `*`, a bare `https:` only on `img-src`/`media-src`)/HSTS (`includeSubDomains`+`preload`)/`Permissions-Policy` (all six denies)/frame/coop header set, no `X-Powered-By`, the Vercel-alias noindex rule, the `/sw.js` no-cache rule, the image optimizer's `remotePatterns` allowlist (exact https hosts, no private hosts), and its `localPatterns` allowlist (drives Next's own matcher: real image paths allowed; non-image paths, encoded traversal and query strings rejected) |
| `anonymous-write-surface.test.ts` | the anon write RPCs and the control the forms carry |
| `push-endpoint-ssrf.test.ts` | the push-endpoint host allowlist (`isAllowedPushEndpoint`): rejects loopback/link-local/RFC1918/metadata/decimal-IP/local names, every writer wires it, the send sink re-checks it, and the registration route requires a session before it parses the body |
| `push-endpoint-sql-parity.test.ts` | the two push-endpoint validators agree: the app gate (`isAllowedPushEndpoint`, a `new URL` host parse) and the DB rule in `register_push_subscription` (`split_part` of the raw string). The parity gate holds on real and rejected endpoints; the `todo` test is the finding — the raw-string split accepts `https://evil.com\.push.apple.com/x` (real host `evil.com`) and percent-encoded variants the URL parse rejects, and rejects `https://fcm.googleapis.com\evil.com/x` the URL parse accepts |
| `anonymous-rpc-throttle.test.ts` | the action throttles before the RPC and the mail fan-out (ordering, not presence); the throttle also lives inside the anon RPC bodies (a gate); the action-path IP dimension is still one shared bucket |
| `session-cookie-flags.test.ts` | the Supabase session cookie's `HttpOnly`/`Secure`/`SameSite` flags, the OAuth-intent cookie's flags, and the controls around them |
| `locale-cookie-flags.test.ts` | the `NEXT_LOCALE` locale cookie's flags, driven through the real middleware with the app's own `routing.ts` — a gate that `Secure` is set in production (fixed in #469/#498); the `HttpOnly` question is answered in the file |
| `cookie-inventory.test.ts` | the whole app cookie inventory (#418 §6): every app-defined cookie name and every `document.cookie` writer is on the audited list (a ratchet), every client-cookie write is `Path=/` + `SameSite=Lax\|Strict` + `Secure`-on-https, the `ib_consent` consent cookie specifically carries those flags and a finite `Max-Age` (write and withdrawal-clear both), and the `NEXT_LOCALE` inventory row is pinned to `src/i18n/routing.ts` so it cannot drift back to advertising a closed finding (#508) |
| `log-safety.test.ts` | no `console.*` call logs a credential (#418 §7). The label rule (first argument is a string/template literal or a shared event name, never a raw object/`Error`) runs on `src` + `supabase/functions`; the credential rule (`process.env.*_SECRET`, a bare `password`/`token`/`secret` value) also runs on `scripts/**`, which execute in CI with `GH_TOKEN`/`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN`. A ratchet — clean today, 6 self-tests pin the rules |
| `api-response-surface.test.ts` | the App Router API response surface (#424): `/api/build-info` returns exactly `{commit, environment}` and its own `no-store`; no source or config file adds `Access-Control-Allow-Origin` (the live header is Vercel platform behaviour, proven absent on the local standalone); every `src/app/api/**/route.ts` declares `dynamic`; every `force-static` route pairs it with `no-store` |
| `inline-script-safety.test.ts` | every `dangerouslySetInnerHTML` in `src/**` keeps the shape that makes it safe: a JSON-LD block escapes `<` (`.replace(/</g, "\u003c")`), any other block is a static string literal — a value expression (the shape DB-backed content arrives in) is rejected. Guards the stored-XSS class the live-support work (#398) introduces |
| `employer-verification-surface.test.ts` | the employer-verification boundary: `publish_approved_job` and the platform branch of `search_public_jobs` still require `verification_status = 'verified'`, no client role holds `update` on `public.companies`, and `admin_list_verified_companies` keeps its platform-admin guard. The open gap (no code path promotes a company to `verified`) is a `todo` |
| `auth-throttle-surface.test.ts` | the credential endpoints (`signIn`, `requestPasswordReset`) consult an abuse control rather than relying on the captcha — which the hosted project does **not** enforce (`/auth/v1/token` answers `invalid_credentials` even with a bogus token). Also pins `experimental.serverActions.allowedOrigins` to stay empty, so Next.js's same-origin Server Action check remains the CSRF control |
| `auth-mail-throttle-surface.test.ts` | the two mail-fan-out credential endpoints `auth-throttle-surface.test.ts` does not cover — `signUp` and `resendConfirmation`. Neither calls `getUser()`, so both mail an attacker-chosen address; the gate pins an address/e-mail throttle **before** the `supabase.auth.signUp`/`resend` call, so a throttled call cannot still send one mail. It strips comments before matching, so a prose "throttle" cannot satisfy either the presence or the ordering check (LANE-AUTH bound the control in #505; promoted to a gate in #514) |
| `account-lifecycle-surface.test.ts` | the account-lifecycle boundary (#418): `public.profiles.status` (the `active`/`suspended`/`closed` kill switch) is not grantable to a client role and every write RPC re-checks `status = 'active'` before it acts. The absence of any self-service deletion path is recorded as a `todo` (KVKK/GDPR erasure) |
| `server-cookie-inventory.test.ts` | the **server**-side cookie write inventory (#418 §6), which `cookie-inventory.test.ts` (client writers) and `session-cookie-flags.test.ts` (known call sites) do not cover: every `cookies().set(…)` / `response.cookies.set(…)` / `cookieStore.set(…)` site in `src/**`, and that the `sb-*` writes take their flags from the shared `cookieOptions` object rather than a forked inline literal |
| `vercel-deploy-gate.test.ts` | `vercel.json` `git.deploymentEnabled` stays pinned to "only `main` deploys". A build cancelled by Vercel's Ignored Build Step still spends the Hobby build budget, so the gate that decides *before* a build exists is what protects `main`'s deploy availability (#319) |
| `readme-coverage.test.ts` | this layer's own coverage table is a ratchet: every `tests/security/*.test.ts` has a row in "What is covered" and every row names a file that exists, so the table cannot silently under- or over-report the audited surface |
| `lockfile-coverage.test.ts` | the supply-chain boundary (#188): the repo carries exactly one lockfile and it resolves the manifest it accompanies. `bun.lock` (the lock CI installs from) matches `package.json` and resolves every direct dependency; no npm-family lockfile (`package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`) is in the tree and `.github/dependabot.yml` watches `bun`, so the advisory scan reads the tree CI installs. All gates, mutation-checked |

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
| Employer self-service dead-ends at `verification_status = 'pending'`: no RPC, server action or admin page promotes a company to `verified`, so an employer can never publish a job | LANE-SUPABASE (`supabase/**`) + LANE-URUN (`src/features/**`) | open (#418 account journey) |
| A company-profile submission notifies nobody: the row is inserted `pending` but no e-mail or admin alert is sent, so "review" only happens if an admin polls `/admin/company-profiles` | LANE-URUN (`src/features/**` + `src/server/email/**`) | open (#418 account journey) |
| `info@isbulkktc.com` is published as the support address with Cloudflare Email Routing MX, but SPF authorises only Cloudflare and no mailbox is documented — inbound routing and Resend sending are not both proven | LANE-CLOUDFLARE (`docs/cloudflare.md`) | open (see #170 for the SPF/Resend half) |
| Supabase session cookie keeps `@supabase/ssr` defaults (`httpOnly:false`, no `Secure`) | LANE-AUTH (`src/features/identity/**`, session lifecycle) | **fixed** (PR #201; now a gate) |
| `NEXT_LOCALE` locale cookie had no `Secure` flag (issue #418 §6) | LANE-İÇERİK (`src/i18n/routing.ts`) | **fixed** (#469/#498; now a gate in `locale-cookie-flags.test.ts`; `HttpOnly` is not possible — the language switcher writes it from JS) |
| The credential endpoints (`signIn`, `requestPasswordReset`) carry no application-level throttle, and the hosted project does **not** enforce the captcha the config claims (issue #418 §7) | LANE-AUTH (`src/features/identity/**`) | **fixed** (#457 closed; `auth-throttle-surface.test.ts` is now a gate) |
| The two mail-fan-out siblings (`signUp`, `resendConfirmation`) carried no throttle: an unbounded confirmation-mail fan-out to an attacker-chosen address (#418 §7) | LANE-AUTH (`src/features/identity/**`) | **fixed** (#505 / PR #513; `auth-mail-throttle-surface.test.ts` promoted to a gate in #514 — it also pins ordering, not just presence) |
| `/api/build-info` is cross-origin readable (`ACAO: *`), page routes answer write methods, error paths cache (#424) | platform / framework (Vercel + Next.js); no repo file owns it | **triaged** — M-01/M-03/M-04 are Vercel platform behaviour (absent on the local standalone); M-02 is Next.js page handling and a non-GET reject would break Server Actions. Gates in `api-response-surface.test.ts`; ownership gap handed to LANE-INFRA |
| `/api/qr` renders attacker-influenced input with no error path: a `next` inside the 2048-character cap but past the QR version-40 byte ceiling, and a `version` below the payload's minimum, both throw → 500 (live: `?next=/jobs&version=1` → 500) | route owner (`src/app/api/qr/route.ts`; `src/lib/pwa/**` is LANE-URUN) | open (`qr-render-capacity-surface.test.ts`; handoff) |
| `package-lock.json` was a stale second lockfile and the only manifest Dependabot audited: it resolved none of `qrcode`, `web-push`, `jsqr` or `pngjs` and pinned `lucide-react@1.63.0` where `bun.lock` has `1.62.0`, so the advisory scan read a tree that is not what CI installs | LANE-INFRA (`package.json`, lockfiles) | **fixed** (b1f8d62: stale lock dropped + gitignored, `.github/dependabot.yml` moved to `bun`; `lockfile-coverage.test.ts` now gates the closure, not the deleted file) |
| The DB half of the push-endpoint allowlist (`register_push_subscription`) parses the host with `split_part` on the raw string, so it disagrees with `isAllowedPushEndpoint` (a URL host parse): `https://evil.com\.push.apple.com/x` (real host `evil.com`) and percent-encoded variants pass the RPC but fail the app gate, and `https://fcm.googleapis.com\evil.com/x` fails the RPC but passes the app gate. Not an SSRF — the send sink re-checks the app gate — but the DB guard does not enforce the rule it claims to | LANE-SUPABASE (`supabase/migrations/**`) | open (`push-endpoint-sql-parity.test.ts`; handoff #536) |

### Guard self-tests

Each detector that reads source or SQL carries a self-test proving it sees the
access forms it claims to (`client-boundary`, `sql-hardening`,
`session-cookie-flags`, `storage-bucket-privacy`, `cookie-inventory`). A guard is
only as wide as its matcher; the self-test
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
