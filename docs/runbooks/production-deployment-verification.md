# Runbook: production deployment verification

The Vercel Git integration deploys `main` on every push. CI proves the code is
*buildable*, but it cannot prove the live site is *serving* it: a failed Vercel
build, an alias left pinned to the previous deployment, or an app that boots and
then errors at request time all keep the Actions tab green while `isbulkktc.com`
quietly serves stale code. This runbook closes that gap.

## How it works

`.github/workflows/verify-production-deployment.yml` runs after every push to
`main`. It polls the production origin's build identity until it reports the
commit that was just pushed, then smoke-tests the public routes:

- **Build identity** — `GET /api/build-info` returns
  `{ commit, environment }`. The route is static, so `VERCEL_GIT_COMMIT_SHA` is
  baked into the deployment at build time. The job waits up to
  `DEPLOY_TIMEOUT_SEC` (default **900 s**, polling every **20 s**) for the live
  commit to match. This is what catches a build that never promoted or an alias
  that stayed on the old deployment.
- **Smoke routes** — `/`, `/jobs`, `/companies`, `/contact`, `/en` must each
  answer **2xx with a non-trivial body**. The default locale (`tr`) is
  unprefixed under `localePrefix: "as-needed"`, so `/jobs` is the canonical path
  (`/tr/jobs` would 308-redirect). `/en` exercises the intl routing layer.
- **Production alias** — when a Vercel token is present, the job also confirms
  the project's `targets.production.id` deployment was built from the same
  commit (read from `meta.githubCommitSha`).

A failure here is a real outage signal: the push landed in `main`, but production
is not serving it.

## Secrets and variables

The build-identity and smoke checks need **no secret**. The optional Vercel token
only adds the alias cross-check; without it the job still verifies the live
origin and stays green.

| Name | Required | Purpose |
|---|---|---|
| `VERCEL_TOKEN` (or `VERCEL`) | optional | Adds the production-alias commit cross-check. Same token as the prune job. |
| `PRODUCTION_URL` (var) | optional | Origin to verify. Default `https://isbulkktc.com`. |
| `DEPLOY_TIMEOUT_SEC` (var) | optional | How long to wait for the commit. Default `900`. |
| `DEPLOY_POLL_SEC` (var) | optional | Seconds between polls. Default `20`. |

## Running it by hand

**Actions → Verify production deployment → Run workflow.** Leave `expect` blank
to verify the checked-out `HEAD`, or pass a specific SHA. The job writes a
Markdown summary (build identity, per-route results, alias check) to the run's
summary page.

Locally:

```bash
node scripts/verify-production-deployment.mjs --expect <sha>
# or against another origin:
node scripts/verify-production-deployment.mjs --expect <sha> --url https://preview.example
```

## When it fails

1. **`build-info HTTP 404`** — the deployment predates this route, or Vercel
   never promoted a new build. Check the Vercel dashboard for the latest
   production deployment and its build log.
2. **`serving <old>, expected <new>`** — a new deployment did not promote, or
   the alias still points at the previous one. Re-run the Vercel build; the job
   keeps polling until the timeout, so a slow build resolves itself.
3. **A route is not `2xx`** — the deploy is live but broken. Check the Vercel
   runtime logs for that deployment; the build can succeed while a request-time
   dependency (for example a missing env var or an unapplied migration) fails.
4. **`alias built from <old>`** — `targets.production.id` is not the commit you
   pushed. Promote the intended deployment in Vercel.

Rolling back is the mirror image: promote the previous good deployment in
Vercel, then re-run this workflow with that deployment's commit SHA to confirm
the rollback is live.
