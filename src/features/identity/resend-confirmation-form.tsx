"use client";

import { Send } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { resendConfirmation } from "./actions";
import { TurnstileField } from "./turnstile-field";
import type { AccountAudience, SignInFormState } from "./schemas";

const initialState: SignInFormState = { status: "idle", message: "idle" };

/**
 * Recovery affordance for an unconfirmed mailbox. Resending is itself a server
 * action so the address travels back to the server inside the form rather than
 * being persisted on the client. Used both after a refused sign-in
 * (`email_not_confirmed`) and on the sign-up success screen, so a candidate
 * whose mail never arrived does not have to fail a sign-in to retry.
 */
export function ResendConfirmationForm({
  audience,
  email,
}: {
  audience: AccountAudience;
  email: string;
}) {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    resendConfirmation,
    initialState,
  );

  return (
    <form action={action} className="editorial-form-resend">
      <input name="email" type="hidden" value={email} />
      <input name="audience" type="hidden" value={audience} />
      <input name="locale" type="hidden" value={locale} />
      <TurnstileField />
      <button
        className="button button-outline"
        disabled={pending}
        type="submit"
      >
        <Send size={17} aria-hidden="true" />
        {pending ? copy("resendingVerification") : copy("resendVerification")}
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
    </form>
  );
}
