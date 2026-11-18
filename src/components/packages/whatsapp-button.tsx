import { getWhatsAppUrl } from "@/lib/social-links";
import { useTranslations } from "next-intl";

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
      className="inline-flex items-center justify-center rounded-lg border border-crayon-highlight/15 bg-crayon-highlight text-vanadium-950 shadow-sm font-medium whitespace-nowrap transition-[background-color,border-color,box-shadow,transform,color] duration-220 ease-premium focus-visible:ring-3 focus-visible:ring-shade-green-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px hover:bg-crayon-50 active:translate-y-0"
    >
      {t("whatsappAction")}
    </a>
  );
}