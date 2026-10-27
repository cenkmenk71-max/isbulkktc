"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  assignCompanyJobPackage,
  saveJobPackage,
} from "./actions";
import type {
  JobPackageActionState,
} from "./schemas";

const initialState: JobPackageActionState = {
  status: "idle",
  message: "idle",
};

type PackageOption = {
  id: string;
  code: string;
  display_name: string;
  description: string;
  max_active_jobs: number;
  job_duration_days: number;
  is_active: boolean;
};

type VerifiedCompanyOption = {
  id: string;
  name: string;
  slug: string;
  package_id: string | null;
  package_code: string | null;
  package_name: string | null;
  max_active_jobs: number | null;
  job_duration_days: number | null;
  active_jobs: number;
  assignment_expires_at: string | null;
};

function PackageFields({
  jobPackage,
  copy,
}: {
  jobPackage?: PackageOption;
  copy: ReturnType<typeof useTranslations<"AdminPackages">>;
}) {
  return (
    <>
      <input name="packageId" type="hidden" value={jobPackage?.id ?? ""} />
      <label>
        {copy("fields.code")}
        <input
          autoComplete="off"
          maxLength={80}
          name="code"
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
          defaultValue={jobPackage?.code ?? ""}
        />
      </label>
      <label>
        {copy("fields.name")}
        <input
          maxLength={100}
          name="displayName"
          required
          defaultValue={jobPackage?.display_name ?? ""}
        />
      </label>
      <label className="admin-package-field-wide">
        {copy("fields.description")}
        <textarea
          maxLength={1000}
          name="description"
          rows={3}
          defaultValue={jobPackage?.description ?? ""}
        />
      </label>
      <label>
        {copy("fields.activeJobs")}
        <input
          max={1000}
          min={1}
          name="maxActiveJobs"
          required
          type="number"
          defaultValue={jobPackage?.max_active_jobs ?? 1}
        />
      </label>
      <label>
        {copy("fields.duration")}
        <input
          max={365}
          min={1}
          name="jobDurationDays"
          required
          type="number"
          defaultValue={jobPackage?.job_duration_days ?? 30}
        />
      </label>
      <label>
        {copy("fields.visibility")}
        <select
          defaultValue={jobPackage?.is_active === false ? "false" : "true"}
          name="isActive"
        >
          <option value="true">{copy("active")}</option>
          <option value="false">{copy("inactive")}</option>
        </select>
      </label>
    </>
  );
}

function PackageActionMessage({ state }: { state: JobPackageActionState }) {
  const copy = useTranslations("AdminPackages");
  if (state.status === "idle") return null;
  return (
    <p
      aria-live="polite"
      className="admin-package-message"
      data-status={state.status}
      role={state.status === "error" ? "alert" : "status"}
    >
      {copy(`messages.${state.message}`)}
    </p>
  );
}

export function NewAdminPackageForm() {
  const copy = useTranslations("AdminPackages");
  const [state, action, pending] = useActionState(saveJobPackage, initialState);

  return (
    <form action={action} className="admin-package-form">
      <h3>{copy("newPackage")}</h3>
      <div className="admin-package-fields">
        <PackageFields copy={copy} />
      </div>
      <div className="admin-package-submit">
        <button className="button button-dark" disabled={pending} type="submit">
          {pending ? copy("saving") : copy("createPackage")}
        </button>
        <PackageActionMessage state={state} />
      </div>
    </form>
  );
}

export function EditAdminPackageForm({
  jobPackage,
}: {
  jobPackage: PackageOption;
}) {
  const copy = useTranslations("AdminPackages");
  const [state, action, pending] = useActionState(saveJobPackage, initialState);

  return (
    <form action={action} className="admin-package-form admin-package-form-edit">
      <div className="admin-package-fields">
        <PackageFields copy={copy} jobPackage={jobPackage} />
      </div>
      <div className="admin-package-submit">
        <button className="button button-dark" disabled={pending} type="submit">
          {pending ? copy("saving") : copy("savePackage")}
        </button>
        <PackageActionMessage state={state} />
      </div>
    </form>
  );
}

export function CompanyPackageAssignmentForm({
  companies,
  packages,
}: {
  companies: VerifiedCompanyOption[];
  packages: PackageOption[];
}) {
  const copy = useTranslations("AdminPackages");
  const [state, action, pending] = useActionState(
    assignCompanyJobPackage,
    initialState,
  );
  const activePackages = packages.filter((jobPackage) => jobPackage.is_active);

  if (companies.length === 0 || activePackages.length === 0) return null;

  return (
    <form action={action} className="admin-package-form admin-assignment-form">
      <h3>{copy("assignPackage")}</h3>
      <div className="admin-package-fields">
        <label>
          {copy("fields.company")}
          <select defaultValue="" name="companyId" required>
            <option disabled value="">{copy("selectCompany")}</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("fields.package")}
          <select defaultValue="" name="packageId" required>
            <option disabled value="">{copy("selectPackage")}</option>
            {activePackages.map((jobPackage) => (
              <option key={jobPackage.id} value={jobPackage.id}>
                {jobPackage.display_name} · {jobPackage.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("fields.assignmentDuration")}
          <input
            max={3650}
            min={1}
            name="durationDays"
            type="number"
            placeholder={copy("unlimited")}
          />
        </label>
      </div>
      <div className="admin-package-submit">
        <button className="button button-dark" disabled={pending} type="submit">
          {pending ? copy("assigning") : copy("assign")}
        </button>
        <PackageActionMessage state={state} />
      </div>
    </form>
  );
}
