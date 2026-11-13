#!/usr/bin/env node
// Sets `NEXT_PUBLIC_GA_MEASUREMENT_ID` on the Vercel project and redeploys, so
// GA4 turns on without anyone clicking through the dashboard.
//
// Why a script rather than "add the variable and redeploy": `NEXT_PUBLIC_*`
// values are inlined at build time, so a variable added to the project does
// nothing until a *new* build runs. This script does both steps and then proves
// the value reached the client bundle — the failure mode it exists to prevent is
// a green dashboard ("variable is set") over a site that still ships no tag.
//
// The measurement id is not a secret (it is visible in the page source), but the
// single source of truth is still the environment variable, never the code. The
// id is read from `--id` or `GA_MEASUREMENT_ID`; it is never written to disk.
//
// Usage:
//   VERCEL_TOKEN=<vcp_…> GA_MEASUREMENT_ID=G-XXXXXXXXXX \
//     node scripts/set-ga4-measurement-id.mjs
//   node scripts/set-ga4-measurement-id.mjs --id G-XXXXXXXXXX --dry-run
//
// Environment:
//   VERCEL_TOKEN           required; token with access to the team
//   VERCEL_PROJECT         optional; project name or id (default "isbulkktc")
//   VERCEL_TEAM_ID         optional; team id (preferred when present)
//   VERCEL_TEAM_SLUG       optional; resolved to an id when VERCEL_TEAM_ID is absent
//   VERCEL_DEPLOY_TIMEOUT_MS optional; how long to wait for the build (600000)
//   DRY_RUN=1              validate without writing

import { pathToFileURL } from "node:url";

const API = "https://api.vercel.com";
const ENV_KEY = "NEXT_PUBLIC_GA_MEASUREMENT_ID";
const DEFAULT_TARGETS = ["production", "preview"];

/** True when the module was launched directly, not imported by a test. */
export function isDirectRun(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

/**
 * A GA4 web-stream measurement id: `G-` followed by upper-case letters and
 * digits. Deliberately the same shape the client component accepts
 * (`src/components/analytics/google-analytics.tsx`), so an id that passes here
 * cannot be silently rejected at render time.
 */
export function looksLikeMeasurementId(value) {
  return typeof value === "string" && /^G-[A-Z0-9]+$/.test(value.trim());
}

/** Parses the CLI flags. Pure, so a test can pin the defaults and overrides. */
export function parseArgs(argv, env = process.env) {
  const value = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const timeout = Number.parseInt(env.VERCEL_DEPLOY_TIMEOUT_MS ?? "600000", 10);
  return {
    id: (value("--id") ?? env.GA_MEASUREMENT_ID ?? "").trim(),
    project: value("--project") ?? env.VERCEL_PROJECT ?? "isbulkktc",
    teamId: value("--team-id") ?? env.VERCEL_TEAM_ID ?? "",
    teamSlug: value("--team-slug") ?? env.VERCEL_TEAM_SLUG ?? "is-bulkktc",
    targets: DEFAULT_TARGETS,
    redeploy: !argv.includes("--no-redeploy"),
    wait: !argv.includes("--no-wait"),
    verify: !argv.includes("--no-verify"),
    dryRun: argv.includes("--dry-run") || env.DRY_RUN === "1",
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 600_000,
  };
}

/** The request body for creating/updating the variable. */
export function envPayload(id, targets = DEFAULT_TARGETS) {
  return { key: ENV_KEY, value: id.trim(), type: "plain", target: [...targets] };
}

/**
 * Decides whether the variable must be written. Idempotent by design: a re-run
 * with the same id and targets writes nothing, so the script is safe to leave on
 * a schedule and never churns a rebuild for no change.
 */
export function decideEnvWrite(existing, id, targets = DEFAULT_TARGETS) {
  if (!existing) return { action: "create" };
  const sameValue = String(existing.value ?? "") === id.trim();
  const sameTargets =
    [...(existing.target ?? [])].sort().join(",") === [...targets].sort().join(",");
  if (sameValue && sameTargets) return { action: "skip" };
  return { action: "update", envId: existing.id };
}

/** True when the deployment reached a terminal, successful state. */
export function isReady(state) {
  return state === "READY";
}

/** True when the deployment stopped without becoming live. */
export function isFailed(state) {
  return state === "ERROR" || state === "CANCELED";
}

/** Extracts `<script src="…">` URLs from an HTML document, made absolute. */
export function scriptSources(html, base) {
  return [...String(html).matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => {
    try {
      return new URL(match[1], base).href;
    } catch {
      return null;
    }
  }).filter(Boolean);
}

async function api(token, path, init = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body };
}

