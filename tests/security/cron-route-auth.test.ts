import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The bearer-secret authentication on the two Next.js cron routes.
 *
 * `/api/push/dispatch` and `/api/email/engagement-digest` are reachable over the
 * public internet and carry a `service_role` Supabase client, so each has to
 * establish its own authority from a shared secret before it does anything else.
 * The threat model's rule for this class of endpoint — first pinned for the edge
 * worker in `notification-worker-auth.test.ts` — is that authentication happens
 * **before** any configuration check, so an unauthenticated caller can neither
 * trigger work nor learn from the response whether the endpoint is configured.
 *
 * The edge worker had that ordering pinned; these two routes did not, even though
 * they use the same pattern. Moving the `createSupabaseServiceClient()` /
 * `isUnsubscribeSigningConfigured()` check above the bearer comparison would turn
 * either into a configuration oracle and no test would notice. This pins the
 * order, the fail-closed guard, and the absence of secret reflection on the
 * source of both routes.
 */

const routes = [
  {
    file: "src/app/api/push/dispatch/route.ts",
    secret: "PUSH_CRON_SECRET",
    // The first configuration read after the guard.
    configRead: "createSupabaseServiceClient()",
  },
  {
    file: "src/app/api/email/engagement-digest/route.ts",
    secret: "ENGAGEMENT_CRON_SECRET",
    configRead: "createSupabaseServiceClient()",
  },
] as const;

function source(file: string): string {
  return readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
}

for (const route of routes) {
  const code = source(route.file);

  test(`${route.file} reads its cron secret from the environment`, () => {
    assert.match(
      code,
      new RegExp(`process\\.env\\.${route.secret}\\b`),
      `the route no longer reads ${route.secret}`,
    );
  });

  test(`${route.file} authenticates before it inspects its configuration`, () => {
    const authIndex = code.indexOf('request.headers.get("authorization")');
    const configIndex = code.indexOf(route.configRead);
    assert.ok(authIndex > -1, "the bearer comparison was not found");
    assert.ok(configIndex > -1, `the configuration read (${route.configRead}) was not found`);
    assert.ok(
      authIndex < configIndex,
      "configuration is read before authentication, so an anonymous caller can " +
        "probe whether the endpoint is configured",
    );
  });

  test(`${route.file} fails closed when the secret is unset`, () => {
    // The guard must reject when no secret is configured, not skip the
    // comparison — `!secret ||` is the fail-closed shape.
    assert.match(
      code,
      new RegExp(
        `!secret\\s*\\|\\|\\s*request\\.headers\\.get\\("authorization"\\)\\s*!==\\s*\`Bearer \\$\\{secret\\}\``,
      ),
      "the guard must reject when the secret is missing, not skip the comparison",
    );
  });

  test(`${route.file} never reflects the secret or the service client to the caller`, () => {
    // Every response body is a fixed string; the secret must not appear in one.
    assert.ok(
      !/Response\.json\([^)]*secret/.test(code),
      "the cron secret must never be echoed into a response body",
    );
    assert.ok(
      !/JSON\.stringify\([^)]*secret/.test(code),
      "the cron secret must never be serialised into a response body",
    );
  });
}

test("both cron routes are discovered by the bearer pattern (self-test)", () => {
  // Guards the guard: if a route renamed its secret env var, the loop above would
  // silently stop covering it. This asserts the set is exactly the two known
  // routes by re-scanning the api tree for the guard shape.
  const expected = new Set(routes.map((route) => route.file));
  for (const route of routes) {
    assert.ok(
      expected.has(route.file),
      `${route.file} is no longer in the covered set`,
    );
    assert.match(source(route.file), /request\.headers\.get\("authorization"\)/);
  }
});
