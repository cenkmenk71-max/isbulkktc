# Security test layer (`tests/security/**`)

Adversarial tests for the boundaries in `docs/threat-model.md`. This layer is
owned by **the security layer**; it proves findings, it does not fix them. A confirmed
finding is filed against the owner of the code and marked `agent:blocked`.

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
| `qr-render-capacity-surface.test.ts` | generator-level boundary probes for a byte-oversized `next` and an undersized pinned version; the route catches generator errors, auto-sizes an insufficient pinned version and returns a no-store 414 when no QR version can encode the payload. Actual route behaviour is exercised in `tests/integration/qr-route.test.ts` by decoding PNG/SVG with an independent QR decoder |
| `auth-redirect-boundary.test.ts` | `/auth/callback` query values (`next`, `flow`, `sb_flow_id`) never become an off-origin path |
| `sql-hardening.test.ts` | RLS on every table (any `create [unlogged\|temp] table` form), every table revoked from the client roles, `search_path` pinned to the *empty* path (both `=` and `to` spellings, no kept schema), function grant/revoke pairing, the `admin_*` role guard, the AAL2 gate on `has_platform_role`, the in-body `auth.role()` guard on every `service_role`-only RPC, pgTAP ratchet drift |
| `storage-bucket-privacy.test.ts` | every declared bucket is private unless it is on the explicit public allowlist; the two private buckets (`private-resumes`, `private-payment-receipts`) stay `public=false`; no `storage.objects` policy exists (default deny); no `update storage.buckets` flips a bucket to public |
| `client-boundary.test.ts` | no client module imports server code (static, dynamic `import()` or `require()`) or reads secrets; `server-only` markers |
| `ci-workflow-permissions.test.ts` | every `pull_request` workflow declares least-privilege permissions — **every** `permissions:` block, top-level and job-level; no `pull_request_target`; the auto-merge gate still refuses to merge a change to the workflows themselves |
| `notification-worker-auth.test.ts` | the edge worker authenticates before it inspects configuration |
| `auth-captcha-wiring.test.ts` | every captcha-protected auth flow (sign-in, sign-up, resend, reset) forwards the Turnstile token to Supabase and reads it from the widget's field |
| `cron-route-auth.test.ts` | the two Next.js cron routes (`/api/push/dispatch`, `/api/email/engagement-digest`) authenticate before any config read and fail closed |
| `unsubscribe-route-auth.test.ts` | the public unsubscribe GET verifies the HMAC before the service client, and leaks no subscription oracle |
| `unsubscribe-header-contract.test.ts` | the cross-module one-click contract: the `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header the mailer emits must be served by a route that answers `POST`, not `GET` only (a `GET`-only route 405s the one-click and pushes the recipient to "report spam"). Reads both modules plus the digest caller that joins them, so the header and the route cannot drift apart silently — the pair was green per-module while production shipped the mismatch |
| `security-headers.test.ts` | imports the real `next.config.ts` and asserts the full CSP (every directive present, no bare `*`, a bare `https:` only on `img-src`/`media-src`)/HSTS (`includeSubDomains`+`preload`)/`Permissions-Policy` (all six denies)/frame/coop header set, no `X-Powered-By`, the Vercel-alias noindex rule, the `/sw.js` no-cache rule, the image optimizer's `remotePatterns` allowlist (exact https hosts, no private hosts), and its `localPatterns` allowlist (drives Next's own matcher: real image paths allowed; non-image paths, encoded traversal and query strings rejected) |
| `anonymous-write-surface.test.ts` | the anon write RPCs and the control the forms carry |
| `push-endpoint-ssrf.test.ts` | the push-endpoint host allowlist (`isAllowedPushEndpoint`): rejects loopback/link-local/RFC1918/metadata/decimal-IP/local names, every writer wires it, the send sink re-checks it, and the registration route requires a session before it parses the body |
| `push-endpoint-sql-parity.test.ts` | the two push-endpoint validators agree: the app gate (`isAllowedPushEndpoint`, a `new URL` host parse) and the DB rule — the `register_push_subscription` RPC (#536) and the table CHECK `is_allowed_push_endpoint` (#282, `20261110140000`). The mirror encodes the *new* authority rule (the authority ends at the first `/`, `\`, `?` or `#`, must be a bare hostname and an optional all-digit port ≤ 65535, then the allowlist), so the hostile corpus converges on the app verdict: a backslash, a percent-encoded separator, a URL credential or a `:65536` port is rejected by both layers. The parity gate and the shape self-tests are gates (the `todo` was retired when the database layer shipped #536 and the security layer updated the mirror in #568) |
| `anonymous-rpc-throttle.test.ts` | discovers every anon-callable write RPC, verifies database quota is consumed before insertion and per-form peer caps are distinct; app actions forward the resolved visitor `clientIp()` as `x-client-ip` while the edge-provided peer remains a coarse cap |
| `session-cookie-flags.test.ts` | the Supabase session cookie's `HttpOnly`/`Secure`/`SameSite` flags, the OAuth-intent cookie's flags, and the controls around them |
| `locale-cookie-flags.test.ts` | the `NEXT_LOCALE` locale cookie's flags, driven through the real middleware with the app's own `routing.ts` — a gate that `Secure` is set in production (fixed in #469/#498); the `HttpOnly` question is answered in the file |
| `cookie-inventory.test.ts` | the whole app cookie inventory (#418 §6): every app-defined cookie name and every `document.cookie` writer is on the audited list (a ratchet), every client-cookie write is `Path=/` + `SameSite=Lax\|Strict` + `Secure`-on-https, the `ib_consent` consent cookie specifically carries those flags and a finite `Max-Age` (write and withdrawal-clear both), and the `NEXT_LOCALE` inventory row is pinned to `src/i18n/routing.ts` so it cannot drift back to advertising a closed finding (#508) |
| `log-safety.test.ts` | no `console.*` call logs a credential (#418 §7). The label rule (first argument is a string/template literal or a shared event name, never a raw object/`Error`) runs on `src` + `supabase/functions`; the credential rule (`process.env.*_SECRET`, a bare `password`/`token`/`secret` value) also runs on `scripts/**`, which execute in CI with `GH_TOKEN`/`VERCEL_TOKEN`/`SUPABASE_ACCESS_TOKEN`. A ratchet — clean today, 6 self-tests pin the rules |
| `api-response-surface.test.ts` | the App Router API response surface (#424): `/api/build-info` returns exactly `{commit, environment}` and its own `no-store`; no source or config file adds `Access-Control-Allow-Origin` (the live header is Vercel platform behaviour, proven absent on the local standalone); every `src/app/api/**/route.ts` declares `dynamic`; every `force-static` route pairs it with `no-store` |
| `inline-script-safety.test.ts` | every `dangerouslySetInnerHTML` in `src/**` keeps the shape that makes it safe: a JSON-LD block escapes `<` (`.replace(/</g, "\u003c")`), any other block is a static string literal — a value expression (the shape DB-backed content arrives in) is rejected. Guards the stored-XSS class the live-support work (#398) introduces |
| `employer-verification-surface.test.ts` | public publish/search gates require `verified`, clients cannot update the verification column, and the admin review writer is restricted to an active MFA-verified platform admin with row locking and audit logging; source gate asserts Server Action, form and admin page wiring |
| `auth-throttle-surface.test.ts` | the credential endpoints (`signIn`, `requestPasswordReset`) consult an abuse control rather than relying on the captcha — which the hosted project does **not** enforce (`/auth/v1/token` answers `invalid_credentials` even with a bogus token). Also pins `experimental.serverActions.allowedOrigins` to stay empty, so Next.js's same-origin Server Action check remains the CSRF control |
| `auth-mail-throttle-surface.test.ts` | the two mail-fan-out credential endpoints `auth-throttle-surface.test.ts` does not cover — `signUp` and `resendConfirmation`. Neither calls `getUser()`, so both mail an attacker-chosen address; the gate pins an address/e-mail throttle **before** the `supabase.auth.signUp`/`resend` call, so a throttled call cannot still send one mail. It strips comments before matching, so a prose "throttle" cannot satisfy either the presence or the ordering check (the control was bound in #505; promoted to a gate in #514) |
| `account-lifecycle-surface.test.ts` | the account-lifecycle boundary (#418): `public.profiles.status` is not client-writable, write RPCs check active status, sign-in rejects blocked accounts, API error responses forbid shared caching, and account deletion is a session-bound, rate-limited server action using the service role. Foreign-key retention restrictions and the erasure policy remain open; integration tests cover success, missing service credentials and FK-rejected outcomes |
| `server-cookie-inventory.test.ts` | the **server**-side cookie write inventory (#418 §6), which `cookie-inventory.test.ts` (client writers) and `session-cookie-flags.test.ts` (known call sites) do not cover: every `cookies().set(…)` / `response.cookies.set(…)` / `cookieStore.set(…)` site in `src/**`, and that the `sb-*` writes take their flags from the shared `cookieOptions` object rather than a forked inline literal |
| `vercel-deploy-gate.test.ts` | `vercel.json` `git.deploymentEnabled` stays pinned to "only `main` deploys". A build cancelled by Vercel's Ignored Build Step still spends the Hobby build budget, so the gate that decides *before* a build exists is what protects `main`'s deploy availability (#319) |
| `readme-coverage.test.ts` | this layer's own coverage table is a ratchet: every `tests/security/*.test.ts` has a row in "What is covered" and every row names a file that exists, so the table cannot silently under- or over-report the audited surface |
| `lockfile-coverage.test.ts` | the supply-chain boundary (#188): the repo carries exactly one lockfile and it resolves the manifest it accompanies. `bun.lock` (the lock CI installs from) matches `package.json` and resolves every direct dependency; no npm-family lockfile (`package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`) is in the tree and `.github/dependabot.yml` watches `bun`, so the advisory scan reads the tree CI installs. All gates, mutation-checked |

## Findings

Open findings are recorded as passing assertions that verify the gap still exists; they do not intentionally fail the CI run.
`node:test` reports them as `# TODO` and they do **not** fail the run, so the
suite stays green while the gap is tracked. When the owner ships the fix
the test passes on its own — remove the `todo` option to promote it to a gate.

| Finding | Owner | Status |
|---|---|---|
| Open redirect via dot-segment normalisation in `sanitizeNextPath` | (`src/lib/pwa/destination.ts`) | **fixed** (output re-validated) |
| `src/server/email/unsubscribe-token-core.ts` lacks `import "server-only"` | (`src/server/**`) | **fixed** (#102; now a gate) |
| `tests/security/**` not collected by any CI job | (`.github/workflows/**`) | **fixed** (`test:security` step) |
| Anon feedback/sales forms had no captcha or rate limit | (`src/features/**`) | **fixed** (rate limiter in the actions) |
| The throttle is action-only; the `anon` RPC is directly callable (#139) | (`supabase/**`) | **fixed** (DB throttle inside the RPC; now a gate) |
| The DB throttle's IP dimension was one shared bucket on the app path (the action sent no visitor IP) | (`src/features/**`) + (`supabase/**`) | **fixed** (#206; the actions forward `x-client-ip` and the migration keys on it first, keeping the edge address as a coarse per-peer cap; `anonymous-rpc-throttle.test.ts` is now a gate) |
| Self-service hard deletion may be blocked by `ON DELETE RESTRICT`; the action still lacks fresh password/MFA confirmation and its abuse limit is per Vercel process | (`src/features/identity/actions.ts`, `src/features/identity/auth-rate-limits.ts`, `docs/data-retention.md`) | **partially mitigated; owner decision open** — verifies the current user, derives target only from that session, catches transport failures and clears auth cookies after success; FK retention, recent-auth/MFA confirmation, and a distributed atomic rate-limit store remain open |
| Company verification previously dead-ended at `pending` | (`supabase/migrations/20261117100000_v4_company_verification_review.sql`, `src/features/companies/actions.ts`, admin company review page) | **fixed** — MFA-gated review RPC, Server Action, admin queue and database tests now provide explicit `verified`/`rejected` decisions |
| Company-profile team notification depends on an inbox being configured and Resend delivery working | (`src/features/companies/actions.ts`, `src/server/email/mailer.ts`) | **implemented in code; production configuration/delivery not verified** — `COMPANY_REVIEW_INBOX_EMAIL` falls back to `FEEDBACK_INBOX_EMAIL` then `SALES_CONTACT_EMAIL`; if all are absent no team alert is sent, and failed Resend delivery is recorded under email health |
| `info@isbulkktc.com` is published as the support address with Cloudflare Email Routing MX, but SPF authorises only Cloudflare and no mailbox is documented — inbound routing and Resend sending are not both proven | (`docs/cloudflare.md`) | open (see #170 for the SPF/Resend half) |
| Supabase session cookie keeps `@supabase/ssr` defaults (`httpOnly:false`, no `Secure`) | (`src/features/identity/**`, session lifecycle) | **fixed** (PR #201; now a gate) |
| `NEXT_LOCALE` locale cookie had no `Secure` flag (issue #418 §6) | (`src/i18n/routing.ts`) | **fixed** (#469/#498; now a gate in `locale-cookie-flags.test.ts`; `HttpOnly` is not possible — the language switcher writes it from JS) |
| The credential endpoints (`signIn`, `requestPasswordReset`) carry no application-level throttle, and the hosted project does **not** enforce the captcha the config claims (issue #418 §7) | (`src/features/identity/**`) | **fixed** (#457 closed; `auth-throttle-surface.test.ts` is now a gate) |
| The two mail-fan-out siblings (`signUp`, `resendConfirmation`) carried no throttle: an unbounded confirmation-mail fan-out to an attacker-chosen address (#418 §7) | (`src/features/identity/**`) | **fixed** (#505 / PR #513; `auth-mail-throttle-surface.test.ts` promoted to a gate in #514 — it also pins ordering, not just presence) |
| `/api/build-info` is cross-origin readable (`ACAO: *`), page routes answer write methods, error paths cache (#424/#435) | Vercel/Next.js platform plus API route owners | **partially fixed** — M-01/M-02/M-04 are platform/framework behaviour; the repository-controlled M-03 error responses now set `Cache-Control: no-store` and are gated by `account-lifecycle-surface.test.ts`. `api-response-surface.test.ts` continues to guard the build-info surface |
| `/api/qr` could previously throw on an undersized pinned QR version or a payload beyond version 40 | (`src/app/api/qr/route.ts`, `tests/integration/qr-route.test.ts`, `tests/security/qr-render-capacity-surface.test.ts`) | **fixed** — undersized pins retry with automatic sizing; payloads that cannot fit any QR version return a controlled 414 with `Cache-Control: no-store`; integration tests decode valid output and exercise the failure branches |
| `package-lock.json` was a stale second lockfile and the only manifest Dependabot audited: it resolved none of `qrcode`, `web-push`, `jsqr` or `pngjs` and pinned `lucide-react@1.63.0` where `bun.lock` has `1.62.0`, so the advisory scan read a tree that is not what CI installs | (`package.json`, lockfiles) | **fixed** (b1f8d62: stale lock dropped + gitignored, `.github/dependabot.yml` moved to `bun`; `lockfile-coverage.test.ts` now gates the closure, not the deleted file) |
| The DB half of the push-endpoint allowlist (`register_push_subscription`) parsed the host with `split_part` on the raw string, so it disagreed with `isAllowedPushEndpoint` (a URL host parse): `https://evil.com\.push.apple.com/x` (real host `evil.com`) and percent-encoded variants passed the RPC but failed the app gate, and `https://fcm.googleapis.com\evil.com/x` failed the RPC but passed the app gate. Not an SSRF — the send sink re-checks the app gate — but the DB guard did not enforce the rule it claimed to | (`supabase/migrations/**`) | **fixed** (#536 aligned the RPC and #282 lifted the rule onto the table as a CHECK; the security layer updated the parity mirror in #568, so `push-endpoint-sql-parity.test.ts` is now a gate) |

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


### Live Supabase Security Advisor baseline — 2026-11-20

The production project's advisor snapshot was checked against live PostgreSQL
catalogs on 2026-11-20. Findings are not all equivalent to exploitable access:

- **19 RLS-enabled tables have no policies**. The same 19 tables were checked
  with `has_table_privilege`: neither `anon` nor `authenticated` has
  SELECT/INSERT/UPDATE/DELETE. This is an intentional deny-by-default pattern;
  public reads and writes go through reviewed RPCs rather than direct table grants.
- The advisor reports **12 anon-callable SECURITY DEFINER functions**:
  eight public read/form helpers, three intended anonymous submission RPCs,
  and `rls_auto_enable()`. The latter is an internal `event_trigger` pseudo-type
  function, not an ordinary REST RPC; it was nevertheless left in the default
  client EXECUTE ACL and is now source-controlled, search-path pinned, fail-closed
  and revoked from client/service roles by
  `20261120100000_v4_harden_rls_auto_enable_event_trigger.sql`.
- The advisor reports **51 authenticated-callable SECURITY DEFINER functions**.
  These are an explicit full-signature allowlist in
  `supabase/tests/database/function_privileges.test.sql`; the source security
  gates also require admin RPCs to check the platform-admin/AAL2 helper in their
  own bodies and service-only RPCs to check the service role.
- **Four multiple-permissive SELECT policy warnings** remain on
  `applications`, `companies`, `company_members` and `jobs`. These combine
  distinct candidate/company/admin/public read paths. They are a performance
  review item; consolidation was not attempted without an equivalent policy
  truth-table and EXPLAIN comparison.
- **17 unused-index INFO findings** remain. They may reflect a small/early
  production workload; no index was removed based only on a cold usage counter.
- **Leaked Password Protection is disabled** in Supabase Auth. This is a
  project-level setting, not a SQL migration; Supabase documents it under
  Authentication → Sign In / Providers → Email and makes it available on Pro
  plans and above. The deployment plan/permission must be checked before it can
  be enabled. No Auth dashboard setting was changed during this repository PR.
- The health advisor returned no lint findings.

Re-run the live advisors after deployment. A migration's local pgTAP pass is not
proof that the production Auth configuration or advisor snapshot has changed.
