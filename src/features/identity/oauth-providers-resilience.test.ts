import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  parseEnabledOAuthProviders,
  resolveEnabledOAuthProviders,
} from "./oauth-providers";

// `AUTH_OAUTH_PROVIDERS` is an operator setting, but the login and registration
// pages read it *during render* to decide which social buttons to enable. The
// strict parser throws on a typo, and an uncaught throw in a page render is a
// 500 in every locale — on the two pages a locked-out visitor needs. These tests
// pin the tolerant path those pages use, and the wiring that keeps them on it.

test("a malformed provider list does not reach the page render as a throw", () => {
  for (const env of [
    "google,facebook",
    "google, linkedin_oidc,instagram",
    "google,",
    ",",
    " , ",
  ]) {
    // The strict parser still fails loudly (the ops verifier relies on it) …
    assert.throws(() => parseEnabledOAuthProviders(env));

    // … but the render path must degrade to "no provider enabled", not 500.
    assert.deepEqual(
      resolveEnabledOAuthProviders(() => parseEnabledOAuthProviders(env)),
      [],
      `${JSON.stringify(env)} must degrade, not throw, on the auth pages`,
    );
  }
});

test("a well-formed provider list passes through unchanged", () => {
  assert.deepEqual(
    resolveEnabledOAuthProviders(() =>
      parseEnabledOAuthProviders("google, linkedin_oidc,google"),
    ),
    ["google", "linkedin_oidc"],
  );
  assert.deepEqual(
    resolveEnabledOAuthProviders(() => parseEnabledOAuthProviders(undefined)),
    [],
  );
});

test("the login and register pages read the provider list through the guard", () => {
  // The guard is only useful if the pages actually call it. Guard the wiring
  // statically so a refactor cannot put the raw parser back on the render path.
  for (const page of [
    "src/app/[locale]/(auth)/login/page.tsx",
    "src/app/[locale]/(auth)/register/page.tsx",
  ]) {
    const source = readFileSync(new URL(`../../../${page}`, import.meta.url), "utf8");
    assert.match(
      source,
      /resolveEnabledOAuthProviders\(getEnabledOAuthProviders\)/,
      `${page} must read the provider list through resolveEnabledOAuthProviders`,
    );
  }
});

test("the OAuth server action contains a malformed provider list too", () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const action = source.slice(
    source.indexOf("export async function startOAuthSignIn"),
    source.indexOf("export async function signIn"),
  );

  assert.match(
    action,
    /resolveEnabledOAuthProviders\(\(\) =>\s*parseEnabledOAuthProviders\(/,
    "startOAuthSignIn must contain the parser, so a bad env answers oauthUnavailable instead of throwing",
  );
});
