# Deploy log — LANE-TESLİMAT

Append-only record of what was merged, what production served, and whether the
two agreed. One row per verification checkpoint (not one per merge): the point is
to make divergence between `main` and the live site visible instead of assumed.

Rule 4 of the lane brief: **every merge is recorded — what, when, verified live?**

## How to read a row

- `main tip` — `git ls-remote origin refs/heads/main` at the time of the check.
- `live` — `GET https://isbulkktc.com/api/build-info` → `commit`.
- `verdict` — ✅ live == main tip; ⚠️ live is an ancestor of the tip (behind);
  ❌ diverged (neither is an ancestor of the other); 🚫 **the origin serves no
  site at all** (Vercel `402 DEPLOYMENT_DISABLED` — account blocked/suspended),
  so `build-info` reports no commit and no comparison is possible.

## 2026-11-06

| Checked (UTC) | main tip | live | verdict | Note |
|---|---|---|---|---|
| 2026-11-06T01:28Z | `f7a10fd6` | `f7a10fd6` | ✅ in sync | Three consecutive `build-info` reads over ~50 min all returned `f7a10fd6`, the `main` tip after PR #301 merged. |
| 2026-11-06T01:54Z | `f7a10fd6` | `f7a10fd6` | ✅ in sync | Fresh read after this lane's PR #307 opened. `main` unchanged; no merge landed between the two checkpoints. |
| 2026-11-06T02:17Z | `c6e15b18` | `c406b397` | ⚠️ **behind by 2** | 🔴 **Production is frozen.** `live` is an ancestor of `main` (not diverged): `c9d932f7` (#307, this lane) and `c6e15b18` (#315) merged but never deployed — both carry `Vercel: Deployment rate limited — retry in 24 hours`. `c406b397` (#314) is the last successful production build. Handoff: issue #319. |
| 2026-11-06T02:55Z | `5d026376` | `5d026376` | ✅ **recovered** | The freeze cleared on its own: the rate-limit window reset and the backlog deployed, so `live` caught up to `main`. Verified with `verify-production-deployment.mjs --expect 5d026376` → exit 0, 5/5 smoke routes 200. This is the first checkpoint where the two agree after 02:17Z. |
| 2026-11-06T03:08Z | `8b45b72` | `5d026376` | ⚠️ **behind by 5** | 🔴 **Frozen again.** `live` is again an ancestor of `main` (behind, not diverged) — five merges landed since the recovery and none deployed: `a9e6b07` (#325), `77ca734` (#326), `e102567` (#330), `eae8633` (#328), `8b45b72` (#323). Every one carries `Vercel: Deployment rate limited — retry in 24 hours`. Same cause as 02:17Z (issue #319): the rate-limit window is shorter than the merge rate, so production oscillates between caught-up and 5+ behind. |
| 2026-11-06T03:48Z | `9ea1aaf` | `5b1923d0` | ⚠️ **behind by 2** | Still catching up: `c989838` (#334, this lane) and `9ea1aaf` (#333) had merged but not deployed. Read directly (the verifier polls for 15 min by default, so a quick check uses `DEPLOY_TIMEOUT_SEC=1`). |
| 2026-11-06T04:50Z | `1b1bf26` | `1b1bf26` | ✅ **recovered** | The rate-limit window reset again and the whole backlog deployed: `main` advanced through `#341`, `#343`, `#344`, `#345`, `#348` and production is serving the tip `1b1bf26` (its commit status is `Vercel: success — Deployment has completed`). Third recovery of the day — the freeze/recover cycle in #319 is the steady state until the build limit is raised or preview builds are cut. |
| 2026-11-06T05:01Z | `31ff8ca` | `1b1bf26` | ⚠️ **behind by 2** | Frozen again immediately after this lane's PR #353 merged (`5ce8aa0`): `5ce8aa0` (#353) and `31ff8ca` (#355) both carry `Vercel: Deployment rate limited — retry in 24 hours`, so neither deployed. Fourth freeze of the day. `#353`'s own preview build hit the same limit, which is why the PR showed `Vercel: fail` (non-required) while every required check passed. |

Earlier in the session the task context reported `main` at `ef6caed3` while the
live site served `48ff9b78`; `48ff9b78` is an ancestor of `main` (5 commits
behind) at the time of writing, i.e. consistent with a real deploy lag that had
already self-healed by the time the checkpoints above were measured. Recorded as
context, not as a measurement.

### Delivery health findings (2026-11-06)

1. **`verify-production-deployment.mjs` had two latent defects** that could let
   the deploy verifier report a *false green* or never terminate. Fixed in this
   PR; the evidence table lives in the PR body. In short: a blank
   `DEPLOY_TIMEOUT_SEC`/`DEPLOY_POLL_SEC` (an unset repository variable arrives
   as `""`) produced a `NaN` deadline and an unbounded busy-loop, and the
   direct-run guard compared against a hand-built `file://${argv[1]}` string
   that never matches `import.meta.url` on a path containing a space or `#` — so
   the script silently exited 0 without verifying anything.

2. **`push`-triggered workflows do not run for auto-merged PRs.**
   `isbulkktc CI` and `Verify production deployment` both declare
   `on: push: branches: [main]`, yet the newest `event=push` runs are from
   **2026-11-05T20:29Z** (SHA `c8fe7d4e`, a *human* merge by `cenkmenk71-max`)
   while every merge since is authored by `app/github-actions`. The cause is in
   `agent-pr-automation.yml`: it lands PRs with
   `gh pr merge --squash --auto` under `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`,
   the default Actions token — which GitHub documents as **not** triggering
   `push` workflows. So the auto-merge loop lands a PR and then no post-merge
   verification fires. The `main` tip carries only the check-runs from
   *scheduled* workflows (`Health check`, `Send pending push notifications`), not
   from CI or the deploy verifier. Net effect: **production-deploy verification
   has not run for any merge today**, which is exactly the loop this lane exists
   to close. Infra-owned; see the handoff issue for the fix options (PAT/App
   token for the merge, and/or a `schedule:` fallback on the verifier so it is
   not solely push-gated).

3. **Vercel build rate limit (external quota).** Open PRs carry a red `Vercel`
   status: `Deployment rate limited — retry in 24 hours`
   (`https://vercel.com/orijin1?upgradeToPro=build-rate-limit`). Preview builds
   are refused until the window resets or the plan is raised. `Vercel` is **not**
   a required check, so it never blocks a merge — but preview deploys are dead
   meanwhile. Needs the owner (plan upgrade) or ~24 h. **Confirmed in round 2 to
   be a *build* limit, not the storage quota**: the scheduled `Prune Vercel
   deployments` job ran cleanly (`deleted=21 failed=0 remaining=10`) yet merges
   still fail to build — so pruning cannot clear it.

4. **🔴 Production is frozen — `main` advances, the live site does not.**
   At 2026-11-06T02:17Z, `main` = `c6e15b18` but `build-info` returned
   `c406b397`, an *ancestor* of `main` (behind, not diverged). The two commits in
   between — `c9d932f7` (this lane's PR #307) and `c6e15b18` (#315) — both merged
   but their production builds were refused by the rate limit. The last
   successfully deployed commit is `c406b397` (#314). Consequence: the live site
   serves an older release than `main`, so "fixed" work is not actually shipped;
   `verify-production-deployment.mjs --expect <main tip>` correctly fails against
   this state. Root cause and fix options are in issue #319 (LANE-INFRA). This is
   the one finding that most directly breaks the lane's acceptance criterion
   ("every merge verified live").

5. **PR #250's `Database` job fails a real pgTAP assertion — it is not a flake.**
   Job `127550318504` shows `supabase/tests/database/table_privileges.test.sql`
   test 7, *"anonymous visitors keep the public catalogue reads"*, failing
   (`Tests: 8 Failed: 1`), so the aggregator inherits the red. A
   `toomanyrequests: Rate exceeded` burst does appear during `db:start`, but the
   stack then reports **"Started supabase local development setup."** — the rate
   limit was retried and is *not* the cause. `supabase/tests/**` is LANE-SUPABASE's;
   the fix belongs to that lane (PR #250 already touches the file). Recorded here
   because a red `Database` on an open PR is exactly what the deploy ledger exists
   to surface.

6. **E2E shards flake on a Docker port collision, not on the change.**
   PR #307's first run: `E2E (2/4)` failed in *Start the seeded local Supabase
   stack* with `failed to bind host port for 0.0.0.0:54322 … address already in
   use`, while `E2E (1/4)`, `(3/4)`, `(4/4)`, `Static checks` and `Database` all
   passed. Four shards start their own Supabase stack in parallel on the same
   runner image, so a leftover `54322` listener from a sibling shard can collide.
   Re-running the failed job cleared it. Infra-owned (`ci.yml`); worth a
   `supabase stop` / unique-port guard, but not blocking.

7. **`approve-pending-runs.mjs` let a blank token shadow a valid one.** The
   `gh()` helper built its child environment as `{ ...process.env, GH_TOKEN:
   GITHUB_PERSONAL_ACCESS_TOKEN ?? GH_TOKEN }`. `??` only falls through on
   `null`/`undefined`, so when `GITHUB_PERSONAL_ACCESS_TOKEN` was the empty
   string — what an unset CI secret interpolates to — it won over a valid
   `GH_TOKEN` and `gh` ran with an empty token. Measured with a recording fake
   `gh`: `GITHUB_PERSONAL_ACCESS_TOKEN="" GH_TOKEN="ghs_real"` → old code passed
   `GH_TOKEN=[]`, new code passes `GH_TOKEN=[ghs_real]`. (The *missing* case was
   already fine: Node drops an `undefined` env entry, so no `"undefined"` was
   ever sent — an earlier note here claimed otherwise and was wrong.) Effect: the
   script could report `no runs are waiting for approval` and approve nothing,
   the "PR stuck at BLOCKED forever" failure it exists to prevent (#178). Fixed
   in this PR (`ghEnv()` uses `||` + trim, and drops the key entirely when no
   token remains) with a regression test. The same helper is also made importable
   by moving the body into a guarded `main()`.

8. **`approve-pending-runs.mjs` was the only owned script without a
   direct-run guard.** `prune-vercel-deployments.mjs` and
   `verify-production-deployment.mjs` both gate `main()` behind
   `import.meta.url === pathToFileURL(process.argv[1]).href`, but
   `approve-pending-runs.mjs` called its top-level `gh api` at module scope, so a
   static import would have run the approval immediately. Added in this PR: the
   body moved into an exported `main()`, guarded the same way. This is now
   load-bearing — the new regression test imports `ghEnv` from the module, which
   would otherwise fire a real `gh` call on import.

9. **`verify-production-deployment.mjs` blamed a missing token for a bad one.**
   When `VERCEL_TOKEN` was set but `resolveVercelContext` failed (invalid token,
   unknown team slug, API blip), the loop kept `configured: false` with reason
   `VERCEL_TOKEN not set`. Measured with `VERCEL_TOKEN=invalid_token_xyz`: the
   summary printed `Vercel API: ⏭️ VERCEL_TOKEN not set` and the verdict
   `vercel: VERCEL_TOKEN not set; …`, so the operator is told to set a secret
   they already set, and `decideVerification` can no longer take its "blocked and
   unconfigured" branch to explain a genuinely blocked probe. Fixed in this PR by
   the extracted `initialVercelState(token, context, error)` helper: a supplied
   token that fails to resolve now reports `Vercel API unreachable: <cause>` and
   `configured: true`. Regression test added.

10. **`prune-vercel-deployments.mjs` — the one script that deletes production
    deployments — had no test.** `selectDeploymentsToDelete` decides what is
    removed irreversibly, and nothing pinned it. Added
    `scripts/prune-vercel-deployments.test.mjs` (8 cases): the live deployment is
    never deleted even when it is the oldest; newest-N production / newest-M
    preview are kept; deletions are oldest-first; the min-age safety window holds;
    a missing `created` is treated as oldest rather than kept by a `NaN`
    comparison; negative keep counts clamp to zero; and only `*.vercel.app`
    hostnames are disposable. Writing it caught a wrong expectation of my own
    (ordering), which is the point.

11. **`prune-vercel-deployments.mjs` could hang the scheduled job.** Its
    `fetch` had no timeout and the workflow sets no `timeout-minutes`, so a
    stalled connection would spin until the six-hour job cap — and a hung prune
    is what lets the deployment backlog grow back into the build rate limit. Added
    a 20 s `AbortSignal.timeout`, reported as HTTP 599 so the existing
    `apiRequestWithRetry` retries it like any transient 5xx instead of crashing
    the run.

12. **`lane-autopilot.mjs` runs the approval block twice** (lines 563 and 581
    are byte-identical, comment and all). Harmless today (the second pass finds no
    pending runs) but it doubles the `gh` traffic that #218 is trying to cut.
    `lane-autopilot.mjs` is LANE-INFRA's file, so it is handed off, not edited
    here.

## 2026-11-09

| Checked (UTC) | main tip | live | verdict | Note |
|---|---|---|---|---|
| 2026-11-09T23:25Z | `bc767871` | `bc767871` | ✅ in sync | Direct `git ls-remote` + `build-info` read. No lag: the 2026-11-06 rate-limit oscillation (issue #319) is not reproducing this round. |
| 2026-11-09T23:38Z | `a1419963` | `a1419963` | ✅ in sync | `main` advanced past `bc767871` (a merge landed while this lane worked). Full `verify-production-deployment.mjs --expect a1419963` run: exit 0, confirmed via HTTP, 5/5 smoke routes 200. The HTTP channel was **reachable** this time — Cloudflare did not 403 the runner, so the verdict came from `/api/build-info` rather than the Vercel API. |
| 2026-11-09T23:45Z | `713d8fe` | `713d8fe` | ✅ in sync | **Merge record — PR #503** (this lane's #427 fix) merged by `app/github-actions` at 23:44:29Z, all required checks green including the `Quality, database and E2E` aggregator. Full `verify-production-deployment.mjs --expect 713d8fe` run: exit 0, confirmed via HTTP, 5/5 smoke routes 200. |

### Delivery health findings (2026-11-09)

13. **`verify-production-deployment.mjs` read `--tip` once, so a merge landing
    mid-run painted a healthy site red (issue #427).** The workflow resolves the
    branch tip at the start and passes it as `--tip`; the script then polls for up
    to `DEPLOY_TIMEOUT_SEC` (900 s). If a merge lands on `main` while the run is
    polling, production heads to the newer commit, so the run can never see its
    commit promoted — but the frozen `tip` value means `isSuperseded()` never
    fires and the run fails. Observed live: `Verify production deployment` was red
    on 3/5 recent `main` runs (`vercel=alias built from 3257efa3, expected
    c3d3d023`) while `expected c3d3d023` stayed fixed across a running poll. The
    `concurrency: cancel-in-progress` block cannot cover this: auto-merges use the
    default Actions token, whose push starts no workflow run to cancel the older
    one. Fixed by re-reading the live tip every `DEPLOY_TIP_REFRESH_SEC` (default
    60) inside the poll loop and skipping when a newer commit owns `main`. An
    unreadable remote keeps verifying rather than skipping on no evidence, and a
    manual (`workflow_dispatch`) run with no `--tip` is unchanged. Three
    regression tests added: a moving tip skips (exit 0); a static tip still fails
    loudly; a push run recovers when the workflow's initial `ls-remote` returned
    empty. The mid-run test fails against the pre-fix script, so it pins the bug.

## 2026-11-10

| Checked (UTC) | main tip | live | verdict | Note |
|---|---|---|---|---|
| 2026-11-10T00:15Z | `8f4a50e3` | `8f4a50e3` | ✅ in sync | Direct `git ls-remote` + `build-info` read. Full `verify-production-deployment.mjs --expect 8f4a50e3` run: exit 0, confirmed via HTTP, 5/5 smoke routes 200. `main` advanced twice since the last record (`713d8fe` → `1101321` PR #504 → `8f4a50e3` PR #507, lane/icerik i18n privacy/cookie); production followed both, so no freeze this round. |

### Delivery health findings (2026-11-10)

14. **`approve-pending-runs.mjs` read only the first page of stuck runs
    (`scripts/approve-pending-runs.mjs`).** The list call used
    `per_page=50` with no `--paginate`, and the GitHub API caps `per_page` at 100
    and returns only the first page by default. A backlog larger than one page
    would be approved partially while the script still printed `approved N/N` and
    exited 0 — the exact failure it exists to prevent (#178, the queue nobody
    watches). Latent today (`action_required` total_count is 0), but a real
    correctness gap: it can only surface as a silently half-cleared queue. Fixed
    by adding `--paginate` and extracting `parsePendingRuns()` so the row shape is
    testable without `gh`. Three regression tests added; the `--paginate`-presence
    test fails against the pre-fix script, so it pins the bug.

| Checked (UTC) | main tip | live | verdict | Note |
|---|---|---|---|---|
| 2026-11-10T00:30Z | `3fcafbf3` | `3fcafbf3` | ✅ in sync | **Merge record — PR #509** (finding 14's `--paginate` fix) auto-merged by `app/github-actions` at 00:26:53Z; all required checks green including the `Quality, database and E2E` aggregator. Full `verify-production-deployment.mjs --expect 3fcafbf` run: exit 0, confirmed via HTTP, 5/5 smoke routes 200. `main` advanced `8f4a50e3` → `3fcafbf3` and production followed it immediately — no freeze. |
| 2026-11-10T02:12Z | `8d3db245` | — | 🚫 **origin disabled** | 🔴 **Production is down for every visitor — the worst state this log can record.** `GET https://isbulkktc.com/api/build-info` → **HTTP 402** with header `x-vercel-error: DEPLOYMENT_DISABLED`; every smoke route (`/`, `/jobs`, `/companies`, `/contact`, `/en`, `/tr`, `/login`) returns 402. The `main` tip's commit status is `Vercel: failure — Account is blocked.` (`3fcafbf3`/`8f4a50e3` were the last two successes). Nothing is served, so `build-info` reports no commit and no `main`↔live comparison is possible — hence 🚫 rather than ✅/⚠️/❌. This is account/quota state, **not a code defect**; cannot be fixed from this repository. Handoff: issue #319 (LANE-INFRA). `verify-production-deployment.mjs --expect 8d3db245` → exit 1 with the new "production deployment is disabled" verdict (finding 15). |
| 2026-11-10T02:40Z | `1599b14a` | — | 🚫 **origin disabled** | **Merge record — PR #522** (finding 15's disabled-deployment fix) auto-merged by `app/github-actions` at 02:39:29Z (squash; `main` `2a78026` → `1599b14a`). All required checks green including the `Quality, database and E2E` aggregator; the only red is `Vercel — Account is blocked.`, which is not a required check (brief's `UNSTABLE` case, not `CONFLICTING`). Live re-check: still **402 on every route** — the account block (#319) persists, so the merge could not be verified live. This is the one merge this lane cannot confirm, and the reason is external, not a code defect. |

### Delivery health findings (2026-11-10, round 2)

15. **`verify-production-deployment.mjs` could report a green deploy for a site
    that is down for every visitor.** Vercel answers a blocked/suspended
    account's deployment with **HTTP 402** and `x-vercel-error:
    DEPLOYMENT_DISABLED` (`https://isbulkktc.com/*` → 402 today). The verifier
    classified 402 as a plain 4xx and `decideVerification` checked the **Vercel
    API channel first**: that channel proves the *alias target* (which deployment
    the domain points at), not that the origin serves it, and can still report
    the alias pointing at a `READY` deployment built from the expected commit
    while every visitor gets 402. Measured against the pre-fix script with the
    alias healthy and the origin answering 402: the summary printed
    `verdict: ✅ alias built from 8d3db245` even though every smoke route had
    failed — the ✅ was wrong, and the run only stayed red because the smoke
    loop happened to be reachable. When Cloudflare edge-blocks the runner (its
    usual answer to GitHub datacenter IPs, 403) every smoke route is *skipped*,
    so there is no failing route to catch it: with the same healthy alias the old
    script **exited 0** — a full false green for a production that serves
    nothing. Fixed in this PR: a new `isDeploymentDisabled` detects the disabled
    case (status 402 or the `x-vercel-error` header), `evaluateRouteResponse`
    marks such a route as a failure rather than a skipped 4xx, and
    `decideVerification` treats `http.disabled` as the **highest-priority**
    failure — checked *before* `vercel.ok` — so the verdict reads
    `❌ production deployment is disabled (not a code problem): HTTP 402
    (DEPLOYMENT_DISABLED)`. The poll loop also breaks immediately on a disabled
    origin (an account state cannot be fixed by waiting for a build: measured
    live against the real outage with `DEPLOY_TIMEOUT_SEC=45`, the old script
    polled for **61 s** and printed three `waiting` lines before failing, the new
    one returns in **<1 s** with zero `waiting` lines). Verified live: exit 1, the message
    above, and `Vercel API: ⏭️ VERCEL_TOKEN not set` no longer able to mask it.
    Regression tests added; the masking test fails against the pre-fix ordering,
    so it pins the bug.
| 2026-11-10T03:09Z | `df36b2d1` | — | 🚫 **origin disabled** | Direct `git ls-remote` + `build-info` read. Every route (`/`, `/jobs`, `/companies`, `/contact`, `/en`, `/tr`, `/login`, `/api/build-info`) still returns **402** with `x-vercel-error: DEPLOYMENT_DISABLED` — the account block (#319 / issue #518, LANE-INFRA) persists from the 02:12Z checkpoint, so no `main`↔live comparison is possible. `main` is unchanged since the last record (`1599b14a` → `df36b2d1`, the #523 docs merge). Merge queue this round: #526 (lane/guvenlik) `BLOCKED`; #493 (lane/infra) `CLEAN` but changes `.github/workflows/ci.yml` → **not merged** (the brief's "two brakes": a human lands workflow changes). No PR was mergeable by this lane this round. |

### Delivery health findings (2026-11-10, round 3)

16. **`approve-pending-runs.mjs` exited 0 even when a run could not be
    approved.** The script caught an approval failure, printed it, and then
    still printed `approved N/M` and returned success. A scheduled caller
    (`lane-autopilot`) reads that exit code as "the queue is clear", so a run
    left at `action_required` — a lane sitting BLOCKED with no CI at all —
    looked like a clean pass. That is the #178 failure mode the script exists to
    prevent, reintroduced by the exit code. Fixed: an approval failure is now
    counted, a `N run(s) still need approval; the queue is not clear` line is
    written to stderr, and the process exits 1. The regression test runs the
    real script against a fake `gh` that refuses the approve call and asserts
    exit 1; it fails against the pre-fix script, so it pins the bug.

17. **A failed `gh` call was reported as `Command failed: gh api …`.** The
    approval catch and the top-level `main().catch` printed only
    `error.message`. `execFileSync` puts that generic string on `message`; the
    actionable reason ("Resource not accessible by integration", "Not Found")
    is on `stderr`, so the log said nothing an operator could act on. Fixed with
    `ghErrorLine(error)`, which prefers the first non-blank `stderr` line and
    falls back to `message`. Regression test covers both paths.
| 2026-11-10T03:22Z | `feb5ee0d` | — | 🚫 **origin disabled** | **Merge record — PR #527** (findings 16–17: the `approve-pending-runs.mjs` exit-code and `stderr` fixes) auto-merged by `app/github-actions` at 03:20:21Z (squash; `main` `df36b2d1` → `feb5ee0d`). All required checks green including the `Quality, database and E2E` aggregator; the only red is `Vercel — Account is blocked.`, not a required check (the brief's `UNSTABLE` case, not `CONFLICTING`). Live re-check: still **402 on every route** — the account block (#319 / issue #518) persists, so the merge could not be verified live. This is this lane's second unverifiable delivery and the reason is external, not a code defect. `main` also advanced `df36b2d1` → `9fb60c0` (#526, lane/guvenlik) before this merge. |
| 2026-11-10T05:56Z | `a44ca16e` | — | 🚫 **origin disabled** | **Merge record — PR #538** (finding 18: the prune retention-safety fix — production can no longer be deleted down to zero) auto-merged by `app/github-actions` at 05:56:00Z (squash; `main` `4568c32` → `a44ca16e`). All required checks green including the `Quality, database and E2E` aggregator; the only red is `Vercel — Account is blocked.`, not a required check (the brief's `UNSTABLE` case, not `CONFLICTING`). Live re-check: `GET https://isbulkktc.com/api/build-info` → **HTTP 402** with `x-vercel-error: DEPLOYMENT_DISABLED` and body `Payment required`, and the tip's commit status is `Vercel: failure — Account is blocked.` — the account block (#319 / issue #518) persists, so the merge could not be verified live. This is this lane's third unverifiable delivery and the reason is external, not a code defect. `main` also advanced `efc8bae` → `4568c32` (#535, lane/cloudflare) before this merge. |

### Delivery health findings (2026-11-10, round 4)

18. **`selectDeploymentsToDelete` could select every production deployment.**
    The retention policy's own docstring promises "always keep the live
    production deployment", but the live deployment was pinned only through
    `keepUid` (from `targets.production.id`). When that id is absent — a project
    with no production alias yet, or an API change that drops the field — the
    newest-N window is the only thing standing between the live deployment and
    deletion, and `VERCEL_KEEP_PRODUCTION=0` (a legal value; the workflow passes
    it straight through) removes even that. `selectDeploymentsToDelete` then
    returned **every** production deployment and `main()` would delete them all,
    destroying the only rollback target and the deployment that may be serving
    traffic. Fixed: the production window now keeps `Math.max(1, keepProduction)`
    deployments, so the newest production deployment always survives, and
    `main()` logs a warning when `targets.production.id` cannot be resolved.
    Regression test in both the `node:test` and the `tsx` unit suite; both fail
    against the pre-fix script.
