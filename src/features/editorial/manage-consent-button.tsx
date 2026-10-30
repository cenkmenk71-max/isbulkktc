"use client";

import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";
import { requestConsentPanel } from "@/components/analytics/consent-browser";

/**
 * A reopen entry point that lives on the policy page itself. GDPR requires
 * withdrawing consent to be as easy as giving it, and a visitor reading the
 * cookie policy is exactly the person looking for this control.
 */
export function ManageConsentButton() {
  const t = useTranslations("Analytics");

  return (
    <button
      type="button"
      className="button button-dark legal-consent-button"
      onClick={requestConsentPanel}
    >
      <Settings2 size={16} aria-hidden="true" />
      {t("managePreferences")}
    </button>
  );
}
