import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, FileText, Upload, Eye, AlertCircle, CheckCircle, Clock, XCircle } from "lucide-react";
import { getEmployerWorkspace } from "@/server/dal/companies";
import { getCompanyOrders, getCompanyCreditAccount, getCompanyJobEntitlements } from "@/server/dal/billing";
import { routing } from "@/i18n/routing";
import { getLocalePrefix } from "@/i18n/routing";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = noIndexMetadata;

type OrdersPageProps = {
  params: Promise<{ locale: string; company: string }>;
  searchParams: Promise<{ created?: string; submitted?: string }>;
};

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function formatCurrency(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatDate(dateStr: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateStr));
}

function isOrderActionable(status: string) {
  return ["awaiting_transfer", "payment_submitted", "rejected"].includes(status);
}

function getStatusInfo(status: string, copy: Translator) {
  const statusMap: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    awaiting_transfer: { label: copy("orders.list.status.awaiting_transfer"), icon: <Clock size={14} aria-hidden="true" />, className: "status-awaiting" },
    payment_submitted: { label: copy("orders.list.status.payment_submitted"), icon: <Clock size={14} aria-hidden="true" />, className: "status-submitted" },
    payment_under_review: { label: copy("orders.list.status.payment_under_review"), icon: <Clock size={14} aria-hidden="true" />, className: "status-review" },
    paid: { label: copy("orders.list.status.paid"), icon: <CheckCircle size={14} aria-hidden="true" />, className: "status-paid" },
    rejected: { label: copy("orders.list.status.rejected"), icon: <XCircle size={14} aria-hidden="true" />, className: "status-rejected" },
    expired: { label: copy("orders.list.status.expired"), icon: <AlertCircle size={14} aria-hidden="true" />, className: "status-expired" },
    cancelled: { label: copy("orders.list.status.cancelled"), icon: <XCircle size={14} aria-hidden="true" />, className: "status-cancelled" },
    refund_pending: { label: copy("orders.list.status.refund_pending"), icon: <Clock size={14} aria-hidden="true" />, className: "status-refund" },
    refunded: { label: copy("orders.list.status.refunded"), icon: <CheckCircle size={14} aria-hidden="true" />, className: "status-refunded" },
  };
  return statusMap[status] || { label: status, icon: <FileText size={14} aria-hidden="true" />, className: "status-unknown" };
}

function OrderPaymentForm({
  order,
  locale,
  copy,
  companyId,
  canUploadReceipt,
}: {
  order: {
    id: string;
    status: string;
    total_minor: number;
    currency: string;
    reference_code: string;
    expires_at: string;
  };
  snapshot: { display_name?: string; price_minor?: number; currency?: string; job_credits?: number };
  locale: string;
  copy: Translator;
  companyId: string;
  canUploadReceipt: boolean;
}) {
  return (
    <form action={submitPaymentFormAction} className="order-payment-form" encType="multipart/form-data">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="amountMinor" value={order.total_minor.toString()} />
      <input type="hidden" name="currency" value={order.currency} />
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="locale" value={locale} />
      <div className="order-payment-form-fields">
        <div className="form-field">
          <label htmlFor={`senderName-${order.id}`}>{copy("orders.list.senderName")}</label>
          <input
            type="text"
            id={`senderName-${order.id}`}
            name="senderName"
            required
            maxLength={120}
            minLength={2}
            placeholder={copy("orders.list.senderNamePlaceholder")}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`transferReference-${order.id}`}>{copy("orders.list.transferReference")}</label>
          <input
            type="text"
            id={`transferReference-${order.id}`}
            name="transferReference"
            required
            maxLength={60}
            minLength={4}
            placeholder={copy("orders.list.transferReferencePlaceholder")}
          />
        </div>
        <div className="form-field">
          <label htmlFor={`transferredAt-${order.id}`}>{copy("orders.list.transferredAt")}</label>
          <input
            type="datetime-local"
            id={`transferredAt-${order.id}`}
            name="transferredAt"
            required
            max={new Date().toISOString().slice(0, 16)}
          />
        </div>
        {canUploadReceipt && (
          <div className="form-field">
            <label htmlFor={`receipt-${order.id}`}>{copy("orders.list.receipt")}</label>
            <input
              type="file"
              id={`receipt-${order.id}`}
              name="receipt"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-describedby={`receipt-hint-${order.id}`}
            />
            <p id={`receipt-hint-${order.id}`} className="form-hint">
              {copy("orders.list.receiptHint")}
            </p>
          </div>
        )}
      </div>
      <div className="order-payment-form-actions">
        <button type="submit" className="button button-primary" disabled={order.status !== "awaiting_transfer"}>
          <Upload size={16} aria-hidden="true" />
          {copy("orders.list.submitPayment")}
        </button>
        {order.status === "payment_submitted" && (
          <span className="order-submitted-badge">
            <Clock size={14} aria-hidden="true" />
            {copy("orders.list.paymentSubmitted")}
          </span>
        )}
      </div>
    </form>
  );
}

