# Runbook: production deployment verification

The Vercel Git integration deploys `main` on every push. CI proves the code is
*buildable*, but it cannot prove the live site is *serving* it: a failed Vercel
build, an alias left pinned to the previous deployment, or an app that boots and
then errors at request time all keep the Actions tab green while `isbulkktc.com`
quietly serves stale code. This runbook closes that gap.

## How it works

`.github/workflows/verify-production-deployment.yml` runs after every push to
`main`. It confirms the deploy through **two independent channels**; either one
succeeding is enough.

1. **Vercel API (authoritative).** With a `VERCEL_TOKEN`, it reads the deployment
   the production alias points at (`targets.production.id`), requires
   `readyState: READY`, and compares `meta.githubCommitSha` with the pushed
   commit. This never touches the public origin.
2. **HTTP build identity.** It polls `GET /api/build-info`, which returns
   `{ commit, environment }`. The route is static, so `VERCEL_GIT_COMMIT_SHA` is
   baked in at build time.

The job polls up to `DEPLOY_TIMEOUT_SEC` (default **900 s**, every **20 s**).

## Why two channels — the Cloudflare 403

`isbulkktc.com` sits behind Cloudflare, which answers requests from datacenter IP
ranges — **including GitHub-hosted runners** — with **403**. That is not an
outage, so a 403 (or 429) on the HTTP channel is classified as *blocked* and
**skipped, never failed**. The Vercel API channel carries the verdict in that
case. This is exactly the situation CI hits: the first production run of this
workflow failed with `build-info HTTP 403` from the runner while the site was
healthy, which is why the check was restructured around the API.

If neither channel confirms the commit, the run fails.

### Smoke routes

When the origin is reachable, the public routes must each answer **2xx with a
non-trivial body**: `/`, `/jobs`, `/companies`, `/contact`, `/en`. Requests use
`redirect: "manual"` so a redirect to an SSO/login page (which answers 200) cannot
masquerade as a healthy app.

The default locale (`tr`) is unprefixed under `localePrefix: "as-needed"`, so
`/jobs` is canonical (`/tr/jobs` 308-redirects). `/en` exercises intl routing.

A failure here is a real outage signal: the push landed in `main`, but production
is not serving it.

### Superseded pushes are skipped

Two merges landing back-to-back (a merge on top of a merge) is normal here. The
older run can never see *its* commit on production — the alias moves to the newer
one — so polling would end in a red check on a perfectly healthy site. That is
exactly what happened on the first production runs (`8eda6beb` failed while
`b76d5fb4` superseded it).

So on a push the workflow resolves the live `main` tip (`git ls-remote`) and the
script **skips** — green — when a newer commit already owns the branch. A manual
`workflow_dispatch` passes no tip: naming a commit explicitly means you want it
verified even if it is no longer the tip. The job group also runs with
`cancel-in-progress: true`, so a superseded run is cancelled instead of waiting
out the 15-minute timeout.

## Secrets and variables

The HTTP channel needs **no secret**. A `VERCEL_TOKEN` is strongly recommended:
it is what makes the check work from GitHub runners, whose IPs Cloudflare blocks.

| Name | Required | Purpose |
|---|---|---|
| `VERCEL_TOKEN` (or `VERCEL`) | recommended | Authoritative alias→commit check; also makes the check work despite Cloudflare blocking the runner. Same token as the prune job. |
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

1. **`could not verify: the edge blocked the HTTP probe and no Vercel token is
   configured`** — the runner got a Cloudflare 403 and there is no
   `VERCEL_TOKEN` to fall back on. Add the secret. This is the only failure mode
   caused by Cloudflare rather than a real problem.
2. **`alias built from <old>, expected <new>`** — the production alias still
   points at the previous deployment. A new build may not have promoted; the job
   keeps polling until the timeout, so a slow build resolves itself. Otherwise
   promote the intended deployment in Vercel.
3. **`production deployment is <state>`** — the aliased deployment is not `READY`
   (still `BUILDING`, or `ERROR`). Check the Vercel build log.
4. **A route is not `2xx`** — the deploy is live but broken. Check the Vercel
   runtime logs for that deployment; the build can succeed while a request-time
   dependency (for example a missing env var or an unapplied migration) fails.
5. **`build-info HTTP 404`** — the deployment predates this route. This alone is
   not fatal when the Vercel API channel confirms the commit.

Rolling back is the mirror image: promote the previous good deployment in
Vercel, then re-run this workflow with that deployment's commit SHA to confirm
the rollback is live.
