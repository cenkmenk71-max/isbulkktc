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

const functionsDir = new URL("../../supabase/functions/", import.meta.url);

/**
 * Every edge function the app serves **without** the platform JWT check —
 * `[functions.<name>] verify_jwt = false` in `supabase/config.toml`.
 *
 * The earlier version pinned the one worker by path. That is a false negative
 * by construction: a second `verify_jwt = false` function added to the config
 * (a new webhook receiver, a second cron target) would be reachable from the
 * public internet with **no** test asserting it authenticates itself, because
 * the only file the suite ever read was the notification worker's. Discovery
 * from the config closes that hole; the self-test below proves the parser sees
 * the declaration and that the known worker is found.
 */
function publicFunctions(): string[] {
  const config = readFileSync(
    new URL("../../supabase/config.toml", import.meta.url),
    "utf8",
  );
  const names: string[] = [];
  // A TOML table header followed by a `verify_jwt = false` key before the next
  // header. `[^[]` keeps the match inside one table.
  const table = /\[functions\.([A-Za-z0-9_-]+)\]([\s\S]*?)(?=\n\[|\s*$)/g;
  for (const match of config.matchAll(table)) {
    if (/^\s*verify_jwt\s*=\s*false\s*$/m.test(match[2])) names.push(match[1]);
  }
  return names.sort();
}

function workerSource(name: string): string {
  return readFileSync(
    new URL(`${name}/index.ts`, functionsDir),
    "utf8",
  );
}

test("the functions with verify_jwt disabled are discovered (self-test)", () => {
  // Guards the guard: if the config parser misses a declaration, the ordering
  // checks below never run for that function.
  const discovered = publicFunctions();
  assert.ok(
    discovered.includes("send-application-notifications"),
    `the notification worker was not discovered in config.toml: ${discovered.join(", ") || "(none)"}`,
  );
  // A config snippet with a JWT-verified function must not be reported.
  const snippet = ["[functions.secure]", "verify_jwt = true", ""].join("\n");
  const match = /\[functions\.([A-Za-z0-9_-]+)\]([\s\S]*?)(?=\n\[|\s*$)/.exec(snippet);
  assert.ok(match, "the table regex no longer matches a functions table");
  assert.equal(/^\s*verify_jwt\s*=\s*false\s*$/m.test(match[2]), false);
});

for (const name of publicFunctions()) {
  const code = workerSource(name);
  const authIndex = code.indexOf('request.headers.get("authorization")');
  // The first configuration read after the guard, whichever form it takes.
  const configMatch = /Deno\.env\.get\("([A-Z0-9_]+)"\)/.exec(
    code.slice(authIndex === -1 ? 0 : authIndex),
  );
  const configIndex =
    configMatch && authIndex > -1
      ? authIndex + (configMatch.index ?? 0)
      : code.indexOf('Deno.env.get("');

  test(`${name} rejects a non-POST method first`, () => {
    assert.match(code, /request\.method !== "POST"/);
    assert.ok(
      code.indexOf('request.method !== "POST"') < authIndex,
      "the method check must precede authentication",
    );
  });

  test(`${name} authenticates before it inspects its configuration`, () => {
    assert.ok(authIndex > -1, "the bearer comparison was not found");
    assert.ok(configIndex > -1, "the configuration read was not found");
    assert.ok(
      authIndex < configIndex,
      "configuration is read before authentication, so an anonymous caller can probe whether delivery is configured",
    );
  });

  test(`${name} fails closed rather than disabling the guard when the token is missing`, () => {
    // The guard must reject when no token is configured, not skip the
    // comparison — a `!token || … !== \`Bearer ${token}\`` shape.
    assert.match(
      code,
      /!\s*(\w+)\s*\|\|\s*request\.headers\.get\("authorization"\)\s*!==\s*`Bearer \$\{\1\}`/,
      "the guard must reject when the token is missing, not skip the comparison",
    );
  });

  test(`${name} never reflects the service key or provider errors to the caller`, () => {
    // Responses are fixed strings; the service key must not appear in any body.
    assert.ok(
      !/response\([^)]*serviceKey/.test(code),
      "the service key must never be echoed into a response body",
    );
    assert.ok(
      !/JSON\.stringify\([^)]*resendApiKey/.test(code),
      "the Resend key must never be echoed into a response body",
    );
  });
}
