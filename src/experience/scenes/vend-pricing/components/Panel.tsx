import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Ref } from "react";
import { accentInk } from "@/components/packages/package-tiers";
import type { AppLocale } from "@/i18n/routing";
import type { ListingDuration, Plan } from "../lib/plans";

type Props = {
  plan: Plan;
  locale: AppLocale;
  packageContentsLabel: string;
  durationLabel: string;
  durationGroupLabel: string;
  durationOptions: { days: ListingDuration; label: string }[];
  priceSummary: string;
  customPriceLabel: string;
  contactTitle: string;
  contactInstructions: string;
  inquirySubject: string;
  inquiryBody: string;
  contactLabels: {
    whatsapp: string;
    email: string;
    instagram: string;
    instagramNote: string;
  };
  whatsappUrl: string;
  supportEmail: string;
  instagramUrl: string | null;
  selectedDuration: ListingDuration;
  onDurationChange: (duration: ListingDuration) => void;
  ctaTitle: string;
  ctaLabel: string;
  backLabel: string;
  quiet: boolean;
  onClose: () => void;
  heading: Ref<HTMLHeadingElement>;
};

export function Panel({
  plan,
  locale,
  packageContentsLabel,
  durationLabel,
  durationGroupLabel,
  durationOptions,
  priceSummary,
  customPriceLabel,
  contactTitle,
  contactInstructions,
  inquirySubject,
  inquiryBody,
  contactLabels,
  whatsappUrl,
  supportEmail,
  instagramUrl,
  selectedDuration,
  onDurationChange,
  ctaTitle,
  ctaLabel,
  backLabel,
  quiet,
  onClose,
  heading,
}: Props) {
  const selectedPrice = plan.prices?.[selectedDuration];
  const formattedPrice =
    selectedPrice === undefined
      ? customPriceLabel
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "TRY",
          maximumFractionDigits: 0,
        }).format(selectedPrice);
  const messageBody = inquiryBody
    .replaceAll("%PACKAGE%", plan.name)
    .replaceAll("%DAYS%", new Intl.NumberFormat(locale).format(selectedDuration))
    .replaceAll("%PRICE%", formattedPrice);
  const whatsappHref = `${whatsappUrl}?text=${encodeURIComponent(messageBody)}`;
  const emailHref = `mailto:${supportEmail}?subject=${encodeURIComponent(inquirySubject)}&body=${encodeURIComponent(messageBody)}`;

  return (
    <aside
      aria-hidden={quiet || undefined}
      aria-label={plan.name}
      className="vend-panel"
    >
      <p className="vend-panel-audience" style={{ color: accentInk(plan.color) }}>
        {plan.audience}
      </p>
      <h2 ref={heading} tabIndex={-1} className="vend-panel-title">
        {plan.name}
      </h2>
      <p className="vend-panel-summary">{plan.blurb}</p>

      <div className="vend-panel-scope">
        <p>{packageContentsLabel}</p>
        <ul>
          {plan.features.map((feature, index) => (
            <li key={feature}>
              <span aria-hidden="true">
                {new Intl.NumberFormat(locale, {
                  minimumIntegerDigits: 2,
                  useGrouping: false,
                }).format(index + 1)}
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <section className="vend-panel-pricing" aria-label={durationLabel}>
        <p>{durationLabel}</p>
        <div className="vend-panel-duration" role="group" aria-label={durationGroupLabel}>
          {durationOptions.map((option) => (
            <button
              aria-pressed={selectedDuration === option.days}
              key={option.days}
              onClick={() => onDurationChange(option.days)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="vend-panel-price" aria-live="polite">
          {selectedPrice === undefined ? (
            <span data-testid="vend-panel-price-custom">{customPriceLabel}</span>
          ) : (
            <>
              <strong data-testid="vend-panel-price-amount">
                ₺{new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(selectedPrice)}
              </strong>
              <span>{priceSummary}</span>
            </>
          )}
        </p>
      </section>

      <div className="vend-panel-action">
        <p>{contactTitle}</p>
        <p className="vend-panel-contact-instructions">{contactInstructions}</p>
        <div className="vend-panel-contact-actions">
          <a
            className="vend-panel-link vend-panel-whatsapp"
            href={whatsappHref}
            rel="noopener noreferrer"
            target="_blank"
          >
            {contactLabels.whatsapp}
          </a>
          <a className="vend-panel-link vend-panel-email" href={emailHref}>
            {contactLabels.email}
          </a>
          {instagramUrl ? (
            <a
              className="vend-panel-link vend-panel-instagram"
              href={instagramUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              {contactLabels.instagram}
            </a>
          ) : null}
        </div>
        {instagramUrl ? (
          <p className="vend-panel-contact-note">
            {contactLabels.instagramNote}
          </p>
        ) : null}
        {plan.prices ? (
          <>
            <p>{ctaTitle}</p>
            <Link
              className="vend-panel-link"
              href={{ pathname: "/register", query: { audience: "employer" } }}
            >
              {ctaLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </>
        ) : null}
      </div>
      <button
        className="vend-panel-back"
        onClick={onClose}
        type="button"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        {backLabel}
      </button>
    </aside>
  );
}
