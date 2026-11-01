"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { turnstileSiteKey, useTurnstileWidget } from "./turnstile";

/**
 * Shown when a submit is intercepted because Turnstile has not produced a token
 * yet (widget still solving, or the ~5 minute token expired). Keeps the user
 * from spending a round trip on a submit that cannot succeed.
 */
export function CaptchaNotice() {
  const copy = useTranslations("AuthForms");
  return (
    <p
      aria-live="polite"
      className="editorial-form-message"
      data-status="error"
      role="alert"
    >
      {copy("messages.captchaRequired")}
    </p>
  );
}

/**
 * Renders a Cloudflare Turnstile widget and lets it inject its hidden
 * `cf-turnstile-response` field into the surrounding form. Renders nothing when
 * the site key is not configured, so the auth forms keep working without captcha
 * in development.
 *
 * `resetSignal` is bumped by `useCaptchaAction` after every settled submission;
 * resetting a spent token is what keeps a second attempt from being rejected as
 * `captcha_failed`.
 */
export function TurnstileField({ resetSignal = 0 }: { resetSignal?: number }) {
  const { containerRef, reset } = useTurnstileWidget();

  useEffect(() => {
    if (resetSignal > 0) reset();
  }, [resetSignal, reset]);

  if (!turnstileSiteKey) return null;

  return (
    <div className="editorial-turnstile">
      <div ref={containerRef} />
    </div>
  );
}
