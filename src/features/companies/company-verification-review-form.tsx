"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { reviewCompanyVerification } from "./actions";
import type { CompanyVerificationReviewState } from "./schemas";

const initialState: CompanyVerificationReviewState = {
  status: "idle",
  message: "idle",
};

export function CompanyVerificationReviewForm({
  companyId,
}: {
  companyId: string;
}) {
  const copy = useTranslations("CompanyReview");
  const [state, action, pending] = useActionState(
    reviewCompanyVerification,
    initialState,
  );

  return (
    <form action={action} className="company-review-form">
      <input name="companyId" type="hidden" value={companyId} />
      <div className="company-review-actions">
        <button
          className="button button-dark"
          disabled={pending}
          name="decision"
          type="submit"
          value="verified"
        >
          {pending ? copy("saving") : copy("verifyCompany")}
        </button>
        <button
          className="button button-outline"
          disabled={pending}
          name="decision"
          type="submit"
          value="rejected"
        >
          {copy("rejectVerification")}
        </button>
      </div>
      <p
        aria-live="polite"
        className="company-review-message"
        data-status={state.status}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message === "idle"
          ? ""
          : copy(`verificationMessages.${state.message}`)}
      </p>
    </form>
  );
}
