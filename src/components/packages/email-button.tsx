import { SUPPORT_EMAIL } from "@/lib/social-links";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";

interface EmailButtonProps {
  locale: string;
  packageName: string;
  duration?: number;
  price?: string;
}

export function EmailButton({
  locale,
  packageName,
  duration,
  price,
}: EmailButtonProps) {
  const t = useTranslations("PackagesPage.showcase.pricing");
  
  // Construct the message body using the same pattern as Panel.tsx
  const inquiryBody = t("inquiryBody")
    .replaceAll("%PACKAGE%", packageName)
    .replaceAll("%DAYS%", duration ? new Intl.NumberFormat(locale).format(duration) : "")
    .replaceAll("%PRICE%", price || "");
    
  const inquirySubject = t("inquirySubject");
  const emailUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(inquirySubject)}&body=${encodeURIComponent(inquiryBody)}`;

  return (
    <a
      href={emailUrl}
      aria-label={t("emailAction")}
      className={buttonVariants({ variant: "inverse" })}
    >
      {t("emailAction")}
    </a>
  );
}