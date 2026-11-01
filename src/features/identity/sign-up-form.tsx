"use client";

import { Eye, EyeOff, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { signUp } from "./actions";
import { CaptchaNotice, TurnstileField } from "./turnstile-field";
import { useCaptchaAction } from "./use-captcha-action";
import { OAuthProviderForm } from "./oauth-provider-form";
import type {
  AccountAudience,
  OAuthProvider,
  SignInFormState,
} from "./schemas";

const initialState: SignInFormState = { status: "idle", message: "idle" };

export function SignUpForm({
  audience,
  providers,
}: {
  audience: AccountAudience;
  providers: OAuthProvider[];
}) {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const formRef = useRef<HTMLFormElement>(null);
  const { state, action, pending, resetSignal, captchaBlocked } =
    useCaptchaAction(signUp, initialState, formRef);
  const [passwordVisible, setPasswordVisible] = useState(false);

  return (
    <>
      <OAuthProviderForm
        audience={audience}
        intent="signup"
        providers={providers}
      />
      <form ref={formRef} className="editorial-form" action={action}>
        <input name="audience" type="hidden" value={audience} />
        <input name="locale" type="hidden" value={locale} />
        <TurnstileField resetSignal={resetSignal} />
        <label htmlFor="register-display-name">
          {copy(audience === "employer" ? "contactNameLabel" : "nameLabel")}
          <input
            id="register-display-name"
            autoComplete="name"
            maxLength={80}
            minLength={2}
            name="displayName"
            required
          />
        </label>
        <label htmlFor="register-email">
          {copy(audience === "employer" ? "accountEmailLabel" : "emailLabel")}
          <input
            id="register-email"
            aria-describedby={
              state.message !== "idle" ? "register-form-message" : undefined
            }
            aria-invalid={state.status === "error"}
            autoComplete="email"
            name="email"
            required
            type="email"
          />
        </label>
        <div className="editorial-field">
          <label htmlFor="register-password">{copy("passwordLabel")}</label>
          <span className="editorial-password-field">
            <input
              id="register-password"
              autoComplete="new-password"
              maxLength={128}
              minLength={10}
              name="password"
              required
              type={passwordVisible ? "text" : "password"}
              aria-describedby="register-password-hint"
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
          <small id="register-password-hint">{copy("passwordHint")}</small>
        </div>
        <button
          className="button button-dark editorial-submit editorial-auth-email-button"
          disabled={pending}
          type="submit"
        >
          <UserRound size={17} aria-hidden="true" />
          {pending
            ? copy("creatingAccount")
            : copy(
                audience === "employer"
                  ? "createEmployerAccount"
                  : "createCandidateAccount",
              )}
        </button>
        {captchaBlocked ? (
          <CaptchaNotice />
        ) : (
          state.message !== "idle" && (
            <p
              aria-live="polite"
              className="editorial-form-message"
              data-status={state.status}
              id="register-form-message"
              role={state.status === "error" ? "alert" : "status"}
            >
              {copy(`messages.${state.message}`)}
            </p>
          )
        )}
        <p className="editorial-form-footnote">
          {copy("alreadyHaveAccount")}{" "}
          <Link href={{ pathname: "/login", query: { audience } }}>
            {copy(
              audience === "employer"
                ? "employerSignInLink"
                : "candidateSignInLink",
            )}
          </Link>
        </p>
        {audience === "employer" && (
          <p className="editorial-form-note">{copy("companyAccountNote")}</p>
        )}
      </form>
    </>
  );
}
