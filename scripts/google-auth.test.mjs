import assert from "node:assert/strict";
import test from "node:test";

import {
  GOOGLE_ENV,
  describeGoogleAuth,
  getAccessToken,
  hasScope,
  inspectAccessToken,
  refreshAccessToken,
  resolveGoogleAuth,
} from "./google-auth.mjs";

test("a static access token is preferred when present", () => {
  const auth = resolveGoogleAuth({ [GOOGLE_ENV.accessToken]: "ya29.abc" });
  assert.equal(auth.mode, "static");
  assert.equal(auth.accessToken, "ya29.abc");
});

test("a full refresh-token triple resolves to the refresh mode", () => {
  const auth = resolveGoogleAuth({
    [GOOGLE_ENV.clientId]: "id",
    [GOOGLE_ENV.clientSecret]: "secret",
    [GOOGLE_ENV.refreshToken]: "refresh",
  });
  assert.equal(auth.mode, "refresh");
  assert.equal(auth.refreshToken, "refresh");
});

test("a partial refresh-token set is unconfigured, never half-attempted", () => {
  const auth = resolveGoogleAuth({
    [GOOGLE_ENV.clientId]: "id",
    [GOOGLE_ENV.refreshToken]: "refresh",
  });
  assert.equal(auth.mode, "unconfigured");
  // The missing variable is named so the notice is actionable.
  assert.ok(auth.missing.includes(GOOGLE_ENV.clientSecret));
});

test("an empty environment is unconfigured and names every variable", () => {
  const auth = resolveGoogleAuth({});
  assert.equal(auth.mode, "unconfigured");
  assert.deepEqual(auth.missing, [
    GOOGLE_ENV.accessToken,
    GOOGLE_ENV.clientId,
    GOOGLE_ENV.clientSecret,
    GOOGLE_ENV.refreshToken,
  ]);
});

test("blank and whitespace-only values count as absent", () => {
  const auth = resolveGoogleAuth({ [GOOGLE_ENV.accessToken]: "   " });
  assert.equal(auth.mode, "unconfigured");
});

test("describeGoogleAuth never reveals a full token", () => {
  const line = describeGoogleAuth({ mode: "static", accessToken: "ya29.SUPERSECRETVALUE" });
  assert.ok(line.includes("ya29.S"));
  assert.ok(!line.includes("SUPERSECRETVALUE"));
});

test("describeGoogleAuth names the missing variables when unconfigured", () => {
  const line = describeGoogleAuth(resolveGoogleAuth({}));
  assert.ok(line.includes(GOOGLE_ENV.refreshToken));
});

test("getAccessToken returns a static token without any network call", async () => {
  let called = false;
  const token = await getAccessToken(
    { mode: "static", accessToken: "ya29.abc" },
    { fetchImpl: () => { called = true; } },
  );
  assert.equal(token, "ya29.abc");
  assert.equal(called, false);
});

test("getAccessToken throws on an unconfigured credential rather than sending a bad request", async () => {
  await assert.rejects(
    () => getAccessToken(resolveGoogleAuth({})),
    /No Google credential/,
  );
});

test("refreshAccessToken posts the grant and returns the new access token", async () => {
  let seenUrl = null;
  let seenBody = null;
  const token = await refreshAccessToken(
    { mode: "refresh", clientId: "id", clientSecret: "secret", refreshToken: "refresh" },
    {
      fetchImpl: async (url, init) => {
        seenUrl = url;
        seenBody = init.body;
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: "ya29.fresh" }),
        };
      },
    },
  );
  assert.equal(token, "ya29.fresh");
  assert.equal(seenUrl, "https://oauth2.googleapis.com/token");
  assert.equal(seenBody.get("grant_type"), "refresh_token");
  assert.equal(seenBody.get("refresh_token"), "refresh");
});

test("refreshAccessToken surfaces Google's error without leaking the secret", async () => {
  await assert.rejects(
    () =>
      refreshAccessToken(
        { mode: "refresh", clientId: "id", clientSecret: "SECRET", refreshToken: "REFRESH" },
        {
          fetchImpl: async () => ({
            ok: false,
            status: 400,
            json: async () => ({ error: "invalid_grant", error_description: "Token has been expired or revoked." }),
          }),
        },
      ),
    (error) => {
      assert.match(error.message, /invalid_grant|expired or revoked/);
      assert.ok(!error.message.includes("SECRET"));
      assert.ok(!error.message.includes("REFRESH"));
      return true;
    },
  );
});

test("inspectAccessToken reports the scopes and remaining lifetime", async () => {
  const info = await inspectAccessToken("ya29.abc", {
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        scope: "https://www.googleapis.com/auth/indexing https://www.googleapis.com/auth/webmasters",
        expires_in: "3288",
      }),
    }),
  });
  assert.equal(info.valid, true);
  assert.equal(info.expiresInSeconds, 3288);
  assert.ok(hasScope(info.scopes, "https://www.googleapis.com/auth/indexing"));
  assert.ok(hasScope(info.scopes, "https://www.googleapis.com/auth/webmasters"));
  assert.equal(hasScope(info.scopes, "https://www.googleapis.com/auth/drive"), false);
});

test("inspectAccessToken reports an invalid token instead of throwing", async () => {
  const info = await inspectAccessToken("expired", {
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_token" }),
    }),
  });
  assert.equal(info.valid, false);
  assert.equal(info.error, "invalid_token");
});

test("hasScope is false for a non-array, not a crash", () => {
  assert.equal(hasScope(undefined, "x"), false);
  assert.equal(hasScope("x", "x"), false);
});
