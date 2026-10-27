"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { reviewCompanyProfile } from "./actions";
import type {
  CompanyProfileSubmissionReviewState,
} from "./schemas";

const initialState: CompanyProfileSubmissionReviewState = {
  status: "idle",
  message: "idle",
};

export function CompanyProfileReviewForm({
  submissionId,
}: {
  submissionId: string;
}) {
  const copy = useTranslations("CompanyReview");
  const [state, action, pending] = useActionState(
    reviewCompanyProfile,
    initialState,
  );

  return (
    <form action={action} className="company-review-form">
      <input name="submissionId" type="hidden" value={submissionId} />
      <label>
        {copy("reviewNote")}
        <textarea maxLength={1_000} name="reviewNote" rows={3} />
      </label>
      <div className="company-review-actions">
        <button
          className="button button-dark"
          disabled={pending}
          name="decision"
          type="submit"
          value="approved"
        >
          {pending ? copy("saving") : copy("approveAndPublish")}
        </button>
        <button
          className="button button-outline"
          disabled={pending}
          name="decision"
          type="submit"
          value="rejected"
        >
          {copy("reject")}
        </button>
      </div>
      <p
        aria-live="polite"
        className="company-review-message"
        data-status={state.status}
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message === "idle" ? "" : copy(`messages.${state.message}`)}
      </p>
    </form>
  );
}
