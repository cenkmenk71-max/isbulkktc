"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { transitionApplication } from "@/features/jobs/actions";
import type { ApplicationFormState } from "@/features/jobs/schemas";
import {
  getApplicationStatusMessageKey,
  isApplicationStatus,
  type ApplicationStatus,
} from "@/features/jobs/presentation";

const initialState: ApplicationFormState = {
  status: "idle",
  message: "idle",
};

const nextStatuses: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  submitted: ["reviewing", "shortlisted", "rejected"],
  reviewing: ["shortlisted", "rejected"],
  shortlisted: ["hired", "rejected"],
};

export function ApplicationStatusForm({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const copy = useTranslations("CompanyManagement");
  const feedback = useTranslations("JobApplication");
  const [state, action, pending] = useActionState(
    transitionApplication,
    initialState,
  );
  if (!isApplicationStatus(currentStatus)) {
    throw new Error("The application status is unsupported.");
  }
  const options = nextStatuses[currentStatus] ?? [];

  if (options.length === 0) return null;

  return (
    <form action={action} className="company-application-status-form">
      <input name="applicationId" type="hidden" value={applicationId} />
      <label>
        {copy("applicationStatusLabel")}
        <select name="nextStatus" required defaultValue="">
          <option disabled value="">
            {copy("applicationStatusLabel")}
          </option>
          {options.map((status) => (
            <option key={status} value={status}>
              {copy(getApplicationStatusMessageKey(status))}
            </option>
          ))}
        </select>
      </label>
      <button className="button button-dark" disabled={pending} type="submit">
        {pending
          ? copy("updatingApplicationStatus")
          : copy("updateApplicationStatus")}
      </button>
      {state.status !== "idle" ? (
        <p
          aria-live="polite"
          role={state.status === "error" ? "alert" : "status"}
        >
          {feedback(`messages.${state.message}`)}
        </p>
      ) : null}
    </form>
  );
}
