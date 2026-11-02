"use client";

import { useCallback, useEffect, useState } from "react";

export type ServiceWorkerStatus = {
  supported: boolean;
  registration: ServiceWorkerRegistration | null;
  updateReady: boolean;
  applyUpdate: () => void;
};

/**
 * Registers the service worker and surfaces an update when one is waiting.
 *
 * An update is never applied automatically: `skipWaiting` from inside the worker
 * would swap the shell under a visitor mid-form. The page asks, and the visitor
 * decides; on confirm the waiting worker is told to activate and the page
 * reloads once.
 */
export function useServiceWorker(): ServiceWorkerStatus {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const supported = typeof navigator !== "undefined" && "serviceWorker" in navigator;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const register = async () => {
      try {
        const next = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (cancelled) return;
        setRegistration(next);

        if (next.waiting) setUpdateReady(true);

        next.addEventListener("updatefound", () => {
          const installing = next.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // `installed` with a live controller means an update is waiting; with
            // no controller it is the first install, which needs no prompt.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      } catch {
        // Registration fails on insecure origins and in some private modes. The
        // app must keep working without a service worker.
      }
    };

    void register();

    const onControllerChange = () => {
      // Only reload when the page had a controller before (i.e. this is an
      // update, not a first install) to avoid a reload loop on first visit.
      setUpdateReady(false);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [supported]);

  const applyUpdate = useCallback(() => {
    const waiting = registration?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
    // `controllerchange` fires once the new worker takes over, but a reload is
    // also safe here and is what actually swaps the HTML.
    window.setTimeout(() => window.location.reload(), 250);
  }, [registration]);

  return { supported, registration, updateReady, applyUpdate };
}
