import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The notification worker's authentication ordering.
 *
 * `supabase/functions/send-application-notifications/index.ts` is reachable over
 * the public internet (`verify_jwt = false` in `config.toml`, because the
 * scheduler sends a dedicated bearer rather than a user JWT). It therefore has to
 * establish its own authority, and the threat model makes a specific claim about
 * *how*: authentication happens **before** any configuration check, so an
 * unauthenticated caller can neither trigger delivery nor learn from the
 * response whether the worker is configured.
 *
 * That ordering is easy to break in a refactor — moving the `RESEND_API_KEY`
 * check above the bearer check would turn the endpoint into a configuration
 * oracle and is not caught by any runtime test (the function is not exercised by
 * the local stack). This test pins the order on the source.
 */

const workerSource = readFileSync(
  new URL("../../supabase/functions/send-application-notifications/index.ts", import.meta.url),
  "utf8",
);

const authIndex = workerSource.indexOf('request.headers.get("authorization")');
const configIndex = workerSource.indexOf('Deno.env.get("RESEND_API_KEY")');

test("the worker rejects a non-POST method first", () => {
  assert.match(workerSource, /request\.method !== "POST"/);
  assert.ok(
    workerSource.indexOf('request.method !== "POST"') < authIndex,
    "the method check must precede authentication",
  );
});

test("the worker authenticates before it inspects its configuration", () => {
  assert.ok(authIndex > -1, "the bearer comparison was not found");
  assert.ok(configIndex > -1, "the Resend configuration read was not found");
  assert.ok(
    authIndex < configIndex,
    "configuration is read before authentication, so an anonymous caller can probe whether delivery is configured",
  );
});

test("a missing worker token fails closed rather than disabling the guard", () => {
  // The guard must reject when no token is configured, not skip the comparison.
  assert.match(
    workerSource,
    /!workerToken\s*\|\|\s*request\.headers\.get\("authorization"\)\s*!==\s*`Bearer \$\{workerToken\}`/,
  );
});

test("the worker never reflects the service key or provider errors to the caller", () => {
  // Responses are fixed strings; the service key must not appear in any body.
  assert.ok(
    !/response\([^)]*serviceKey/.test(workerSource),
    "the service key must never be echoed into a response body",
  );
  assert.ok(
    !/JSON\.stringify\([^)]*resendApiKey/.test(workerSource),
    "the Resend key must never be echoed into a response body",
  );
});
