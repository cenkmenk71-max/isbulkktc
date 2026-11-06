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

4. **PR #250's `Database` job fails a real pgTAP assertion — it is not a flake.**
   Job `127550318504` shows `supabase/tests/database/table_privileges.test.sql`
   test 7, *"anonymous visitors keep the public catalogue reads"*, failing
   (`Tests: 8 Failed: 1`), so the aggregator inherits the red. A
   `toomanyrequests: Rate exceeded` burst does appear during `db:start`, but the
   stack then reports **"Started supabase local development setup."** — the rate
   limit was retried and is *not* the cause. `supabase/tests/**` is LANE-SUPABASE's;
   the fix belongs to that lane (PR #250 already touches the file). Recorded here
   because a red `Database` on an open PR is exactly what the deploy ledger exists
   to surface.

5. **E2E shards flake on a Docker port collision, not on the change.**
   PR #307's first run: `E2E (2/4)` failed in *Start the seeded local Supabase
   stack* with `failed to bind host port for 0.0.0.0:54322 … address already in
   use`, while `E2E (1/4)`, `(3/4)`, `(4/4)`, `Static checks` and `Database` all
   passed. Four shards start their own Supabase stack in parallel on the same
   runner image, so a leftover `54322` listener from a sibling shard can collide.
   Re-running the failed job cleared it. Infra-owned (`ci.yml`); worth a
   `supabase stop` / unique-port guard, but not blocking.
