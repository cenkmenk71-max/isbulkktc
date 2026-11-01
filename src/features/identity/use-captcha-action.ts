"use client";

import { useActionState, useState, type RefObject } from "react";
import { readCaptchaToken, turnstileSiteKey } from "./turnstile";
import type { SignInFormState } from "./schemas";

/**
 * Wraps `useActionState` for a form protected by Turnstile.
 *
 * Two problems are solved here that a plain `useActionState` cannot:
 *
 * 1. A Turnstile token is single-use. The sign-in and sign-up forms render their
 *    status message *inside* the same `<form>`, so a failed round trip leaves the
 *    browser holding a spent token — Supabase then answers `captcha_failed` on
 *    every retry and the real credential error never shows. The widget is reset
 *    on submit (the `FormData` handed to the action already carries the token),
 *    so the next attempt gets a fresh one.
 * 2. If the token has expired (Turnstile tokens live ~5 minutes) or the widget
 *    has not finished, submitting would waste a round trip. The action is
 *    intercepted here and the user is told to re-verify.
 */
export function useCaptchaAction(
  action: (state: SignInFormState, formData: FormData) => Promise<SignInFormState>,
  initialState: SignInFormState,
  formRef: RefObject<HTMLFormElement | null>,
) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [resetSignal, setResetSignal] = useState(0);
  const [captchaBlocked, setCaptchaBlocked] = useState(false);

  function guardedAction(formData: FormData) {
    if (turnstileSiteKey && !readCaptchaToken(formRef.current)) {
      setCaptchaBlocked(true);
      return;
    }
    setCaptchaBlocked(false);
    setResetSignal((signal) => signal + 1);
    dispatch(formData);
  }

  return { state, action: guardedAction, pending, resetSignal, captchaBlocked };
}
