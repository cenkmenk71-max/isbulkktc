"use client";

import { useActionState, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  FileLock2,
  FileUp,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { submitCompanyProfile } from "./actions";
import type {
  CompanyProfileSubmissionStatus,
  CompanyVerificationStatus,
} from "@/types/database";
import type {
  CompanyProfileFormState,
} from "./schemas";
import {
  applyCompanyDirectoryAutofill,
  getCompanyDirectoryAutofill,
  type CompanyDirectoryAutofill,
  type CompanyDirectoryAutofillSource,
  type CompanyProfileFields,
} from "./company-directory-autofill";
import { DirectoryDropdown } from "./directory-dropdown";
import {
  applyCompanyDocumentAutofill,
  type CompanyDocumentConflict,
} from "./company-document-autofill";
import { importCompanyDocument } from "./company-document-actions";
import {
  northernCyprusDistricts,
  resolveNorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";

export type DirectoryTargetOption = CompanyDirectoryAutofillSource & {
  value: string;
  label: string;
};

const documentFieldTranslationKeys: Record<keyof import("./company-document-parser").CompanyDocumentSuggestions, string> = {
  companyName: "companyName",
  website: "website",
  phone: "phone",
  publicEmail: "publicEmail",
  address: "address",
  municipality: "municipality",
  profileDescription: "description",
  categoriesText: "categories",
};

const initialState: CompanyProfileFormState = {
  status: "idle",
  message: "idle",
};

export function CompanyProfileForm({
  companyId,
  companyName,
  profileDescription,
  categories,
  website,
  phone,
  publicEmail,
  address,
  municipality,
  directoryTarget,
  verificationStatus,
  submissionStatus,
  reviewNote,
  directoryTargets,
}: {
  companyId: string;
  companyName: string;
  profileDescription: string;
  categories: string[];
  website: string | null;
  phone: string | null;
  publicEmail: string | null;
  address: string | null;
  municipality: string | null;
  directoryTarget: string;
  verificationStatus: CompanyVerificationStatus;
  submissionStatus: CompanyProfileSubmissionStatus | null;
  reviewNote: string | null;
  directoryTargets: DirectoryTargetOption[];
}) {
  const copy = useTranslations("CompanyManagement");
  const [state, action, pending] = useActionState(submitCompanyProfile, initialState);
  const initialFields: CompanyProfileFields = {
    companyName,
    profileDescription,
    categoriesText: categories.join(", "),
    website: website ?? "",
    phone: phone ?? "",
    publicEmail: publicEmail ?? "",
    address: address ?? "",
    municipality: resolveNorthernCyprusDistrict(municipality) ?? "",
  };
  const initialFieldsRef = useRef(initialFields);
  const fieldsRef = useRef(initialFields);
  const lastAutofillRef = useRef<CompanyDirectoryAutofill>({});
  const [fields, setFields] = useState(initialFields);
  const [directorySearch, setDirectorySearch] = useState(
    directoryTargets.find((target) => target.value === directoryTarget)?.label ?? "",
  );
  const [selectedDirectoryTarget, setSelectedDirectoryTarget] =
    useState(directoryTarget);
  const [directoryMatchApplied, setDirectoryMatchApplied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(directoryTarget));
  const [documentImporting, setDocumentImporting] = useState(false);
  const [documentImportStatus, setDocumentImportStatus] = useState<
    | "idle"
    | "imported"
    | "suggestionApplied"
    | "suggestionsOnly"
    | "noNewInformation"
    | "unsupported"
    | "tooLarge"
    | "tooManyPages"
    | "empty"
    | "unreadable"
    | "legacyDoc"
  >("idle");
  const [documentFieldsFilled, setDocumentFieldsFilled] = useState(0);
  const [documentConflicts, setDocumentConflicts] = useState<
    CompanyDocumentConflict[]
  >([]);

  function updateField<K extends keyof CompanyProfileFields>(
    field: K,
    value: string,
  ) {
    const updatedFields = { ...fieldsRef.current, [field]: value };
    fieldsRef.current = updatedFields;
    setFields(updatedFields);
  }

  async function handleCompanyDocument(file: File) {

    try {
      const request = new FormData();
      request.set("file", file);

      const result = await importCompanyDocument(request);
      if (!result.ok) {
        setDocumentImportStatus(
          result.code === "unauthorized" || result.code === "inactive"
            ? "unreadable"
            : result.code === "parseFailed"
              ? "unreadable"
              : result.code,
        );
        return;
      }

      const suggestions = result.suggestions;
      const autofillResult = applyCompanyDocumentAutofill(
        fieldsRef.current,
        suggestions,
      );
      fieldsRef.current = autofillResult.fields;
      setFields(autofillResult.fields);
      setDocumentFieldsFilled(autofillResult.filled);
      setDocumentConflicts(autofillResult.conflicts);
      setDocumentImportStatus(
        autofillResult.filled > 0
          ? "imported"
          : autofillResult.conflicts.length > 0
            ? "suggestionsOnly"
            : "noNewInformation",
      );
      if (autofillResult.filled > 0 || autofillResult.conflicts.length > 0) {
        setDetailsOpen(true);
      }
    } catch (error) {
      console.error("Company document parsing failed.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setDocumentImportStatus("unreadable");
    } finally {
      setDocumentImporting(false);
    }
  }

  return (
    <section className="company-management-card" aria-labelledby="company-profile-title">
        <header className="company-management-card-heading">
          <p className="company-management-status">
            {verificationStatus === "verified" ? (
              <BadgeCheck size={15} aria-hidden="true" />
            ) : (
              <ShieldCheck size={15} aria-hidden="true" />
            )}
            {copy(`verification.${verificationStatus}`)}
          </p>
          <h2 id="company-profile-title">{copy("profileTitle")}</h2>
          <p>{copy("profileDescription")}</p>
        </header>

        {submissionStatus ? (
          <p className="company-management-review-note" role="status">
            <strong>{copy(`submission.${submissionStatus}`)}</strong>
            {reviewNote ? <span>{reviewNote}</span> : null}
          </p>
        ) : null}

        <form action={action} className="company-management-form">
          <input name="companyId" type="hidden" value={companyId} />
          <input
            name="directoryTarget"
            type="hidden"
            value={selectedDirectoryTarget}
          />
          <div className="company-management-directory-search">
            <label>
              {copy("directorySearchLabel")}
              <DirectoryDropdown
                targets={directoryTargets}
                value={directorySearch}
                onSelect={(target) => {
                  setDirectorySearch(target.label);
                  setSelectedDirectoryTarget(target.value);
                  setDirectoryMatchApplied(true);
                  setDetailsOpen(true);
                  const result = applyCompanyDirectoryAutofill(
                    fieldsRef.current,
                    initialFieldsRef.current,
                    lastAutofillRef.current,
                    getCompanyDirectoryAutofill(target),
                  );
                  lastAutofillRef.current = result.autofilled;
                  fieldsRef.current = result.fields;
                  setFields(result.fields);
                }}
              />
            </label>
            <small>{copy("directorySearchHint")}</small>
            {directoryMatchApplied ? (
              <p aria-live="polite" className="company-management-autofill-note" role="status">
                {copy("directoryMatchApplied")}
              </p>
            ) : null}
          </div>
          <fieldset className="company-management-fieldset">
            <legend>{copy("workspace.identitySection")}</legend>
            <div className="company-management-fields">
              <label className="company-management-span">
                {copy("companyName")}
                <input
                  autoComplete="organization"
                  maxLength={120}
                  minLength={2}
                  name="companyName"
                  onChange={(event) =>
                    updateField("companyName", event.currentTarget.value)
                  }
                  required
                  value={fields.companyName}
                />
              </label>
            </div>
          </fieldset>
          <details
            className="company-management-optional-details"
            onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
            open={detailsOpen}
          >
            <summary>{copy("optionalDetails")}</summary>
            <p>{copy("optionalDetailsHint")}</p>
            <fieldset className="company-management-fieldset">
              <legend>{copy("workspace.profileDetailsSection")}</legend>
              <div className="company-management-fields">
                <label className="company-management-span">
                  {copy("description")}
                  <textarea
                    maxLength={2_000}
                    name="profileDescription"
                    onChange={(event) =>
                      updateField("profileDescription", event.currentTarget.value)
                    }
                    rows={4}
                    value={fields.profileDescription}
                  />
                </label>
                <label className="company-management-span">
                  {copy("categories")}
                  <input
                    maxLength={1_000}
                    name="categoriesText"
                    placeholder={copy("categoriesHint")}
                    onChange={(event) =>
                      updateField("categoriesText", event.currentTarget.value)
                    }
                    value={fields.categoriesText}
                  />
                  <small>{copy("categoriesHint")}</small>
                </label>
              </div>
            </fieldset>
            <fieldset className="company-management-fieldset">
              <legend>{copy("workspace.contactSection")}</legend>
              <div className="company-management-fields">
                <label className="company-management-span">
                  {copy("website")}
                  <input
                    autoComplete="url"
                    maxLength={2_048}
                    name="website"
                    onChange={(event) =>
                      updateField("website", event.currentTarget.value)
                    }
                    placeholder="https://"
                    type="url"
                    value={fields.website}
                  />
                </label>
                <label>
                  {copy("phone")}
                  <input
                    autoComplete="tel"
                    maxLength={80}
                    name="phone"
                    onChange={(event) =>
                      updateField("phone", event.currentTarget.value)
                    }
                    type="tel"
                    value={fields.phone}
                  />
                </label>
                <label>
                  {copy("publicEmail")}
                  <input
                    autoComplete="email"
                    maxLength={254}
                    name="publicEmail"
                    onChange={(event) =>
                      updateField("publicEmail", event.currentTarget.value)
                    }
                    type="email"
                    value={fields.publicEmail}
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="company-management-fieldset">
              <legend>{copy("workspace.locationSection")}</legend>
              <div className="company-management-fields">
                <label>
                  {copy("municipality")}
                  <select
                    autoComplete="address-level2"
                    name="municipality"
                    onChange={(event) =>
                      updateField("municipality", event.currentTarget.value)
                    }
                    value={fields.municipality}
                  >
                    <option value="">{copy("districtPlaceholder")}</option>
                    {northernCyprusDistricts.map(({ value, key }) => (
                      <option key={value} value={value}>
                        {copy(`districts.${key}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {copy("address")}
                  <input
                    autoComplete="street-address"
                    maxLength={240}
                    name="address"
                    onChange={(event) =>
                      updateField("address", event.currentTarget.value)
                    }
                    value={fields.address}
                  />
                </label>
              </div>
            </fieldset>
          </details>
          <section
            aria-labelledby="company-document-import-title"
            className="candidate-resume-import company-document-import"
          >
            <div className="candidate-resume-import-icon" aria-hidden="true">
              <FileUp size={19} />
            </div>
            <div className="candidate-resume-import-copy">
              <h3 id="company-document-import-title">
                {copy("documentImport.title")}
              </h3>
              <p>{copy("documentImport.description")}</p>
              <p className="candidate-resume-privacy">
                <FileLock2 size={14} aria-hidden="true" />
                {copy("documentImport.privacy")}
              </p>
              <p>{copy("documentImport.fileHint")}</p>
            </div>
            <label className="candidate-resume-file">
              <span>
                {documentImporting
                  ? copy("documentImport.processing")
                  : copy("documentImport.chooseFile")}
              </span>
              <input
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={documentImporting}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void handleCompanyDocument(file);
                }}
                type="file"
              />
            </label>
            <p
              aria-live="polite"
              className="candidate-resume-status"
              data-status={
                documentImportStatus === "imported" ||
                documentImportStatus === "suggestionApplied" ||
                documentImportStatus === "suggestionsOnly" ||
                documentImportStatus === "noNewInformation"
                  ? "success"
                  : documentImportStatus === "idle"
                    ? "idle"
                    : "error"
              }
              role={
                documentImportStatus === "idle" ||
                documentImportStatus === "imported" ||
                documentImportStatus === "suggestionApplied" ||
                documentImportStatus === "suggestionsOnly" ||
                documentImportStatus === "noNewInformation"
                  ? "status"
                  : "alert"
              }
            >
              {documentImporting
                ? copy("documentImport.processingStatus")
                : documentImportStatus === "idle"
                  ? ""
                  : documentImportStatus === "imported"
                    ? copy("documentImport.imported", {
                        count: documentFieldsFilled,
                      })
                    : documentImportStatus === "suggestionApplied"
                      ? copy("documentImport.suggestionApplied")
                    : documentImportStatus === "suggestionsOnly"
                      ? copy("documentImport.suggestionsOnly", {
                          count: documentConflicts.length,
                        })
                    : documentImportStatus === "noNewInformation"
                      ? copy("documentImport.noNewInformation")
                      : copy(`documentImport.errors.${documentImportStatus}`)}
            </p>
            {documentConflicts.length > 0 ? (
              <div className="company-document-conflicts">
                <strong>{copy("documentImport.conflictsTitle")}</strong>
                {documentConflicts.map(({ field, value }) => (
                  <div className="company-document-conflict" key={field}>
                    <span>
                      <strong>
                        {copy(
                          documentFieldTranslationKeys[field] as Parameters<
                            typeof copy
                          >[0],
                        )}
                      </strong>
                      <span>{value}</span>
                    </span>
                    <button
                      className="button button-outline"
                      onClick={() => {
                        updateField(field, value);
                        setDocumentConflicts((conflicts) =>
                          conflicts.filter((conflict) => conflict.field !== field),
                        );
                        setDocumentImportStatus("suggestionApplied");
                      }}
                      type="button"
                    >
                      {copy("documentImport.applySuggestion")}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <p className="company-management-publish-note">
            <LockKeyhole size={15} aria-hidden="true" />
            {copy("documentsUnavailable")}
          </p>
          <p className="company-management-publish-note">
            <LockKeyhole size={15} aria-hidden="true" />
            {copy("publicationNote")}
          </p>
          <button
            className="button button-dark"
            disabled={pending || documentImporting}
            type="submit"
          >
            {pending ? copy("saving") : copy("submitForReview")}
          </button>
          <p
            aria-live="polite"
            className="company-management-message"
            data-status={state.status}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message === "idle" ? "" : copy(`messages.${state.message}`)}
          </p>
        </form>
    </section>
  );
}
