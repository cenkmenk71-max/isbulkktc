#!/usr/bin/env node
// Verifies the pieces of the auth stack that live outside the repository and
// therefore cannot be caught by lint, typecheck or the test suite:
//
//   1. Cloudflare Turnstile — the secret stored in Supabase Auth must be valid,
//      and the public site key the app ships must belong to the same widget.
//      A mismatch makes every captcha-protected submit answer `captcha_failed`,
//      which is exactly the failure this guard exists to surface.
//   2. Supabase OAuth providers — every provider the app advertises in
//      `AUTH_OAUTH_PROVIDERS` must be enabled in Supabase with a client id *and*
//      a secret that belongs to it. An enabled provider with a wrong secret still
//      answers the authorize redirect and then fails the token exchange with
//      `invalid_client` at sign-in, so the recent auth logs are checked for that
//      signature (the Management API only ever returns a *hash* of a secret, so
//      it cannot prove one).
//   3. Redirect allowlist — the production callback must be allowed, or OAuth
//      and email confirmation links land on a `redirect_to` error.
//
// Usage:
//   node scripts/verify-auth-config.mjs
//
// Environment:
//   SUPABASE_ACCESS_TOKEN  Supabase management token (read-only use). Required
//                          for the Supabase checks; without it they are skipped.
//   SUPABASE_PROJECT_REF   default the project this repository targets.
//   AUTH_OAUTH_PROVIDERS   comma-separated providers the app advertises.
//   NEXT_PUBLIC_TURNSTILE_SITE_KEY  the site key baked into the deployment.
//   APP_ORIGIN             default "https://isbulkktc.com".
//
// Exits non-zero only on a real inconsistency. Missing credentials skip the
// dependent checks with a warning, so the guard never blocks on absent secrets.

const SUPABASE_API = "https://api.supabase.com/v1";

/** Providers Supabase exposes and this app is allowed to advertise. */
export const SUPPORTED_OAUTH_PROVIDERS = ["google", "linkedin_oidc"];

/** Parses `AUTH_OAUTH_PROVIDERS`, dropping blanks and unknown names. */
export function parseAdvertisedProviders(raw) {
  if (typeof raw !== "string") return { providers: [], unknown: [] };
  const providers = [];
  const unknown = [];
  for (const entry of raw.split(",")) {
    const name = entry.trim();
    if (!name) continue;
    if (SUPPORTED_OAUTH_PROVIDERS.includes(name)) {
      if (!providers.includes(name)) providers.push(name);
    } else {
      unknown.push(name);
    }
  }
  return { providers, unknown };
}

/** The site key Turnstile prints, so a placeholder can be told from a real one. */
export function looksLikeTurnstileSiteKey(value) {
  return typeof value === "string" && /^0x[0-9A-Za-z_-]{10,}$/.test(value.trim());
}

/**
 * Interprets a Cloudflare `siteverify` reply for a deliberately invalid token.
 * A *valid* secret answers `invalid-input-response`; an unknown secret answers
 * `invalid-input-secret`. Cloudflare's always-pass testing keys answer
 * `success: true` outright. Anything else means the check could not be trusted.
 */
export function evaluateTurnstileSecret(reply) {
  if (reply?.success === true) {
    return { ok: true, reason: "Cloudflare accepted the secret." };
  }
  const codes = Array.isArray(reply?.["error-codes"]) ? reply["error-codes"] : [];
  if (codes.includes("invalid-input-secret")) {
    return {
      ok: false,
      reason: "Cloudflare rejected the stored secret (invalid-input-secret).",
    };
  }
  if (codes.includes("invalid-input-response")) {
    return { ok: true, reason: "The stored secret is accepted by Cloudflare." };
  }
  return {
    ok: false,
    reason: `Cloudflare answered an unexpected result: ${JSON.stringify(reply)}`,
  };
}

/**
 * True when a stored client id could plausibly be a real one. Both supported
 * providers issue ids that contain digits (Google prefixes the project number,
 * LinkedIn ids are numeric), so a word like `ISBULKKTC` is a placeholder that
 * GoTrue will happily forward to the provider and fail there. The emptiness
 * check alone let exactly that through and reported "configured".
 */
