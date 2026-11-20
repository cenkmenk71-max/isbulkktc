"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { northernCyprusDistricts } from "@/features/locations/northern-cyprus-districts";
import type { Database } from "@/types/database";
import { reviewJob, saveJobDraft, submitJobForReview } from "./actions";
import type { JobFormState, JobReviewFormState } from "./schemas";

type JobRow = Database["public"]["Tables"]["jobs"]["Row"];

const initialJobState: JobFormState = { status: "idle", message: "idle" };
const initialReviewState: JobReviewFormState = { status: "idle", message: "idle" };

export function JobDraftForm({
  companyId,
  job,
}: {
  companyId: string;
  job?: JobRow;
}) {
  const copy = useTranslations("JobManagement.employer");
  const companyCopy = useTranslations("CompanyManagement");
  const [state, action, pending] = useActionState(saveJobDraft, initialJobState);
  const [submission, submitAction, submitting] = useActionState(
    submitJobForReview,
    initialJobState,
  );
  const savedJobId = state.jobId ?? job?.id;
  const canSubmit = savedJobId && submission.status !== "success" && (!job || job.status === "draft" || job.status === "rejected");

  return (
    <div className="job-authoring">
      <form action={action} className="job-authoring-form">
        <fieldset className="job-authoring-fields" disabled={submission.status === "success"}>
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
          <button className="button button-dark" disabled={pending} type="submit">
            {pending ? copy("saving") : copy("saveDraft")}
          </button>
          {state.status !== "idle" ? (
            <p aria-live="polite" data-status={state.status} role={state.status === "error" ? "alert" : "status"}>
              {copy(state.message)}
            </p>
          ) : null}
        </div>
        </fieldset>
      </form>

      {canSubmit ? (
        <form action={submitAction} className="job-authoring-submit">
          <input name="jobId" type="hidden" value={savedJobId ?? ""} />
          <button className="button button-outline" disabled={submitting} type="submit">
            {submitting ? copy("submitting") : copy("submitReview")}
          </button>
          {submission.status !== "idle" ? (
            <p aria-live="polite" data-status={submission.status} role={submission.status === "error" ? "alert" : "status"}>
              {copy(submission.message)}
            </p>
          ) : null}
        </form>
      ) : null}
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
