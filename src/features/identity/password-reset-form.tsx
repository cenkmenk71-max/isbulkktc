"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { requestPasswordReset } from "./actions";
import type { SignInFormState } from "./schemas";

const initialState: SignInFormState = { status: "idle", message: "idle" };

export function PasswordResetForm() {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  return (
    <form className="editorial-form" action={action}>
      <input name="locale" type="hidden" value={locale} />
      <label htmlFor="reset-email">
        {copy("emailLabel")}
        <input
          id="reset-email"
          autoComplete="email"
          name="email"
          required
          type="email"
        />
      </label>
      <button
        className="button button-dark editorial-submit editorial-auth-email-button"
        disabled={pending}
        type="submit"
      >
        <MailCheck size={18} aria-hidden="true" />
        {pending ? copy("sendingResetLink") : copy("sendResetLink")}
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
      <p className="editorial-form-note">{copy("resetLinkNote")}</p>
    </form>
  );
}
