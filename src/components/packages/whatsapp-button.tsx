"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { createPaymentConfirmationAction } from "@/features/companies/payment-confirmation-actions";

interface WhatsAppButtonProps {
  _locale: string;
  packageCode: string;
  _packageName: string;
  duration?: number;
  _price?: string;
}

export function WhatsAppButton({
  _locale,
  packageCode,
  _packageName,
  duration,
  _price,
}: WhatsAppButtonProps) {
  const t = useTranslations("PackagesPage.showcase.pricing");
  const searchParams = useSearchParams();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const companyName = searchParams.get("companyName") ?? "";
    const packageName = _packageName;
    const userEmail = searchParams.get("email") ?? "";

    const message = `Merhaba İşBul KKTC, ${companyName} adına ${packageName} ilan paketini satın almak istiyorum. IBAN ödeme bilgilerini paylaşabilir misiniz?${userEmail ? `\nE-posta: ${userEmail}` : ""}`;

    const whatsappUrl = `https://wa.me/905391316421?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");

    const formData = new FormData();
    formData.append("packageCode", packageCode);
    formData.append("durationDays", duration?.toString() ?? "30");
    formData.append("channel", "whatsapp");

    void createPaymentConfirmationAction(formData);
  }

  return (
    <button
      type="button"
      className="package-buy-button whatsapp-buy-button pulse-buy-button"
      onClick={handleClick}
      aria-label={t("whatsappAction")}
    >
      <svg
        className="button-icon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.454.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378 9.86 9.86 0 0 1-1.738-4.415 9.88 9.88 0 0 1 4.132-5.573 9.87 9.87 0 0 1 5.315 1.307 9.87 9.87 0 0 1 1.82 4.23c-.047.725-.21 1.413-.436 2.032a9.77 9.77 0 0 1-4.127 3.815z" />
      </svg>
      <span>{t("whatsappAction")}</span>
    </button>
  );
}