"use client";

import { useActionState } from "react";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { northernCyprusDistricts } from "@/features/locations/northern-cyprus-districts";
import type { Database } from "@/types/database";
import { reviewJob, saveJobDraft, submitJobForReview, updatePublishedJob } from "./actions";
import type { JobFormState, JobReviewFormState, UpdatePublishedJobFormState } from "./schemas";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];
type JobDraftValues = Pick<
  JobRow,
  | "id"
  | "status"
  | "title"
  | "slug"
  | "summary"
  | "description"
  | "requirements"
  | "responsibilities"
  | "job_type"
  | "workplace_mode"
  | "district"
>;

const initialJobState: JobFormState = { status: "idle", message: "idle" };
const initialReviewState: JobReviewFormState = { status: "idle", message: "idle" };
const initialUpdateState: UpdatePublishedJobFormState = { status: "idle", message: "idle" };

function getDraftStorageKey(companyId: string, jobId?: string): string {
  return `job-draft-${companyId}${jobId ? `-${jobId}` : ""}`;
}

function saveDraftToStorage(key: string, data: Record<string, string>) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }
}

function loadDraftFromStorage(key: string): Record<string, string> | null {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(key);
      if (stored) return JSON.parse(stored);
    } catch {
      // Ignore parse errors
    }
  }
  return null;
}

function clearDraftFromStorage(key: string) {
  if (typeof window !== "undefined") {
    localStorage.removeItem(key);
  }
}

