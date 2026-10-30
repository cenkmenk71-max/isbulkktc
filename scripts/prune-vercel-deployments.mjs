#!/usr/bin/env node
// Prunes old Vercel deployments so the project's stored-deployment count never
// grows without bound. Vercel caps stored deployments on every plan; once the
// cap is reached new builds are refused, which is what "your quota is filling
// up" mail warns about.
//
// Retention policy (all counts configurable):
//   * always keep the live production deployment (the one the domains point at)
//   * keep the newest N production deployments   (rollback history)
//   * keep the newest M preview deployments      (recent PR/branch builds)
//   * keep anything younger than a safety window (never race a fresh build)
// Everything else is deleted, oldest first. Runs as a dry-run unless --apply.
//
// Usage:
//   node scripts/prune-vercel-deployments.mjs            # dry-run (default)
//   node scripts/prune-vercel-deployments.mjs --apply    # delete
//
// Environment:
//   VERCEL_TOKEN            required; token with access to the team
//   VERCEL_TEAM_ID          optional; resolved from the slug when absent
//   VERCEL_TEAM_SLUG        optional; default "orijin1"
//   VERCEL_PROJECT          optional; default "isbulkktc"
//   VERCEL_KEEP_PRODUCTION  optional; newest production deploys to keep (5)
//   VERCEL_KEEP_PREVIEW     optional; newest preview deploys to keep (5)
//   VERCEL_MIN_AGE_HOURS    optional; keep anything newer than this (1)
//   VERCEL_MAX_DELETES      optional; hard per-run cap (200)
//
// When GITHUB_STEP_SUMMARY is set the run also writes a Markdown summary.

import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API = "https://api.vercel.com";

/** An auto-generated Vercel hostname, e.g. `isbulkktc-amber.vercel.app`. Only
 * these are disposable; any other hostname is a domain someone configured. */
export function isVercelHostname(hostname) {
  return typeof hostname === "string" && hostname.endsWith(".vercel.app");
}

/** A hostname we must never let a deployment deletion take down. */
export function isProtectedHostname(hostname) {
  return typeof hostname === "string" && !isVercelHostname(hostname);
}

/**
 * Pure retention decision. Returns the deployments to delete, oldest first.
 * `deployments` are raw Vercel deployment objects (`uid`, `created`, `target`,
 * `state`).
 */
export function selectDeploymentsToDelete(deployments, options) {
  const {
    keepUid,
    keepProduction = 5,
    keepPreview = 5,
    minAgeMs = 0,
    now = Date.now(),
  } = options ?? {};

  const created = (deployment) => deployment.created ?? 0;
  const isProduction = (deployment) => deployment.target === "production";

  const newestFirst = [...deployments].sort((a, b) => created(b) - created(a));

  const keep = new Set();
  if (keepUid) {
    keep.add(keepUid);
  }
  for (const deployment of newestFirst
    .filter(isProduction)
    .slice(0, Math.max(0, keepProduction))) {
    keep.add(deployment.uid);
  }
  for (const deployment of newestFirst
    .filter((deployment) => !isProduction(deployment))
    .slice(0, Math.max(0, keepPreview))) {
    keep.add(deployment.uid);
  }

  const stale = [];
  for (const deployment of newestFirst) {
    if (keep.has(deployment.uid)) continue;
    if (minAgeMs > 0 && now - created(deployment) < minAgeMs) continue;
    stale.push(deployment);
  }

  stale.sort((a, b) => created(a) - created(b));
  return stale;
}

async function apiRequest(token, path, method = "GET") {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, body };
}

async function apiRequestWithRetry(token, path, method = "GET") {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await apiRequest(token, path, method);
    if (last.status !== 429 && last.status < 500) return last;
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  return last;
}

async function resolveTeamId(token, teamId, teamSlug) {
  if (teamId) return teamId;
  const { status, body } = await apiRequest(token, "/v2/teams?limit=100");
  if (status !== 200) {
    throw new Error(`Could not list teams (HTTP ${status}).`);
  }
  const team = (body.teams ?? []).find((entry) => entry.slug === teamSlug);
  if (!team) {
    throw new Error(`No team with slug "${teamSlug}" for this token.`);
  }
  return team.id;
}

async function listAllDeployments(token, teamId, projectId) {
  const all = [];
  let until;
  for (;;) {
    const query = new URLSearchParams({
      teamId,
      projectId,
      limit: "100",
    });
    if (until) query.set("until", String(until));
    const { status, body } = await apiRequestWithRetry(
      token,
      `/v6/deployments?${query}`,
    );
    if (status !== 200) {
      throw new Error(`Could not list deployments (HTTP ${status}).`);
    }
    all.push(...(body.deployments ?? []));
    const next = body.pagination?.next;
    if (!next) return all;
    until = next;
  }
}

