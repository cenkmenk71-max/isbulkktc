import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  parseAuthFlow,
  parsePkceFlowId,
  resolveAuthErrorRedirect,
} from "../../src/features/identity/auth-routing";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("a valid PKCE flow id is accepted, anything else is dropped", () => {
  // 32 lowercase hex characters, as `generatePKCEFlowId` produces.
  assert.equal(
    parsePkceFlowId("505e96d1e1a6debd9cdd3e80cf443a0b"),
    "505e96d1e1a6debd9cdd3e80cf443a0b",
  );

  for (const invalid of [
    undefined,
    null,
    "",
    "  ",
    "505E96D1E1A6DEBD9CDD3E80CF443A0B", // uppercase
    "505e96d1e1a6debd9cdd3e80cf443a0", // 31 chars
    "505e96d1e1a6debd9cdd3e80cf443a0bb", // 33 chars
    "505e96d1e1a6debd9cdd3e80cf443azb", // non-hex
    "../505e96d1e1a6debd9cdd3e80cf443a", // traversal attempt
    "505e96d1e1a6debd9cdd3e80cf443a0b=x",
  ]) {
    assert.equal(parsePkceFlowId(invalid), undefined, `should reject ${invalid}`);
  }
});

test("parseAuthFlow keeps the fixed vocabulary and defaults to email", () => {
  assert.equal(parseAuthFlow("oauth"), "oauth");
  assert.equal(parseAuthFlow("reset"), "reset");
  assert.equal(parseAuthFlow("email"), "email");
  assert.equal(parseAuthFlow(undefined), "email");
  assert.equal(parseAuthFlow("../../etc/passwd"), "email");
});

test("the OAuth start opts into PKCE flow-id redirects", async () => {
  const actions = await read("src/features/identity/actions.ts");
  const call = actions.slice(actions.indexOf("export async function startOAuthSignIn"));
  const body = call.slice(0, call.indexOf("export async function signIn"));

  // Without this flag every flow falls back to the shared legacy verifier key,
  // which mirrors only the most recently started flow.
  assert.match(body, /appendPkceFlowIdToRedirects:\s*true/);
  assert.match(body, /experimental:\s*\{\s*appendPkceFlowIdToRedirects:\s*true\s*\}/);
});

