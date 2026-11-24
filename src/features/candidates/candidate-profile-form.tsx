"use client";

import {
  useActionState,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Check, Circle, FileUp, LockKeyhole, Plus, Trash2 } from "lucide-react";
import { saveCandidateProfile } from "./actions";
import { importResumeFile } from "./ai-resume-actions";
import type {
  CandidateCertification,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
  CandidateProfileFormState,
  CandidateProfileValues,
} from "./schemas";
import { mergeResumeDraft } from "./resume-profile-draft";
import {
  AccountPanel,
  type AccountPanelAccount,
} from "@/features/identity/account-panel";
import {
  northernCyprusDistricts,
  resolveNorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";

const initialState: CandidateProfileFormState = {
  status: "idle",
  message: "idle",
};

function ProfileEntry({
  label,
  value,
  onChange,
  name,
  multiline = false,
  maxLength,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  multiline?: boolean;
  maxLength: number;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      {multiline ? (
        <textarea
          maxLength={maxLength}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          value={value}
        />
      ) : (
        <input
          maxLength={maxLength}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          value={value}
        />
      )}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function ProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="candidate-profile-section">
      <div className="candidate-profile-section-heading">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

export function CandidateProfileForm({
  profile,
  account,
}: {
  profile: CandidateProfileValues;
  account: AccountPanelAccount;
}) {
  const copy = useTranslations("CandidateDashboard");
  const rootCopy = useTranslations();
  const [state, action, pending] = useActionState(
    saveCandidateProfile,
    initialState,
  );
  const [, startImportTransition] = useTransition();
  const [fullName, setFullName] = useState(account.displayName);
  const [headline, setHeadline] = useState(profile.headline ?? "");
  const [location, setLocation] = useState(
    resolveNorthernCyprusDistrict(profile.location) ?? "",
  );
  const [skillsText, setSkillsText] = useState(profile.skills.join("\n"));
  const [experience, setExperience] = useState(profile.experience);
  const [education, setEducation] = useState(profile.education);
  const [languages, setLanguages] = useState(profile.languages);
  const [certifications, setCertifications] = useState(profile.certifications);
  const [summary, setSummary] = useState(profile.summary ?? "");
  const [links, setLinks] = useState(profile.links ?? []);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<
    | "idle"
    | "imported"
    | "importedWithSkipped"
    | "noNewInformation"
    | "noNewInformationWithSkipped"
    | "unsupported"
    | "tooLarge"
    | "tooManyPages"
    | "empty"
    | "unreadable"
    | "legacyDoc"
    | "parseFailed"
    | "unauthorized"
    | "inactive"
  >("idle");
  const [importSkipped, setImportSkipped] = useState(0);
  const [resumeImported, setResumeImported] = useState(false);
  const [additionalSectionsOpen, setAdditionalSectionsOpen] = useState(
    Boolean(
      profile.experience.length ||
        profile.education.length ||
        profile.languages.length ||
        profile.certifications.length ||
        profile.links.length,
    ),
  );

  const profileEssentials = [
    { key: "headline", complete: Boolean(headline.trim()) },
    { key: "location", complete: Boolean(location.trim()) },
    {
      key: "skills",
      complete: skillsText.split(/[,;\n]+/).some((skill) => skill.trim()),
    },
    { key: "experience", complete: experience.length > 0 },
    { key: "education", complete: education.length > 0 },
    { key: "languages", complete: languages.length > 0 },
    { key: "certifications", complete: certifications.length > 0 },
    { key: "summary", complete: Boolean(summary.trim()) },
    { key: "links", complete: links.length > 0 },
  ] as const;
  const completedEssentials = profileEssentials.filter(
    (item) => item.complete,
  ).length;

  function updateExperience(
    index: number,
    field: keyof CandidateExperience,
    value: string,
  ) {
    setExperience((entries) =>
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function updateEducation(
    index: number,
    field: keyof CandidateEducation,
    value: string,
  ) {
    setEducation((entries) =>
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function updateLanguage(
    index: number,
    field: keyof CandidateLanguage,
    value: string,
  ) {
    setLanguages((entries) =>
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function updateCertification(
    index: number,
    field: keyof CandidateCertification,
    value: string,
  ) {
    setCertifications((entries) =>
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    );
  }

  function updateLink(
    index: number,
    field: "label" | "url",
    value: string,
  ) {
    setLinks((currentLinks) =>
      currentLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, [field]: value } : link,
      ),
    );
  }

  function removeLink(index: number) {
    setLinks((currentLinks) => currentLinks.filter((_, linkIndex) => linkIndex !== index));
  }

  function addLink() {
    setLinks((currentLinks) => [
      ...currentLinks,
      { label: "", url: "" },
    ]);
  }

  async function handleResumeFile(file: File) {
    setImporting(true);
    setImportStatus("idle");
    setImportSkipped(0);
    try {
      const request = new FormData();
      request.set("file", file);
      const importResult = await importResumeFile(request);
      if (!importResult.ok) {
        setImportStatus(importResult.code);
        return;
      }

      const mergeResult = mergeResumeDraft(
        {
          headline,
          location,
          skills: skillsText
            .split(/[,;\n]+/)
            .map((skill) => skill.trim())
            .filter(Boolean),
          experience,
          education,
          languages,
          certifications,
          summary,
          cvFullText: "",
          links,
        },
        importResult.draft,
      );
      const { profile: mergedProfile } = mergeResult;
      setHeadline(mergedProfile.headline);
      setLocation(mergedProfile.location);
      setSkillsText(mergedProfile.skills.join("\n"));
      setExperience(mergedProfile.experience);
      setEducation(mergedProfile.education);
      setLanguages(mergedProfile.languages);
      setCertifications(mergedProfile.certifications);
      setSummary(mergedProfile.summary);
      setLinks(mergedProfile.links);
      if (
        mergedProfile.experience.length ||
        mergedProfile.education.length ||
        mergedProfile.languages.length ||
        mergedProfile.certifications.length ||
        mergedProfile.links.length
      ) {
        setAdditionalSectionsOpen(true);
      }
      setImportSkipped(mergeResult.skipped);
      if (mergeResult.added === 0) {
        setImportStatus(
          mergeResult.skipped > 0
            ? "noNewInformationWithSkipped"
            : "noNewInformation",
        );
        return;
      }

      setImportStatus(
        mergeResult.skipped > 0 ? "importedWithSkipped" : "imported",
      );
      setResumeImported(true);
    } catch (error) {
      console.error("Candidate CV import failed.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setImportStatus("parseFailed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="candidate-dashboard-grid">
      <section className="candidate-profile-card" aria-labelledby="profile-title">
        <div className="candidate-profile-intro">
          <span className="candidate-profile-index">{copy("profileIndex")}</span>
          <h2 id="profile-title">{copy("profileTitle")}</h2>
          <p>{copy("profileDescription")}</p>
        </div>
        <form
          action={action}
          aria-busy={importing}
          className="candidate-profile-form"
        >
          <section className="candidate-resume-import" aria-labelledby="resume-import-title">
            <div className="candidate-resume-import-icon" aria-hidden="true">
              <FileUp size={19} />
            </div>
            <div className="candidate-resume-import-copy">
              <h3 id="resume-import-title">{rootCopy("resumeImport.title")}</h3>
              <p>{rootCopy("resumeImport.description")}</p>
              <p className="candidate-resume-privacy">
                <LockKeyhole size={14} aria-hidden="true" />
                {rootCopy("resumeImport.privacy")}
              </p>
            </div>
            <label className="candidate-resume-file">
              <span>
                {importing
                  ? rootCopy("resumeImport.processing")
                  : rootCopy("resumeImport.chooseFile")}
              </span>
              <input
                accept=".pdf,.docx,.rtf,.odt,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                disabled={importing}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) {
                    startImportTransition(() => {
                      void handleResumeFile(file);
                    });
                  }
                }}
                type="file"
              />
            </label>
            <p
              aria-live="polite"
              className="candidate-resume-status"
              data-status={
                importStatus === "imported" ||
                importStatus === "importedWithSkipped" ||
                importStatus === "noNewInformation" ||
                importStatus === "noNewInformationWithSkipped"
                  ? "success"
                  : importStatus === "idle"
                    ? "idle"
                    : "error"
              }
              role={
                importStatus !== "idle" &&
                importStatus !== "imported" &&
                importStatus !== "importedWithSkipped" &&
                importStatus !== "noNewInformation" &&
                importStatus !== "noNewInformationWithSkipped"
                  ? "alert"
                  : "status"
              }
            >
              {importStatus === "idle"
                ? importing
                  ? rootCopy("resumeImport.processingStatus")
                  : rootCopy("resumeImport.fileHint")
                : importStatus === "imported"
                  ? rootCopy("resumeImport.imported")
                  : importStatus === "importedWithSkipped"
                    ? rootCopy("resumeImport.importedWithSkipped", {
                        count: importSkipped,
                      })
                    : importStatus === "noNewInformationWithSkipped"
                      ? rootCopy("resumeImport.noNewInformationWithSkipped", {
                          count: importSkipped,
                        })
                      : importStatus === "noNewInformation"
                      ? rootCopy("resumeImport.noNewInformation")
                  : rootCopy(`resumeImport.errors.${importStatus}`)}
            </p>
          </section>

          <fieldset
            className="candidate-profile-fields"
            disabled={importing}
          >
          <input name="experience" type="hidden" value={JSON.stringify(experience)} />
          <input name="education" type="hidden" value={JSON.stringify(education)} />
          <input name="languages" type="hidden" value={JSON.stringify(languages)} />
          <input
            name="certifications"
            type="hidden"
            value={JSON.stringify(certifications)}
          />
          <input
            name="summary"
            type="hidden"
            value={JSON.stringify(summary)}
          />
          <input
            name="links"
            type="hidden"
            value={JSON.stringify(links)}
          />
          <input
            name="resumeImported"
            type="hidden"
            value={resumeImported ? "1" : ""}
          />

          <ProfileEntry
            label={copy("fullNameLabel")}
            maxLength={80}
            name="fullName"
            onChange={setFullName}
            hint={copy("fullNameHint")}
            placeholder={copy("fullNamePlaceholder")}
            value={fullName}
          />
          <ProfileEntry
            label={copy("headlineLabel")}
            maxLength={140}
            name="headline"
            onChange={setHeadline}
            hint={copy("headlineHint")}
            placeholder={copy("headlinePlaceholder")}
            value={headline}
          />
          <label>
            {copy("locationLabel")}
            <select
              name="location"
              onChange={(event) => setLocation(event.currentTarget.value)}
              value={location}
            >
              <option value="">{copy("locationPlaceholder")}</option>
              {northernCyprusDistricts.map(({ value, key }) => (
                <option key={value} value={value}>
                  {copy(`districts.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy("skillsLabel")}
            <textarea
              maxLength={2600}
              name="skillsText"
              onChange={(event) => setSkillsText(event.target.value)}
              placeholder={copy("skillsPlaceholder")}
              rows={4}
              value={skillsText}
            />
            <small>{copy("skillsHint")}</small>
          </label>

          <ProfileSection
            title={copy("summaryLabel")}
            description={copy("summaryDescription")}
          >
            <ProfileEntry
              label={copy("summaryLabel")}
              maxLength={2000}
              multiline
              name="summary"
              onChange={setSummary}
              placeholder={copy("summaryPlaceholder")}
              value={summary}
            />
          </ProfileSection>

          <ProfileSection
            title={copy("linksLabel")}
            description={copy("linksDescription")}
          >
            {links.map((link, index) => (
              <fieldset className="candidate-profile-entry" key={index}>
                <legend>{copy("entryLabel", { number: index + 1 })}</legend>
                <button
                  aria-label={copy("removeEntry")}
                  className="candidate-entry-remove"
                  onClick={() => removeLink(index)}
                  type="button"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
                <div className="candidate-entry-fields">
                  <ProfileEntry
                    label={copy("fields.linkLabel")}
                    maxLength={120}
                    onChange={(value) => updateLink(index, "label", value)}
                    value={link.label}
                  />
                  <ProfileEntry
                    label={copy("fields.linkUrl")}
                    maxLength={600}
                    onChange={(value) => updateLink(index, "url", value)}
                    value={link.url}
                  />
                </div>
              </fieldset>
            ))}
            <button
              className="candidate-entry-add"
              disabled={links.length >= 12}
              onClick={addLink}
              type="button"
            >
              <Plus size={16} aria-hidden="true" />
              {copy("linksAdd")}
            </button>
          </ProfileSection>

          <details
            className="candidate-profile-additional"
            onToggle={(event) => setAdditionalSectionsOpen(event.currentTarget.open)}
            open={additionalSectionsOpen}
          >
            <summary>
              {copy("additionalDetails", {
                count:
                  experience.length +
                  education.length +
                  languages.length +
                  certifications.length +
                  links.length,
              })}
            </summary>
            <p>{copy("additionalDetailsHint")}</p>
            <ProfileSection
            title={copy("sections.experience.title")}
            description={copy("sections.experience.description")}
          >
            {experience.map((entry, index) => (
              <fieldset className="candidate-profile-entry" key={index}>
                <legend>{copy("entryLabel", { number: index + 1 })}</legend>
                <button
                  aria-label={copy("removeEntry")}
                  className="candidate-entry-remove"
                  onClick={() =>
                    setExperience((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                  type="button"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
                <div className="candidate-entry-fields">
                  <ProfileEntry
                    label={copy("fields.role")}
                    maxLength={140}
                    onChange={(value) => updateExperience(index, "role", value)}
                    value={entry.role}
                  />
                  <ProfileEntry
                    label={copy("fields.organization")}
                    maxLength={160}
                    onChange={(value) =>
                      updateExperience(index, "organization", value)
                    }
                    value={entry.organization}
                  />
                  <ProfileEntry
                    label={copy("locationLabel")}
                    maxLength={120}
                    onChange={(value) => updateExperience(index, "location", value)}
                    value={entry.location}
                  />
                  <ProfileEntry
                    label={copy("fields.startDate")}
                    maxLength={32}
                    onChange={(value) =>
                      updateExperience(index, "startDate", value)
                    }
                    value={entry.startDate}
                    hint={copy("fields.dateHint")}
                  />
                  <ProfileEntry
                    label={copy("fields.endDate")}
                    maxLength={32}
                    onChange={(value) => updateExperience(index, "endDate", value)}
                    value={entry.endDate}
                    hint={copy("fields.dateHint")}
                  />
                  <ProfileEntry
                    label={copy("fields.description")}
                    maxLength={1800}
                    multiline
                    onChange={(value) =>
                      updateExperience(index, "description", value)
                    }
                    value={entry.description}
                  />
                </div>
              </fieldset>
            ))}
            <button
              className="candidate-entry-add"
              disabled={experience.length >= 12}
              onClick={() =>
                setExperience((entries) => [
                  ...entries,
                  {
                    role: "",
                    organization: "",
                    location: "",
                    startDate: "",
                    endDate: "",
                    description: "",
                  },
                ])
              }
              type="button"
            >
              <Plus size={16} aria-hidden="true" />
              {copy("sections.experience.add")}
            </button>
            </ProfileSection>

            <ProfileSection
            title={copy("sections.education.title")}
            description={copy("sections.education.description")}
          >
            {education.map((entry, index) => (
              <fieldset className="candidate-profile-entry" key={index}>
                <legend>{copy("entryLabel", { number: index + 1 })}</legend>
                <button
                  aria-label={copy("removeEntry")}
                  className="candidate-entry-remove"
                  onClick={() =>
                    setEducation((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                  type="button"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
                <div className="candidate-entry-fields">
                  <ProfileEntry
                    label={copy("fields.institution")}
                    maxLength={160}
                    onChange={(value) =>
                      updateEducation(index, "institution", value)
                    }
                    value={entry.institution}
                  />
                  <ProfileEntry
                    label={copy("fields.qualification")}
                    maxLength={140}
                    onChange={(value) =>
                      updateEducation(index, "qualification", value)
                    }
                    value={entry.qualification}
                  />
                  <ProfileEntry
                    label={copy("fields.field")}
                    maxLength={140}
                    onChange={(value) => updateEducation(index, "field", value)}
                    value={entry.field}
                  />
                  <ProfileEntry
                    label={copy("fields.startDate")}
                    maxLength={32}
                    onChange={(value) =>
                      updateEducation(index, "startDate", value)
                    }
                    value={entry.startDate}
                    hint={copy("fields.dateHint")}
                  />
                  <ProfileEntry
                    label={copy("fields.endDate")}
                    maxLength={32}
                    onChange={(value) => updateEducation(index, "endDate", value)}
                    value={entry.endDate}
                    hint={copy("fields.dateHint")}
                  />
                  <ProfileEntry
                    label={copy("fields.description")}
                    maxLength={1200}
                    multiline
                    onChange={(value) =>
                      updateEducation(index, "description", value)
                    }
                    value={entry.description}
                  />
                </div>
              </fieldset>
            ))}
            <button
              className="candidate-entry-add"
              disabled={education.length >= 12}
              onClick={() =>
                setEducation((entries) => [
                  ...entries,
                  {
                    institution: "",
                    qualification: "",
                    field: "",
                    startDate: "",
                    endDate: "",
                    description: "",
                  },
                ])
              }
              type="button"
            >
              <Plus size={16} aria-hidden="true" />
              {copy("sections.education.add")}
            </button>
            </ProfileSection>

            <ProfileSection
            title={copy("sections.languages.title")}
            description={copy("sections.languages.description")}
          >
            {languages.map((entry, index) => (
              <fieldset className="candidate-profile-entry" key={index}>
                <legend>{copy("entryLabel", { number: index + 1 })}</legend>
                <button
                  aria-label={copy("removeEntry")}
                  className="candidate-entry-remove"
                  onClick={() =>
                    setLanguages((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                  type="button"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
                <div className="candidate-entry-fields candidate-entry-fields--two">
                  <ProfileEntry
                    label={copy("fields.language")}
                    maxLength={80}
                    onChange={(value) => updateLanguage(index, "name", value)}
                    value={entry.name}
                  />
                  <ProfileEntry
                    label={copy("fields.proficiency")}
                    maxLength={80}
                    onChange={(value) =>
                      updateLanguage(index, "proficiency", value)
                    }
                    value={entry.proficiency}
                  />
                </div>
              </fieldset>
            ))}
            <button
              className="candidate-entry-add"
              disabled={languages.length >= 12}
              onClick={() =>
                setLanguages((entries) => [
                  ...entries,
                  { name: "", proficiency: "B1" as const },
                ])
              }
              type="button"
            >
              <Plus size={16} aria-hidden="true" />
              {copy("sections.languages.add")}
            </button>
            </ProfileSection>

            <ProfileSection
            title={copy("sections.certifications.title")}
            description={copy("sections.certifications.description")}
          >
            {certifications.map((entry, index) => (
              <fieldset className="candidate-profile-entry" key={index}>
                <legend>{copy("entryLabel", { number: index + 1 })}</legend>
                <button
                  aria-label={copy("removeEntry")}
                  className="candidate-entry-remove"
                  onClick={() =>
                    setCertifications((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    )
                  }
                  type="button"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
                <div className="candidate-entry-fields">
                  <ProfileEntry
                    label={copy("fields.certification")}
                    maxLength={160}
                    onChange={(value) =>
                      updateCertification(index, "name", value)
                    }
                    value={entry.name}
                  />
                  <ProfileEntry
                    label={copy("fields.issuer")}
                    maxLength={160}
                    onChange={(value) =>
                      updateCertification(index, "issuer", value)
                    }
                    value={entry.issuer}
                  />
                  <ProfileEntry
                    label={copy("fields.issueDate")}
                    maxLength={32}
                    onChange={(value) =>
                      updateCertification(index, "issueDate", value)
                    }
                    value={entry.issueDate}
                    hint={copy("fields.dateHint")}
                  />
                  <ProfileEntry
                    label={copy("fields.expiryDate")}
                    maxLength={32}
                    onChange={(value) =>
                      updateCertification(index, "expiryDate", value)
                    }
                    value={entry.expiryDate}
                    hint={copy("fields.dateHint")}
                  />
                </div>
              </fieldset>
            ))}
            <button
              className="candidate-entry-add"
              disabled={certifications.length >= 12}
              onClick={() =>
                setCertifications((entries) => [
                  ...entries,
                  { name: "", issuer: "", issueDate: "", expiryDate: "" },
                ])
              }
              type="button"
            >
              <Plus size={16} aria-hidden="true" />
              {copy("sections.certifications.add")}
            </button>
            </ProfileSection>
          </details>

          <button
            className="button button-dark"
            disabled={pending || importing}
            type="submit"
          >
            {pending ? copy("saving") : copy("save")}
          </button>
          <p
            aria-live="polite"
            className="candidate-profile-message"
            data-status={state.status}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message === "idle" ? "" : copy(`messages.${state.message}`)}
          </p>
          </fieldset>
        </form>
      </section>
      <aside className="candidate-profile-aside">
        <AccountPanel account={account} />
        <section className="candidate-completion-card" aria-labelledby="completion-title">
          <div className="candidate-aside-heading">
            <span className="candidate-aside-icon" aria-hidden="true">
              <Check size={17} />
            </span>
            <span>{copy("completionEyebrow")}</span>
          </div>
          <h2 id="completion-title">{copy("completionTitle")}</h2>
          <p aria-live="polite" className="candidate-completion-count">
            <strong>{completedEssentials}</strong>
            <span>{copy("completionOf", { total: profileEssentials.length })}</span>
          </p>
          <progress
            aria-label={copy("completionLabel", {
              current: completedEssentials,
              total: profileEssentials.length,
            })}
            className="candidate-completion-progress"
            max={profileEssentials.length}
            value={completedEssentials}
          />
          <ul className="candidate-completion-list">
            {profileEssentials.map(({ key, complete }) => (
              <li key={key} data-complete={complete}>
                {complete ? (
                  <Check size={15} aria-hidden="true" />
                ) : (
                  <Circle size={15} aria-hidden="true" />
                )}
                {copy(`completionFields.${key}`)}
              </li>
            ))}
          </ul>
          <p className="candidate-completion-hint">{copy("completionHint")}</p>
        </section>
        <section className="candidate-privacy-card" aria-labelledby="privacy-title">
          <LockKeyhole size={17} aria-hidden="true" />
          <h2 id="privacy-title">{copy("privacyTitle")}</h2>
          <p>{copy("privacyDescription")}</p>
        </section>
      </aside>
    </div>
  );
}
