import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, CreditCard, Clock, AlertCircle, Info } from "lucide-react";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { getPublicJobPackages } from "@/server/dal/billing";
import { routing } from "@/i18n/routing";
import { getLocalePrefix } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { createOrderAction } from "@/features/billing/actions";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type OrderNewPageProps = {
  params: Promise<{ locale: string; company: string }>;
};

export default async function OrderNewPage({ params }: OrderNewPageProps) {
  const { locale: requestedLocale, company: companyId } = await params;
  const locale = routing.locales.find((l) => l === requestedLocale);
  if (!locale) notFound();

  setRequestLocale(locale);
  const [{ company }, packages, copy] = await Promise.all([
    getEmployerWorkspace(companyId),
    getPublicJobPackages(),
    getTranslations({ locale, namespace: "CompanyOrders" }),
  ]);

  if (company.verification_status !== "verified") {
    redirect(`${getLocalePrefix(locale)}/company/dashboard?company=${encodeURIComponent(company.id)}`);
  }

  const activePackages = packages.filter((p) => p.is_active);
  const localePrefix = getLocalePrefix(locale);

  return (
    <main className="company-management page-container">
      <header className="company-management-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("orders.new.eyebrow")}
        </p>
        <div className="company-management-heading-row">
          <div>
            <Link className="button button-ghost" href={`${localePrefix}/company/dashboard?company=${encodeURIComponent(company.id)}`}>
              <ArrowLeft size={16} aria-hidden="true" />
              {copy("orders.new.backToDashboard")}
            </Link>
            <h1>{copy("orders.new.title")}</h1>
            <p>{copy("orders.new.description", { company: company.name })}</p>
          </div>
        </div>
      </header>

      <nav aria-label={copy("orders.new.stepsLabel")} className="order-steps">
        <ol>
          <li aria-current="step">
            <span className="order-step-number">1</span>
            <span>{copy("orders.new.stepPackage")}</span>
          </li>
          <li>
            <span className="order-step-number">2</span>
            <span>{copy("orders.new.stepConfirm")}</span>
          </li>
          <li>
            <span className="order-step-number">3</span>
            <span>{copy("orders.new.stepPayment")}</span>
          </li>
        </ol>
      </nav>

      <section aria-labelledby="package-selection-title" className="order-section">
        <header>
          <h2 id="package-selection-title">{copy("orders.new.packageSelectionTitle")}</h2>
          <p>{copy("orders.new.packageSelectionDescription")}</p>
        </header>

        <ul className="order-package-grid" role="list">
          {activePackages.map((pkg) => (
            <li key={pkg.id}>
              <article className="order-package-card">
                <header>
                  <h3>{pkg.display_name}</h3>
                  <p className="order-package-code">{pkg.code}</p>
                </header>
                <dl className="order-package-details">
                  <div>
                    <dt>{copy("orders.new.jobCredits")}</dt>
                    <dd><strong>{pkg.job_credits}</strong> {copy("orders.new.creditUnit")}</dd>
                  </div>
                  <div>
                    <dt>{copy("orders.new.maxActiveJobs")}</dt>
                    <dd><strong>{pkg.max_active_jobs}</strong> {copy("orders.new.jobUnit")}</dd>
                  </div>
                  <div>
                    <dt>{copy("orders.new.jobDuration")}</dt>
                    <dd><strong>{pkg.job_duration_days}</strong> {copy("orders.new.dayUnit")}</dd>
                  </div>
                  <div>
                    <dt>{copy("orders.new.price")}</dt>
                    <dd>
                      {new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency: pkg.currency,
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }).format(pkg.price_minor / 100)}
                    </dd>
                  </div>
                </dl>
                <form action={createOrderAction} className="order-package-form">
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="packageId" value={pkg.id} />
                  <button type="submit" className="button button-primary">
                    <CreditCard size={16} aria-hidden="true" />
                    {copy("orders.new.selectPackage")}
                  </button>
                </form>
              </article>
            </li>
          ))}
        </ul>

        {activePackages.length === 0 && (
          <div className="order-empty" role="status">
            <Info size={32} aria-hidden="true" />
            <p>{copy("orders.new.noPackages")}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="payment-info-title" className="order-section order-info-section">
        <header>
          <h2 id="payment-info-title">{copy("orders.new.paymentInfoTitle")}</h2>
        </header>
        <div className="order-info-grid">
          <article className="order-info-card">
            <div className="order-info-icon">
              <Clock size={24} aria-hidden="true" />
            </div>
            <div>
              <h3>{copy("orders.new.paymentDeadlineTitle")}</h3>
              <p>{copy("orders.new.paymentDeadlineDescription")}</p>
            </div>
          </article>
          <article className="order-info-card">
            <div className="order-info-icon">
              <AlertCircle size={24} aria-hidden="true" />
            </div>
            <div>
              <h3>{copy("orders.new.maskedIbanTitle")}</h3>
              <p>{copy("orders.new.maskedIbanDescription")}</p>
            </div>
          </article>
          <article className="order-info-card">
            <div className="order-info-icon">
              <Info size={24} aria-hidden="true" />
            </div>
            <div>
              <h3>{copy("orders.new.receiptTitle")}</h3>
              <p>{copy("orders.new.receiptDescription")}</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}