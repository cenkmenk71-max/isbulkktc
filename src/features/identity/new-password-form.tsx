"use client";

import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { updatePassword } from "./actions";
import type { SignInFormState } from "./schemas";

const initialState: SignInFormState = { status: "idle", message: "idle" };

export function NewPasswordForm() {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const [state, action, pending] = useActionState(updatePassword, initialState);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);

  const hasConfirmation = confirmation.length > 0;
  const passwordsMatch = password.length > 0 && password === confirmation;

  return (
    <form className="editorial-form" action={action}>
      <input name="locale" type="hidden" value={locale} />
      <div className="editorial-field">
        <label htmlFor="reset-new-password">{copy("newPasswordLabel")}</label>
        <span className="editorial-password-field">
          <input
            id="reset-new-password"
            aria-describedby="reset-password-hint"
            autoComplete="new-password"
            maxLength={128}
            minLength={10}
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type={passwordVisible ? "text" : "password"}
            value={password}
          />
          <button
            type="button"
            className="editorial-password-toggle"
            aria-label={copy(passwordVisible ? "hidePassword" : "showPassword")}
            aria-pressed={passwordVisible}
            onClick={() => setPasswordVisible((visible) => !visible)}
          >
            {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
        <small id="reset-password-hint">{copy("passwordHint")}</small>
      </div>
      <div className="editorial-field">
        <label htmlFor="reset-confirm-password">
          {copy("confirmPasswordLabel")}
        </label>
        <span className="editorial-password-field">
          <input
            id="reset-confirm-password"
            aria-describedby="reset-confirm-hint"
            autoComplete="new-password"
            maxLength={128}
            minLength={10}
            name="confirmPassword"
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type={confirmationVisible ? "text" : "password"}
            value={confirmation}
          />
          <button
            type="button"
            className="editorial-password-toggle"
            aria-label={copy(
              confirmationVisible ? "hidePassword" : "showPassword",
            )}
            aria-pressed={confirmationVisible}
            onClick={() => setConfirmationVisible((visible) => !visible)}
          >
            {confirmationVisible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </span>
        <small
          id="reset-confirm-hint"
          data-state={
            hasConfirmation ? (passwordsMatch ? "match" : "mismatch") : "idle"
          }
        >
          {hasConfirmation
            ? copy(
                passwordsMatch ? "passwordMatch" : "messages.passwordMismatch",
              )
            : null}
        </small>
      </div>
      <button
        className="button button-dark editorial-submit editorial-auth-email-button"
        disabled={pending || (hasConfirmation && !passwordsMatch)}
        type="submit"
      >
        <KeyRound size={18} aria-hidden="true" />
        {pending ? copy("updatingPassword") : copy("updatePassword")}
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