async function submitPaymentFormAction(formData: FormData) {
  "use server";
  const { uploadPaymentReceiptAction, submitPaymentAction } = await import("@/features/billing/actions");
  const { getLocalePrefix, routing } = await import("@/i18n/routing");

  const orderId = formData.get("orderId") as string;
  const companyId = formData.get("companyId") as string;
  const locale = formData.get("locale") as string;
  const validLocale = (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
  const localePrefix = getLocalePrefix(validLocale as "tr" | "en" | "ru" | "el" | "fa" | "de");
  const receiptFile = formData.get("receipt") as File | null;

  let receiptPath: string | null = null;
  if (receiptFile && receiptFile.size > 0) {
    const uploadResult = await uploadPaymentReceiptAction(receiptFile, orderId);
    if (uploadResult.error) {
      redirect(`${localePrefix}/company/dashboard/orders?company=${companyId}&error=upload_failed`);
    }
    receiptPath = uploadResult.path ?? null;
  }

  const paymentData = new FormData();
  paymentData.set("orderId", orderId);
  paymentData.set("senderName", formData.get("senderName") as string);
  paymentData.set("transferReference", formData.get("transferReference") as string);
  paymentData.set("amountMinor", formData.get("amountMinor") as string);
  paymentData.set("currency", formData.get("currency") as string);
  paymentData.set("transferredAt", formData.get("transferredAt") as string);
  if (receiptPath) paymentData.set("receiptStoragePath", receiptPath);

  await submitPaymentAction(paymentData);

  redirect(`${localePrefix}/company/dashboard/orders?company=${companyId}&submitted=1`);
}

export default async function OrdersPage({ params, searchParams }: OrdersPageProps) {
  const [{ locale: requestedLocale, company: companyId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const locale = routing.locales.find((l) => l === requestedLocale);
  if (!locale) notFound();

  setRequestLocale(locale);
  const [{ company }, orders, creditAccount, entitlements, copy] = await Promise.all([
    getEmployerWorkspace(companyId),
    getCompanyOrders(companyId),
    getCompanyCreditAccount(companyId),
    getCompanyJobEntitlements(companyId),
    getTranslations({ locale, namespace: "CompanyOrders" }),
  ]);

  const localePrefix = getLocalePrefix(locale);
  const showCreatedToast = query.created === "1";
  const showSubmittedToast = query.submitted === "1";

  return (
    <main className="company-management page-container">
      <header className="company-management-heading">
        <p className="eyebrow">
          <span className="eyebrow-rule" />
          {copy("orders.list.eyebrow")}
        </p>
        <div className="company-management-heading-row">
          <div>
            <Link className="button button-ghost" href={`${localePrefix}/company/dashboard?company=${encodeURIComponent(company.id)}`}>
              <ArrowLeft size={16} aria-hidden="true" />
              {copy("orders.list.backToDashboard")}
            </Link>
            <h1>{copy("orders.list.title")}</h1>
            <p>{copy("orders.list.description")}</p>
          </div>
          <Link className="button button-primary" href={`${localePrefix}/company/dashboard/orders/new?company=${encodeURIComponent(company.id)}`}>
            <FileText size={16} aria-hidden="true" />
            {copy("orders.list.newOrder")}
          </Link>
        </div>
      </header>

      {showCreatedToast && (
        <div className="toast toast-success" role="status" aria-live="polite">
          <CheckCircle size={20} aria-hidden="true" />
          <span>{copy("orders.list.createdToast")}</span>
        </div>
      )}

      {showSubmittedToast && (
        <div className="toast toast-success" role="status" aria-live="polite">
          <CheckCircle size={20} aria-hidden="true" />
          <span>{copy("orders.list.submittedToast")}</span>
        </div>
      )}

      <section aria-labelledby="entitlements-title" className="order-entitlements">
        <h2 id="entitlements-title">{copy("orders.list.entitlementsTitle")}</h2>
        <div className="order-entitlements-grid">
          <article className="order-entitlement-card">
            <div className="order-entitlement-icon">
              <FileText size={24} aria-hidden="true" />
            </div>
            <div>
              <p className="order-entitlement-label">{copy("orders.list.availableCredits")}</p>
              <p className="order-entitlement-value">{creditAccount?.available_balance ?? 0}</p>
              <p className="order-entitlement-unit">{copy("orders.list.creditUnit")}</p>
            </div>
          </article>
          {entitlements.length > 0 ? (
            entitlements.map((e) => (
              <article key={e.package_id} className="order-entitlement-card">
                <div className="order-entitlement-icon">
                  <CheckCircle size={24} aria-hidden="true" />
                </div>
                <div>
                  <p className="order-entitlement-label">{copy("orders.list.activePackage")}</p>
                  <p className="order-entitlement-value">{e.package_name}</p>
                  <p className="order-entitlement-detail">
                    {e.active_jobs} / {e.max_active_jobs} {copy("orders.list.activeJobs")}
                    {e.job_duration_days && (
                      <> · {copy("orders.list.jobDuration")} {e.job_duration_days} {copy("orders.list.dayUnit")}</>
                    )}
                    {e.assignment_expires_at && (
                      <> · {copy("orders.list.expiresAt")} {formatDate(e.assignment_expires_at, locale)}</>
                    )}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <article className="order-entitlement-card empty">
              <div className="order-entitlement-icon">
                <AlertCircle size={24} aria-hidden="true" />
              </div>
              <div>
                <p className="order-entitlement-label">{copy("orders.list.noActivePackage")}</p>
                <p className="order-entitlement-value">{copy("orders.list.noActivePackageDesc")}</p>
              </div>
            </article>
          )}
        </div>
        <div className="order-entitlements-actions">
          <Link className="button button-primary" href={`${localePrefix}/company/dashboard/orders/new?company=${encodeURIComponent(company.id)}`}>
            <FileText size={16} aria-hidden="true" />
            {copy("orders.list.buyPackage")}
          </Link>
          <Link className="button button-outline" href={`${localePrefix}/company/dashboard/orders?company=${encodeURIComponent(company.id)}`}>
            <FileText size={16} aria-hidden="true" />
            {copy("orders.list.myOrders")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="orders-table-title" className="orders-table-section">
        <h2 id="orders-table-title">{copy("orders.list.ordersTitle")}</h2>
        {orders.length > 0 ? (
          <div className="orders-table-wrapper">
            <table className="orders-table">
              <thead>
                <tr>
                  <th scope="col">{copy("orders.list.colReference")}</th>
                  <th scope="col">{copy("orders.list.colPackage")}</th>
                  <th scope="col">{copy("orders.list.colAmount")}</th>
                  <th scope="col">{copy("orders.list.colStatus")}</th>
                  <th scope="col">{copy("orders.list.colExpiresAt")}</th>
                  <th scope="col">{copy("orders.list.colCreatedAt")}</th>
                  <th scope="col">{copy("orders.list.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const statusInfo = getStatusInfo(order.status, copy);
                  const snapshot = order.package_snapshot as {
                    display_name?: string;
                    job_credits?: number;
                    price_minor?: number;
                    currency?: string;
                  };
                  const canSubmitPayment = isOrderActionable(order.status);
                  const canUploadReceipt = ["awaiting_transfer", "payment_submitted"].includes(order.status);
                  return (
                    <tr key={order.id}>
                      <td>
                        <code className="order-reference">{order.reference_code}</code>
                      </td>
                      <td>
                        <div>
                          <strong>{snapshot.display_name || order.package_id}</strong>
                          {snapshot.job_credits && (
                            <span className="order-credits-badge">{snapshot.job_credits} {copy("orders.list.creditUnit")}</span>
                          )}
                        </div>
                      </td>
                      <td>{formatCurrency(order.total_minor, order.currency, locale)}</td>
                      <td>
                        <span className={`order-status-badge ${statusInfo.className}`}>
                          {statusInfo.icon}
                          {statusInfo.label}
                        </span>
                      </td>
                      <td>{formatDate(order.expires_at, locale)}</td>
                      <td>{formatDate(order.created_at, locale)}</td>
                      <td>
                        <div className="order-actions">
                          {canSubmitPayment && (
                            <OrderPaymentForm
                              order={order}
                              snapshot={snapshot}
                              locale={locale}
                              copy={copy}
                              companyId={company.id}
                              canUploadReceipt={canUploadReceipt}
                            />
                          )}
                          <Link
                            className="button button-ghost button-sm"
                            href={`${localePrefix}/company/dashboard/orders/${order.id}?company=${encodeURIComponent(company.id)}`}
                            aria-label={copy("orders.list.viewOrder", { reference: order.reference_code })}
                          >
                            <Eye size={14} aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="orders-empty" role="status">
            <FileText size={48} aria-hidden="true" />
            <h3>{copy("orders.list.emptyTitle")}</h3>
            <p>{copy("orders.list.emptyDescription")}</p>
            <Link className="button button-primary" href={`${localePrefix}/company/dashboard/orders/new?company=${encodeURIComponent(company.id)}`}>
              {copy("orders.list.newOrder")}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}