#!/usr/bin/env node
// Enables a social provider in the hosted Supabase Auth config, then proves it
// with a live authorize probe.
//
// Why a script: the Supabase Management API's config read can lag a write, so a
// successful PATCH is not proof. `GET /auth/v1/authorize?provider=…` is — a
// configured provider answers 302 towards its login host, an unconfigured one
// answers 400 `provider is not enabled`.
//
// Usage (secrets stay out of shell history when passed via env):
//   OAUTH_CLIENT_ID=<id> OAUTH_CLIENT_SECRET=<secret> \
//   SUPABASE_ACCESS_TOKEN=<sbp_…> node scripts/enable-oauth-provider.mjs google
//
// Environment:
//   OAUTH_CLIENT_ID        provider client id (required)
//   OAUTH_CLIENT_SECRET    provider client secret (required)
//   SUPABASE_ACCESS_TOKEN  Supabase management token (required)
//   SUPABASE_PROJECT_REF   default the project this repository targets
//   DRY_RUN=1              validate without writing

import { probeOAuthAuthorize, SUPPORTED_OAUTH_PROVIDERS } from "./verify-auth-config.mjs";

const SUPABASE_API = "https://api.supabase.com/v1";

async function main() {
  const provider = (process.argv[2] ?? "").trim();
  const clientId = (process.env.OAUTH_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.OAUTH_CLIENT_SECRET ?? "").trim();
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF ?? "uwmhquvzbilbfzdrlxmb";

  if (!SUPPORTED_OAUTH_PROVIDERS.includes(provider)) {
    console.error(
      `Provider must be one of: ${SUPPORTED_OAUTH_PROVIDERS.join(", ")} (got ${provider || "nothing"}).`,
    );
    process.exitCode = 1;
    return;
  }
  if (!clientId || !clientSecret) {
    console.error("OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET are both required.");
    process.exitCode = 1;
    return;
  }
  if (!token) {
    console.error("SUPABASE_ACCESS_TOKEN is required.");
    process.exitCode = 1;
    return;
  }

  const body = {
    [`external_${provider}_enabled`]: true,
    [`external_${provider}_client_id`]: clientId,
    [`external_${provider}_secret`]: clientSecret,
  };

  if (process.env.DRY_RUN === "1") {
    console.log(`DRY_RUN=1 — would enable ${provider} (client id ${clientId.slice(0, 8)}…).`);
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let status;
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
    status = response.status;
  } finally {
    clearTimeout(timer);
  }

  if (status !== 200) {
    console.error(`Supabase rejected the update (HTTP ${status}).`);
    process.exitCode = 1;
    return;
  }
  console.log(`Supabase accepted the ${provider} update (HTTP 200).`);

  const probe = await probeOAuthAuthorize(token, projectRef, provider);
  if (probe.ok) {
    console.log(`Verified live: ${probe.reason}`);
    return;
  }
  console.error(`Not live yet: ${probe.reason}`);
  console.error(
    "If it persists, check the provider console: the authorized redirect URI must be " +
      `https://${projectRef}.supabase.co/auth/v1/callback`,
  );
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
