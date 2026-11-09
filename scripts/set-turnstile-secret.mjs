#!/usr/bin/env node
// Applies a Cloudflare Turnstile secret to the hosted Supabase Auth config —
// but only after Cloudflare confirms the secret is real.
//
// Why the check first: an invalid secret with `security_captcha_enabled = true`
// makes *every* auth request answer `captcha_failed`, which surfaces to users as
// "the bot check could not be verified" and locks them out of sign-in entirely.
// That is exactly the production state this script exists to prevent, so it
// refuses to write a secret Cloudflare rejects.
//
// Usage:
//   TURNSTILE_SECRET=<secret> SUPABASE_ACCESS_TOKEN=<sbp_…> \
//     node scripts/set-turnstile-secret.mjs
//
// Emergency escape hatch — when the stored secret is wrong, *every* auth request
// answers `captcha_failed` and nobody can sign in. Until the correct secret is at
// hand, bot protection can be switched off (it protects nothing while broken):
//
//   node scripts/set-turnstile-secret.mjs --disable
//
// Environment:
//   TURNSTILE_SECRET       the widget's Secret Key. Prefer passing it as an env
//                          var so it never lands in shell history or chat.
//   SUPABASE_ACCESS_TOKEN  Supabase management token (required).
//   SUPABASE_PROJECT_REF   default the project this repository targets.
//   DRY_RUN=1              validate without writing.

import { pathToFileURL } from "node:url";
import { evaluateTurnstileSecret, verifyCaptchaLive } from "./verify-auth-config.mjs";

const SUPABASE_API = "https://api.supabase.com/v1";
const TURNSTILE_VERIFY =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Turnstile secrets are 32–64 chars; reject obvious junk before calling out. */
export function looksLikeTurnstileSecret(value) {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{32,80}$/.test(value.trim())
  );
}

async function patchAuthConfig(token, projectRef, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `${SUPABASE_API}/projects/${projectRef}/config/auth`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    return { status: response.status, body: await response.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

async function siteverify(secret) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(TURNSTILE_VERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        // A deliberately invalid token: a *valid* secret answers
        // `invalid-input-response`, an unknown one `invalid-input-secret`.
        response: "set-turnstile-secret-probe",
      }).toString(),
      signal: controller.signal,
    });
    return await response.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const secret = (process.env.TURNSTILE_SECRET ?? "").trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? "uwmhquvzbilbfzdrlxmb";
  const disable = process.argv.includes("--disable");

  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exitCode = 1;
    return;
  }

  if (disable) {
    if (process.env.DRY_RUN === "1") {
      console.log("DRY_RUN=1 — captcha would be disabled.");
      return;
    }
    const { status } = await patchAuthConfig(token, projectRef, {
      security_captcha_enabled: false,
    });
    if (status !== 200) {
      console.error(`Supabase rejected the update (HTTP ${status}).`);
      process.exitCode = 1;
      return;
    }
    const probe = await verifyCaptchaLive(token, projectRef);
    console.log(
      probe.state === "disabled"
        ? "Captcha disabled. Auth works again; re-enable it once the correct secret is set."
        : `Supabase answered 200 but captcha is still ${probe.state} — re-run npm run auth:verify.`,
    );
    if (probe.state !== "disabled") process.exitCode = 1;
    return;
  }

  if (!secret) {
    console.error(
      "TURNSTILE_SECRET is required (or pass --disable to switch captcha off).",
    );
    process.exitCode = 1;
    return;
  }
  if (!looksLikeTurnstileSecret(secret)) {
    console.error(
      "TURNSTILE_SECRET does not look like a Turnstile secret key (32–80 chars).",
    );
    process.exitCode = 1;
    return;
  }

  const verdict = evaluateTurnstileSecret(await siteverify(secret));
  if (!verdict.ok) {
    console.error(`Refusing to store the secret: ${verdict.reason}`);
    console.error(
      "Copy the Secret Key from Cloudflare dashboard → Turnstile → your widget " +
        "(it must be the same widget as the deployed site key).",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Cloudflare accepted the secret: ${verdict.reason}`);

  if (process.env.DRY_RUN === "1") {
    console.log("DRY_RUN=1 — nothing written.");
    return;
  }

  const { status } = await patchAuthConfig(token, projectRef, {
    security_captcha_enabled: true,
    security_captcha_provider: "turnstile",
    security_captcha_secret: secret,
  });

  if (status !== 200) {
    console.error(`Supabase rejected the update (HTTP ${status}).`);
    process.exitCode = 1;
    return;
  }

  // The Management API's config read can lag a PATCH, so confirm the secret the
  // way GoTrue actually sees it instead of trusting the echoed field.
  const probe = await verifyCaptchaLive(token, projectRef);
  if (probe.ok) {
    console.log(`Captcha verified live: ${probe.reason}`);
    return;
  }
  console.error(`The stored secret did not take effect: ${probe.reason}`);
  console.error("Re-run npm run auth:verify; if it still fails, check the widget's domains.");
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
