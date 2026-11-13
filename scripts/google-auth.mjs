// Google OAuth access-token resolution, shared by the Search Console and
// Indexing API scripts.
//
// Two credential shapes are supported, in priority order:
//
//   1. `GOOGLE_ACCESS_TOKEN` — a short-lived bearer token (`ya29.…`). This is
//      what a human gets from the OAuth playground or `gcloud auth print-access-token`.
//      It is the fastest way to run a script once, and it expires in about an
//      hour, so it is wrong for a scheduler.
//   2. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN` —
//      exchanged for a fresh access token on every run. This is the only shape
//      a scheduled job can use, because the refresh token does not expire.
//
// Both are read from the environment and never logged. A missing credential is
// not an error: the callers treat "unconfigured" as "skip", so CI stays green
// until the owner adds the secret (the same contract as `push-dispatch.yml`).

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/** The environment variable names the scripts read. Kept in one place so a
 * rename cannot leave one script reading a stale name. */
export const GOOGLE_ENV = {
  accessToken: "GOOGLE_ACCESS_TOKEN",
  clientId: "GOOGLE_CLIENT_ID",
  clientSecret: "GOOGLE_CLIENT_SECRET",
  refreshToken: "GOOGLE_REFRESH_TOKEN",
};

/**
 * Picks the credential shape to use from `env`, without any network call.
 *
 * Returns `{ mode: "static", accessToken }`, `{ mode: "refresh", clientId,
 * clientSecret, refreshToken }`, or `{ mode: "unconfigured", missing: [...] }`.
 * The `missing` list names the variables a refresh-token setup still needs, so
 * the caller can print an actionable line instead of a bare "no credentials".
 */
export function resolveGoogleAuth(env = process.env) {
  const accessToken = String(env[GOOGLE_ENV.accessToken] ?? "").trim();
  if (accessToken) return { mode: "static", accessToken };

  const clientId = String(env[GOOGLE_ENV.clientId] ?? "").trim();
  const clientSecret = String(env[GOOGLE_ENV.clientSecret] ?? "").trim();
  const refreshToken = String(env[GOOGLE_ENV.refreshToken] ?? "").trim();

  // A refresh flow needs all three. A partial set is treated as unconfigured
  // rather than half-attempted: sending a client id without its secret fails at
  // Google with a less obvious error than the notice printed here.
  if (clientId && clientSecret && refreshToken) {
    return { mode: "refresh", clientId, clientSecret, refreshToken };
  }

  const missing = [];
  if (!accessToken) missing.push(GOOGLE_ENV.accessToken);
  if (!clientId) missing.push(GOOGLE_ENV.clientId);
  if (!clientSecret) missing.push(GOOGLE_ENV.clientSecret);
  if (!refreshToken) missing.push(GOOGLE_ENV.refreshToken);
  return { mode: "unconfigured", missing };
}

/**
 * A one-line description of the resolved credential, safe to log: it names the
 * mode and, for a static token, only its first six characters. Never returns a
 * secret in full.
 */
export function describeGoogleAuth(auth) {
  if (auth.mode === "static") {
    return `static access token (${auth.accessToken.slice(0, 6)}…, expires within the hour)`;
  }
  if (auth.mode === "refresh") {
    return "refresh token (exchanges for a fresh access token each run)";
  }
  return `unconfigured — set ${auth.missing.join(", ")}`;
}

/**
 * Exchanges a refresh token for an access token. Only called when
 * `resolveGoogleAuth` returned `mode: "refresh"`; a static token is used as-is.
 */
export async function refreshAccessToken(auth, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: auth.clientId,
      client_secret: auth.clientSecret,
      refresh_token: auth.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    // The error body can echo the client id; it never echoes the secret or the
    // refresh token, so the message is safe to surface.
    throw new Error(
      `Google token refresh failed (HTTP ${response.status}): ${body.error_description ?? body.error ?? "no access_token in response"}`,
    );
  }
  return body.access_token;
}

/** Resolves a usable bearer token for the given credential. */
export async function getAccessToken(auth, options = {}) {
  if (auth.mode === "static") return auth.accessToken;
  if (auth.mode === "refresh") return refreshAccessToken(auth, options);
  throw new Error(`No Google credential: ${describeGoogleAuth(auth)}`);
}

/**
 * Reads the scope and remaining lifetime of an access token. `tokeninfo` is
 * Google's documented introspection endpoint and needs no credential, so this
 * is the cheapest way to confirm a token is the right one before a script acts
 * on it — a token with the wrong scope otherwise fails later, mid-run, with a
 * 403 that says less.
 */
export async function inspectAccessToken(accessToken, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    return { valid: false, scopes: [], expiresInSeconds: 0, error: body.error_description ?? body.error ?? `HTTP ${response.status}` };
  }
  return {
    valid: true,
    scopes: String(body.scope ?? "").split(/\s+/).filter(Boolean),
    expiresInSeconds: Number.parseInt(body.expires_in ?? "0", 10) || 0,
    error: null,
  };
}

/** True when the token carries `scope` (exact match, as Google reports it). */
export function hasScope(scopes, scope) {
  return Array.isArray(scopes) && scopes.includes(scope);
}
