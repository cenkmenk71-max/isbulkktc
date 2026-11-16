import Image from "next/image";
import { ArrowDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { PackagesInteractiveShowcase } from "@/components/packages/packages-interactive-showcase";
import { SalesLeadForm } from "@/features/sales/sales-lead-form";
import { packageTierColors, packageTierPlanCodes } from "@/components/packages/package-tiers";
import type { PublicJobPackage } from "@/server/dal/billing";
import type { PackageProfile } from "@/components/packages/packages-interactive-showcase";

const packageTerms = {
  singleListing: ["oneListing", "durationOptions", "onePosition"],
  growth: ["threeListings", "durationOptions", "multiplePositions"],
  professional: ["fiveListings", "durationOptions", "regularHiring"],
  enterprise: ["finiteScope", "durationOptions", "writtenOffer"],
} as const;

const durations = [1, 7, 30] as const;

type PackageTierId = keyof typeof packageTierPlanCodes;

function getTierFromPackage(pkg: PublicJobPackage): PackageTierId | null {
  const code = pkg.code;
  const tierEntry = Object.entries(packageTierPlanCodes).find(([, planCode]) => planCode === code);
  return tierEntry ? (tierEntry[0] as PackageTierId) : null;
}

function getTierDefaults(tierId: PackageTierId) {
  const defaults: Record<PackageTierId, { listingCount: number | null; prices: Record<number, number> | null }> = {
    singleListing: { listingCount: 1, prices: { 1: 290, 7: 690, 30: 1290 } },
    growth: { listingCount: 3, prices: { 1: 590, 7: 1390, 30: 2790 } },
    professional: { listingCount: 5, prices: { 1: 890, 7: 2090, 30: 3990 } },
    enterprise: { listingCount: null, prices: null },
  };
  return defaults[tierId] ?? { listingCount: null, prices: null };
}

function mapPackageToTierProfile(pkg: PublicJobPackage): PackageProfile | null {
  const tierId = getTierFromPackage(pkg);
  if (!tierId) return null;
  const defaults = getTierDefaults(tierId);
  const prices: Record<1 | 7 | 30, number> | null = pkg.price_minor > 0
    ? { 1: pkg.price_minor, 7: pkg.price_minor, 30: pkg.price_minor }
    : defaults.prices as Record<1 | 7 | 30, number> | null;
  return {
    id: tierId,
    color: packageTierColors[tierId],
    listingCount: pkg.job_credits ?? defaults.listingCount,
    prices,
    title: pkg.display_name,
    audience: pkg.description || "",
    summary: pkg.description || "",
    terms: [...packageTerms[tierId]],
  };
}

export async function PackagesExperience({
  locale,
  packages,
}: {
  locale: AppLocale;
  packages: PublicJobPackage[];
}) {
  const copy = await getTranslations({ locale, namespace: "PackagesPage" });
  const leadCopy = await getTranslations({ locale, namespace: "SalesLeadForm" });

  const activePackages = packages.filter((p) => p.is_active);

  const profiles = activePackages.map((pkg) => {
    const tierId = getTierFromPackage(pkg);
    const defaults = tierId ? getTierDefaults(tierId) : { listingCount: null, prices: null };
    const tierColor = tierId ? packageTierColors[tierId] : packageTierColors.singleListing;

    const prices: Record<number, number> | null = pkg.price_minor > 0
      ? { 1: pkg.price_minor, 7: pkg.price_minor, 30: pkg.price_minor }
      : defaults.prices;

    return {
      id: pkg.code,
      code: pkg.code,
      color: tierColor,
      listingCount: pkg.job_credits ?? defaults.listingCount,
      prices,
      title: pkg.display_name,
      audience: pkg.description || copy(`showcase.cards.${tierId ?? "singleListing"}.audience`),
      summary: pkg.description || copy(`showcase.cards.${tierId ?? "singleListing"}.summary`),
      terms: tierId
        ? [...packageTerms[tierId]].map((term) => copy(`showcase.terms.${term}`))
        : [...packageTerms.singleListing].map((term) => copy(`showcase.terms.${term}`)),
    };
  });

  const interactiveProfiles = activePackages
    .map(mapPackageToTierProfile)
    .filter((p): p is PackageProfile => p !== null);

  const getDurationLabel = (days: number) =>
    copy(`showcase.pricing.${durations.includes(days as 1 | 7 | 30) ? (days === 1 ? "oneDay" : days === 7 ? "sevenDays" : "thirtyDays") : "oneDay"}`);
  const durationOptions = durations.map((days) => ({
    days: days as 1 | 7 | 30,
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
            {profiles.map((profile) => {
              const prices = profile.prices;
              return (
                <li key={profile.id}>
                  <article className="package-catalog-card" data-reveal data-tilt>
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
                    {prices ? (
                      <dl className="package-proposal-prices">
                        {durations.map((days) => (
                          <div key={days}>
                            <dt>{getDurationLabel(days)}</dt>
                            <dd>
                              {new Intl.NumberFormat(locale, {
                                style: "currency",
                                currency: "TRY",
                                maximumFractionDigits: 0,
                              }).format(prices[days] / 100)}
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
              );
            })}
          </ul>
        </div>
      </section>

      <section className="packages-vend-section" aria-label={copy("showcase.title")}>
        <div className="packages-vend-page">
          <PackagesInteractiveShowcase
            profiles={interactiveProfiles}
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