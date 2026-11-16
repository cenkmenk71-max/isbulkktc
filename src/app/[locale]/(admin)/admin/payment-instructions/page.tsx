import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import { PaymentInstructionForm, PaymentInstructionList } from "@/features/jobs/payment-instruction-forms";
import { getAdminPaymentInstructionVersions } from "@/server/dal/admin-payments";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminPaymentInstructionsPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminPaymentInstructionsPage({
  params,
}: AdminPaymentInstructionsPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const mfa = await getPlatformAdminMfaStatus();
  const copy = await getTranslations("AdminPaymentInstructions");

  if (!mfa.aal2) {
    return (
      <main className="admin-payment-instructions-page page-container">
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  const instructions = await getAdminPaymentInstructionVersions();

  return (
    <main className="admin-payment-instructions-page page-container">
      <header className="admin-payment-instructions-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <div className="admin-packages-links">
          <span>
            <ShieldCheck size={15} aria-hidden="true" /> {copy("mfaVerified")}
          </span>
          <Link href="/admin/packages">{copy("packagesLink")}</Link>
          <Link href="/admin/payments">{copy("paymentsLink")}</Link>
        </div>
      </header>

      <section className="admin-payment-instructions-section" aria-labelledby="instructions-title">
        <header className="admin-payment-instructions-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("listEyebrow")}
            </p>
            <h2 id="instructions-title">{copy("listTitle")}</h2>
            <p>{copy("listDescription")}</p>
          </div>
          <span className="admin-count">{instructions.length}</span>
        </header>

        <PaymentInstructionForm />
        <PaymentInstructionList instructions={instructions} />
      </section>
    </main>
  );
}