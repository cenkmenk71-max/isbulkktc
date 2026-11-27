import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import { OutreachComposer } from "@/features/admin/outreach-composer";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { AdminConsoleNav } from "@/components/admin/admin-console-nav";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminOutreachPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminOutreachPage({
  params,
}: AdminOutreachPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const mfa = await getPlatformAdminMfaStatus();
  const [copy] = await Promise.all([getTranslations("AdminOutreach")]);

  if (!mfa.aal2) {
    return (
      <main className="admin-outreach-page page-container">
        <AdminConsoleNav />
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  const hasResendKey = Boolean(process.env.RESEND_API_KEY);
  const hasFromEmail = Boolean(process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL);

  return (
    <main className="admin-outreach-page page-container">
      <AdminConsoleNav />
      <header className="admin-packages-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
      </header>

      <section className="admin-outreach-status-section" aria-labelledby="resend-status-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("resendStatusEyebrow")}
            </p>
            <h2 id="resend-status-title">{copy("resendStatusTitle")}</h2>
            <p>{copy("resendStatusDescription")}</p>
          </div>
        </header>

        <div className="admin-outreach-status-card">
          {hasResendKey && hasFromEmail ? (
            <div className="status-ready">
              <CheckCircle size={24} aria-hidden="true" className="status-icon ready" />
              <div className="status-content">
                <h3>{copy("readyTitle")}</h3>
                <p>{copy("readyDescription")}</p>
              </div>
            </div>
          ) : (
            <div className="status-warning">
              <AlertTriangle size={24} aria-hidden="true" className="status-icon warning" />
              <div className="status-content">
                <h3>{copy("notConfiguredTitle")}</h3>
                <p>{copy("notConfiguredDescription")}</p>
                <ul className="missing-vars">
                  {!hasResendKey && (
                    <li><code>RESEND_API_KEY</code> {copy("missingResendKey")}</li>
                  )}
                  {!hasFromEmail && (
                    <li><code>EMAIL_FROM</code> / <code>RESEND_FROM_EMAIL</code> {copy("missingFromEmail")}</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="admin-outreach-composer-section" aria-labelledby="composer-title">
        <header className="admin-packages-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("composerEyebrow")}
            </p>
            <h2 id="composer-title">{copy("composerTitle")}</h2>
            <p>{copy("composerDescription")}</p>
          </div>
        </header>
        <OutreachComposer />
      </section>
    </main>
  );
}