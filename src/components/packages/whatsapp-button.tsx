"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
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

  return (
    <form action={createPaymentConfirmationAction}>
      <input type="hidden" name="packageCode" value={packageCode} />
      <input type="hidden" name="durationDays" value={duration?.toString() ?? "30"} />
      <input type="hidden" name="channel" value="whatsapp" />
      <button
        type="submit"
        className={buttonVariants({ variant: "default" })}
        aria-label={t("whatsappAction")}
      >
        {t("whatsappAction")}
      </button>
    </form>
  );
}