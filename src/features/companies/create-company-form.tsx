"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createCompany } from "./actions";

const initialState = { status: "idle" as const, message: "idle" as const };

export function CreateCompanyForm() {
  const copy = useTranslations("CompanyRegistration");
  const [state, action, pending] = useActionState(createCompany, initialState);

  return (
    <form className="editorial-form" action={action}>
      <label htmlFor="company-name">
        {copy("nameLabel")}
        <input
          id="company-name"
          autoComplete="organization"
          maxLength={120}
          minLength={2}
          name="name"
          placeholder={copy("namePlaceholder")}
          required
        />
      </label>
      <label htmlFor="company-slug">
        {copy("slugLabel")}
        <input
          id="company-slug"
          autoComplete="off"
          maxLength={80}
          minLength={2}
          name="slug"
          pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*"
          required
        />
        <small>{copy("slugHint")}</small>
      </label>
      <button
        className="button button-dark editorial-submit"
        disabled={pending}
        type="submit"
      >
        {pending ? copy("saving") : copy("submit")}
      </button>
      <p
        aria-live="polite"
        className="editorial-form-message"
        data-status={state.status}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message === "idle" ? "" : copy(`messages.${state.message}`)}
      </p>
    </form>
  );
}
