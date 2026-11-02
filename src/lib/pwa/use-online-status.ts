"use client";

import { useEffect, useState } from "react";

/**
 * Connectivity state for the offline affordances.
 *
 * `navigator.onLine` is a hint, not a probe: it is false only when the device
 * reports no interface, and it stays true on a captive portal or a dead uplink.
 * That is why the service worker's offline document, not this flag, is the real
 * fallback — this state only decides whether to show a banner.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(window.navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
