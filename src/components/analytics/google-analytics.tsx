"use client";

import Script from "next/script";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import { useConsent } from "./consent-context";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

/**
 * Loads Google Analytics only after the visitor has granted analytics consent.
 *
 * Two consent-mode defaults matter and used to be wrong: `analytics_storage`
 * defaulted to `granted` (granting storage before any choice was made) and the
 * tag was configured with `send_page_view: false` while nothing else ever sent
 * the first view. Now the default is `denied` for every category, the tag is
 * loaded *after* consent, and each client-side navigation sends its own
 * `page_view` because Next does not reload the document between routes.
 */
export function GoogleAnalytics() {
  const pathname = usePathname();
  const { consent } = useConsent();
  const [ready, setReady] = useState(false);

  const configured = Boolean(measurementId) && /^G-[A-Z0-9]+$/.test(measurementId ?? "");
  const enabled = configured && consent.analytics;

  // The gtag.js snippet is only injected once consent exists. When consent is
  // withdrawn the effect below disables collection; the scripts stay in the DOM
  // but send nothing.
  useEffect(() => {
    if (!configured || typeof window === "undefined") return;
    window[`ga-disable-${measurementId}`] = !consent.analytics;
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: consent.analytics ? "granted" : "denied",
        ad_storage: consent.marketing ? "granted" : "denied",
        ad_user_data: consent.marketing ? "granted" : "denied",
        ad_personalization: consent.marketing ? "granted" : "denied",
      });
    }
  }, [configured, consent.analytics, consent.marketing]);

  useEffect(() => {
    if (!enabled || !ready || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }, [enabled, ready, pathname]);

  if (!enabled) return null;

  return (
    <>
      <Script
        id="google-analytics-init"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        dangerouslySetInnerHTML={{
          __html:
            `window.dataLayer=window.dataLayer||[];` +
            `window.gtag=function(){window.dataLayer.push(arguments)};` +
            `window.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});` +
            `window.gtag('js',new Date());` +
            `window.gtag('config','${measurementId}',{send_page_view:false});`,
        }}
      />
      <Script
        id="google-analytics"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  );
}
