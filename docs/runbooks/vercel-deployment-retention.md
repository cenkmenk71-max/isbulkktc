# Runbook: Vercel deployment retention

Vercel caps how many deployments a project may store. Once the cap is reached,
new builds are refused and Vercel mails the owner that the quota is full. This
runbook keeps the `isbulkktc` project under that cap automatically while
preserving everything needed to serve and roll back the live site.

## What is kept

The prune job deletes the oldest deployments first and never touches:

- the **live production deployment** — the one `isbulkktc.com` and
  `www.isbulkktc.com` point at (read from the project's `targets.production.id`);
- the newest **5 production** deployments (rollback history);
- the newest **5 preview** deployments (recent branch/PR builds);
- anything **younger than 1 hour** (never race a build that is still in flight);
- any deployment a **custom domain** alias points at (only auto-generated
  `*.vercel.app` aliases are considered disposable).

All four counts are configurable; see the table below.

## Scheduled job

`.github/workflows/prune-vercel-deployments.yml` runs every six hours
(`23 */6 * * *`) and can be started by hand (**Actions → Prune Vercel
deployments → Run workflow**, which accepts overrides for the keep counts and a
dry-run toggle). Six-hourly, not daily, because active branches can produce
dozens of deployments a day — which is exactly what fills the quota.

The job needs one repository secret:

| Secret | Purpose |
|---|---|
| `VERCEL_TOKEN` | A Vercel token that can read the team and delete deployments. Create one at <https://vercel.com/account/tokens>; a team-scoped token is preferred. |

Until the secret exists the job stays **green** and prints a warning annotation
instead of failing every night (the same fail-safe pattern as
`refresh-source-jobs.yml`).

Optional repository **variables** override the defaults:

| Variable | Default | Meaning |
|---|---|---|
| `VERCEL_TEAM_SLUG` | `orijin1` | Team that owns the project |
| `VERCEL_TEAM_ID` | *(resolved from slug)* | Skip the team lookup |
| `VERCEL_PROJECT` | `isbulkktc` | Project name |
| `VERCEL_KEEP_PRODUCTION` | `5` | Newest production deployments to keep |
| `VERCEL_KEEP_PREVIEW` | `5` | Newest preview deployments to keep |
| `VERCEL_MIN_AGE_HOURS` | `1` | Never prune anything newer than this |
| `VERCEL_MAX_DELETES` | `200` | Hard per-run deletion cap |

## Run it locally

```bash
# Dry-run: shows what would be deleted, deletes nothing.
VERCEL_TOKEN=... bun run vercel:prune

# Delete for real.
VERCEL_TOKEN=... bun run vercel:prune:apply
```

The dry-run prints the project, the number kept/pruned, and the 25 oldest
candidates. `--apply` deletes them oldest first and exits non-zero if any
deletion fails.

## Verifying after a run

1. `curl -o /dev/null -w '%{http_code}\n' -L https://www.isbulkktc.com` → `200`.
2. List remaining deployments: `GET /v6/deployments?teamId=<team>&projectId=<prj>`.
3. Confirm the live deployment id still matches the project's
   `targets.production.id`.

## If a new build is refused with a quota error

Run the prune by hand with a lower keep count to free space immediately:

```bash
VERCEL_KEEP_PRODUCTION=2 VERCEL_KEEP_PREVIEW=2 VERCEL_TOKEN=... bun run vercel:prune:apply
```

Deleting a deployment is irreversible, but only preview/branch builds and
superseded production builds are ever removed — the live deployment and recent
rollback history are always preserved.
