# Deploy log — LANE-TESLİMAT

Append-only record of what was merged, what production served, and whether the
two agreed. One row per verification checkpoint (not one per merge): the point is
to make divergence between `main` and the live site visible instead of assumed.

Rule 4 of the lane brief: **every merge is recorded — what, when, verified live?**

## How to read a row

- `main tip` — `git ls-remote origin refs/heads/main` at the time of the check.
- `live` — `GET https://isbulkktc.com/api/build-info` → `commit`.
- `verdict` — ✅ live == main tip; ⚠️ live is an ancestor of the tip (behind);
  ❌ diverged (neither is an ancestor of the other).

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