export function looksLikeOAuthClientId(provider, value) {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (id.length < 8) return false;
  if (/\s/.test(id)) return false;
  if (id.toLowerCase() === provider.toLowerCase()) return false;
  if (id.toLowerCase() === `isbulkktc`) return false;
  return /[0-9]/.test(id);
}

/** Checks each advertised provider against the Supabase auth config. */
export function evaluateOAuthProviders(providers, authConfig) {
  const problems = [];
  for (const provider of providers) {
    const enabled = authConfig?.[`external_${provider}_enabled`] === true;
    const clientId = authConfig?.[`external_${provider}_client_id`];
    if (!enabled) {
      problems.push(`${provider} is advertised but disabled in Supabase.`);
      continue;
    }
    if (typeof clientId !== "string" || clientId.trim() === "") {
      problems.push(`${provider} is enabled but has no client id in Supabase.`);
      continue;
    }
    if (!looksLikeOAuthClientId(provider, clientId)) {
      problems.push(
        `${provider} is enabled but its client id "${clientId}" looks like a placeholder.`,
      );
    }
  }
  return problems;
}

/**
 * Reads recent production auth logs for the signature of a failed OAuth token
 * exchange.
 *
 * The Management API cannot validate a provider secret: it returns a
 * deterministic *hash* of the stored value, never the value itself, so no probe
 * can send it to a provider and learn whether it matches. (Verified: writing
 * `PLAINTEXT-PROBE-12345` and reading it back yields a 64-hex digest, stable for
 * the same input.) GoTrue, however, logs the real outcome of every exchange. A
 * secret that does not belong to the client id produces exactly:
 *
 *   error: oauth2: "invalid_client" "The provided client secret is invalid."
 *   msg:   500: Unable to exchange external code: <code>
 *   path:  /callback
 *
 * Surfacing that in the deploy report turns "social sign-in is broken" from a
 * user report into a finding. A quiet window means the last exchange succeeded —
 * or that nobody tried — so it is a note, never a hard pass on credentials.
 */
export function evaluateRecentOAuthErrors(rows) {
  if (!Array.isArray(rows)) {
    return {
      state: "unknown",
      ok: false,
      reason: "Recent auth logs could not be interpreted.",
    };
  }
  const matches = rows.filter((row) => {
    const message = String(row?.event_message ?? "");
    return (
      message.includes('"path":"/callback"') &&
      (message.includes("invalid_client") ||
        message.includes("Unable to exchange external code"))
    );
  });
  if (matches.length === 0) {
    return {
      state: "clean",
      ok: true,
      reason: "No failed OAuth token exchange in the recent auth logs.",
    };
  }
  const latest = matches[0]?.timestamp ?? "";
  return {
    state: "failing",
    ok: false,
    reason:
      `${matches.length} failed OAuth token exchange(s) in the recent auth logs` +
      `${latest ? ` (latest ${latest})` : ""} — the stored provider secret does not ` +
      `match its client id.`,
  };
}

