"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FaFacebook, FaGoogle, FaLinkedin } from "react-icons/fa6";
import type { IconType } from "react-icons";
import { startOAuthSignIn } from "./actions";
import type {
  AccountAudience,
  OAuthProvider,
  SignInFormState,
} from "./schemas";

const initialState: SignInFormState = {
  status: "idle",
  message: "idle",
};

const providerLabels: Record<OAuthProvider, string> = {
  google: "Google",
  linkedin_oidc: "LinkedIn",
  facebook: "Facebook",
};

const supportedProviders = [
  "google",
  "linkedin_oidc",
  "facebook",
] as const satisfies readonly OAuthProvider[];

const providerMarks: Record<
  OAuthProvider,
  { Icon: IconType }
> = {
  google: { Icon: FaGoogle },
  linkedin_oidc: { Icon: FaLinkedin },
  facebook: { Icon: FaFacebook },
};

function OAuthProviderMark({
  provider,
}: {
  provider: OAuthProvider;
}) {
  const { Icon } = providerMarks[provider];

  return <Icon aria-hidden="true" focusable="false" size={25} />;
}

export function OAuthProviderForm({
  audience,
  intent,
  providers,
}: {
  audience: AccountAudience;
  intent: "signin" | "signup";
  providers: OAuthProvider[];
}) {
  const copy = useTranslations("AuthForms");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    startOAuthSignIn,
    initialState,
  );

  return (
    <section className="editorial-oauth">
      <header className="editorial-oauth-heading">
        <span className="editorial-oauth-eyebrow">
          <span aria-hidden="true" className="editorial-oauth-eyebrow-mark" />
          {copy("oauth.eyebrow")}
        </span>
        <h2>{copy("oauth.title")}</h2>
      </header>
      <form action={action} className="editorial-oauth-form">
        <input name="audience" type="hidden" value={audience} />
        <input name="locale" type="hidden" value={locale} />
        <input name="intent" type="hidden" value={intent} />
        <div className="editorial-oauth-providers">
          {supportedProviders.map((provider) => {
            const enabled = providers.includes(provider);

            return (
              <button
                aria-describedby={enabled ? undefined : "oauth-provider-setup"}
                className="editorial-oauth-button"
                data-configured={enabled}
                data-provider={provider}
                disabled={pending || !enabled}
                key={provider}
                name="provider"
                type="submit"
                value={provider}
              >
                <span className="editorial-oauth-mark" data-brand-icon={provider}>
                  <OAuthProviderMark provider={provider} />
                </span>
                <span className="editorial-oauth-copy">
                  <strong>
                    {copy("oauth.continueWith", {
                      provider: providerLabels[provider],
                    })}
                  </strong>
                </span>
              </button>
            );
          })}
        </div>
        {providers.length < supportedProviders.length ? (
          <p
            className="editorial-oauth-setup"
            id="oauth-provider-setup"
            role="status"
          >
            {copy("oauth.setupPending")}
          </p>
        ) : null}
        {state.message !== "idle" ? (
          <p
            aria-live="polite"
            className="editorial-form-message"
            data-status={state.status}
            role="alert"
          >
            {copy(`messages.${state.message}`)}
          </p>
        ) : null}
      </form>
      <div className="editorial-auth-divider">
        <span>{copy("oauth.orEmail")}</span>
      </div>
    </section>
  );
}
