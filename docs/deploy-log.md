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
   meanwhile. Needs the owner (plan upgrade) or ~24 h.

4. **The `Database` CI job fails on an external rate limit, not on code.**
   PR #250 shows `Static checks` ✅, all four `E2E` shards ✅, and `Database` ❌
   with `Error response from daemon: toomanyrequests: Rate exceeded` (Docker Hub
   pull limit) — the aggregator inherits the red. A re-run once the limit clears
   should go green; no code change is involved.
