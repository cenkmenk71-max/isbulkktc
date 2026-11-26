"use client";

import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Ref,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  FileUp,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
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
  candidateProfileSectionKeys,
  getOpenCandidateProfileSections,
  hasEntryContent,
  type CandidateProfileSectionKey,
} from "./candidate-profile-sections";
import {
  AccountPanel,
  type AccountPanelAccount,
} from "@/features/identity/account-panel";
import {
  northernCyprusDistricts,
  resolveNorthernCyprusDistrict,
} from "@/features/locations/northern-cyprus-districts";
import { jobTypeKeys } from "@/features/jobs/job-type-slugs";

const workplaceModeKeys = ["on_site", "hybrid", "remote"] as const;

const initialState: CandidateProfileFormState = {
  status: "idle",
  message: "idle",
};
const proficiencyLevels = ["Native", "C2", "C1", "B2", "B1", "A2", "A1"] as const;

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

function AccordionCard({
  title,
  description,
  children,
  isOpen,
  onToggle,
  badge,
  sectionKey,
}: {
  title: string;
  description: string;
  children: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  badge?: ReactNode;
  sectionKey: CandidateProfileSectionKey;
}) {
  const contentId = useId();

  return (
    <section
      className="candidate-profile-accordion-card"
      id={`candidate-profile-section-${sectionKey}`}
    >
      <h3 className="candidate-profile-accordion-heading-wrap">
        <button
          type="button"
          className="candidate-profile-accordion-heading"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={contentId}
        >
          <span className="candidate-profile-accordion-title">
            <span>{title}</span>
            {badge}
          </span>
          <span className="candidate-profile-accordion-chevron" aria-hidden="true">
            {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </span>
        </button>
      </h3>
      <p className="candidate-profile-section-description">{description}</p>
      <div
        id={contentId}
        className="candidate-profile-accordion-content"
        hidden={!isOpen}
      >
        {children}
      </div>
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
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [jobTypePreference, setJobTypePreference] = useState(
    profile.jobTypePreference,
  );
  const [workplaceModePreference, setWorkplaceModePreference] = useState(
    profile.workplaceModePreference,
  );
  const [availability, setAvailability] = useState(profile.availability ?? "");
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
  const [importAdded, setImportAdded] = useState(0);
  const [importFilledFields, setImportFilledFields] = useState<string[]>([]);
  const [resumeImported, setResumeImported] = useState(false);
  const [isDraggingResume, setIsDraggingResume] = useState(false);

  const [openSections, setOpenSections] = useState<
    Set<CandidateProfileSectionKey>
  >(() =>
    getOpenCandidateProfileSections(profile),
  );

  const [initialValues, setInitialValues] = useState(() => ({
    ...profile,
    fullName: account.displayName,
    phone: profile.phone ?? "",
    availability: profile.availability ?? "",
    headline: profile.headline ?? "",
    location: resolveNorthernCyprusDistrict(profile.location) ?? "",
    summary: profile.summary ?? "",
    skillsText: profile.skills.join("\n"),
  }));
  const currentValuesRef = useRef(initialValues);
  const previousActionStateRef = useRef(state);

  useEffect(() => {
    currentValuesRef.current = {
      ...initialValues,
      fullName,
      phone,
      jobTypePreference,
      workplaceModePreference,
      availability,
      headline,
      location,
      summary,
      skillsText,
      experience,
      education,
      languages,
      certifications,
      links,
    };
  }, [
    initialValues,
    fullName,
    phone,
    jobTypePreference,
    workplaceModePreference,
    availability,
    headline,
    location,
    summary,
    skillsText,
    experience,
    education,
    languages,
    certifications,
    links,
  ]);

  useEffect(() => {
    if (previousActionStateRef.current === state) return;
    previousActionStateRef.current = state;
    if (state.status !== "success") return;

    setInitialValues(currentValuesRef.current);
    setResumeImported(false);
    setImportSkipped(0);
    setImportAdded(0);
    setImportFilledFields([]);
    setImportStatus("idle");
  }, [state]);

  const hasUnsavedChanges = useMemo(() => {
    const initial = initialValues;
    if (!initial) return false;

    if (fullName !== initial.fullName) return true;
    if (phone !== initial.phone) return true;
    if (headline !== initial.headline) return true;
    if (location !== initial.location) return true;
    if (availability !== initial.availability) return true;
    if (summary !== initial.summary) return true;
    if (skillsText !== initial.skillsText) return true;
    if (jobTypePreference !== initial.jobTypePreference) return true;
    if (workplaceModePreference !== initial.workplaceModePreference) return true;
    if (JSON.stringify(experience) !== JSON.stringify(initial.experience))
      return true;
    if (JSON.stringify(education) !== JSON.stringify(initial.education))
      return true;
    if (JSON.stringify(languages) !== JSON.stringify(initial.languages))
      return true;
    if (
      JSON.stringify(certifications) !== JSON.stringify(initial.certifications)
    )
      return true;
    if (JSON.stringify(links) !== JSON.stringify(initial.links)) return true;

    return false;
  }, [
    fullName,
    phone,
    headline,
    location,
    availability,
    summary,
    skillsText,
    jobTypePreference,
    workplaceModePreference,
    experience,
    education,
    languages,
    certifications,
    links,
    initialValues,
  ]);

  function revertToInitial() {
    const initial = initialValues;
    setFullName(initial.fullName);
    setPhone(initial.phone);
    setJobTypePreference(initial.jobTypePreference);
    setWorkplaceModePreference(initial.workplaceModePreference);
    setAvailability(initial.availability);
    setHeadline(initial.headline);
    setLocation(initial.location);
    setSkillsText(initial.skillsText);
    setExperience(initial.experience);
    setEducation(initial.education);
    setLanguages(initial.languages);
    setCertifications(initial.certifications);
    setSummary(initial.summary);
    setLinks(initial.links ?? []);
    setResumeImported(false);
    setImportSkipped(0);
    setImportStatus("idle");
  }

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

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks((currentLinks) =>
      currentLinks.map((link, linkIndex) =>
        linkIndex === index ? { ...link, [field]: value } : link,
      ),
    );
  }

  function removeLink(index: number) {
    setLinks((currentLinks) =>
      currentLinks.filter((_, linkIndex) => linkIndex !== index),
    );
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
          phone,
          jobTypePreference,
          workplaceModePreference,
          availability,
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
      const { profile: mergedProfile, added, skipped, filledFields } =
        mergeResult;
      setHeadline(mergedProfile.headline);
      setLocation(mergedProfile.location);
      setSkillsText(mergedProfile.skills.join("\n"));
      setExperience(mergedProfile.experience);
      setEducation(mergedProfile.education);
      setLanguages(mergedProfile.languages);
      setCertifications(mergedProfile.certifications);
      setSummary(mergedProfile.summary);
      setLinks(mergedProfile.links);
      setImportSkipped(skipped);
      setImportAdded(added);
      setImportFilledFields(filledFields);
      if (added === 0) {
        setImportStatus(
          skipped > 0
            ? "noNewInformationWithSkipped"
            : "noNewInformation",
        );
        return;
      }

      setImportStatus(skipped > 0 ? "importedWithSkipped" : "imported");
      setResumeImported(true);
      setOpenSections(getOpenCandidateProfileSections(mergedProfile));
    } catch (error) {
      console.error("Candidate CV import failed.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      setImportStatus("parseFailed");
    } finally {
      setImporting(false);
    }
  }

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
    phone.trim() ||
    Boolean(jobTypePreference) ||
    Boolean(workplaceModePreference) ||
    availability.trim() ||
    skillsText.trim() ||
    summary.trim() ||
    hasEntryContent(experience) ||
    hasEntryContent(education) ||
    languages.some((entry) => entry.name.trim()) ||
    hasEntryContent(certifications) ||
    hasEntryContent(links)
  );

  const scrollToSection = (sectionKey: CandidateProfileSectionKey) => {
    setOpenSections((prev) => new Set(prev).add(sectionKey));
    const section = document.getElementById(
      `candidate-profile-section-${sectionKey}`,
    );
    requestAnimationFrame(() => {
      section?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center",
      });
    });
  };

  const completionKeyToSection: Record<string, CandidateProfileSectionKey> = {
    headline: "essentials",
    location: "essentials",
    skills: "linksSkills",
    experience: "experience",
    education: "education",
    languages: "languagesCerts",
    certifications: "languagesCerts",
    links: "linksSkills",
    summary: "essentials",
  };

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
                aria-describedby="candidate-resume-status"
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
                  ? rootCopy("resumeImport.processing")
                  : ""
                : importStatus === "imported"
                  ? rootCopy("resumeImport.imported", {
                      count: importAdded,
                      fields: importFilledFields.join(", "),
                    })
                  : importStatus === "importedWithSkipped"
                    ? rootCopy("resumeImport.importedWithSkipped", {
                        count: importAdded,
                        skipped: importSkipped,
                        fields: importFilledFields.join(", "),
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
            disabled={pending || importing}
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
            value={resumeImported && hasUnsavedChanges ? "1" : ""}
          />

          <div className="candidate-profile-accordion-controls">
            <button
              className="candidate-profile-accordion-control"
              onClick={() =>
                setOpenSections(new Set(candidateProfileSectionKeys))
              }
              type="button"
            >
              {copy("accordion.openAll")}
            </button>
            <button
              className="candidate-profile-accordion-control"
              onClick={() => setOpenSections(new Set())}
              type="button"
            >
              {copy("accordion.closeAll")}
            </button>
          </div>

          <AccordionCard
            sectionKey="essentials"
            title={copy("sections.essentials.title")}
            description={copy("sections.essentials.description")}
            isOpen={openSections.has("essentials")}
            onToggle={() =>
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has("essentials")) next.delete("essentials");
                else next.add("essentials");
                return next;
              })
            }
          >
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
              label={copy("phoneLabel")}
              maxLength={80}
              name="phone"
              onChange={setPhone}
              value={phone}
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
            <ProfileEntry
              label={copy("summaryLabel")}
              maxLength={2000}
              multiline
              name="summary"
              onChange={setSummary}
              placeholder={copy("summaryPlaceholder")}
              value={summary}
            />
          </AccordionCard>

          <AccordionCard
            sectionKey="preferences"
            title={copy("sections.preferences.title")}
            description={copy("sections.preferences.description")}
            isOpen={openSections.has("preferences")}
            onToggle={() =>
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has("preferences")) next.delete("preferences");
                else next.add("preferences");
                return next;
              })
            }
          >
            <label>
              {copy("jobTypePreferenceLabel")}
              <select
                name="jobTypePreference"
                onChange={(event) => {
                  const selected = event.currentTarget.value;
                  setJobTypePreference(
                    jobTypeKeys.find((jobType) => jobType === selected) ?? "",
                  );
                }}
                value={jobTypePreference}
              >
                <option value="">{copy("selectPlaceholder")}</option>
                {jobTypeKeys.map((jobType) => (
                  <option key={jobType} value={jobType}>
                    {rootCopy(`HomeJobSearch.jobTypes.${jobType}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy("workplaceModePreferenceLabel")}
              <select
                name="workplaceModePreference"
                onChange={(event) => {
                  const selected = event.currentTarget.value;
                  setWorkplaceModePreference(
                    workplaceModeKeys.find((mode) => mode === selected) ?? "",
                  );
                }}
                value={workplaceModePreference}
              >
                <option value="">{copy("selectPlaceholder")}</option>
                {workplaceModeKeys.map((workplaceMode) => (
                  <option key={workplaceMode} value={workplaceMode}>
                    {rootCopy(`HomeJobSearch.workplaceModes.${workplaceMode}`)}
                  </option>
                ))}
              </select>
            </label>
            <ProfileEntry
              label={copy("availabilityLabel")}
              maxLength={80}
              name="availability"
              onChange={setAvailability}
              value={availability}
            />
          </AccordionCard>

          <AccordionCard
            sectionKey="experience"
            title={copy("sections.experience.title")}
            description={copy("sections.experience.description")}
            isOpen={openSections.has("experience")}
            onToggle={() =>
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has("experience")) next.delete("experience");
                else next.add("experience");
                return next;
              })
            }
            badge={
              experience.length > 0 ? (
                <span className="candidate-profile-section-badge">
                  {experience.length} {copy("entryCount")}
                </span>
              ) : null
            }
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
                      ".candidate-profile-accordion-card",
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
                  ".candidate-profile-accordion-card",
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
          </AccordionCard>

          <AccordionCard
            sectionKey="education"
            title={copy("sections.education.title")}
            description={copy("sections.education.description")}
            isOpen={openSections.has("education")}
            onToggle={() =>
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has("education")) next.delete("education");
                else next.add("education");
                return next;
              })
            }
            badge={
              education.length > 0 ? (
                <span className="candidate-profile-section-badge">
                  {education.length} {copy("entryCount")}
                </span>
              ) : null
            }
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
                      ".candidate-profile-accordion-card",
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
                  ".candidate-profile-accordion-card",
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
          </AccordionCard>

          <AccordionCard
            sectionKey="languagesCerts"
            title={copy("sections.languagesCerts.title")}
            description={copy("sections.languagesCerts.description")}
            isOpen={openSections.has("languagesCerts")}
            onToggle={() =>
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has("languagesCerts")) next.delete("languagesCerts");
                else next.add("languagesCerts");
                return next;
              })
            }
            badge={
              languages.length > 0 || certifications.length > 0 ? (
                <span className="candidate-profile-section-badge">
                  {languages.length + certifications.length} {copy("entryCount")}
                </span>
              ) : null
            }
          >
            <div className="candidate-profile-subsections">
              <div>
                <h4>{copy("sections.languages.title")}</h4>
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
                          ".candidate-profile-accordion-card",
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
                      ".candidate-profile-accordion-card",
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
              </div>

              <div>
                <h4>{copy("sections.certifications.title")}</h4>
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
                          ".candidate-profile-accordion-card",
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
                      ".candidate-profile-accordion-card",
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
              </div>
            </div>
          </AccordionCard>

          <AccordionCard
            sectionKey="linksSkills"
            title={copy("sections.linksSkills.title")}
            description={copy("sections.linksSkills.description")}
            isOpen={openSections.has("linksSkills")}
            onToggle={() =>
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (next.has("linksSkills")) next.delete("linksSkills");
                else next.add("linksSkills");
                return next;
              })
            }
            badge={
              links.length > 0 || skillsText.trim().length > 0 ? (
                <span className="candidate-profile-section-badge">
                  {links.length + (skillsText.trim() ? 1 : 0)} {copy("entryCount")}
                </span>
              ) : null
            }
          >
            <div className="candidate-profile-subsections">
              <div>
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
              </div>
              <div>
                <h4>{copy("sections.links.title")}</h4>
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
                          ".candidate-profile-accordion-card",
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
                      ".candidate-profile-accordion-card",
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
              </div>
            </div>
          </AccordionCard>

          <div className="candidate-profile-save-bar">
            <button
              className="button button-dark"
              disabled={pending || importing}
              type="submit"
            >
              {pending ? copy("saving") : copy("save")}
            </button>
            <button
              className="candidate-revert-button"
              disabled={!hasUnsavedChanges || pending || importing}
              type="button"
              onClick={revertToInitial}
              title={copy("revert.title")}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {copy("revert.label")}
            </button>
          </div>
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
                <button
                  className="candidate-completion-link"
                  onClick={() => scrollToSection(completionKeyToSection[key])}
                  type="button"
                >
                  {complete ? (
                    <Check size={15} aria-hidden="true" />
                  ) : (
                    <Circle size={15} aria-hidden="true" />
                  )}
                  {copy(`completionFields.${key}`)}
                </button>
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