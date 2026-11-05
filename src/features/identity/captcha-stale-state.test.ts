import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { visibleCaptchaState } from "./use-captcha-action";
import type { SignInFormState } from "./schemas";

// A Turnstile token is single-use and expires after ~5 minutes. When the widget
// has not produced one, `useCaptchaAction` intercepts the submit and shows
// `<CaptchaNotice>` *instead of* the status message — but the previous round's
// `state` is left untouched, so the e-mail field keeps `aria-describedby`
// pointed at a message element that is no longer rendered. axe reports that as
// `aria-valid-attr-value` ("ARIA attributes must conform to valid values"); its
// `aria-describedby` pre-check specifically rejects a dangling idref.
//
// This was invisible to the axe gate because that gate audits initial page load
// only, and the stale state needs a settled error followed by a blocked submit.

const idle: SignInFormState = { status: "idle", message: "idle" };

test("a blocked submit reports the idle state, not the previous round's error", () => {
  const settled: SignInFormState = {
    status: "error",
    message: "signInFailed",
    email: "aday@example.com",
  };

  assert.deepEqual(visibleCaptchaState(settled, idle, true), idle);
});

test("an unblocked form renders the live action state untouched", () => {
  const settled: SignInFormState = { status: "success", message: "verificationSent" };

  assert.equal(visibleCaptchaState(settled, idle, false), settled);
  assert.equal(visibleCaptchaState(idle, idle, false), idle);
});

test("the hook exposes the masked state, not the raw action state", () => {
  // The masking is only effective if `useCaptchaAction` returns it; guard the
  // wiring statically so a refactor cannot quietly re-expose the stale state.
  const source = readFileSync(new URL("./use-captcha-action.ts", import.meta.url), "utf8");
  const hook = source.slice(source.indexOf("export function useCaptchaAction"));

  assert.match(
    hook,
    /state:\s*visibleCaptchaState\(state,\s*initialState,\s*captchaBlocked\)/,
    "useCaptchaAction must return the masked state",
  );
});
