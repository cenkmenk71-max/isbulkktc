"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { submitSalesLead } from "./actions";
import type { SalesLeadFormState } from "./schemas";

const initialState: SalesLeadFormState = { status: "idle", message: "idle" };

const durations = [
  { value: "1", key: "oneDay" },
  { value: "7", key: "sevenDays" },
  { value: "30", key: "thirtyDays" },
] as const;

export function SalesLeadForm({ plan }: { plan?: string }) {
  const copy = useTranslations("SalesLeadForm");
  const locale = useLocale();
  const [state, action, pending] = useActionState(submitSalesLead, initialState);

  return (
    <form className="editorial-form sales-lead-form" action={action}>
      <input name="locale" type="hidden" value={locale} />
      {plan ? <input name="plan" type="hidden" value={plan} /> : null}

      <label htmlFor="sales-company">
        {copy("companyLabel")}
        <input
          id="sales-company"
          autoComplete="organization"
          maxLength={120}
          name="companyName"
        />
      </label>

      <label htmlFor="sales-contact">
        {copy("contactLabel")}
        <input
          id="sales-contact"
          autoComplete="name"
          maxLength={80}
          name="contactName"
        />
      </label>

      <label htmlFor="sales-email">
        {copy("emailLabel")}
        <input
          id="sales-email"
          autoComplete="email"
          maxLength={254}
          name="email"
          required
          type="email"
        />
      </label>

      <label htmlFor="sales-phone">
        {copy("phoneLabel")}
        <input
          id="sales-phone"
          autoComplete="tel"
          maxLength={32}
          name="phone"
          type="tel"
        />
      </label>

      <label htmlFor="sales-duration">
        {copy("durationLabel")}
        <select id="sales-duration" name="durationDays" defaultValue="">
          <option value="">{copy("durationPlaceholder")}</option>
          {durations.map(({ value, key }) => (
            <option key={value} value={value}>
              {copy(`durations.${key}`)}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor="sales-note">
        {copy("noteLabel")}
        <textarea
          id="sales-note"
          maxLength={2000}
          name="note"
          rows={4}
        />
      </label>

      <button
        className="button button-dark editorial-submit editorial-auth-email-button"
        disabled={pending}
        type="submit"
      >
        <Send size={17} aria-hidden="true" />
        {pending ? copy("sending") : copy("submit")}
      </button>

      {state.message !== "idle" && (
        <p
          aria-live="polite"
          className="editorial-form-message"
          data-status={state.status}
          role={state.status === "error" ? "alert" : "status"}
        >
          {copy(`messages.${state.message}`)}
        </p>
      )}
      <p className="editorial-form-note">{copy("privacyNote")}</p>
    </form>
  );
}