/** Resolves the team id, or "" for the personal scope. */
async function resolveTeamId(token, { teamId, teamSlug }) {
  if (teamId) return teamId;
  if (!teamSlug) return "";
  const { ok, body } = await api(token, "/v2/teams");
  if (!ok) throw new Error(`Could not list Vercel teams (HTTP ${body?.error?.code ?? "?"}).`);
  const team = (body.teams ?? []).find((entry) => entry.slug === teamSlug);
  if (!team) throw new Error(`No team with slug "${teamSlug}" for this token.`);
  return team.id;
}

async function waitForDeployment(token, teamId, deploymentId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let state = "QUEUED";
  while (Date.now() < deadline) {
    const { body } = await api(
      token,
      `/v13/deployments/${deploymentId}${teamId ? `?teamId=${teamId}` : ""}`,
    );
    state = body.readyState ?? state;
    if (isReady(state) || isFailed(state)) return { state, url: body.url };
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  return { state: "TIMEOUT", url: null };
}

/**
 * Confirms the id is inlined into a client bundle of the live deployment. This
 * is the only end-to-end proof available from outside a browser: the tag is
 * consent-gated, so the id is never in the served HTML — but because
 * `NEXT_PUBLIC_*` is inlined at build time it must appear in a chunk.
 */
async function verifyBuiltBundle(origin, id, limit = 25) {
  const html = await fetch(origin).then((response) => (response.ok ? response.text() : "")).catch(() => "");
  if (!html) return { state: "unknown", detail: "the deployment did not serve HTML" };
  const sources = scriptSources(html, origin).slice(0, limit);
  for (const source of sources) {
    const chunk = await fetch(source).then((response) => (response.ok ? response.text() : "")).catch(() => "");
    if (chunk.includes(id)) return { state: "found", detail: source };
  }
  return { state: "missing", detail: `${sources.length} script(s) scanned, id not found` };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = (process.env.VERCEL_TOKEN ?? "").trim();

  if (!token) {
    console.error("VERCEL_TOKEN is required (create one at https://vercel.com/account/tokens).");
    process.exitCode = 1;
    return;
  }
  if (!args.id) {
    console.error("A measurement id is required: pass --id G-XXXXXXXXXX or set GA_MEASUREMENT_ID.");
    console.error("Create a GA4 web data stream at analytics.google.com → Admin → Data streams.");
    process.exitCode = 1;
    return;
  }
  if (!looksLikeMeasurementId(args.id)) {
    console.error(`"${args.id}" is not a GA4 measurement id (expected G- followed by A–Z/0–9).`);
    process.exitCode = 1;
    return;
  }

  const teamId = await resolveTeamId(token, args);
  const suffix = teamId ? `?teamId=${teamId}` : "";

  const project = await api(token, `/v9/projects/${encodeURIComponent(args.project)}${suffix}`);
  if (!project.ok) {
    console.error(`Could not read project "${args.project}" (HTTP ${project.status}).`);
    process.exitCode = 1;
    return;
  }
  const projectId = project.body.id;
  console.log(`Project ${project.body.name} (${projectId}), team ${teamId || "personal scope"}`);

  const envs = await api(token, `/v9/projects/${projectId}/env${suffix}`);
  const existing = (envs.body.envs ?? []).find((entry) => entry.key === ENV_KEY);
  const decision = decideEnvWrite(existing, args.id, args.targets);
  console.log(
    decision.action === "skip"
      ? `  ${ENV_KEY} is already ${args.id} on ${args.targets.join("+")} — nothing to write`
      : `  ${ENV_KEY} → ${args.id} (${decision.action}) on ${args.targets.join("+")}`,
  );

  if (decision.action === "skip") {
    console.log("Nothing to do.");
    return;
  }
  if (args.dryRun) {
    console.log("DRY_RUN — no write, no redeploy.");
    return;
  }

  const write =
    decision.action === "update"
      ? await api(token, `/v9/projects/${projectId}/env/${decision.envId}${suffix}`, {
          method: "PATCH",
          body: JSON.stringify(envPayload(args.id, args.targets)),
        })
      : await api(token, `/v10/projects/${projectId}/env${suffix}`, {
          method: "POST",
          body: JSON.stringify(envPayload(args.id, args.targets)),
        });
  if (!write.ok) {
    console.error(`Vercel rejected the environment update (HTTP ${write.status}).`);
    process.exitCode = 1;
    return;
  }
  console.log(`  ${decision.action === "update" ? "Updated" : "Created"} ${ENV_KEY}.`);

  // Confirm the value the way Vercel stores it instead of trusting the echo.
  const after = await api(token, `/v9/projects/${projectId}/env${suffix}`);
  const stored = (after.body.envs ?? []).find((entry) => entry.key === ENV_KEY);
  if (!stored || stored.value !== args.id) {
    console.error("The variable did not persist with the expected value; aborting before redeploy.");
    process.exitCode = 1;
    return;
  }

  if (!args.redeploy) {
    console.log("Skipping redeploy (--no-redeploy). The variable takes effect on the next build.");
    return;
  }

  const latest = await api(
    token,
    `/v6/deployments?projectId=${projectId}${teamId ? `&teamId=${teamId}` : ""}&target=production&limit=1`,
  );
  const source = (latest.body.deployments ?? [])[0];
  if (!source) {
    console.error("No production deployment found to redeploy from.");
    process.exitCode = 1;
    return;
  }

  const created = await api(
    token,
    `/v13/deployments?forceNew=1${teamId ? `&teamId=${teamId}` : ""}`,
    {
      method: "POST",
      body: JSON.stringify({
        name: project.body.name,
        deploymentId: source.uid,
        target: "production",
      }),
    },
  );
  if (!created.ok) {
    console.error(`Vercel refused the redeploy (HTTP ${created.status}).`);
    process.exitCode = 1;
    return;
  }
  const deploymentId = created.body.id ?? created.body.uid;
  console.log(`  Redeploy triggered: ${deploymentId} (${created.body.url ?? "queued"})`);

  if (!args.wait) return;
  const final = await waitForDeployment(token, teamId, deploymentId, args.timeoutMs);
  console.log(`  Build finished: ${final.state}`);
  if (isFailed(final.state) || final.state === "TIMEOUT") {
    console.error(`The redeploy did not become READY (${final.state}).`);
    process.exitCode = 1;
    return;
  }

  if (args.verify && final.url) {
    const origin = `https://${final.url}`;
    const check = await verifyBuiltBundle(origin, args.id);
    const label = { found: "PASS", missing: "WARN", unknown: "WARN" }[check.state];
    console.log(`  ${label} bundle      ${check.detail}`);
    if (check.state !== "found") {
      console.log(
        "  The id was not seen in a client chunk. It is inlined at build time, so a\n" +
          "  cache or a non-production target can explain this; confirm in a browser with\n" +
          "  docs/runbooks/analytics.md (consent → `typeof window.gtag`).",
      );
    }
  }
}

if (isDirectRun(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
