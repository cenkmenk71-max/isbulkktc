import assert from "node:assert/strict";
import test from "node:test";

import {
  describeTeamLookupFailure,
  readVercelToken,
} from "./verify-production-deployment.mjs";

test("an invalid Vercel token is reported as a token problem, not a bad team slug", () => {
  // Vercel answers a dead token with 403 `{"error":{"code":"forbidden",
  // "invalidToken":true}}`. The old `resolveVercelContext` ignored the status
  // and read `body.teams ?? []`, so the empty list fell through to
  // `no team with slug "orijin1"` — pointing the operator at the slug (and the
  // project name) when the real fix is rotating the token. Same misdiagnosis
  // class as #209.
  const rejected = describeTeamLookupFailure(403, {
    error: { code: "forbidden", message: "Not authorized", invalidToken: true },
  });
  assert.match(rejected, /rejected the token/);
  assert.match(rejected, /403/);
  assert.doesNotMatch(rejected, /slug/);

  // 401 is the same credential failure on other surfaces.
  assert.match(describeTeamLookupFailure(401, {}), /rejected the token/);

  // A genuine server error is not blamed on the token.
  const server = describeTeamLookupFailure(500, {});
  assert.match(server, /HTTP 500/);
  assert.doesNotMatch(server, /rejected the token/);
});

test("a whitespace-only VERCEL_TOKEN is treated as unset, not as a bearer token", () => {
  assert.equal(readVercelToken({ VERCEL_TOKEN: "  " }), "");
  assert.equal(readVercelToken({ VERCEL_TOKEN: "\t\n" }), "");
  assert.equal(readVercelToken({}), "");
  assert.equal(readVercelToken({ VERCEL_TOKEN: "  vercel_tok  " }), "vercel_tok");
});