/** Fetches the recent auth log window and looks for failed token exchanges. */
export async function probeRecentOAuthErrors(token, projectRef, windowMinutes = 60) {
  const end = new Date();
  const start = new Date(end.getTime() - windowMinutes * 60_000);
  const params = new URLSearchParams({
    sql: "select timestamp, event_message from logs order by timestamp desc limit 1000",
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: end.toISOString(),
  });
  try {
    const { status, body } = await fetchJson(
      `${SUPABASE_API}/projects/${projectRef}/analytics/endpoints/logs?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (status !== 200 || !Array.isArray(body?.result)) {
      return {
        state: "unknown",
        ok: false,
        reason: `Recent auth logs could not be read (HTTP ${status}).`,
      };
    }
    return evaluateRecentOAuthErrors(body.result);
  } catch {
    return {
      state: "unknown",
      ok: false,
      reason: "Recent auth logs could not be reached.",
    };
  }
}

/** True when the production callback is covered by the redirect allowlist. */
export function callbackIsAllowed(origin, allowList) {
  const expected = `${origin.replace(/\/$/, "")}/auth/callback`;
  if (typeof allowList !== "string") return false;
  return allowList
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .some(
      (entry) =>
        entry === expected ||
        entry === `${origin.replace(/\/$/, "")}/**` ||
        entry === `${origin.replace(/\/$/, "")}`,
    );
}

/**
 * Reads the outcome of a live auth probe carrying a deliberately bogus captcha
 * token. This is the authoritative check, because the Management API can return
 * a *stale* `security_captcha_secret` after a PATCH — the config read then
 * disagrees with the secret GoTrue actually uses. GoTrue's own answer cannot be
 * stale:
 *
 *   invalid-input-secret    → the stored secret is wrong (auth is fully broken)
 *   invalid-input-response  → the secret is valid; only our fake token was
 *                             rejected, which is the healthy answer
 *   no captcha_failed       → captcha is not enforced
 */
export function evaluateCaptchaProbe(status, body) {
  const errorCode = body?.error_code;
  const message = String(body?.msg ?? "");

  if (errorCode === "captcha_failed") {
    if (message.includes("invalid-input-secret")) {
      return {
        state: "invalid-secret",
        ok: false,
        reason:
          "GoTrue rejected the stored captcha secret (invalid-input-secret) — every auth request fails.",
      };
    }
    if (message.includes("invalid-input-response")) {
      return {
        state: "valid",
        ok: true,
        reason: "GoTrue accepts the stored captcha secret (only the probe token was rejected).",
      };
    }
    return {
      state: "unknown",
      ok: false,
      reason: `GoTrue answered an unrecognised captcha error: ${message}`,
    };
  }

  if (typeof status === "number" && status >= 200 && status < 500) {
    return {
      state: "disabled",
      ok: true,
      reason: "Captcha is not enforced on auth requests.",
    };
  }

  return {
    state: "unreachable",
    ok: false,
    reason: `The auth probe could not be interpreted (HTTP ${status}).`,
  };
}

async function fetchJson(url, init, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { status: response.status, body: await response.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

/** The publishable key the app itself uses, needed for the live auth probe. */
async function fetchAnonKey(token, projectRef) {
  const { status, body } = await fetchJson(
    `${SUPABASE_API}/projects/${projectRef}/api-keys`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (status !== 200 || !Array.isArray(body)) return null;
  return body.find((key) => key?.name === "anon")?.api_key ?? null;
}

/**
 * Sends one auth request with an invalid captcha token and reports what GoTrue
 * says. Network trouble is reported as `unreachable` so a flaky run is a note,
 * not a false failure.
 */
export async function probeCaptchaSecret(projectRef, anonKey) {
  try {
    const { status, body } = await fetchJson(
      `https://${projectRef}.supabase.co/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { apikey: anonKey, "content-type": "application/json" },
        body: JSON.stringify({
          email: "captcha-config-probe@example.com",
          password: "not-a-real-password",
          gotrue_meta_security: { captcha_token: "probe" },
        }),
      },
    );
    return evaluateCaptchaProbe(status, body);
  } catch {
    return {
      state: "unreachable",
      ok: false,
      reason: "The auth probe could not reach the project.",
    };
  }
}

/**
 * The authoritative captcha check: fetch the publishable key, then ask GoTrue.
 * Used both by this guard and by `set-turnstile-secret.mjs` after a write,
 * because the Management API's config read can be stale.
 */
export async function verifyCaptchaLive(token, projectRef) {
  const anonKey = await fetchAnonKey(token, projectRef);
  if (!anonKey) {
    return {
      state: "unreachable",
      ok: false,
      reason: "The publishable (anon) key could not be read for the auth probe.",
    };
  }
  return probeCaptchaSecret(projectRef, anonKey);
}

/** Hosts a provider's authorize redirect may land on. */
const OAUTH_AUTHORIZE_HOSTS = {
  google: ["accounts.google.com"],
  linkedin_oidc: ["www.linkedin.com", "linkedin.com"],
};

/**
 * Reads the outcome of `GET /auth/v1/authorize?provider=…`. A configured
 * provider answers 302 towards its own login host; an unconfigured one answers
 * 400 `provider is not enabled`. This reflects what GoTrue does, so it is
 * immune to the stale config read noted above.
 */
export function evaluateOAuthAuthorize(provider, status, location) {
  if (
    typeof status === "number" &&
    status >= 300 &&
    status < 400 &&
    typeof location === "string"
  ) {
    let host = null;
    try {
      host = new URL(location).host;
    } catch {
      host = null;
    }
    const expected = OAUTH_AUTHORIZE_HOSTS[provider] ?? [];
    if (host && expected.includes(host)) {
      return { ok: true, reason: `${provider} is enabled (authorize redirects to ${host}).` };
    }
    return {
      ok: false,
      reason: `${provider} authorize redirected somewhere unexpected: ${location}`,
    };
  }
  return { ok: false, reason: `${provider} is not enabled (HTTP ${status}).` };
}

/** Live check that a provider is enabled, via the authorize endpoint. */
export async function probeOAuthAuthorize(token, projectRef, provider) {
  const anonKey = await fetchAnonKey(token, projectRef);
  if (!anonKey) {
    return { ok: false, reason: "The publishable (anon) key could not be read." };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(
        `https://${projectRef}.supabase.co/auth/v1/authorize?provider=${provider}` +
          `&redirect_to=${encodeURIComponent("https://isbulkktc.com/auth/callback")}`,
        { headers: { apikey: anonKey }, redirect: "manual", signal: controller.signal },
      );
      return evaluateOAuthAuthorize(
        provider,
        response.status,
        response.headers.get("location"),
      );
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false, reason: `${provider} could not be probed (network error).` };
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? "uwmhquvzbilbfzdrlxmb";
  const origin = (process.env.APP_ORIGIN ?? "https://isbulkktc.com").replace(
    /\/$/,
    "",
  );
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
  const { providers, unknown } = parseAdvertisedProviders(
    process.env.AUTH_OAUTH_PROVIDERS,
  );

  const failures = [];
  const notes = [];

  if (unknown.length > 0) {
    failures.push(
      `AUTH_OAUTH_PROVIDERS names unsupported providers: ${unknown.join(", ")}.`,
    );
  }

  if (!siteKey) {
    notes.push("NEXT_PUBLIC_TURNSTILE_SITE_KEY is empty — captcha is disabled.");
  } else if (!looksLikeTurnstileSiteKey(siteKey)) {
    failures.push(`NEXT_PUBLIC_TURNSTILE_SITE_KEY is not a Turnstile site key.`);
  }

  if (!token) {
    notes.push("SUPABASE_ACCESS_TOKEN is unset — Supabase checks skipped.");
  } else {
    const { status, body } = await fetchJson(
      `${SUPABASE_API}/projects/${projectRef}/config/auth`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (status !== 200 || !body) {
      failures.push(`Supabase auth config could not be read (HTTP ${status}).`);
    } else {
      // The secret GoTrue actually uses is the source of truth, and the config
      // read can be stale, so probe the live endpoint instead of trusting
      // `security_captcha_secret` here.
      const probe = await verifyCaptchaLive(token, projectRef);
      if (probe.ok) notes.push(probe.reason);
      else failures.push(probe.reason);

      failures.push(...evaluateOAuthProviders(providers, body));

      // Same stale-read caveat for providers: an advertised provider is only
      // really usable when GoTrue answers the authorize request.
      for (const provider of providers) {
        const authorize = await probeOAuthAuthorize(token, projectRef, provider);
        if (authorize.ok) notes.push(authorize.reason);
        else failures.push(authorize.reason);
      }

      // A provider can be enabled, hold a well-formed client id, answer the
      // authorize redirect — and still fail the token exchange because the
      // stored secret does not belong to that client id. The Management API
      // cannot prove a secret (it returns a hash, never the value), so the
      // authoritative signal is GoTrue's own log of the failed exchange.
      const oauthErrors = await probeRecentOAuthErrors(token, projectRef);
      if (oauthErrors.ok) notes.push(oauthErrors.reason);
      else if (oauthErrors.state === "failing") failures.push(oauthErrors.reason);
      else notes.push(oauthErrors.reason);

      if (!callbackIsAllowed(origin, body.uri_allow_list)) {
        failures.push(`${origin}/auth/callback is not in the redirect allowlist.`);
      }
    }
  }

  const summary = [
    "# Auth configuration verification",
    "",
    `- Project: \`${projectRef}\``,
    `- Origin: \`${origin}\``,
    `- Advertised OAuth providers: ${providers.length ? providers.join(", ") : "(none)"}`,
    "",
    "## Findings",
    "",
    ...(failures.length
      ? failures.map((line) => `- ❌ ${line}`)
      : ["- ✅ No configuration inconsistency found."]),
    ...notes.map((line) => `- ℹ️ ${line}`),
  ].join("\n");

  console.log(summary);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import("node:fs/promises");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }

  if (failures.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
