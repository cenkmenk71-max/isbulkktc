import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { PackagesInteractiveShowcase } from "@/components/packages/packages-interactive-showcase";
import { SalesLeadForm } from "@/features/sales/sales-lead-form";
import { packageTierColors } from "@/components/packages/package-tiers";
import type { ListingDuration } from "@/experience/scenes/vend-pricing/lib/plans";

const packageTiers = [
  {
    id: "singleListing",
    color: packageTierColors.singleListing,
    listingCount: 1,
    prices: { 1: 290, 7: 690, 30: 1290 },
  },
  {
    id: "growth",
    color: packageTierColors.growth,
    listingCount: 3,
    prices: { 1: 590, 7: 1390, 30: 2790 },
  },
  {
    id: "professional",
    color: packageTierColors.professional,
    listingCount: 5,
    prices: { 1: 890, 7: 2090, 30: 3990 },
  },
  {
    id: "enterprise",
    color: packageTierColors.enterprise,
    listingCount: null,
    prices: null,
  },
] as const;

const packageTerms = {
  singleListing: ["oneListing", "durationOptions", "onePosition"],
  growth: ["threeListings", "durationOptions", "multiplePositions"],
  professional: ["fiveListings", "durationOptions", "regularHiring"],
  enterprise: ["finiteScope", "durationOptions", "writtenOffer"],
} as const;

const durations = [1, 7, 30] as const satisfies readonly ListingDuration[];
const durationLabelKeys = {
  1: "oneDay",
  7: "sevenDays",
  30: "thirtyDays",
} as const;

export async function PackagesExperience({ locale }: { locale: AppLocale }) {
  const copy = await getTranslations({ locale, namespace: "PackagesPage" });
  const leadCopy = await getTranslations({ locale, namespace: "SalesLeadForm" });
  const profiles = packageTiers.map((tier) => ({
    ...tier,
    title: copy(`showcase.cards.${tier.id}.title`),
    audience: copy(`showcase.cards.${tier.id}.audience`),
    summary: copy(`showcase.cards.${tier.id}.summary`),
    terms: packageTerms[tier.id].map((term) =>
      copy(`showcase.terms.${term}`),
    ),
  }));
  const getDurationLabel = (days: ListingDuration) =>
    copy(`showcase.pricing.${durationLabelKeys[days]}`);
  const durationOptions = durations.map((days) => ({
    days,
    label: getDurationLabel(days),
  }));

  return (
    <div className="packages-page">
      <section className="packages-hero" aria-labelledby="packages-title">
        <Image
          src="/images/packages-hero.webp"
          alt=""
          fill
          preload
          sizes="100vw"
          quality={85}
          className="packages-hero-image"
        />
        <div className="packages-hero-grain" aria-hidden="true" />
        <div className="page-container packages-hero-layout">
          <div className="packages-hero-copy">
            <p className="eyebrow eyebrow-light">
              <span className="eyebrow-rule" />
              {copy("eyebrow")}
            </p>
            <h1 id="packages-title">{copy("title")}</h1>
            <p className="packages-hero-description">{copy("description")}</p>
            <Link className="packages-hero-link" href="#packages-current">
              {copy("heroLink")}
              <ArrowDown size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="packages-hero-bottom" aria-hidden="true">
          <span>İşBul KKTC</span>
          <span>{copy("catalog.eyebrow")}</span>
          <span>{copy("locationLine")}</span>
        </div>
      </section>

      <section className="packages-vend-section" id="packages-current">
        <div className="packages-vend-page package-catalog">
          <header className="package-catalog-heading">
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("showcase.eyebrow")}
            </p>
            <h2 id="package-proposal-title">{copy("showcase.title")}</h2>
            <p>{copy("showcase.instruction")}</p>
          </header>

          <ul className="package-catalog-grid">
            {profiles.map((profile) => (
              <li key={profile.id}>
                <article className="package-catalog-card">
                  <p className="package-catalog-code">{profile.audience}</p>
                  <h3>{profile.title}</h3>
                  <p className="package-catalog-description">
                    {profile.summary}
                  </p>
                  <ul className="package-proposal-terms">
                    {profile.terms.map((term) => (
                      <li key={term}>{term}</li>
                    ))}
                  </ul>
                  {profile.prices ? (
                    <dl className="package-proposal-prices">
                      {durations.map((days) => (
                        <div key={days}>
                          <dt>{getDurationLabel(days)}</dt>
                          <dd>
                            {new Intl.NumberFormat(locale, {
                              style: "currency",
                              currency: "TRY",
                              maximumFractionDigits: 0,
                            }).format(profile.prices[days])}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="package-proposal-custom-price">
                      {copy("showcase.pricing.customPrice")}
                    </p>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="packages-vend-section" aria-label={copy("showcase.title")}>
        <div className="packages-vend-page">
          <PackagesInteractiveShowcase
            profiles={profiles.map((profile) => ({
              ...profile,
              id: profile.id,
              listingCount: profile.listingCount,
              prices: profile.prices,
            }))}
            title={copy("showcase.title")}
            instruction={copy("showcase.instruction")}
            brand={copy("showcase.brand")}
            labelCopy={{
              locale,
              package: copy("showcase.scene.package"),
              selectPackage: copy("showcase.selectPackage"),
              viewScope: copy("showcase.scene.viewScope"),
              insertCoin: copy("showcase.scene.insertCoin"),
              careerHub: copy("showcase.scene.careerHub"),
              region: copy("showcase.scene.region"),
              listing: copy("showcase.scene.listing"),
              quote: copy("showcase.scene.quote"),
            }}
            selectLabel={copy("showcase.selectPackage")}
            packageContentsLabel={copy("showcase.packageContents")}
            durationLabel={copy("showcase.pricing.durationLabel")}
            durationGroupLabel={copy("showcase.pricing.durationGroup")}
            durationOptions={durationOptions}
            priceSummary={copy("showcase.pricing.priceSummary")}
            customPriceLabel={copy("showcase.pricing.customPrice")}
            quoteAction={copy("showcase.pricing.quoteAction")}
            quoteTitle={copy("showcase.pricing.quoteTitle")}
            quoteInstructions={copy("showcase.pricing.quoteInstructions")}
            quoteUnavailable={copy("showcase.pricing.quoteUnavailable")}
            quoteEmailSubject={copy("showcase.pricing.quoteEmailSubject")}
            quoteEmailBody={copy("showcase.pricing.quoteEmailBody")}
            salesContactEmail={process.env.SALES_CONTACT_EMAIL ?? ""}
            fallbackMessage={copy("showcase.sceneFallback")}
            ctaTitle={copy("showcase.ctaTitle")}
            ctaLabel={copy("showcase.ctaAction")}
            backLabel={copy("showcase.back")}
            soundLabels={{
              button: copy("showcase.sound.button"),
              effects: copy("showcase.sound.effects"),
              rain: copy("showcase.sound.rain"),
              off: copy("showcase.sound.off"),
            }}
          />
        </div>
      </section>

      <section className="packages-lead-section" aria-labelledby="packages-lead-title">
        <div className="page-container packages-lead-layout">
          <div className="packages-lead-copy">
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {leadCopy("eyebrow")}
            </p>
            <h2 id="packages-lead-title">{leadCopy("title")}</h2>
            <p>{leadCopy("description")}</p>
          </div>
          <SalesLeadForm />
        </div>
      </section>
    </div>
  );
}
