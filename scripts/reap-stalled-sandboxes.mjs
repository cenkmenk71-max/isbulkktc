#!/usr/bin/env node
// Reaps sandboxes a finished lane forgot to release.
//
// `scripts/lane-autopilot.mjs` counts a sandbox as running while it is RUNNING
// and treats the lane as busy while its conversation is `running`. The platform
// releases a sandbox on its own when a conversation ends *cleanly*, but a
// conversation that ends in `error` (or is abandoned in `finished`/`stuck`)
// leaves its sandbox RUNNING with nobody using it. That sandbox holds one of
// the `sandboxBudget` slots forever, so capacity is permanently short and the
// lanes with real work are `deferred` every pass — the capacity deadlock in
// issue #218.
//
// This script finds those sandboxes and *pauses* them. Pausing frees the slot
// (the budget counts RUNNING sandboxes) while keeping the lane's worktree, so
// the autopilot can `resume` it later without spending quota. It never deletes.
//
// It is deliberately conservative. A sandbox is only paused when every
// conversation attached to it is in a terminal state, so it can never pull the
// sandbox out from under an agent that is still working. An idle conversation
// (finished its turn, waiting for the next task) is not terminal and is left
// alone — that is exactly the state the autopilot reuses.
//
// Usage:
//   node scripts/reap-stalled-sandboxes.mjs                 # dry-run (default)
//   node scripts/reap-stalled-sandboxes.mjs --apply         # pause
//   node scripts/reap-stalled-sandboxes.mjs --min-idle-minutes 20
//
// Environment:
//   OPENHANDS_API_KEY          required; the same key the autopilot uses
//   REAP_MIN_IDLE_MINUTES      optional; ignore anything younger (default 15)
//   REAP_MAX_PAUSES            optional; hard per-run cap (default 20)
//
// When GITHUB_STEP_SUMMARY is set the run also writes a Markdown summary.

import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const API = "https://app.all-hands.dev/api/v1";

// A conversation in one of these states is done with the sandbox: nothing will
// run on it again, so the sandbox is safe to reclaim. `idle` is deliberately
// absent — an idle conversation is between tasks and is the autopilot's reuse
// target. `waiting_for_confirmation` is absent because it is blocked on a human,
// not finished.
const TERMINAL_STATUSES = new Set(["error", "finished", "stuck"]);

// A sandbox is in use while any conversation attached to it is in one of these
// states, regardless of that conversation's own status. Guards the shared-sandbox
// case: a lane refreshes its conversation on the same sandbox, so one sandbox can
// hold an old terminal conversation and a live one at once.
const ACTIVE_STATUSES = new Set([
  "running",
  "idle",
  "paused",
  "waiting_for_confirmation",
]);

/** The lane a conversation belongs to, or null when it is not a lane. */
export function laneName(title) {
  const match = /^LANE-(.+)$/.exec(String(title ?? ""));
  return match ? match[1] : null;
}

/**
 * Pure reaping decision. Returns the sandboxes to pause, one entry per sandbox,
 * given the raw `/app-conversations/search` items.
 *
 * A sandbox is selected only when all of the following hold:
 *   - it has at least one lane conversation in a terminal state;
 *   - no conversation attached to it (lane or not) is in an active state;
 *   - its last activity is at least `minIdleMs` old.
 *
 * `idleMs` is measured from the newest `updated_at` among the sandbox's
 * conversations, so a sandbox that just finished is left for the next pass.
 *
 * @param {Array<object>} conversations raw conversation items
 * @param {{minIdleMs?: number, now?: number}} [options]
 * @returns {Array<{sandboxId: string, lane: string, status: string, idleMs: number, conversations: number}>}
 */
export function selectStalledSandboxes(conversations, options = {}) {
  const { minIdleMs = 0, now = Date.now() } = options;
  const bySandbox = new Map();

  for (const conversation of conversations ?? []) {
    const sandboxId = conversation?.sandbox_id;
    if (!sandboxId) continue;
    // A sandbox the platform already reclaimed is not ours to touch.
    if (String(conversation?.sandbox_status ?? "") !== "RUNNING") continue;
    const bucket = bySandbox.get(sandboxId) ?? [];
    bucket.push(conversation);
    bySandbox.set(sandboxId, bucket);
  }

  const selected = [];
  for (const [sandboxId, bucket] of bySandbox) {
    const statuses = bucket.map((c) => String(c?.execution_status ?? ""));
    if (statuses.some((status) => ACTIVE_STATUSES.has(status))) continue;

    const terminal = bucket.filter((c) =>
      TERMINAL_STATUSES.has(String(c?.execution_status ?? "")),
    );
    if (terminal.length === 0) continue;

    const lastActivity = bucket.reduce((newest, c) => {
      const at = Date.parse(String(c?.updated_at ?? ""));
      return Number.isFinite(at) && at > newest ? at : newest;
    }, 0);
    const idleMs = lastActivity > 0 ? now - lastActivity : Infinity;
    if (idleMs < minIdleMs) continue;

    // Name the sandbox after the lane whose conversation stopped last: that is
    // the conversation whose failure stranded it.
    const culprit = terminal.reduce((latest, c) =>
      Date.parse(String(c?.updated_at ?? "")) >
      Date.parse(String(latest?.updated_at ?? ""))
        ? c
        : latest,
    );

    selected.push({
      sandboxId,
      lane: laneName(culprit?.title) ?? "unknown",
      status: String(culprit?.execution_status ?? ""),
      idleMs,
      conversations: bucket.length,
    });
  }

  selected.sort((a, b) => b.idleMs - a.idleMs);
  return selected;
}

