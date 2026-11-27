"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { createPaymentConfirmationAction } from "@/features/companies/payment-confirmation-actions";

interface EmailButtonProps {
  _locale: string;
  packageCode: string;
  _packageName: string;
  duration?: number;
  _price?: string;
}

export function EmailButton({
  _locale,
  packageCode,
  _packageName,
  duration,
  _price,
}: EmailButtonProps) {
  const t = useTranslations("PackagesPage.showcase.pricing");
  const searchParams = useSearchParams();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const companyName = searchParams.get("companyName") ?? "";
    const packageName = _packageName;
    const userEmail = searchParams.get("email") ?? "";

    const subject = `Paket siparişi: ${companyName} - ${packageName}`;
    const body = `Merhaba İşBul KKTC ekibi,\n\n${companyName} adına ${packageName} ilan paketini satın almak istiyorum. IBAN ödeme bilgilerini paylaşabilir misiniz?\n\nŞirket: ${companyName}\nPaket: ${packageName}\nSüre: ${duration ?? 30} gün\n${userEmail ? `E-posta: ${userEmail}` : ""}`;

    const emailUrl = `mailto:info@isbulkktc.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = emailUrl;

    const formData = new FormData();
    formData.append("packageCode", packageCode);
    formData.append("durationDays", duration?.toString() ?? "30");
    formData.append("channel", "email");

    void createPaymentConfirmationAction(formData);
  }

  return (
    <button
      type="button"
      className="package-buy-button email-buy-button pulse-buy-button"
      onClick={handleClick}
      aria-label={t("emailAction")}
    >
      <svg
        className="button-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
      <span>{t("emailAction")}</span>
    </button>
  );
}