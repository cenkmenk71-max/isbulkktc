import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { authorizationIndex, authorizationLookup } from "./authorization-header";
import { envReadNames } from "./env-access";

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

const apiDir = new URL("../../src/app/api/", import.meta.url);

function source(file: string): string {
  return readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
}

/**
 * True when a route module authenticates with a bearer built from a shared
 * secret env var — the exact shape `/api/push/dispatch` and
 * `/api/email/engagement-digest` use, and the marker of the class this suite
 * exists to cover:
 *
 *   - it reads the `Authorization` header (any casing / access form),
 *   - it compares against a `Bearer ${…}` string, and
 *   - the token comes from a non-public env var (`*_SECRET` / `*_TOKEN`).
 *
 * All three must hold: a route that merely *reads* the header (to log it, say)
 * is not a bearer-authenticated worker, and a route that reads a secret but
 * never compares the header is not authenticating with it.
 *
 * Documented limitation (not silent): the header clause is anchored to a
 * `headers` receiver, so a route that copies the header map into a differently
 * named variable first (`const h = new Headers(request.headers); h.get(…)`) is
 * not discovered. No route does that today; widen the anchor if one appears.
 */
function isBearerSecretGuard(code: string): boolean {
  return (
    authorizationLookup.test(code) && /Bearer\s*\$\{/.test(code) && cronSecretNames(code).length > 0
  );
}

/**
 * The non-public `*_SECRET` / `*_TOKEN` env names a route reads, in **every**
 * access form. The earlier inline regex matched only `process.env.NAME`, so a
 * guard written as `process.env["PUSH_CRON_SECRET"]` (or a destructured read)
 * was never discovered — its ordering and fail-closed shape were never checked
 * while the suite stayed green. `env-access.ts` is the shared, self-tested
 * reader for all five forms.
 */
function cronSecretNames(code: string): string[] {
  return envReadNames(code).filter(
    (name) => /(?:SECRET|TOKEN)$/.test(name) && !name.startsWith("NEXT_PUBLIC_"),
  );
}

/**
 * Every route under `src/app/api/**` that authenticates with a bearer secret,
 * **discovered** rather than listed by hand.
 *
 * The earlier version named the two routes in a literal array. That is a
 * false-negative by construction: a third cron route — a new worker, or the
 * same two copied — was simply never scanned, so a config read placed above its
 * bearer check (the ordering bug this suite exists to catch) shipped green. The
 * probe used to prove it: a `route.ts` reading `createSupabaseServiceClient()`
 * before `Authorization` passed every test here. Discovery by the guard shape
 * closes that hole; the self-test below proves the predicate sees the shape.
 */
function bearerGuardedRoutes(): string[] {
  const entries = readdirSync(apiDir, { recursive: true }) as string[];
  return entries
    .filter((entry) => entry.endsWith("route.ts"))
    .map((entry) => `src/app/api/${entry}`)
    .filter((file) => isBearerSecretGuard(source(file)))
    .sort();
}

/** The first configuration probe a route makes, if any. */
const configProbes = ["createSupabaseServiceClient(", "isUnsubscribeSigningConfigured("];

const routes = bearerGuardedRoutes().map((file) => {
  const code = source(file);
  const secret = cronSecretNames(code)[0];
  const probeIndex = configProbes
    .map((probe) => code.indexOf(probe))
    .filter((index) => index > -1)
    .sort((a, b) => a - b)[0];
  return { file, secret, code, probeIndex };
});

for (const route of routes) {
  test(`${route.file} reads its cron secret from the environment`, () => {
    assert.ok(
      envReadNames(route.code).includes(route.secret),
      `the route no longer reads ${route.secret}`,
    );
  });

  test(`${route.file} authenticates before it inspects its configuration`, () => {
    const authIndex = authorizationIndex(route.code);
    assert.ok(authIndex > -1, "the bearer comparison was not found");
    if (route.probeIndex === -1) return; // no configuration probe to order against
    assert.ok(
      authIndex < route.probeIndex,
      "configuration is read before authentication, so an anonymous caller can " +
        "probe whether the endpoint is configured",
    );
  });

  test(`${route.file} fails closed when the secret is unset`, () => {
    // The guard must reject when no secret is configured, not skip the
    // comparison — `!secret || … !== \`Bearer ${secret}\`` is the fail-closed
    // shape. The variable name is back-referenced so a rename cannot make the
    // check vacuous (it would otherwise match any `!x ||` guard).
    assert.match(
      route.code,
      /!\s*(\w+)\s*\|\|\s*(?:request\.)?headers\s*(?:\.\s*get\(\s*|\[\s*)["']authorization["']\s*[)\]]\s*!==\s*`Bearer \$\{\1\}`/i,
      "the guard must reject when the secret is missing, not skip the comparison",
    );
  });

  test(`${route.file} never reflects the secret or the service client to the caller`, () => {
    // Every response body is a fixed string; the secret must not appear in one.
    assert.ok(
      !/Response\.json\([^)]*secret/.test(route.code),
      "the cron secret must never be echoed into a response body",
    );
    assert.ok(
      !/JSON\.stringify\([^)]*secret/.test(route.code),
      "the cron secret must never be serialised into a response body",
    );
  });
}

test("the bearer-guard predicate sees the route shape and rejects near-misses (self-test)", () => {
  // Guards the guard: discovery is only as good as this predicate. A route it
  // cannot recognise is a route whose ordering is never checked.
  assert.equal(
    isBearerSecretGuard(
      'const secret = process.env.PUSH_CRON_SECRET;' +
        'if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {}',
    ),
    true,
  );
  // HTTP header names are case-insensitive and `Authorization` is the canonical
  // spelling — the predicate must discover it, or a route written that way
  // escapes every check below while staying green.
  for (const spelling of [
    'request.headers.get("Authorization")',
    'request.headers.get("AUTHORIZATION")',
    'request.headers["authorization"]',
  ]) {
    assert.equal(
      isBearerSecretGuard(
        `const secret = process.env.PUSH_CRON_SECRET;` +
          `if (!secret || ${spelling} !== \`Bearer \${secret}\`) {}`,
      ),
      true,
      `the predicate must recognise ${spelling}`,
    );
  }
  // The secret may be read through any access form; each is a real guard whose
  // ordering must be checked. A dot-only reader missed the bracket and
  // destructured forms, so a route written that way was never discovered.
  for (const read of [
    "const secret = process.env.PUSH_CRON_SECRET;",
    'const secret = process.env["PUSH_CRON_SECRET"];',
    "const secret = process.env?.PUSH_CRON_SECRET;",
    "const { PUSH_CRON_SECRET: secret } = process.env;",
  ]) {
    assert.equal(
      isBearerSecretGuard(
        read +
          'if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {}',
      ),
      true,
      `the predicate must discover a guard that reads its secret via: ${read}`,
    );
  }
  // A route that reads a secret but never compares the header is not a bearer guard.
  assert.equal(
    isBearerSecretGuard("const secret = process.env.PUSH_CRON_SECRET; return secret;"),
    false,
  );
  // A route that reads the header but has no secret-backed bearer is not one either.
  assert.equal(
    isBearerSecretGuard('const h = request.headers.get("authorization"); return h;'),
    false,
  );
  // A `NEXT_PUBLIC_` token is not a server secret.
  assert.equal(
    isBearerSecretGuard(
      'const t = process.env.NEXT_PUBLIC_TOKEN; if (!t || request.headers.get("authorization") !== `Bearer ${t}`) {}',
    ),
    false,
  );
});

test("both known cron routes are discovered, not listed (self-test)", () => {
  // Guards the guard: if a route renamed its secret env var the loop above would
  // silently stop covering it. The two reviewed workers must always be found by
  // the discovery scan — this fails loudly if the predicate narrows.
  const discovered = routes.map((route) => route.file);
  for (const expected of [
    "src/app/api/push/dispatch/route.ts",
    "src/app/api/email/engagement-digest/route.ts",
  ]) {
    assert.ok(
      discovered.includes(expected),
      `${expected} was not discovered by the bearer-guard scan: ${discovered.join(", ")}`,
    );
  }
});