export function JobDraftForm({
  companyId,
  job,
}: {
  companyId: string;
  job?: JobDraftValues;
}) {
  const copy = useTranslations("JobManagement.employer");
  const companyCopy = useTranslations("CompanyManagement");
  const [state, action, pending] = useActionState(saveJobDraft, initialJobState);
  const [submission, submitAction, submitting] = useActionState(
    submitJobForReview,
    initialJobState,
  );
  const [updateState, updateAction, updating] = useActionState(updatePublishedJob, initialUpdateState);
  const savedJobId = state.jobId ?? submission.jobId ?? job?.id;
  const canSubmit = submission.status !== "success" && (!job || job.status === "draft" || job.status === "rejected");
  const isEditingPublished = job?.status === "published";
  const draftKey = getDraftStorageKey(companyId, job?.id);

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = loadDraftFromStorage(draftKey);
    if (draft) {
      // Dispatch a custom event to populate form fields
      window.dispatchEvent(new CustomEvent("job-draft-load", { detail: draft }));
    }
  }, [draftKey]);

  // Save draft to localStorage on form change
  useEffect(() => {
    const handleStorage = () => {
      const form = document.querySelector(`form[data-draft-key="${draftKey}"]`) as HTMLFormElement | null;
      if (form) {
        const formData = new FormData(form);
        const data: Record<string, string> = {};
        formData.forEach((value, key) => {
          data[key] = value.toString();
        });
        saveDraftToStorage(draftKey, data);
      }
    };

    const handleInput = (e: Event) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        handleStorage();
      }
    };

    document.addEventListener("input", handleInput);
    document.addEventListener("change", handleInput);

    return () => {
      document.removeEventListener("input", handleInput);
      document.removeEventListener("change", handleInput);
    };
  }, [draftKey]);

  // Clear draft on successful save/submit/update
  useEffect(() => {
    if (state.status === "success" || submission.status === "success" || updateState.status === "success") {
      clearDraftFromStorage(draftKey);
    }
  }, [state.status, submission.status, updateState.status, draftKey]);

  return (
    <div className="job-authoring">
      <form action={action} className="job-authoring-form" data-draft-key={draftKey}>
        <fieldset aria-label={copy("description")} className="job-authoring-fields" disabled={submission.status === "success" || updateState.status === "success"}>
        <input name="companyId" type="hidden" value={companyId} />
        <input name="jobId" type="hidden" value={savedJobId ?? ""} />

        <label>
          {copy("jobTitle")}
          <input
            autoComplete="off"
            maxLength={140}
            minLength={5}
            name="title"
            required
            defaultValue={job?.title ?? ""}
          />
        </label>

        <label>
          {copy("slug")}
          <input
            autoComplete="off"
            maxLength={100}
            name="slug"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            defaultValue={job?.slug ?? ""}
          />
        </label>

        <label className="job-authoring-wide">
          {copy("summary")}
          <textarea
            maxLength={500}
            minLength={20}
            name="summary"
            required
            rows={3}
            defaultValue={job?.summary ?? ""}
          />
        </label>

        <label className="job-authoring-wide">
          {copy("descriptionLabel")}
          <textarea
            maxLength={20000}
            minLength={50}
            name="description"
            required
            rows={8}
            defaultValue={job?.description ?? ""}
          />
        </label>

        <label className="job-authoring-wide">
          {copy("requirements")}
          <textarea
            maxLength={10000}
            name="requirements"
            rows={5}
            defaultValue={job?.requirements ?? ""}
          />
        </label>

        <label className="job-authoring-wide">
          {copy("responsibilities")}
          <textarea
            maxLength={10000}
            name="responsibilities"
            rows={5}
            defaultValue={job?.responsibilities ?? ""}
          />
        </label>

        <label>
          {copy("jobType")}
          <select defaultValue={job?.job_type ?? ""} name="jobType" required>
            <option disabled value="">{copy("selectJobType")}</option>
            {(["full_time", "part_time", "contract", "temporary", "internship", "freelance"] as const).map((value) => (
              <option key={value} value={value}>{copy(value)}</option>
            ))}
          </select>
        </label>

        <label>
          {copy("workplaceMode")}
          <select defaultValue={job?.workplace_mode ?? ""} name="workplaceMode" required>
            <option disabled value="">{copy("selectWorkplace")}</option>
            {(["on_site", "hybrid", "remote"] as const).map((value) => (
              <option key={value} value={value}>{copy(value)}</option>
            ))}
          </select>
        </label>

        <label>
          {copy("district")}
          <select defaultValue={job?.district ?? ""} name="district">
            <option value="">{copy("selectDistrict")}</option>
            {northernCyprusDistricts.map(({ value, key }) => (
              <option key={value} value={value}>
                {companyCopy(`districts.${key}`)}
              </option>
            ))}
          </select>
        </label>

        <div className="job-authoring-actions">
          <button className="button button-dark" disabled={pending || submitting || updating} type="submit">
            {pending ? copy("saving") : copy("saveDraft")}
          </button>
          {canSubmit ? (
            <button
              className="button button-outline"
              disabled={pending || submitting}
              formAction={submitAction}
              type="submit"
            >
              {submitting ? copy("submitting") : copy("submitReview")}
            </button>
          ) : null}
          {isEditingPublished ? (
            <button
              className="button button-outline"
              disabled={pending || updating}
              formAction={updateAction}
              type="submit"
            >
              {updating ? copy("updating") : copy("updatePublished")}
            </button>
          ) : null}
          {state.status !== "idle" ? (
            <p aria-live="polite" data-status={state.status} role={state.status === "error" ? "alert" : "status"}>
              {copy(state.message)}
            </p>
          ) : null}
          {submission.status !== "idle" ? (
            <p aria-live="polite" data-status={submission.status} role={submission.status === "error" ? "alert" : "status"}>
              {copy(submission.message)}
            </p>
          ) : null}
          {updateState.status !== "idle" ? (
            <p aria-live="polite" data-status={updateState.status} role={updateState.status === "error" ? "alert" : "status"}>
              {copy(updateState.message)}
            </p>
          ) : null}
        </div>
        </fieldset>
      </form>
    </div>
  );
}

export function JobReviewForm({ jobId }: { jobId: string }) {
  const copy = useTranslations("JobManagement.admin");
  const [state, action, pending] = useActionState(reviewJob, initialReviewState);

  return (
    <form action={action} className="job-review-form">
      <input name="jobId" type="hidden" value={jobId} />
      <label>
        {copy("reviewNote")}
        <textarea
          maxLength={1000}
          name="reviewNote"
          required
          placeholder={copy("reviewNotePlaceholder")}
          rows={3}
        />
      </label>
      <div className="job-review-actions">
        <button
          className="button button-dark"
          disabled={pending}
          formNoValidate
          name="decision"
          type="submit"
          value="approved"
        >
          {pending ? copy("reviewing") : copy("approve")}
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
      {state.status !== "idle" ? (
        <p aria-live="polite" data-status={state.status} role={state.status === "error" ? "alert" : "status"}>
          {copy(state.message)}
        </p>
      ) : null}
    </form>
  );
}
