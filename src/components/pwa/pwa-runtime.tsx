"use client";

import { useEffect } from "react";
import { useConsent } from "@/components/analytics/consent-context";
import {
  captureInstallPrompt,
  markAppInstalled,
} from "@/lib/pwa/install-prompt";
import {
  configureInstallTracking,
  trackInstallEvent,
} from "@/lib/pwa/install-analytics";
import { configureConversionTracking } from "@/lib/analytics/conversion";
import { useServiceWorker } from "@/lib/pwa/use-service-worker";
import { standaloneMediaQuery } from "@/lib/pwa/platform";
import { AppUpdateToast } from "@/components/pwa/app-update-toast";
import { OfflineBanner } from "@/components/pwa/offline-banner";

/**
 * Client-side PWA lifecycle owner. Mounted once from the locale layout.
 *
 * It does four things and nothing else:
 *  1. registers the service worker and exposes an update prompt,
 *  2. captures `beforeinstallprompt` for the install page,
 *  3. reports `appinstalled` and standalone launches (the only confirmed
 *     installation signals),
 *  4. wires the analytics transport to the consent decision.
 */
export function PwaRuntime() {
  const { consent } = useConsent();
  const { updateReady, applyUpdate, supported } = useServiceWorker();

  useEffect(() => {
    configureInstallTracking({ analyticsConsent: consent.analytics });
    configureConversionTracking({ analyticsConsent: consent.analytics });
  }, [consent.analytics]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the browser's own mini-infobar so the install CTA is the one
      // the visitor sees; the event is kept for that CTA to use.
      event.preventDefault();
      captureInstallPrompt(event);
      trackInstallEvent("install_prompt_available");
    };
    const onInstalled = () => {
      markAppInstalled();
      trackInstallEvent("app_installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia(standaloneMediaQuery).matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    // A standalone launch is the one installation signal that also works on
    // iOS, where no `appinstalled` event exists.
    if (standalone) trackInstallEvent("standalone_launch");
  }, []);

  return (
    <>
      <OfflineBanner />
      <AppUpdateToast
        updateReady={updateReady}
        serviceWorkerSupported={supported}
        onApply={() => {
          trackInstallEvent("app_update_applied");
          applyUpdate();
        }}
      />
    </>
  );
}
