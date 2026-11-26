import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";
import { getPendingPayments } from "@/server/dal/admin-payments";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminPaymentsPendingPageProps = {
  params: Promise<{ locale: string }>;
};

export default async function AdminPaymentsPendingPage({
  params,
}: AdminPaymentsPendingPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const mfa = await getPlatformAdminMfaStatus();
  const copy = await getTranslations("AdminPayments");
  const payments = await getPendingPayments();

  if (!mfa.aal2) {
    return (
      <main className="admin-payments-page page-container">
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  return (
    <main className="admin-payments-page page-container">
      <header className="admin-payments-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("eyebrow")}
        </p>
        <h1>{copy("title")}</h1>
        <p>{copy("description")}</p>
        <div className="admin-payments-links">
          <Link href="/admin/packages">{copy("packagesLink")}</Link>
          <Link href="/admin/company-profiles">{copy("companyReviewsLink")}</Link>
          <Link href="/admin/jobs">{copy("jobsLink")}</Link>
          <Link href="/admin/content">{copy("contentLink")}</Link>
          <Link href="/admin/outreach">{copy("outreachLink")}</Link>
        </div>
      </header>

      <section className="admin-payments-section" aria-labelledby="pending-payments-title">
        <header className="admin-payments-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("pendingEyebrow")}
            </p>
            <h2 id="pending-payments-title">{copy("pendingTitle")}</h2>
            <p>{copy("pendingDescription")}</p>
          </div>
          <span className="admin-count">{payments.length}</span>
        </header>

        {payments.length ? (
          <div className="admin-payments-table-container">
            <table className="admin-payments-table" role="table">
              <thead>
                <tr>
                  <th scope="col">{copy("table.company")}</th>
                  <th scope="col">{copy("table.package")}</th>
                  <th scope="col">{copy("table.amount")}</th>
                  <th scope="col">{copy("table.requestedAt")}</th>
                  <th scope="col">{copy("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <div className="payment-company">
                        <strong>{payment.company_name}</strong>
                        <span className="payment-slug">{payment.company_slug}</span>
                      </div>
                    </td>
                    <td>
                      <div className="payment-package">
                        <strong>{payment.package_name}</strong>
                        <span className="payment-code">{payment.package_code}</span>
                      </div>
                    </td>
                    <td className="payment-amount">{payment.amount_display}</td>
                    <td className="payment-date">
                      {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(payment.requested_at),
                      )}
                    </td>
                    <td>
                      <form action={confirmPaymentAction} className="payment-confirm-form">
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="companyId" value={payment.company_id} />
                        <input type="hidden" name="packageId" value={payment.package_id} />
                        <button
                          className="button button-dark payment-confirm-button"
                          type="submit"
                        >
                          {copy("confirmButton")}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-payments-empty" role="status">
            {copy("emptyPayments")}
          </p>
        )}
      </section>
    </main>
  );
}

async function confirmPaymentAction(formData: FormData) {
  "use server";
  const { revalidatePath } = await import("next/cache");
  const { redirect } = await import("next/navigation");
  const { getCurrentUser } = await import("@/server/dal/user");
  const { hasPlatformRole } = await import("@/server/dal/jobs");
  const { createSupabaseServerClient } = await import("@/server/db/supabase-server");
  const { getLocalePrefix } = await import("@/i18n/routing");

  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    redirect("/login");
  }

  if (!(await hasPlatformRole("platform_admin"))) {
    return;
  }

  const paymentId = formData.get("paymentId") as string;
  const companyId = formData.get("companyId") as string;
  const packageId = formData.get("packageId") as string;

  if (!paymentId || !companyId || !packageId) {
    return;
  }

  const supabase = await createSupabaseServerClient();

  const { error: assignError } = await supabase.rpc("admin_assign_company_job_package", {
    _company_id: companyId,
    _package_id: packageId,
    _expires_at: null,
  });

  if (assignError) {
    console.error("Package assignment failed.", { code: assignError.code, paymentId });
    return;
  }

  const { error: deleteError } = await supabase
    .from("payment_confirmations")
    .delete()
    .eq("id", paymentId);

  if (deleteError) {
    console.error("Payment confirmation cleanup failed.", { code: deleteError.code, paymentId });
  }

  const { data: company } = await supabase
    .from("companies")
    .select("name, public_email")
    .eq("id", companyId)
    .maybeSingle();

  const { data: jobPackage } = await supabase
    .from("job_packages")
    .select("display_name, max_active_jobs")
    .eq("id", packageId)
    .maybeSingle();

  if (company?.public_email && jobPackage) {
    try {
      const { sendPackageActivatedEmail } = await import("@/server/email/mailer");
      await sendPackageActivatedEmail({
        to: company.public_email,
        locale: "tr",
        companyName: company.name,
        packageName: jobPackage.display_name,
        maxJobs: jobPackage.max_active_jobs,
        expiresAt: null,
      });
    } catch (mailError) {
      console.error("Package activation email failed.", { error: mailError });
    }
  }

revalidatePath(`${getLocalePrefix(user?.locale ?? "tr")}/admin/payments/pending`);
  revalidatePath(`${getLocalePrefix(user?.locale ?? "tr")}/admin/packages`);
}