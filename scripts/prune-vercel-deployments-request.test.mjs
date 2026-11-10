import assert from "node:assert/strict";
import test from "node:test";

import { apiRequest } from "./prune-vercel-deployments.mjs";

// `apiRequest` must never throw: `apiRequestWithRetry` only retries the
// `{ status }` it returns, so anything thrown here escapes the retry loop and
// aborts the whole prune run. The request and the body read share one abort
// signal, so both must map to the 599 sentinel.

/** Run `fn` with `globalThis.fetch` replaced, restoring it afterwards. */
async function withFetch(fetchImpl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("a request that rejects is mapped to the 599 retry sentinel", async () => {
  await withFetch(
    async () => {
      throw new DOMException("The operation was aborted", "TimeoutError");
    },
    async () => {
      const result = await apiRequest("token", "/v2/teams");
      assert.equal(result.status, 599);
      assert.match(result.body.error, /aborted/);
    },
  );
});

test("a body read that aborts is mapped to 599 instead of throwing", async () => {
  // Regression: the `await response.text()` used to run *outside* the try, so a
  // stalled or truncated response threw a TimeoutError that escaped
  // `apiRequestWithRetry` and crashed the run instead of being retried.
  await withFetch(
    async () => ({
      status: 200,
      text: () =>
        Promise.reject(
          new DOMException("The operation was aborted", "TimeoutError"),
        ),
    }),
    async () => {
      const result = await apiRequest("token", "/v2/teams");
      assert.equal(result.status, 599);
      assert.match(result.body.error, /aborted/);
    },
  );
});

test("a valid JSON body is parsed and the status is preserved", async () => {
  await withFetch(
    async () => ({
      status: 200,
      text: async () => JSON.stringify({ teams: [{ id: "team_1" }] }),
    }),
    async () => {
      const result = await apiRequest("token", "/v2/teams");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { teams: [{ id: "team_1" }] });
    },
  );
});

test("a non-JSON body is preserved under `raw`", async () => {
  await withFetch(
    async () => ({ status: 502, text: async () => "<html>bad gateway</html>" }),
    async () => {
      const result = await apiRequest("token", "/v2/teams");
      assert.equal(result.status, 502);
      assert.deepEqual(result.body, { raw: "<html>bad gateway</html>" });
    },
  );
});

test("an empty body yields an empty object", async () => {
  await withFetch(
    async () => ({ status: 204, text: async () => "" }),
    async () => {
      const result = await apiRequest("token", "/x", "DELETE");
      assert.equal(result.status, 204);
      assert.deepEqual(result.body, {});
    },
  );
});
