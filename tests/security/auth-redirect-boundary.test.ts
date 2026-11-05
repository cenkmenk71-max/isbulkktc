import assert from "node:assert/strict";
import test from "node:test";

import {
  audienceFromCallbackParam,
  callbackAudienceParam,
  parseAuthFlow,
  parsePkceFlowId,
  resolveAuthErrorRedirect,
  resolveAuthDestination,
  resolveAuthFailurePath,
} from "@/features/identity/auth-routing";
import { routing } from "@/i18n/routing";

/**
 * Open-redirect boundary for the auth callback (`/[locale]/auth/callback`).
 *
 * The callback is a public GET, so its query values are attacker-controlled:
 * anyone can mail a victim a link like
 *
 *     /auth/callback?next=https://evil.example
 *     /auth/callback?next=//evil.example
 *
 * `auth-routing.ts` is the module that turns those query values into a path, and
 * its header promises that "only the fixed vocabulary below is ever turned into
 * a path". These tests hold it to that promise for every branch that ends in a
 * `redirect(...)`:
 *
 *  1. `next` (audience) is a closed enum — any value other than the literal
 *     `"company"` is the candidate audience, never a passthrough string;
 *  2. `flow` is a closed enum;
 *  3. `sb_flow_id` is accepted only in the exact 32-lowercase-hex shape PKCE
 *     produces, so it cannot smuggle anything else into the exchange;
 *  4. every destination/failure/error path begins with a known locale prefix and
 *     contains no scheme, backslash or protocol-relative prefix.
 *
 * This is a different module from `sanitizeNextPath` (the QR-install boundary),
 * which `open-redirect.test.ts` already covers.
 */

const localePrefixes = routing.locales.map((locale) =>
  locale === routing.defaultLocale ? "" : `/${locale}`,
);

/** True when a returned path would send the browser off this origin. */
function isHostChanging(value: string): boolean {
  if (value.startsWith("//")) return true; // protocol-relative
  if (value.includes("\\")) return true; // the URL parser folds `\` to `/`
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return true; // absolute scheme
  return false;
}

function isLocalePrefixed(value: string): boolean {
  return localePrefixes.some((prefix) =>
    prefix === "" ? value.startsWith("/") : value.startsWith(`${prefix}/`),
  );
}

const hostileNextValues = [
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "javascript:alert(1)",
  "company/../../evil",
  "company\nevil",
  "%2f%2fevil.example",
  "\\evil.example",
  "candidate",
  "employer",
  "COMPANY",
  "",
  " ",
];

test("the callback audience param never echoes an attacker string", () => {
  for (const value of hostileNextValues) {
    const audience = audienceFromCallbackParam(value);
    assert.ok(
      audience === "candidate" || audience === "employer",
      `audienceFromCallbackParam(${JSON.stringify(value)}) returned ${JSON.stringify(audience)}`,
    );
  }

  // Only the exact literal `"company"` selects the employer audience; everything
  // else — including near-misses — falls back to candidate.
  assert.equal(audienceFromCallbackParam("company"), "employer");
  assert.equal(audienceFromCallbackParam("COMPANY"), "candidate");
  assert.equal(audienceFromCallbackParam(" company"), "candidate");
});

test("the callback audience param and its inverse agree", () => {
  for (const audience of ["candidate", "employer"] as const) {
    assert.equal(
      audienceFromCallbackParam(callbackAudienceParam(audience)),
      audience,
    );
  }
});

test("parseAuthFlow only ever returns a known flow", () => {
  const hostile = [
    "https://evil.example",
    "oauth ",
    "OAuth",
    "reset\n",
    "javascript:oauth",
    "email",
    null,
    undefined,
  ];
  for (const value of hostile) {
    const flow = parseAuthFlow(value);
    assert.ok(
      flow === "email" || flow === "oauth" || flow === "reset",
      `parseAuthFlow(${JSON.stringify(value)}) returned ${JSON.stringify(flow)}`,
    );
  }
});

test("parsePkceFlowId accepts only the exact PKCE id shape", () => {
  const valid = "0123456789abcdef0123456789abcdef";
  assert.equal(parsePkceFlowId(valid), valid);

  for (const value of [
    "0123456789ABCDEF0123456789ABCDEF", // uppercase
    "0123456789abcdef0123456789abcde", // 31 chars
    "0123456789abcdef0123456789abcdef0", // 33 chars
    "0123456789abcdef0123456789abcdeg", // non-hex
    "0123456789abcdef0123456789abcde/",
    "../0123456789abcdef0123456789abcd",
    "",
    null,
    undefined,
  ]) {
    assert.equal(
      parsePkceFlowId(value),
      undefined,
      `parsePkceFlowId(${JSON.stringify(value)}) should be rejected`,
    );
  }
});

test("no auth destination, failure path or error redirect is host-changing", () => {
  for (const locale of routing.locales) {
    for (const audience of ["candidate", "employer"] as const) {
      const paths = [
        resolveAuthDestination(audience, locale),
        resolveAuthFailurePath("email", locale, audience),
        resolveAuthFailurePath("oauth", locale, audience),
        resolveAuthFailurePath("reset", locale, audience),
      ];
      for (const path of paths) {
        assert.ok(
          !isHostChanging(path),
          `${path} is a host change (locale ${locale}, audience ${audience})`,
        );
        assert.ok(
          isLocalePrefixed(path),
          `${path} is not under a known locale prefix`,
        );
      }
    }

    const errorRedirect = resolveAuthErrorRedirect(
      { error_code: "otp_expired" },
      locale,
    );
    assert.ok(errorRedirect, `resolveAuthErrorRedirect returned null for ${locale}`);
    assert.ok(!isHostChanging(errorRedirect), `${errorRedirect} is a host change`);
    assert.ok(isLocalePrefixed(errorRedirect), `${errorRedirect} is not locale-prefixed`);
  }
});

test("a bare ?error= is not turned into a redirect (home cannot be a redirector)", () => {
  assert.equal(resolveAuthErrorRedirect({ error: "anything" }, "tr"), null);
  assert.equal(resolveAuthErrorRedirect({}, "tr"), null);
  assert.equal(resolveAuthErrorRedirect({ error_code: "" }, "tr"), null);
  assert.equal(
    resolveAuthErrorRedirect({ error_code: ["https://evil.example"] }, "tr"),
    null,
    "an array-valued error_code must not be trusted",
  );
});
