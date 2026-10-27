"use client";

import Image from "next/image";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  beginAdminMfa,
  verifyAdminMfa,
  type AdminMfaState,
} from "./admin-mfa-actions";

const initialState: AdminMfaState = {
  status: "idle",
  message: "idle",
};

export function AdminMfaGate({
  verifiedFactorId,
}: {
  verifiedFactorId: string | null;
}) {
  const copy = useTranslations("AdminPackages.mfa");
  const [beginState, beginAction, beginning] = useActionState(
    beginAdminMfa,
    initialState,
  );
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyAdminMfa,
    initialState,
  );

  const started = beginState.mode !== undefined;
  const error = verifyState.status === "error" ? verifyState : beginState;

  return (
    <section className="admin-mfa-gate" aria-labelledby="admin-mfa-title">
      <div className="admin-mfa-mark" aria-hidden="true">2FA</div>
      <p className="eyebrow">
        <span className="eyebrow-rule" />
        {copy("eyebrow")}
      </p>
      <h1 id="admin-mfa-title">
        {verifiedFactorId ? copy("challengeTitle") : copy("enrollTitle")}
      </h1>
      <p className="admin-mfa-description">
        {verifiedFactorId ? copy("challengeDescription") : copy("enrollDescription")}
      </p>

      {!started ? (
        <form action={beginAction}>
          <button className="button button-dark" disabled={beginning} type="submit">
            {beginning
              ? copy("starting")
              : verifiedFactorId
                ? copy("startChallenge")
                : copy("startEnrollment")}
          </button>
        </form>
      ) : (
        <>
          {beginState.mode === "enroll" && beginState.qrCode && beginState.secret ? (
            <div className="admin-mfa-enrollment">
              <Image
                alt={copy("qrAlt")}
                height={220}
                src={beginState.qrCode}
                unoptimized
                width={220}
              />
              <p>{copy("manualEntry")}</p>
              <code>{beginState.secret}</code>
            </div>
          ) : null}

          {beginState.factorId && beginState.challengeId ? (
            <form action={verifyAction} className="admin-mfa-verify">
              <input name="mode" type="hidden" value={beginState.mode} />
              <input name="factorId" type="hidden" value={beginState.factorId} />
              <input name="challengeId" type="hidden" value={beginState.challengeId} />
              <label htmlFor="admin-mfa-code">{copy("codeLabel")}</label>
              <input
                autoComplete="one-time-code"
                autoFocus
                id="admin-mfa-code"
                inputMode="numeric"
                maxLength={6}
                name="code"
                pattern="[0-9]{6}"
                required
              />
              <button className="button button-dark" disabled={verifying} type="submit">
                {verifying ? copy("verifying") : copy("verify")}
              </button>
            </form>
          ) : null}
        </>
      )}

      {error.status === "error" && error.message !== "idle" ? (
        <p className="admin-mfa-error" role="alert">
          {copy(`messages.${error.message}`)}
        </p>
      ) : null}
      <p className="admin-mfa-footnote">{copy("footnote")}</p>
    </section>
  );
}
