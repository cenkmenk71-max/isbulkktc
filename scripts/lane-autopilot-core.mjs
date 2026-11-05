/**
 * Pure decision helpers for the lane autopilot.
 *
 * `lane-autopilot.mjs` runs `main()` at import time, so it cannot be imported by
 * a unit test. These helpers hold the decisions worth pinning without touching
 * the network: when to refresh a lane's conversation, and whether a lane has any
 * labelled work at all.
 */

/**
 * Decide how to give a lane its next task on a sandbox it already owns.
 *
 * A conversation re-sends its whole transcript every turn, so appending forever
 * is a context cost, not a saving — that is what pushed one lane past 100M
 * prompt tokens (issue #218). Past `maxReuses` the lane gets a *fresh
 * conversation on the same sandbox*: the sandbox is reused (the daily quota
 * counts sandbox creation, so this costs none), the history is not.
 *
 * @param {object} params
 * @param {number} params.reuses tasks already appended to this conversation
 * @param {number} params.maxReuses
 * @returns {"append"|"refresh"}
 */
export function nextConversationAction({ reuses, maxReuses }) {
  const limit =
    Number.isFinite(maxReuses) && maxReuses > 0 ? maxReuses : 1;
  const used = Number.isFinite(reuses) && reuses > 0 ? reuses : 0;
  return used >= limit ? 'refresh' : 'append';
}

/**
 * Whether a lane has any open issue that names it.
 *
 * A lane is only started when it has concrete, bounded work (docs/lanes/POLICY.md):
 * a labelled issue is that work. Without this guard the autopilot hands a
 * "no work yet" kickoff to every idle lane each pass, and a lane with nothing to
 * do burns a full conversation before stopping.
 *
 * Matching rules, most precise first:
 *   - the lane's own `lane:<name>` label always counts;
 *   - the broad label (`agent:infra`) is shared by several lanes, so it only
 *     counts for an issue that carries no `lane:*` label at all — otherwise an
 *     infra-labelled issue would also start `cloudflare`, which shares the
 *     `agent:infra` label.
 *
 * @param {{label?: string, laneLabel?: string}} lane
 * @param {Array<{labels?: Array<{name?: string}|string>}>} issues open issues
 * @returns {boolean}
 */
export function hasLabelledWork(lane, issues) {
  const laneLabel = lane?.laneLabel;
  const broadLabel = lane?.label;
  if (!laneLabel && !broadLabel) return false;
  return (issues ?? []).some((issue) => {
    const labels = (issue?.labels ?? []).map((label) => label?.name ?? label);
    if (laneLabel && labels.includes(laneLabel)) return true;
    if (!broadLabel || !labels.includes(broadLabel)) return false;
    // The broad label only applies when no lane has claimed the issue precisely.
    return !labels.some((name) => typeof name === 'string' && name.startsWith('lane:'));
  });
}

/** A quota rejection is the platform's limit, not the lane's failure. */
export function isCapacityError(detail) {
  const text = String(detail ?? '').toLowerCase();
  return (
    text.includes('sandbox limit') ||
    text.includes('quota') ||
    text.includes('capacity')
  );
}
