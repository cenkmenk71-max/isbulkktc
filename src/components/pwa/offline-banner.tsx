"use client";

import { useTranslations } from "next-intl";
import { useOnlineStatus } from "@/lib/pwa/use-online-status";

/**
 * Connectivity banner.
 *
 * Deliberately a plain, dismissable status line rather than a modal: the offline
 * *document* is the real fallback, and this only tells a visitor who is still on
 * a cached page why fresh data is not arriving. It renders nothing while online.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const t = useTranslations("Install");

  if (online) return null;

  return (
    <div className="pwa-offline-banner" role="status" aria-live="polite">
      <span className="pwa-offline-dot" aria-hidden="true" />
      <span>{t("offlineBanner")}</span>
    </div>
  );
}
