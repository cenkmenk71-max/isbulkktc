"use client";

import { useCallback, useEffect, useRef } from "react";

export const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export const turnstileResponseField = "cf-turnstile-response";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

const scriptId = "cf-turnstile-script";
const scriptSrc =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

/**
 * Loads the Turnstile script once per document and resolves when it is ready.
 *
 * Exported so the retry path can be exercised without a browser (see
 * `turnstile-loader.test.ts`); the widget hooks call it through
 * `useTurnstileWidget`.
 */
export function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    // A prior attempt may have left a failed `<script>` behind. A settled
    // element never fires `load`/`error` again, so reusing it would leave this
    // promise pending forever and the widget would never render — start from a
    // fresh element on every attempt.
    document.getElementById(scriptId)?.remove();

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = scriptSrc;
    script.async = true;
    script.defer = true;

    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener(
      "error",
      () => {
        // Drop the failed element so a later mount re-downloads instead of
        // reusing it and hanging on an event that will never fire again.
        script.remove();
        scriptPromise = null;
        reject(new Error("Turnstile script could not be loaded."));
      },
      { once: true },
    );

    document.head.appendChild(script);
  });

  return scriptPromise;
}

/** Reads the token Turnstile injected into a form, if the widget produced one. */
export function readCaptchaToken(form: HTMLFormElement | null): string | null {
  if (!form) return null;
  const value = new FormData(form).get(turnstileResponseField);
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Owns one Turnstile widget for a form.
 *
 * A Turnstile token is single-use and expires after ~5 minutes. A form that
 * renders its status message *inside* the same `<form>` (the sign-in and
 * sign-up forms do) survives the failed round trip, so the token the browser
 * submitted is already spent by the time the user retries — Supabase then
 * answers `captcha_failed` forever and the real credential error never shows.
 * The widget is therefore reset once the action settles, and an expired token
 * is rejected client-side so the user is told to re-verify instead of losing a
 * round trip to a generic failure.
 */
export function useTurnstileWidget() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        const container = containerRef.current;
        if (cancelled || !container || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: turnstileSiteKey,
        });
      })
      .catch(() => {
        // The enclosing form still submits; the server reports captcha_failed.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Clears the spent token so a retry is not rejected before it is sent. */
  const reset = useCallback(() => {
    const widgetId = widgetIdRef.current;
    if (!widgetId || !window.turnstile) return;
    window.turnstile.reset(widgetId);
  }, []);

  return { containerRef, reset };
}