test("the callback forwards the flow id to exchangeCodeForSession", async () => {
  const route = await read("src/app/[locale]/auth/callback/route.ts");

  assert.match(route, /parsePkceFlowId\(/);
  assert.match(route, /exchangeCodeForSession\(\s*\n?\s*code,\s*\n?\s*flowId \? \{ flowId \} : undefined,?\s*\n?\s*\)/);
});

test("the server client forwards experimental auth flags", async () => {
  const client = await read("src/server/db/supabase-server.ts");

  assert.match(client, /experimental\?:\s*\{/);
  assert.match(client, /auth:\s*\{\s*experimental:\s*options\.experimental\s*\}/);
});

test("a failed OAuth round-trip on the home page is sent to the login message", () => {
  // GoTrue redirects a failed OAuth round-trip to the Site URL (the bare origin)
  // with the failure in the query string, never to /auth/callback. The home page
  // must hand those visitors the login page, which renders the OAuth message.
  assert.equal(
    resolveAuthErrorRedirect(
      {
        error: "invalid_request",
        error_code: "bad_oauth_state",
        error_description: "OAuth state parameter is invalid",
      },
      "tr",
    ),
    "/login?error=oauth",
  );
  assert.equal(
    resolveAuthErrorRedirect({ error_code: "bad_oauth_callback" }, "en"),
    "/en/login?error=oauth",
  );
  assert.equal(
    resolveAuthErrorRedirect({ error_code: "bad_code_verifier" }, "de"),
    "/de/login?error=oauth",
  );
});

test("only GoTrue's error_code triggers the redirect", () => {
  // A bare `?error=` must not be enough: otherwise any link could bounce the
  // visitor off the home page.
  assert.equal(resolveAuthErrorRedirect({ error: "invalid_request" }, "tr"), null);
  assert.equal(resolveAuthErrorRedirect({}, "tr"), null);
  assert.equal(resolveAuthErrorRedirect({ error_code: "" }, "tr"), null);
  assert.equal(
    resolveAuthErrorRedirect({ error_code: ["a", "b"] }, "tr"),
    null,
  );
  assert.equal(resolveAuthErrorRedirect({ query: "designer" }, "tr"), null);
});

test("the home page applies the auth-error redirect", async () => {
  const page = await read("src/app/[locale]/page.tsx");

  assert.match(page, /resolveAuthErrorRedirect\(query,\s*locale\)/);
  assert.match(page, /redirect\(authErrorRedirect\)/);
});

test("PKCE diagnostics detect only the matching flow verifier cookie", async () => {
  const { inspectPkceVerifierCookies } = await import(
    "../../src/features/identity/pkce-cookie-diagnostics"
  );
  const storageKey = "sb-example-auth-token";
  const flowId = "505e96d1e1a6debd9cdd3e80cf443a0b";

  assert.deepEqual(
    inspectPkceVerifierCookies(
      [
        `${storageKey}-flow-${flowId}-code-verifier`,
        `${storageKey}-code-verifier`,
      ],
      storageKey,
      flowId,
    ),
    {
      hasFlowVerifierCookie: true,
      hasLegacyVerifierCookie: true,
    },
  );

  assert.deepEqual(
    inspectPkceVerifierCookies(
      [
        `${storageKey}-flow-${flowId}-code-verifier.0`,
        `${storageKey}-flow-${flowId}-code-verifier.1`,
        `${storageKey}-unrelated`,
      ],
      storageKey,
      flowId,
    ),
    {
      hasFlowVerifierCookie: true,
      hasLegacyVerifierCookie: false,
    },
  );

  assert.deepEqual(
    inspectPkceVerifierCookies(
      [`${storageKey}-flow-another-flow-code-verifier`],
      storageKey,
      flowId,
    ),
    {
      hasFlowVerifierCookie: false,
      hasLegacyVerifierCookie: false,
    },
  );
});

test("PKCE diagnostics do not infer a flow verifier when the callback has no flow id", async () => {
  const { inspectPkceVerifierCookies } = await import(
    "../../src/features/identity/pkce-cookie-diagnostics"
  );

  assert.deepEqual(
    inspectPkceVerifierCookies(
      ["sb-example-auth-token-code-verifier"],
      "sb-example-auth-token",
      undefined,
    ),
    {
      hasFlowVerifierCookie: null,
      hasLegacyVerifierCookie: true,
    },
  );
});

test("a callback with an explicit flow id never retries against the shared legacy verifier", async () => {
  const route = await read("src/app/[locale]/auth/callback/route.ts");

  assert.equal(
    (route.match(/exchangeCodeForSession\(/g) ?? []).length,
    1,
    "the callback must make exactly one code-exchange attempt",
  );
  assert.match(route, /inspectPkceVerifierCookies\(/);
  assert.match(route, /hasFlowVerifierCookie/);
  assert.match(route, /callbackHostMatchesAppOrigin/);
});

test("email confirmation and recovery flows opt into per-flow PKCE ids", async () => {
  const actions = await read("src/features/identity/actions.ts");

  for (const method of ["signUp", "resendConfirmation", "requestPasswordReset"]) {
    const start = actions.indexOf(`export async function ${method}(`);
    assert.ok(start >= 0, `${method} action must exist`);
    const nextAction = actions.indexOf("\nexport async function ", start + 10);
    const body = actions.slice(start, nextAction < 0 ? actions.length : nextAction);

    assert.match(
      body,
      /experimental:\s*\{\s*appendPkceFlowIdToRedirects:\s*true\s*\}/,
      `${method} must carry a unique flow id through the email redirect`,
    );
  }
});

test("a present malformed PKCE flow id is rejected before any verifier fallback", async () => {
  const route = await read("src/app/[locale]/auth/callback/route.ts");

  assert.match(route, /const invalidFlowId = rawFlowId !== null && flowId === undefined/);
  const rejectionIndex = route.indexOf("if (invalidFlowId)");
  const clientIndex = route.indexOf("createSupabaseServerClient({", rejectionIndex);
  assert.ok(rejectionIndex >= 0, "malformed flow ids must have an explicit rejection");
  assert.ok(clientIndex > rejectionIndex, "reject before reading any verifier cookie storage");
  assert.match(route.slice(rejectionIndex, clientIndex), /flow_state_not_found/);
});
