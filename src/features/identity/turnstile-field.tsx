"use client";

import { useEffect, useRef } from "react";

export const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (target: HTMLElement, options: Record<string, unknown>) => string;
    };
  }
}

const scriptId = "cf-turnstile-script";
const scriptSrc =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Renders a Cloudflare Turnstile widget and injects a hidden `captchaToken`
 * field into the surrounding form. Renders nothing when the site key is not
 * configured, so the auth forms keep working without captcha in development.
 */
export function TurnstileField() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!turnstileSiteKey) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.turnstile) return;
      if (container.dataset.rendered === "true") return;
      container.dataset.rendered = "true";
      window.turnstile.render(container, { sitekey: turnstileSiteKey });
    };

    if (window.turnstile) {
      render();
      return () => {
        cancelled = true;
      };
    }

    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = scriptSrc;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", render);
    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
    };
  }, []);

  if (!turnstileSiteKey) return null;

  // Turnstile injects its own hidden `cf-turnstile-response` field into the
  // container, which the enclosing form submits.
  return (
    <div className="editorial-turnstile">
      <div ref={containerRef} />
    </div>
  );
}
