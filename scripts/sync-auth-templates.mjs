#!/usr/bin/env node
// Pushes the branded auth email templates and their localized subjects from the
// repository to the hosted Supabase project.
//
// Why this exists: the Auth dashboard stores each template and subject in the
// project config, not in git, and nothing re-syncs them. A template pasted into
// the dashboard by hand therefore drifts from `supabase/templates/` silently —
// the recovery email shipped unbranded and un-localized exactly this way — and no
// test, lint or build can see it. `scripts/verify-auth-config.mjs` reports the
// drift; this script removes it.
//
// Usage:
//   SUPABASE_ACCESS_TOKEN=<sbp_…> node scripts/sync-auth-templates.mjs
//
// Environment:
//   SUPABASE_ACCESS_TOKEN  Supabase management token (required).
//   SUPABASE_PROJECT_REF   default the project this repository targets.
//   DRY_RUN=1              print the plan without writing.

import { pathToFileURL } from "node:url";
import {
  AUTH_TEMPLATE_FILES,
  evaluateAuthTemplateDrift,
  notificationFlagKey,
  readRepoAuthTemplate,
  readRepoNotificationEnabled,
  readRepoTemplateSubject,
} from "./verify-auth-config.mjs";

const SUPABASE_API = "https://api.supabase.com/v1";

/** The `mailer_templates_*` / `mailer_subjects_*` pair for every repo template. */
export function buildTemplatePayload() {
  const payload = {};
  for (const name of Object.keys(AUTH_TEMPLATE_FILES)) {
    const content = readRepoAuthTemplate(name);
    if (typeof content !== "string") continue;
    payload[`mailer_templates_${name}_content`] = content;
    const subject = readRepoTemplateSubject(name);
    if (typeof subject === "string") payload[`mailer_subjects_${name}`] = subject;
  }
  return payload;
}

/**
 * The `mailer_notifications_*_enabled` switches `config.toml` pins. A repository
 * that enables a notification while the hosted project has it off sends no
 * notice, so the sync must carry the switch too — the body alone does not.
 */
export function buildNotificationPayload() {
  const payload = {};
  for (const name of Object.keys(AUTH_TEMPLATE_FILES)) {
    const enabled = readRepoNotificationEnabled(name);
    if (typeof enabled === "boolean") payload[notificationFlagKey(name)] = enabled;
  }
  return payload;
}

async function fetchAuthConfig(token, projectRef) {
  const response = await fetch(`${SUPABASE_API}/projects/${projectRef}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function patchAuthConfig(token, projectRef, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${SUPABASE_API}/projects/${projectRef}/config/auth`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? "uwmhquvzbilbfzdrlxmb";
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exitCode = 1;
    return;
  }

  const before = await fetchAuthConfig(token, projectRef);
  if (before.status !== 200 || !before.body) {
    console.error(`Supabase auth config could not be read (HTTP ${before.status}).`);
    process.exitCode = 1;
    return;
  }

  const drift = evaluateAuthTemplateDrift(before.body);
  if (drift.length === 0) {
    console.log("Auth email templates already match the repository — nothing to sync.");
    return;
  }
  for (const line of drift) console.log(`drift: ${line}`);

  const payload = { ...buildTemplatePayload(), ...buildNotificationPayload() };
  console.log(`syncing ${Object.keys(payload).length} fields`);

  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN=1 — nothing written.");
    return;
  }

  const patched = await patchAuthConfig(token, projectRef, payload);
  if (patched.status !== 200) {
    console.error(`Supabase rejected the update (HTTP ${patched.status}).`);
    process.exitCode = 1;
    return;
  }

  // The Management API's config read can lag a PATCH, so re-read and report the
  // drift that remains instead of trusting the echoed fields.
  const after = await fetchAuthConfig(token, projectRef);
  const remaining = evaluateAuthTemplateDrift(after.body ?? {});
  if (remaining.length > 0) {
    console.error(`Templates still drift after the update (${remaining.length}):`);
    for (const line of remaining) console.error(`  - ${line}`);
    process.exitCode = 1;
    return;
  }
  console.log("Auth email templates synced and verified.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
