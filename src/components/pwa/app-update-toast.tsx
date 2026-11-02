"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { trackInstallEvent } from "@/lib/pwa/install-analytics";

/**
 * Update affordance.
 *
 * Shown only when a new service worker is waiting. It never reloads on its own:
 * a reload can land while the visitor is filling in a form or uploading a CV, so
 * the decision stays with them. The "later" choice is remembered for the session
 * so the toast does not re-appear on every navigation, but it returns on the
 * next launch so an update cannot be deferred forever.
 */
export function AppUpdateToast({
  updateReady,
  serviceWorkerSupported,
  onApply,
}: {
  updateReady: boolean;
  serviceWorkerSupported: boolean;
  onApply: () => void;
}) {
  const t = useTranslations("Install");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (updateReady) trackInstallEvent("app_update_available");
  }, [updateReady]);

  if (!serviceWorkerSupported || !updateReady || dismissed) return null;

  return (
    <div className="pwa-update-toast" role="status" aria-live="polite">
      <p className="pwa-update-copy">{t("updateAvailable")}</p>
      <div className="pwa-update-actions">
        <button
          type="button"
          className="pwa-update-primary"
          onClick={onApply}
        >
          {t("updateApply")}
        </button>
        <button
          type="button"
          className="pwa-update-secondary"
          onClick={() => setDismissed(true)}
        >
          {t("updateLater")}
        </button>
      </div>
    </div>
  );
}
