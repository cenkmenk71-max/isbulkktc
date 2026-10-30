"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Link } from "@/i18n/navigation";
import { signIn } from "./actions";
import { ResendConfirmationForm } from "./resend-confirmation-form";
import { TurnstileField } from "./turnstile-field";
import { OAuthProviderForm } from "./oauth-provider-form";
import type {
  AccountAudience,
  OAuthProvider,
  SignInFormState,
} from "./schemas";

const initialState: SignInFormState = { status: "idle", message: "idle" };

export function SignInForm({
  audience,
  providers,
}: {
  audience: AccountAudience;
  providers: OAuthProvider[];
}) {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const [state, action, pending] = useActionState(signIn, initialState);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <>
      <OAuthProviderForm
        audience={audience}
        intent="signin"
        providers={providers}
      />
      <form className="editorial-form" action={action}>
        <input name="audience" type="hidden" value={audience} />
        <input name="locale" type="hidden" value={locale} />
        <TurnstileField />
        <label htmlFor="login-email">
          {copy(audience === "employer" ? "accountEmailLabel" : "emailLabel")}
          <input
            id="login-email"
            aria-describedby={
              state.message !== "idle" ? "login-form-message" : undefined
            }
            aria-invalid={state.status === "error"}
            autoComplete="email"
            name="email"
            required
            type="email"
          />
        </label>
        <div className="editorial-field">
          <label htmlFor="login-password">{copy("passwordLabel")}</label>
          <span className="editorial-password-field">
            <input
              id="login-password"
              autoComplete="current-password"
              name="password"
              required
              type={passwordVisible ? "text" : "password"}
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
        </div>
        <div className="editorial-form-utility">
          <span aria-hidden="true" />
          <Link href="/forgot-password">{copy("forgotPassword")}</Link>
        </div>
        <button
          className="button button-dark editorial-submit editorial-auth-email-button"
          disabled={pending}
          type="submit"
        >
          <LogIn size={17} aria-hidden="true" />
          {pending
            ? copy("signingIn")
            : copy(
                audience === "employer" ? "employerSignIn" : "candidateSignIn",
              )}
        </button>
        <p className="editorial-form-footnote">
          {copy("noAccount")}{" "}
          <Link href={{ pathname: "/register", query: { audience } }}>
            {copy(
              audience === "employer"
                ? "createEmployerAccountLink"
                : "createCandidateAccountLink",
            )}
          </Link>
        </p>
      </form>
      {state.message !== "idle" && (
        <div className="editorial-form-status">
          <p
            aria-live="polite"
            className="editorial-form-message"
            data-status={state.status}
            id="login-form-message"
            role={state.status === "error" ? "alert" : "status"}
          >
            {copy(`messages.${state.message}`)}
          </p>
          {state.message === "emailNotConfirmed" && state.email ? (
            <ResendConfirmationForm audience={audience} email={state.email} />
          ) : null}
        </div>
      )}
    </>
  );
}
