"use client";

import Script from "next/script";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const consentStorageKey = "isbulkkktc-analytics-consent-v1";
const consentChangedEvent = "isbulkkktc:analytics-consent";

type ConsentChoice = "granted" | "denied" | "unset";

function getConsentSnapshot(): ConsentChoice {
  const value = window.localStorage.getItem(consentStorageKey);
  return value === "granted" || value === "denied" ? value : "unset";
}

function subscribeToConsent(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(consentChangedEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(consentChangedEvent, onChange);
  };
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

export function GoogleAnalyticsConsent() {
  const pathname = usePathname();
  const t = useTranslations("Analytics");
  const storedConsent = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    () => "unset",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (
      storedConsent !== "granted" ||
      !scriptReady ||
      typeof window.gtag !== "function"
    ) {
      return;
    }

    window.gtag("event", "page_view", {
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }, [storedConsent, pathname, scriptReady]);

  // The banner is a general cookie notice, so it must appear even when the
  // analytics property is not configured. Only the GA scripts depend on a
  // valid measurement id.
  const analyticsConfigured =
    Boolean(measurementId) && /^G-[A-Z0-9]+$/.test(measurementId ?? "");

  function saveConsent(value: "granted" | "denied") {
    window.localStorage.setItem(consentStorageKey, value);
    window[`ga-disable-${measurementId}`] = value === "denied";
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: value,
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
    }
    setScriptReady(false);
    window.dispatchEvent(new Event(consentChangedEvent));
    setSettingsOpen(false);
  }

  return (
    <>
      {analyticsConfigured && storedConsent === "granted" && (
        <>
          <Script
            id="google-analytics-init"
            strategy="afterInteractive"
            onReady={() => setScriptReady(true)}
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];window.gtag=function(){window.dataLayer.push(arguments)};window.gtag('consent','default',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});window.gtag('js',new Date());window.gtag('config','${measurementId}',{send_page_view:false});`,
            }}
          />
          <Script
            id="google-analytics"
            src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
            strategy="afterInteractive"
          />
        </>
      )}
      {(storedConsent === "unset" || settingsOpen) && (
        <aside
          className="analytics-consent"
          aria-label={t("regionLabel")}
          aria-live="polite"
        >
          <p>{t("description")}</p>
          <div>
            <button type="button" onClick={() => saveConsent("granted")}>
              {t("accept")}
            </button>
            <button type="button" onClick={() => saveConsent("denied")}>
              {t("reject")}
            </button>
          </div>
        </aside>
      )}
      {storedConsent !== "unset" && !settingsOpen && (
        <button
          type="button"
          className="analytics-consent-settings"
          onClick={() => setSettingsOpen(true)}
        >
          {t("settings")}
        </button>
      )}
    </>
  );
}