// The list endpoint omits `alias`, and the per-deployment detail endpoint
// reports the production domain on *every* production deployment (a Vercel
// quirk), so neither can tell which deployment is really live. The aliases
// endpoint is authoritative: it maps each hostname to the one deployment it
// currently serves.
async function listDomainPinnedDeploymentIds(token, teamId, projectId) {
  const pinned = new Set();
  let until;
  for (;;) {
    const query = new URLSearchParams({ teamId, projectId, limit: "100" });
    if (until) query.set("until", until);
    const { status, body } = await apiRequestWithRetry(
      token,
      `/v4/aliases?${query}`,
    );
    if (status !== 200) {
      throw new Error(`Could not list aliases (HTTP ${status}).`);
    }
    for (const entry of body.aliases ?? []) {
      if (isProtectedHostname(entry.alias) && entry.deploymentId) {
        pinned.add(entry.deploymentId);
      }
    }
    const next = body.pagination?.next;
    if (!next) return pinned;
    until = next;
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatRow(deployment, now) {
  const created = deployment.created ?? 0;
  const iso = new Date(created).toISOString().replace("T", " ").slice(0, 16);
  const ageHours = Math.floor((now - created) / 3_600_000);
  const target = deployment.target ?? "preview";
  const ref = deployment.meta?.githubCommitRef ?? "-";
  return `${iso}Z  ${target.padEnd(10)}  ${(deployment.state ?? "-").padEnd(9)}  ${deployment.uid}  ${ref}  (${ageHours}h)`;
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error(
      "VERCEL_TOKEN is not set. Create one at https://vercel.com/account/tokens.",
    );
  }

  const apply = process.argv.includes("--apply");
  const teamSlug = process.env.VERCEL_TEAM_SLUG ?? "orijin1";
  const projectName = process.env.VERCEL_PROJECT ?? "isbulkktc";
  const keepProduction = parsePositiveInt(
    process.env.VERCEL_KEEP_PRODUCTION,
    5,
  );
  const keepPreview = parsePositiveInt(process.env.VERCEL_KEEP_PREVIEW, 5);
  const minAgeHours = parsePositiveInt(process.env.VERCEL_MIN_AGE_HOURS, 1);
  const maxDeletes = parsePositiveInt(process.env.VERCEL_MAX_DELETES, 200);

  const teamId = await resolveTeamId(
    token,
    process.env.VERCEL_TEAM_ID,
    teamSlug,
  );

  const project = await apiRequestWithRetry(
    token,
    `/v9/projects/${encodeURIComponent(projectName)}?teamId=${teamId}`,
  );
  if (project.status !== 200) {
    throw new Error(
      `Could not read project "${projectName}" (HTTP ${project.status}).`,
    );
  }
  const projectId = project.body.id;
  const liveUid = project.body.targets?.production?.id;

  const deployments = await listAllDeployments(token, teamId, projectId);
  const now = Date.now();

  // Any deployment a real domain currently points at is untouchable, regardless
  // of age or the keep counts. This is resolved from the authoritative aliases
  // endpoint, not the misleading per-deployment `alias` field.
  const domainPinned = await listDomainPinnedDeploymentIds(
    token,
    teamId,
    projectId,
  );

  let toDelete = selectDeploymentsToDelete(deployments, {
    keepUid: liveUid,
    keepProduction,
    keepPreview,
    minAgeMs: minAgeHours * 3_600_000,
    now,
  }).filter((deployment) => !domainPinned.has(deployment.uid));

  const capped = toDelete.length > maxDeletes;
  if (capped) {
    // Drop the newest of the stale set so we still make progress on the oldest.
    toDelete = toDelete.slice(0, maxDeletes);
  }

  console.log(
    `project ${projectName} (${projectId}) on team ${teamId}: ${deployments.length} deployments, keeping ${deployments.length - toDelete.length}, pruning ${toDelete.length}${apply ? "" : " [dry-run]"}`,
  );
  if (domainPinned.size > 0) {
    console.log(
      `domain-pinned (never pruned): ${[...domainPinned].join(", ")}`,
    );
  }

  const summaryLines = [
    `## Vercel deployment prune ${apply ? "(applied)" : "(dry-run)"}`,
    "",
    `- project: \`${projectName}\``,
    `- deployments before: **${deployments.length}**`,
    `- pruning: **${toDelete.length}**`,
    `- keeping: **${deployments.length - toDelete.length}** (live \`${liveUid ?? "unknown"}\`, newest ${keepProduction} production, newest ${keepPreview} preview, <${minAgeHours}h old, ${domainPinned.size} domain-pinned)`,
  ];
  if (capped) {
    summaryLines.push(
      `- note: capped at ${maxDeletes} deletions this run; re-run to continue`,
    );
  }

  if (toDelete.length === 0) {
    console.log("Nothing to prune.");
  } else {
    console.log("\nOldest deletions first:");
    for (const deployment of toDelete.slice(0, 25)) {
      console.log(`  ${formatRow(deployment, now)}`);
    }
    if (toDelete.length > 25) {
      console.log(`  ... and ${toDelete.length - 25} more`);
    }
  }

  let deleted = 0;
  const failures = [];
  if (apply) {
    for (const [index, deployment] of toDelete.entries()) {
      const { status } = await apiRequestWithRetry(
        token,
        `/v13/deployments/${deployment.uid}?teamId=${teamId}`,
        "DELETE",
      );
      if (status === 200 || status === 204) {
        deleted += 1;
      } else {
        failures.push(`${deployment.uid} -> HTTP ${status}`);
      }
      if ((index + 1) % 25 === 0) {
        console.log(
          `  ... ${index + 1}/${toDelete.length} (deleted ${deleted}, failed ${failures.length})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    console.log(
      `\nDone. deleted=${deleted} failed=${failures.length} remaining=${deployments.length - deleted}`,
    );
    summaryLines.push(`- deleted: **${deleted}**`, `- failed: ${failures.length}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`  FAIL ${failure}`);
    summaryLines.push("", "Failed deletions:", ...failures.map((f) => `- \`${f}\``));
  }

  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    await appendFile(summaryFile, `${summaryLines.join("\n")}\n`);
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
