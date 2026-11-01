"use client";

import { MailCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef } from "react";
import { requestPasswordReset } from "./actions";
import { CaptchaNotice, TurnstileField } from "./turnstile-field";
import { useCaptchaAction } from "./use-captcha-action";
import type { SignInFormState } from "./schemas";

const initialState: SignInFormState = { status: "idle", message: "idle" };

export function PasswordResetForm() {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const { state, action, pending, resetSignal, captchaBlocked } =
    useCaptchaAction(requestPasswordReset, initialState, formRef);

  return (
    <form ref={formRef} className="editorial-form" action={action}>
      <input name="locale" type="hidden" value={locale} />
      <TurnstileField resetSignal={resetSignal} />
      <label htmlFor="reset-email">
        {copy("emailLabel")}
        <input
          id="reset-email"
          aria-describedby={
            state.message !== "idle" ? "reset-form-message" : undefined
          }
          aria-invalid={state.status === "error"}
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
      {captchaBlocked ? (
        <CaptchaNotice />
      ) : (
        state.message !== "idle" && (
          <p
            aria-live="polite"
            className="editorial-form-message"
            data-status={state.status}
            id="reset-form-message"
            role={state.status === "error" ? "alert" : "status"}
          >
            {copy(`messages.${state.message}`)}
          </p>
        )
      )}
      <p className="editorial-form-note">{copy("resetLinkNote")}</p>
    </form>
  );
}
