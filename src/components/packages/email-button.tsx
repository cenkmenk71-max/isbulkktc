"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
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

  return (
    <form action={createPaymentConfirmationAction}>
      <input type="hidden" name="packageCode" value={packageCode} />
      <input type="hidden" name="durationDays" value={duration?.toString() ?? "30"} />
      <input type="hidden" name="channel" value="email" />
      <button
        type="submit"
        className={buttonVariants({ variant: "default" })}
        aria-label={t("emailAction")}
      >
        {t("emailAction")}
      </button>
    </form>
  );
}