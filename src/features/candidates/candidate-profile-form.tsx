"use client";

import {
  useActionState,
  useRef,
  useState,
  useTransition,
  type Ref,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Circle,
  FileUp,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
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
const proficiencyLevels = ["Native", "C2", "C1", "B2", "B1", "A2", "A1"] as const;

function hasEntryContent(entries: object[]) {
  return entries.some((entry) =>
    Object.values(entry).some(
      (value) => typeof value === "string" && value.trim().length > 0,
    ),
  );
}

function focusProfileEntry(section: Element | null, index: number) {
  requestAnimationFrame(() => {
    const entry =
      section?.querySelectorAll<HTMLElement>(".candidate-profile-entry")[index];
    entry?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  });
}

function restoreProfileSectionFocus(
  section: Element | null,
  index: number,
  remainingCount: number,
) {
  requestAnimationFrame(() => {
    if (!section) return;
    if (remainingCount === 0) {
      section.querySelector<HTMLButtonElement>(".candidate-entry-add")?.focus();
      return;
    }

    const entry =
      section.querySelectorAll<HTMLElement>(".candidate-profile-entry")[
        Math.min(index, remainingCount - 1)
      ];
    entry?.querySelector<HTMLElement>("input, textarea, select")?.focus();
  });
}

function ProfileEntry({
  label,
  value,
  onChange,
  name,
  multiline = false,
  maxLength,
  hint,
  placeholder,
  inputRef,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  multiline?: boolean;
  maxLength: number;
  hint?: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
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
          ref={inputRef}
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
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const fullNameInputRef = useRef<HTMLInputElement>(null);
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
  const [isDraggingResume, setIsDraggingResume] = useState(false);
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
    { key: "experience", complete: hasEntryContent(experience) },
    { key: "education", complete: hasEntryContent(education) },
    { key: "languages", complete: languages.some((entry) => entry.name.trim()) },
    { key: "certifications", complete: hasEntryContent(certifications) },
    { key: "summary", complete: Boolean(summary.trim()) },
    { key: "links", complete: hasEntryContent(links) },
  ] as const;
  const completedEssentials = profileEssentials.filter(
    (item) => item.complete,
  ).length;
  const profileStatus =
    completedEssentials === 0
      ? "notStarted"
      : completedEssentials === profileEssentials.length
        ? "complete"
        : "inProgress";
  const isProfileEmpty = !(
    headline.trim() ||
    location.trim() ||
    skillsText.trim() ||
    summary.trim() ||
    hasEntryContent(experience) ||
    hasEntryContent(education) ||
    languages.some((entry) => entry.name.trim()) ||
    hasEntryContent(certifications) ||
    hasEntryContent(links)
  );

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

  async function convertPdfToImages(file: File): Promise<string[]> {
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const data = new Uint8Array(await file.arrayBuffer());
      const task = pdfjs.getDocument({ data, enableXfa: false, stopAtErrors: true });
      const pdfDocument = await task.promise;
      const maxPages = Math.min(2, pdfDocument.numPages);
      const images: string[] = [];

      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.5 });
        const maxWidth = 1200;
        const scale = Math.min(1.5, maxWidth / viewport.width);
        const scaledViewport = page.getViewport({ scale });
        const canvas = globalThis.document.createElement("canvas");
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, viewport: scaledViewport }).promise;
        const base64 = canvas.toDataURL("image/jpeg", 0.75);
        images.push(base64);
        await page.cleanup();
      }
      await task.destroy();
      return images;
    } catch {
      return [];
    }
  }

  async function handleResumeFile(file: File) {
    setImporting(true);
    setImportStatus("idle");
    setImportSkipped(0);
    try {
      const pageImages = file.type === "application/pdf" ? await convertPdfToImages(file) : [];
      const request = new FormData();
      request.set("file", file);
      if (pageImages.length > 0) {
        request.set("pageImages", JSON.stringify(pageImages));
      }
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
          <div
            aria-live="polite"
            className="candidate-profile-overview"
          >
            <span data-status={profileStatus}>
              {copy(`completionStatus.${profileStatus}`)}
            </span>
            <span>
              {copy("completionLabel", {
                current: completedEssentials,
                total: profileEssentials.length,
              })}
            </span>
          </div>
        </div>
        <form
          action={action}
          aria-busy={importing}
          className="candidate-profile-form"
        >
          {isProfileEmpty ? (
            <section
              aria-labelledby="candidate-profile-onboarding-title"
              className="candidate-profile-onboarding"
            >
              <span className="candidate-profile-onboarding-mark" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <div>
                <h3 id="candidate-profile-onboarding-title">
                  {copy("emptyProfile.title")}
                </h3>
                <p>{copy("emptyProfile.description")}</p>
                <div className="candidate-profile-onboarding-actions">
                  <button
                    className="candidate-onboarding-action candidate-onboarding-action--primary"
                    onClick={() => fullNameInputRef.current?.focus()}
                    type="button"
                  >
                    {copy("emptyProfile.start")}
                  </button>
                  <button
                    className="candidate-onboarding-action"
                    onClick={() => resumeInputRef.current?.click()}
                    type="button"
                  >
                    <FileUp size={15} aria-hidden="true" />
                    {copy("emptyProfile.import")}
                  </button>
                </div>
              </div>
            </section>
          ) : null}
          <section
            aria-labelledby="resume-import-title"
            className="candidate-resume-import"
            data-drag-active={isDraggingResume}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingResume(true);
            }}
            onDragLeave={(event) => {
              const relatedTarget = event.relatedTarget;
              if (
                !(relatedTarget instanceof Node) ||
                !event.currentTarget.contains(relatedTarget)
              ) {
                setIsDraggingResume(false);
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingResume(false);
              if (importing) return;
              const file = event.dataTransfer.files[0];
              if (file) {
                startImportTransition(() => {
                  void handleResumeFile(file);
                });
              }
            }}
          >
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
              <p className="candidate-resume-drop-hint">
                {copy("resumeImport.dropPrompt")}
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
                ref={resumeInputRef}
                aria-describedby="candidate-resume-file-hint candidate-resume-status"
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
            <p className="candidate-resume-file-hint" id="candidate-resume-file-hint">
              {rootCopy("resumeImport.fileHint")}
            </p>
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
                  : ""
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
            {importing ? (
              <div
                aria-hidden="true"
                className="candidate-resume-pending"
              >
                <LoaderCircle className="candidate-resume-spinner" size={16} />
                <span className="candidate-resume-skeleton candidate-resume-skeleton--long" />
                <span className="candidate-resume-skeleton" />
              </div>
            ) : null}
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
            inputRef={fullNameInputRef}
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
                  aria-label={copy("removeEntry", {
                    section: copy("sections.links.title"),
                    number: index + 1,
                  })}
                  className="candidate-entry-remove"
                  onClick={(event) => {
                    const section = event.currentTarget.closest(
                      ".candidate-profile-section",
                    );
                    removeLink(index);
                    restoreProfileSectionFocus(section, index, links.length - 1);
                  }}
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
              onClick={(event) => {
                const section = event.currentTarget.closest(
                  ".candidate-profile-section",
                );
                const index = links.length;
                addLink();
                focusProfileEntry(section, index);
              }}
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
                  aria-label={copy("removeEntry", {
                    section: copy("sections.experience.title"),
                    number: index + 1,
                  })}
                  className="candidate-entry-remove"
                  onClick={(event) => {
                    const section = event.currentTarget.closest(
                      ".candidate-profile-section",
                    );
                    setExperience((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    );
                    restoreProfileSectionFocus(
                      section,
                      index,
                      experience.length - 1,
                    );
                  }}
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
              onClick={(event) => {
                const section = event.currentTarget.closest(
                  ".candidate-profile-section",
                );
                const index = experience.length;
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
                ]);
                focusProfileEntry(section, index);
              }}
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
                  aria-label={copy("removeEntry", {
                    section: copy("sections.education.title"),
                    number: index + 1,
                  })}
                  className="candidate-entry-remove"
                  onClick={(event) => {
                    const section = event.currentTarget.closest(
                      ".candidate-profile-section",
                    );
                    setEducation((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    );
                    restoreProfileSectionFocus(
                      section,
                      index,
                      education.length - 1,
                    );
                  }}
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
              onClick={(event) => {
                const section = event.currentTarget.closest(
                  ".candidate-profile-section",
                );
                const index = education.length;
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
                ]);
                focusProfileEntry(section, index);
              }}
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
                  aria-label={copy("removeEntry", {
                    section: copy("sections.languages.title"),
                    number: index + 1,
                  })}
                  className="candidate-entry-remove"
                  onClick={(event) => {
                    const section = event.currentTarget.closest(
                      ".candidate-profile-section",
                    );
                    setLanguages((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    );
                    restoreProfileSectionFocus(
                      section,
                      index,
                      languages.length - 1,
                    );
                  }}
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
                  <label>
                    {copy("fields.proficiency")}
                    <select
                      onChange={(event) =>
                        updateLanguage(index, "proficiency", event.target.value)
                      }
                      value={entry.proficiency}
                    >
                      {proficiencyLevels.map((level) => (
                          <option key={level} value={level}>
                            {copy(`proficiencyLevels.${level}`)}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </fieldset>
            ))}
            <button
              className="candidate-entry-add"
              disabled={languages.length >= 12}
              onClick={(event) => {
                const section = event.currentTarget.closest(
                  ".candidate-profile-section",
                );
                const index = languages.length;
                setLanguages((entries) => [
                  ...entries,
                  { name: "", proficiency: "B1" as const },
                ]);
                focusProfileEntry(section, index);
              }}
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
                  aria-label={copy("removeEntry", {
                    section: copy("sections.certifications.title"),
                    number: index + 1,
                  })}
                  className="candidate-entry-remove"
                  onClick={(event) => {
                    const section = event.currentTarget.closest(
                      ".candidate-profile-section",
                    );
                    setCertifications((entries) =>
                      entries.filter((_, entryIndex) => entryIndex !== index),
                    );
                    restoreProfileSectionFocus(
                      section,
                      index,
                      certifications.length - 1,
                    );
                  }}
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
              onClick={(event) => {
                const section = event.currentTarget.closest(
                  ".candidate-profile-section",
                );
                const index = certifications.length;
                setCertifications((entries) => [
                  ...entries,
                  { name: "", issuer: "", issueDate: "", expiryDate: "" },
                ]);
                focusProfileEntry(section, index);
              }}
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
          <p
            className="candidate-completion-status"
            data-status={profileStatus}
          >
            {copy(`completionStatus.${profileStatus}`)}
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
