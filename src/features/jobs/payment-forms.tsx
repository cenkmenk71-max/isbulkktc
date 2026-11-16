"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { reconcilePayment } from "./payment-actions";
import { ExternalLink, FileText, Loader2, AlertCircle, CheckCircle, XCircle, HelpCircle } from "lucide-react";
import type { ReconcilePaymentState } from "./payment-actions";

const initialReconcileState: ReconcilePaymentState = {
  status: "idle",
  message: "idle",
};

interface ReconcilePaymentFormProps {
  submissionId: string;
  orderReference: string;
  companyName: string;
  amount: string;
  transferReference: string;
  senderName: string;
  receiptPath: string | null;
}

export function ReconcilePaymentForm({
  submissionId,
  orderReference,
  companyName,
  amount,
  transferReference,
  senderName,
  receiptPath,
}: ReconcilePaymentFormProps) {
  const copy = useTranslations("AdminPayments");
  const [state, action, pending] = useActionState(reconcilePayment, initialReconcileState);
  const [showDetails, setShowDetails] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const [idempotencyKey] = useState(() => `reconcile:${submissionId}:${Date.now()}`);

  const handleReceiptClick = async () => {
    if (!receiptPath) return;
    setLoadingReceipt(true);
    try {
      const response = await fetch(`/api/admin/receipt-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storagePath: receiptPath }),
      });
      if (response.ok) {
        const data = await response.json();
        setReceiptUrl(data.signedUrl);
      }
    } catch {
      // Error handled by form state
    } finally {
      setLoadingReceipt(false);
    }
  };

  const error = state.status === "error" && state.message !== "idle";

  return (
    <div className="admin-reconcile-cell">
      <button
        type="button"
        className="admin-reconcile-toggle"
        onClick={() => setShowDetails(!showDetails)}
        aria-expanded={showDetails}
        aria-controls={`reconcile-details-${submissionId}`}
      >
        {showDetails ? copy("hideDetails") : copy("showDetails")}
      </button>

      {showDetails && (
        <details id={`reconcile-details-${submissionId}`} className="admin-reconcile-details" open>
          <summary>{copy("submissionDetails")}</summary>
          <dl className="admin-reconcile-dl">
            <div>
              <dt>{copy("fields.orderReference")}</dt>
              <dd><code>{orderReference}</code></dd>
            </div>
            <div>
              <dt>{copy("fields.company")}</dt>
              <dd>{companyName}</dd>
            </div>
            <div>
              <dt>{copy("fields.amount")}</dt>
              <dd>{amount}</dd>
            </div>
            <div>
              <dt>{copy("fields.transferReference")}</dt>
              <dd><code>{transferReference}</code></dd>
            </div>
            <div>
              <dt>{copy("fields.senderName")}</dt>
              <dd>{senderName}</dd>
            </div>
            {receiptPath && (
              <div>
                <dt>{copy("fields.receipt")}</dt>
                <dd className="admin-receipt-row">
                  <button
                    type="button"
                    className="button button-ghost admin-receipt-button"
                    onClick={handleReceiptClick}
                    disabled={loadingReceipt}
                  >
                    {loadingReceipt ? (
                      <>
                        <Loader2 size={14} aria-hidden="true" className="animate-spin" />
                        {copy("loadingReceipt")}
                      </>
                    ) : receiptUrl ? (
                      <>
                        <FileText size={14} aria-hidden="true" />
                        {copy("openReceipt")}
                      </>
                    ) : (
                      <>
                        <FileText size={14} aria-hidden="true" />
                        {copy("viewReceipt")}
                      </>
                    )}
                  </button>
                  {receiptUrl && (
                    <a
                      href={receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button button-ghost admin-receipt-button"
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      {copy("openInNewTab")}
                    </a>
                  )}
                </dd>
              </div>
            )}
          </dl>

          <form action={action} className="admin-reconcile-form">
            <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
            <input name="submissionId" type="hidden" value={submissionId} />

            <fieldset className="admin-reconcile-fieldset">
              <legend>{copy("fields.decision")}</legend>
              <div className="admin-decision-options">
                <label className="admin-decision-option">
                  <input
                    type="radio"
                    name="decision"
                    value="accepted"
                    defaultChecked
                    required
                  />
                  <span className="admin-decision-label accepted">
                    <CheckCircle size={16} aria-hidden="true" />
                    {copy("decision.accepted")}
                  </span>
                </label>
                <label className="admin-decision-option">
                  <input type="radio" name="decision" value="rejected" />
                  <span className="admin-decision-label rejected">
                    <XCircle size={16} aria-hidden="true" />
                    {copy("decision.rejected")}
                  </span>
                </label>
                <label className="admin-decision-option">
                  <input type="radio" name="decision" value="needs_more_info" />
                  <span className="admin-decision-label needs-more-info">
                    <HelpCircle size={16} aria-hidden="true" />
                    {copy("decision.needsMoreInfo")}
                  </span>
                </label>
              </div>
            </fieldset>

            <label className="admin-reconcile-field">
              {copy("fields.bankReference")}
              <input
                name="bankReferenceNormalized"
                type="text"
                maxLength={60}
                minLength={4}
                required
                pattern="[A-Z0-9]{4,60}"
                placeholder="BANKREF123"
                autoComplete="off"
              />
            </label>

            <label className="admin-reconcile-field admin-reconcile-field-wide">
              {copy("fields.notes")}
              <textarea
                name="notes"
                maxLength={1000}
                rows={3}
                placeholder={copy("notesPlaceholder")}
              />
            </label>

            <div className="admin-reconcile-submit">
              <button className="button button-dark" disabled={pending} type="submit">
                {pending ? (
                  <>
                    <Loader2 size={16} aria-hidden="true" className="animate-spin" />
                    {copy("processing")}
                  </>
                ) : (
                  copy("reconcile")
                )}
              </button>
              {error && (
                <p className="admin-reconcile-error" role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  {copy(`messages.${state.message}`)}
                </p>
              )}
              {state.status === "success" && (
                <p className="admin-reconcile-success" role="status">
                  <CheckCircle size={16} aria-hidden="true" />
                  {copy("messages.reconciled")}
                </p>
              )}
            </div>
          </form>
        </details>
      )}
    </div>
  );
}