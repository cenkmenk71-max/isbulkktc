"use client";

import { useActionState, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { savePaymentInstruction, deletePaymentInstruction, type SavePaymentInstructionState } from "./payment-actions";
import { Plus, Edit2, Trash2, Loader2, X, Check, AlertCircle, Eye, EyeOff } from "lucide-react";
import type { AdminPaymentInstructionRow } from "@/server/dal/admin-payments";

const initialSaveState: SavePaymentInstructionState = {
  status: "idle",
  message: "idle",
};

interface PaymentInstructionListProps {
  instructions: AdminPaymentInstructionRow[];
}

export function PaymentInstructionForm() {
  const copy = useTranslations("AdminPaymentInstructions");
  const [state, action, pending] = useActionState(savePaymentInstruction, initialSaveState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<AdminPaymentInstructionRow>>({
    beneficiary_name: "",
    bank_name: "",
    iban_restricted_value: "",
    currency: "TRY",
    instructions: "",
    active_from: new Date().toISOString().slice(0, 16),
    active_to: "",
  });
  const [showIban, setShowIban] = useState(false);

  useEffect(() => {
    const handleEdit = (e: CustomEvent<AdminPaymentInstructionRow>) => {
      const instruction = e.detail;
      setEditingId(instruction.id);
      setFormData({
        beneficiary_name: instruction.beneficiary_name,
        bank_name: instruction.bank_name,
        iban_restricted_value: instruction.iban_restricted_value,
        currency: instruction.currency,
        instructions: instruction.instructions,
        active_from: instruction.active_from.slice(0, 16),
        active_to: instruction.active_to ? instruction.active_to.slice(0, 16) : "",
      });
      // Scroll to form
      document.getElementById("payment-instruction-form")?.scrollIntoView({ behavior: "smooth" });
    };

    window.addEventListener("edit-instruction", handleEdit as EventListener);
    return () => window.removeEventListener("edit-instruction", handleEdit as EventListener);
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.set("instructionId", editingId ?? "");
    action(data);
  };

  const handleNew = () => {
    setEditingId(null);
    setFormData({
      beneficiary_name: "",
      bank_name: "",
      iban_restricted_value: "",
      currency: "TRY",
      instructions: "",
      active_from: new Date().toISOString().slice(0, 16),
      active_to: "",
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    handleNew();
  };

  const isEditing = editingId !== null;

  return (
    <form id="payment-instruction-form" onSubmit={handleSubmit} className="admin-payment-instruction-form">
      <h3>{isEditing ? copy("editTitle") : copy("newTitle")}</h3>
      <div className="admin-payment-instruction-fields">
        <input name="instructionId" type="hidden" value={editingId ?? ""} />

        <label>
          {copy("fields.beneficiaryName")}
          <input
            name="beneficiaryName"
            type="text"
            maxLength={120}
            minLength={2}
            required
            defaultValue={formData.beneficiary_name}
          />
        </label>

        <label>
          {copy("fields.bankName")}
          <input
            name="bankName"
            type="text"
            maxLength={80}
            minLength={2}
            required
            defaultValue={formData.bank_name}
          />
        </label>

        <label className="admin-payment-instruction-field-wide">
          {copy("fields.iban")}
          <div className="iban-input-wrapper">
            <input
              name="ibanRestrictedValue"
              type={showIban ? "text" : "password"}
              maxLength={34}
              minLength={15}
              required
              defaultValue={formData.iban_restricted_value}
              autoComplete="off"
              placeholder="TR123456789012345678901234"
            />
            <button
              type="button"
              className="iban-toggle"
              onClick={() => setShowIban(!showIban)}
              aria-label={showIban ? copy("hideIban") : copy("showIban")}
            >
              {showIban ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
        </label>

        <label>
          {copy("fields.currency")}
          <input
            name="currency"
            type="text"
            maxLength={3}
            minLength={3}
            required
            defaultValue={formData.currency}
            pattern="[A-Z]{3}"
          />
        </label>

        <label className="admin-payment-instruction-field-wide">
          {copy("fields.instructions")}
          <textarea
            name="instructions"
            maxLength={2000}
            rows={3}
            defaultValue={formData.instructions}
            placeholder={copy("instructionsPlaceholder")}
          />
        </label>

        <label>
          {copy("fields.activeFrom")}
          <input
            name="activeFrom"
            type="datetime-local"
            required
            defaultValue={formData.active_from}
          />
        </label>

        <label>
          {copy("fields.activeTo")}
          <input
            name="activeTo"
            type="datetime-local"
            defaultValue={formData.active_to ?? ""}
            placeholder={copy("activeToPlaceholder")}
          />
        </label>
      </div>

      <div className="admin-payment-instruction-submit">
        <button className="button button-dark" disabled={pending} type="submit">
          {pending ? (
            <>
              <Loader2 size={16} aria-hidden="true" className="animate-spin" />
              {copy("saving")}
            </>
          ) : isEditing ? (
            <>
              <Check size={16} aria-hidden="true" />
              {copy("saveChanges")}
            </>
          ) : (
            <>
              <Plus size={16} aria-hidden="true" />
              {copy("createInstruction")}
            </>
          )}
        </button>
        {isEditing && (
          <button type="button" className="button button-ghost" onClick={handleCancel}>
            <X size={16} aria-hidden="true" /> {copy("cancel")}
          </button>
        )}
        {state.status === "error" && state.message !== "idle" && (
          <p className="admin-payment-instruction-error" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            {copy(`messages.${state.message}`)}
          </p>
        )}
        {state.status === "success" && (
          <p className="admin-payment-instruction-success" role="status">
            <Check size={16} aria-hidden="true" />
            {copy(`messages.${state.message}`)}
          </p>
        )}
      </div>
    </form>
  );
}

export function PaymentInstructionList({ instructions }: PaymentInstructionListProps) {
  const copy = useTranslations("AdminPaymentInstructions");
  const [deleteState, deleteAction] = useActionState(deletePaymentInstruction, initialSaveState);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = (instructionId: string) => {
    setDeletingId(instructionId);
    const fd = new FormData();
    fd.append("instructionId", instructionId);
    deleteAction(fd);
    setDeletingId(null);
  };

  if (instructions.length === 0) {
    return (
      <p className="admin-package-empty" role="status">
        <Plus size={19} aria-hidden="true" />
        {copy("emptyInstructions")}
      </p>
    );
  }

  return (
    <div className="admin-payment-instruction-list">
      {instructions.map((instruction) => (
        <article key={instruction.id} className="admin-payment-instruction-card">
          <header>
            <div>
              <span className="admin-package-code">{instruction.currency}</span>
              <h3>{instruction.beneficiary_name}</h3>
              <p className="admin-instruction-bank">{instruction.bank_name}</p>
            </div>
            <div className="admin-instruction-status">
              <span className={`admin-instruction-active ${instruction.active_to && new Date(instruction.active_to) < new Date() ? "expired" : ""}`}>
                {instruction.active_to && new Date(instruction.active_to) < new Date()
                  ? copy("expired")
                  : new Date(instruction.active_from) > new Date()
                  ? copy("scheduled")
                  : copy("active")}
              </span>
            </div>
          </header>

          <dl className="admin-instruction-details">
            <div>
              <dt>{copy("fields.iban")}</dt>
              <dd className="admin-instruction-iban">
                <code>{"**** **** **** " + instruction.iban_restricted_value.slice(-4)}</code>
              </dd>
            </div>
            <div>
              <dt>{copy("fields.activeFrom")}</dt>
              <dd>
                <time dateTime={instruction.active_from}>
                  {new Date(instruction.active_from).toLocaleDateString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </dd>
            </div>
            {instruction.active_to && (
              <div>
                <dt>{copy("fields.activeTo")}</dt>
                <dd>
                  <time dateTime={instruction.active_to}>
                    {new Date(instruction.active_to).toLocaleDateString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </dd>
              </div>
            )}
            {instruction.instructions && (
              <div className="admin-instruction-instructions-wide">
                <dt>{copy("fields.instructions")}</dt>
                <dd>{instruction.instructions}</dd>
              </div>
            )}
          </dl>

          <div className="admin-instruction-actions">
            <button
              type="button"
              className="button button-ghost admin-edit-button"
              onClick={() => {
                const event = new CustomEvent("edit-instruction", { detail: instruction });
                window.dispatchEvent(event);
              }}
            >
              <Edit2 size={16} aria-hidden="true" /> {copy("edit")}
            </button>
            {(!instruction.active_to || new Date(instruction.active_to) > new Date()) && (
              <button
                type="button"
                className="button button-ghost admin-delete-button"
                onClick={() => {
                  if (window.confirm(copy("deleteConfirm"))) {
                    handleDelete(instruction.id);
                  }
                }}
                disabled={deleteState.status === "error" && deletingId === instruction.id}
              >
                <Trash2 size={16} aria-hidden="true" /> {copy("delete")}
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}