// Bound every request so a stalled connection cannot hang the run.
const REQUEST_TIMEOUT_MS = 20_000;

async function apiRequest(key, path, method = "GET") {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return { status: 599, body: { error: error.message } };
  }
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, body };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function formatRow(entry) {
  const minutes = Number.isFinite(entry.idleMs)
    ? Math.floor(entry.idleMs / 60_000)
    : "?";
  return `${entry.lane.padEnd(12)} ${entry.status.padEnd(8)} idle ${String(minutes).padStart(4)}m  ${entry.sandboxId}  (${entry.conversations} conv)`;
}

/**
 * Reap in one call: list conversations, select stalled sandboxes, pause them.
 * Returns what it found and what it did, so the caller can log or summarise.
 *
 * `request` is injectable so the orchestration (the max-pauses cap, the
 * already-gone handling, failure collection) can be tested without a network.
 *
 * @param {{key?: string, apply?: boolean, minIdleMinutes?: number,
 *          maxPauses?: number, now?: number,
 *          request?: (key: string, path: string, method?: string) => Promise<{status: number, body: any}>}} [options]
 * @returns {Promise<{candidates: Array<object>, toPause: Array<object>, paused: Array<object>, gone: Array<object>, failures: string[]}>}
 */
export async function reapStalledSandboxes({
  key,
  apply = true,
  minIdleMinutes = 15,
  maxPauses = 20,
  now = Date.now(),
  request = apiRequest,
} = {}) {
  if (!key) {
    throw new Error("OPENHANDS_API_KEY is not set.");
  }

  const { status, body } = await request(
    key,
    "/app-conversations/search?limit=50",
  );
  if (status !== 200) {
    throw new Error(`Could not list conversations (HTTP ${status}).`);
  }

  const candidates = selectStalledSandboxes(body?.items ?? [], {
    minIdleMs: minIdleMinutes * 60_000,
    now,
  });
  const toPause = candidates.slice(0, maxPauses);
  const paused = [];
  const gone = [];
  const failures = [];

  if (apply) {
    for (const entry of toPause) {
      const result = await request(
        key,
        `/sandboxes/${entry.sandboxId}/pause`,
        "POST",
      );
      if (result.status === 200 || result.status === 204) {
        paused.push(entry);
      } else if (result.status === 404) {
        // Already gone: the platform reclaimed it between the list and the pause.
        gone.push(entry);
      } else {
        failures.push(`${entry.lane} ${entry.sandboxId} HTTP ${result.status}`);
      }
    }
  }

  return { candidates, toPause, paused, gone, failures };
}

export async function main() {
  const key = process.env.OPENHANDS_API_KEY;
  if (!key) {
    throw new Error("OPENHANDS_API_KEY is not set.");
  }

  const apply = process.argv.includes("--apply");
  const minIdleMinutes = parsePositiveInt(
    process.env.REAP_MIN_IDLE_MINUTES,
    15,
  );
  const maxPauses = parsePositiveInt(process.env.REAP_MAX_PAUSES, 20);

  const result = await reapStalledSandboxes({
    key,
    apply,
    minIdleMinutes,
    maxPauses,
  });

  const summaryLines = ["## Stalled sandboxes", ""];
  console.log(
    `stalled sandboxes: ${result.candidates.length} (pausing ${result.toPause.length}, min idle ${minIdleMinutes}m)`,
  );
  for (const entry of result.candidates) {
    console.log(`  ${formatRow(entry)}`);
  }

  if (!apply) {
    console.log("\n--dry-run: nothing paused. Re-run with --apply to pause.");
    summaryLines.push(
      `- stalled: **${result.candidates.length}**`,
      `- paused: 0 (dry-run)`,
    );
    await writeSummary(summaryLines);
    return;
  }

  for (const entry of result.paused) {
    console.log(`  paused ${entry.lane} (${entry.sandboxId})`);
  }
  for (const entry of result.gone) {
    console.log(`  gone   ${entry.lane} (${entry.sandboxId})`);
  }
  for (const failure of result.failures) {
    console.error(`  FAIL   ${failure}`);
  }

  console.log(
    `\nDone. paused=${result.paused.length} failed=${result.failures.length}`,
  );
  summaryLines.push(
    `- stalled: **${result.candidates.length}**`,
    `- paused: ${result.paused.length}`,
  );
  if (result.failures.length > 0) {
    summaryLines.push(
      "",
      "Failed pauses:",
      ...result.failures.map((f) => `- \`${f}\``),
    );
  }
  await writeSummary(summaryLines);

  if (result.failures.length > 0) {
    process.exitCode = 1;
  }
}

async function writeSummary(lines) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) {
    await appendFile(summaryFile, `${lines.join("\n")}\n`);
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
