"use client";

import { useTranslations } from "next-intl";
import { oauthProviderLabels } from "./oauth-providers";
import { monogramFor } from "./monogram";

export type AccountPanelAccount = {
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  givenName: string | null;
  familyName: string | null;
  signInMethods: string[];
  emailConfirmed: boolean;
};

/**
 * The signed-in account, as the visitor cannot otherwise see it: which address
 * the account uses, whether that address is verified, and which providers can
 * open it. Shared by the candidate and employer workspaces so both sides get
 * the same answer — an employer account created through Google has no password,
 * and a candidate who signed up with an e-mail address has no social identity.
 */
export function AccountPanel({ account }: { account: AccountPanelAccount }) {
  const copy = useTranslations("AccountPanel");

  return (
    <section className="account-panel" aria-labelledby="account-panel-title">
      <h2 id="account-panel-title">{copy("title")}</h2>
      <div className="account-panel-identity">
        {account.avatarUrl ? (
          // The provider avatar is a remote URL the user did not upload, so it
          // is rendered as a plain <img> (the CSP already allows https images)
          // rather than routed through the image optimizer, which would need
          // every provider host in `images.remotePatterns`.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            aria-hidden="true"
            className="account-panel-avatar"
            height={48}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={account.avatarUrl}
            width={48}
          />
        ) : (
          <span
            aria-hidden="true"
            className="account-panel-avatar account-panel-avatar--monogram"
          >
            {monogramFor(account.displayName)}
          </span>
        )}
        <div>
          <p className="account-panel-name">{account.displayName}</p>
          {account.email ? (
            <p className="account-panel-email">
              <span>{account.email}</span>
              <span
                className="account-panel-badge"
                data-verified={account.emailConfirmed ? "yes" : "no"}
              >
                {copy(account.emailConfirmed ? "emailVerified" : "emailUnverified")}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      <dl className="account-panel-details">
        {account.givenName || account.familyName ? (
          <>
            <div>
              <dt>{copy("givenNameLabel")}</dt>
              <dd>{account.givenName ?? copy("valueMissing")}</dd>
            </div>
            <div>
              <dt>{copy("familyNameLabel")}</dt>
              <dd>{account.familyName ?? copy("valueMissing")}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>{copy("signInMethodsLabel")}</dt>
          <dd>
            {account.signInMethods.length
              ? account.signInMethods
                  .map((method) =>
                    method === "email"
                      ? copy("signInMethodEmail")
                      : oauthProviderLabels[method] ?? method,
                  )
                  .join(", ")
              : copy("valueMissing")}
          </dd>
        </div>
      </dl>
      {account.avatarUrl ? (
        <p className="account-panel-note">{copy("syncedNote")}</p>
      ) : null}
    </section>
  );
}
