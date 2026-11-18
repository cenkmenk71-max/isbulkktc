import { getWhatsAppUrl } from "@/lib/social-links";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";

interface WhatsAppButtonProps {
  locale: string;
  packageName: string;
  duration?: number;
  price?: string;
}

export function WhatsAppButton({
  locale,
  packageName,
  duration,
  price,
}: WhatsAppButtonProps) {
  const t = useTranslations("PackagesPage.showcase.pricing");
  
  // Construct the message body using the same pattern as Panel.tsx
  const inquiryBody = t("inquiryBody")
    .replaceAll("%PACKAGE%", packageName)
    .replaceAll("%DAYS%", duration ? new Intl.NumberFormat(locale).format(duration) : "")
    .replaceAll("%PRICE%", price || "");
    
  const whatsappUrl = `${getWhatsAppUrl()}?text=${encodeURIComponent(inquiryBody)}`;

  return (
    <a
      href={whatsappUrl}
      rel="noopener noreferrer"
      target="_blank"
      aria-label={t("whatsappAction")}
      className={buttonVariants({ variant: "inverse" })}
    >
      {t("whatsappAction")}
    </a>
  );
}