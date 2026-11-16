import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ShieldCheck, FileText, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import { AdminMfaGate } from "@/features/identity/admin-mfa-gate";
import { ReconcilePaymentForm } from "@/features/jobs/payment-forms";
import { getAdminPaymentConsoleData } from "@/server/dal/admin-payments";
import { getPlatformAdminMfaStatus } from "@/server/dal/user";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type AdminPaymentsPageProps = {
  params: Promise<{ locale: string }>;
};

type AdminPaymentsCopy = Awaited<ReturnType<typeof getTranslations<"AdminPayments">>>;

function formatMinorAmount(minor: number | null, currency: string | null, locale: string): string {
  if (minor === null || currency === null) return "—";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function formatDate(dateString: string | null, locale: string): string {
  if (!dateString) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(dateString));
}

function StatusBadge({ status, copy }: { status: string; copy: AdminPaymentsCopy }) {
  const statusMap: Record<string, { label: string; className: string }> = {
    awaiting_transfer: { label: copy("orderStatus.awaitingTransfer"), className: "status-awaiting" },
    payment_submitted: { label: copy("orderStatus.paymentSubmitted"), className: "status-submitted" },
    payment_under_review: { label: copy("orderStatus.paymentUnderReview"), className: "status-under-review" },
    paid: { label: copy("orderStatus.paid"), className: "status-paid" },
    rejected: { label: copy("orderStatus.rejected"), className: "status-rejected" },
    expired: { label: copy("orderStatus.expired"), className: "status-expired" },
    cancelled: { label: copy("orderStatus.cancelled"), className: "status-cancelled" },
    refund_pending: { label: copy("orderStatus.refundPending"), className: "status-refund-pending" },
    refunded: { label: copy("orderStatus.refunded"), className: "status-refunded" },
    submitted: { label: copy("submissionStatus.submitted"), className: "status-submitted" },
    under_review: { label: copy("submissionStatus.underReview"), className: "status-under-review" },
    accepted: { label: copy("submissionStatus.accepted"), className: "status-accepted" },
    needs_more_info: { label: copy("submissionStatus.needsMoreInfo"), className: "status-needs-more" },
  };
  const config = statusMap[status] ?? { label: status, className: "status-unknown" };
  return <span className={`admin-status-badge ${config.className}`}>{config.label}</span>;
}

function DecisionBadge({ decision, copy }: { decision: string | null; copy: AdminPaymentsCopy }) {
  if (!decision) return <span className="admin-status-badge status-unknown">—</span>;
  const decisionMap: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    accepted: { label: copy("decision.accepted"), className: "status-accepted", icon: <CheckCircle size={12} aria-hidden="true" /> },
    rejected: { label: copy("decision.rejected"), className: "status-rejected", icon: <XCircle size={12} aria-hidden="true" /> },
    needs_more_info: { label: copy("decision.needsMoreInfo"), className: "status-needs-more", icon: <HelpCircle size={12} aria-hidden="true" /> },
  };
  const config = decisionMap[decision] ?? { label: decision, className: "status-unknown", icon: null };
  return (
    <span className={`admin-status-badge ${config.className}`}>
      {config.icon} {config.label}
    </span>
  );
}

export default async function AdminPaymentsPage({
  params,
}: AdminPaymentsPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = routing.locales.find(
    (supportedLocale) => supportedLocale === requestedLocale,
  );
  if (!locale) notFound();

  setRequestLocale(locale);
  const mfa = await getPlatformAdminMfaStatus();
  const [copy, contentCopy] = await Promise.all([
    getTranslations("AdminPayments"),
    getTranslations("AdminContent"),
  ]);

  if (!mfa.aal2) {
    return (
      <main className="admin-payments-page page-container">
        <AdminMfaGate verifiedFactorId={mfa.verifiedTotpFactorId} />
      </main>
    );
  }

  const { orders } = await getAdminPaymentConsoleData();

  return (
    <main className="admin-payments-page page-container">
      <header className="admin-payments-heading">
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
          <Link href="/admin/payment-instructions">{copy("instructionsLink")}</Link>
          <Link href="/admin/content">{contentCopy("title")}</Link>
        </div>
      </header>

      <section className="admin-payments-section" aria-labelledby="payments-title">
        <header className="admin-payments-section-heading">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-rule" />
              {copy("ordersEyebrow")}
            </p>
            <h2 id="payments-title">{copy("ordersTitle")}</h2>
            <p>{copy("ordersDescription")}</p>
          </div>
          <span className="admin-count">{orders.length}</span>
        </header>

        {orders.length ? (
          <div className="admin-orders-table-container">
            <table className="admin-orders-table">
              <thead>
                <tr>
                  <th scope="col">{copy("table.referenceCode")}</th>
                  <th scope="col">{copy("table.company")}</th>
                  <th scope="col">{copy("table.package")}</th>
                  <th scope="col">{copy("table.amount")}</th>
                  <th scope="col">{copy("table.orderStatus")}</th>
                  <th scope="col">{copy("table.submission")}</th>
                  <th scope="col">{copy("table.submissionStatus")}</th>
                  <th scope="col">{copy("table.reconciliation")}</th>
                  <th scope="col">{copy("table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="admin-order-row">
                    <td className="admin-order-reference">
                      <code>{order.reference_code}</code>
                    </td>
                    <td>
                      <div>
                        <span className="admin-company-name">{order.company_name}</span>
                        <span className="admin-company-slug">@{order.company_slug}</span>
                      </div>
                    </td>
                    <td>
                      <span>{order.package_name}</span>
                      <span className="admin-package-code">({order.package_code})</span>
                    </td>
                    <td>{formatMinorAmount(order.total_minor, order.currency, locale)}</td>
                    <td><StatusBadge status={order.status} copy={copy} /></td>
                    <td>
                      {order.submission_transfer_reference ? (
                        <code>{order.submission_transfer_reference}</code>
                      ) : (
                        <span className="admin-empty">—</span>
                      )}
                    </td>
                    <td>
                      {order.submission_status ? (
                        <StatusBadge status={order.submission_status} copy={copy} />
                      ) : (
                        <span className="admin-empty">—</span>
                      )}
                    </td>
                    <td>
                      {order.reconciliation_decision ? (
                        <DecisionBadge decision={order.reconciliation_decision} copy={copy} />
                      ) : (
                        <span className="admin-empty">—</span>
                      )}
                    </td>
                    <td>
                      {order.submission_id && order.submission_status === "submitted" && !order.reconciliation_decision ? (
                        <ReconcilePaymentForm
                          submissionId={order.submission_id}
                          orderReference={order.reference_code}
                          companyName={order.company_name}
                          amount={formatMinorAmount(order.total_minor, order.currency, locale)}
                          transferReference={order.submission_transfer_reference ?? ""}
                          senderName={order.submission_sender_name ?? ""}
                          receiptPath={order.submission_receipt_path}
                        />
                      ) : order.reconciliation_decision ? (
                        <span className="admin-reconciled-note">
                          {copy("reconciledBy")} {order.reviewed_by_name ?? "—"}
                          <br />
                          <time dateTime={order.reconciliation_reviewed_at ?? ""}>
                            {formatDate(order.reconciliation_reviewed_at, locale)}
                          </time>
                        </span>
                      ) : (
                        <span className="admin-empty">{copy("noActionAvailable")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="admin-package-empty" role="status">
            <FileText size={19} aria-hidden="true" />
            {copy("emptyOrders")}
          </p>
        )}
      </section>
    </main>
  );
}