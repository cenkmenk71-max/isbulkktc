import type { AppLocale } from "@/i18n/routing";
import {
  faqByLocale,
  faqSectionByLocale,
  type FaqEntry,
} from "@/content/ai-visibility/faq";

/**
 * Server-rendered FAQ block. The same questions and answers are emitted as
 * `FAQPage` JSON-LD beside it, so the visible text and the structured data can
 * never disagree. Reuses the About page's section and card classes, so it needs
 * no new CSS and inherits the responsive and contrast behaviour already gated.
 *
 * `entries` lets the About route pass the administrator-managed catalogue; when
 * it is omitted the bundled catalogue is rendered, so the block is never empty.
 */
export function FaqSection({
  locale,
  entries,
}: {
  locale: AppLocale;
  entries?: readonly FaqEntry[];
}) {
  const heading = faqSectionByLocale[locale];
  const resolvedEntries = entries ?? faqByLocale[locale];

  return (
    <>
      <section className="editorial-intro" aria-labelledby="about-faq-title">
        <div className="editorial-section-index">
          <span>02</span>
          <span>{heading.kicker}</span>
        </div>
        <div className="editorial-intro-copy">
          <h2 id="about-faq-title">{heading.title}</h2>
          <p>{heading.lead}</p>
        </div>
      </section>

      <section className="about-values" aria-label={heading.title}>
        {resolvedEntries.map((entry) => (
          <article className="about-value-card" key={entry.question}>
            <h3>{entry.question}</h3>
            <p>{entry.answer}</p>
          </article>
        ))}
      </section>
    </>
  );
}
