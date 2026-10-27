import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Ref } from "react";
import type { ListingDuration, Plan } from "../lib/plans";

type Props = {
  plan: Plan;
  packageStatus: string;
  packageContentsLabel: string;
  durationLabel: string;
  durationGroupLabel: string;
  durationOptions: { days: ListingDuration; label: string }[];
  priceSummary: string;
  customPriceLabel: string;
  priceDisclaimer: string;
  quoteAction: string;
  quoteTitle: string;
  quoteInstructions: string;
  quoteUnavailable: string;
  quoteEmailSubject: string;
  quoteEmailBody: string;
  salesContactEmail: string;
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
  packageStatus,
  packageContentsLabel,
  durationLabel,
  durationGroupLabel,
  durationOptions,
  priceSummary,
  customPriceLabel,
  priceDisclaimer,
  quoteAction,
  quoteTitle,
  quoteInstructions,
  quoteUnavailable,
  quoteEmailSubject,
  quoteEmailBody,
  salesContactEmail,
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
  const quoteBody = quoteEmailBody.replace("%DAYS%", String(selectedDuration));
  const quoteHref = salesContactEmail
    ? `mailto:${salesContactEmail}?subject=${encodeURIComponent(quoteEmailSubject)}&body=${encodeURIComponent(quoteBody)}`
    : null;

  return (
    <aside
      aria-hidden={quiet || undefined}
      aria-label={plan.name}
      className="vend-panel"
    >
      <p className="vend-panel-audience" style={{ color: plan.color }}>
        {plan.audience}
      </p>
      <h2 ref={heading} tabIndex={-1} className="vend-panel-title">
        {plan.name}
      </h2>
      <p className="vend-panel-summary">{plan.blurb}</p>
      <p className="vend-panel-status">{packageStatus}</p>

      <div className="vend-panel-scope">
        <p>{packageContentsLabel}</p>
        <ul>
          {plan.features.map((feature, index) => (
            <li key={feature}>
              <span aria-hidden="true">{`0${index + 1}`}</span>
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
                ₺{new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(selectedPrice)}
              </strong>
              <span>{priceSummary}</span>
            </>
          )}
        </p>
        <p className="vend-panel-price-disclaimer">{priceDisclaimer}</p>
      </section>

      <div className="vend-panel-action">
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
        ) : (
          <>
            <p>{quoteTitle}</p>
            {quoteHref ? (
              <>
                <p className="vend-panel-quote-instructions">{quoteInstructions}</p>
                <a className="vend-panel-link" href={quoteHref}>
                  {quoteAction}
                  <ArrowRight size={16} aria-hidden="true" />
                </a>
              </>
            ) : (
              <>
                <button className="vend-panel-link" disabled type="button">
                  {quoteAction}
                </button>
                <p className="vend-panel-quote-unavailable">{quoteUnavailable}</p>
              </>
            )}
          </>
        )}
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
