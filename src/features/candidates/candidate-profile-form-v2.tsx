"use client";

import {
  useState,
  useCallback,
  useMemo,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useLocale } from "next-intl";
import { useActionState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle, FileUp, Download, User, Calendar, Shield, Mail, Phone, MapPin, Link2, ExternalLink, Target, FileText, GraduationCap, Briefcase, FlaskConical, Code, Languages, Award, BookOpen, Star, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FormField,
  SelectField,
  CollapsibleSection,
  Tabs,
  TabPanel,
  FormGrid,
  FieldGroup,
  RepeaterField,
  FormSection,
  CANDIDATE_FORM_TABS,
  getSectionIcon,
} from "@/components/forms/form-components";
import { saveCandidateProfile } from "./actions";
import {
  ResumeImportError,
  extractResumeFile,
} from "./resume-file-extractor";
import {
  mergeResumeDraft,
  type CandidateProfileDraft,
} from "./resume-profile-draft";
import type { CandidateResumeDraft } from "./resume-parser";
import type {
  CandidateExperience,
  CandidateInternship,
  CandidateEducation,
  CandidateSkill,
  CandidateLanguage,
  CandidateCertification,
  CandidateCourse,
  CandidateProject,
  CandidatePublication,
  CandidateAward,
  CandidateVolunteer,
  CandidateReference,
  CandidateProfileUpdate,
  CandidateProfileFormState,
} from "./schemas";
import { northernCyprusDistrictValues } from "@/features/locations/northern-cyprus-districts";

const initialState: CandidateProfileFormState = {
  status: "idle",
  message: "idle",
};

const EMPTY_EXPERIENCE: CandidateExperience = {
  company: "",
  role: "",
  sector: undefined,
  district: undefined,
  startDate: null,
  endDate: null,
  isCurrent: false,
  description: "",
  achievements: [],
};

const EMPTY_INTERNSHIP: CandidateInternship = {
  company: "",
  role: "",
  startDate: null,
  endDate: null,
  isCurrent: false,
  description: "",
};

const EMPTY_EDUCATION: CandidateEducation = {
  level: "other",
  institution: "",
  department: "",
  degree: null,
  startYear: null,
  endYear: null,
  gpa: undefined,
  isOngoing: false,
  location: "",
};

const EMPTY_SKILL: CandidateSkill = {
  name: "",
  category: undefined,
  proficiency: undefined,
};

const EMPTY_LANGUAGE: CandidateLanguage = {
  language: "tr",
  proficiency: "B1",
  language_name_localized: undefined,
};

const EMPTY_CERTIFICATION: CandidateCertification = {
  name: "",
  issuer: "",
  issueDate: null,
  expiryDate: undefined,
  credentialId: undefined,
  credentialUrl: undefined,
};

const EMPTY_COURSE: CandidateCourse = {
  name: "",
  provider: "",
  startDate: null,
  endDate: undefined,
  hours: undefined,
  certificateUrl: undefined,
};

const EMPTY_PROJECT: CandidateProject = {
  name: "",
  role: "",
  startDate: null,
  endDate: undefined,
  isCurrent: false,
  description: "",
  url: undefined,
  technologies: [],
};

const EMPTY_PUBLICATION: CandidatePublication = {
  title: "",
  type: "article",
  date: null,
  url: undefined,
  coAuthors: [],
};

const EMPTY_AWARD: CandidateAward = {
  name: "",
  issuer: "",
  date: null,
  description: "",
};

const EMPTY_VOLUNTEER: CandidateVolunteer = {
  organization: "",
  role: "",
  startDate: null,
  endDate: undefined,
  isCurrent: false,
  description: "",
};

const EMPTY_REFERENCE: CandidateReference = {
  name: "",
  title: "",
  company: "",
  phone: undefined,
  email: undefined,
  relation: "",
};

const SECTORS = [
  { value: "technology", label: "Teknoloji" },
  { value: "finance", label: "Finans" },
  { value: "healthcare", label: "Sağlık" },
  { value: "education", label: "Eğitim" },
  { value: "construction", label: "İnşaat" },
  { value: "manufacturing", label: "Üretim" },
  { value: "retail", label: "Perakende" },
  { value: "hospitality", label: "Konaklama" },
  { value: "transportation", label: "Ulaşım" },
  { value: "real_estate", label: "Gayrimenkul" },
  { value: "legal", label: "Hukuk" },
  { value: "marketing", label: "Pazarlama" },
  { value: "human_resources", label: "İK" },
  { value: "administration", label: "İdare" },
  { value: "engineering", label: "Mühendislik" },
  { value: "science", label: "Bilim" },
  { value: "arts", label: "Sanat" },
  { value: "non_profit", label: "STK" },
  { value: "government", label: "Kamu" },
  { value: "agriculture", label: "Tarım" },
  { value: "energy", label: "Enerji" },
  { value: "telecommunications", label: "Telekom" },
  { value: "media", label: "Medya" },
  { value: "consulting", label: "Danışmanlık" },
  { value: "other", label: "Diğer" },
];

const SKILL_CATEGORIES = [
  { value: "technical", label: "Teknik" },
  { value: "software", label: "Yazılım" },
  { value: "tools", label: "Araçlar" },
  { value: "language", label: "Dil" },
  { value: "management", label: "Yönetim" },
  { value: "design", label: "Tasarım" },
  { value: "marketing", label: "Pazarlama" },
  { value: "sales", label: "Satış" },
  { value: "finance", label: "Finans" },
  { value: "legal", label: "Hukuk" },
  { value: "engineering", label: "Mühendislik" },
  { value: "science", label: "Bilim" },
  { value: "medical", label: "Tıbbi" },
  { value: "education", label: "Eğitim" },
  { value: "creative", label: "Yaratıcı" },
  { value: "other", label: "Diğer" },
];

const LANGUAGES = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "İngilizce" },
  { value: "de", label: "Almanca" },
  { value: "fr", label: "Fransızca" },
  { value: "ru", label: "Rusça" },
  { value: "el", label: "Yunanca" },
  { value: "fa", label: "Farsça" },
  { value: "ar", label: "Arapça" },
  { value: "es", label: "İspanyolca" },
  { value: "it", label: "İtalyanca" },
  { value: "zh", label: "Çince" },
  { value: "other", label: "Diğer" },
];

const CEFR_LEVELS = [
  { value: "A1", label: "A1 - Başlangıç" },
  { value: "A2", label: "A2 - Temel" },
  { value: "B1", label: "B1 - Orta" },
  { value: "B2", label: "B2 - İleri Orta" },
  { value: "C1", label: "C1 - İleri" },
  { value: "C2", label: "C2 - Uzman" },
  { value: "native", label: "Ana Dil" },
];

const EDUCATION_LEVELS = [
  { value: "high_school", label: "Lise" },
  { value: "associate", label: "Önlisans" },
  { value: "bachelor", label: "Lisans" },
  { value: "master", label: "Yüksek Lisans" },
  { value: "phd", label: "Doktora" },
  { value: "other", label: "Diğer" },
];

const PUBLICATION_TYPES = [
  { value: "article", label: "Makale" },
  { value: "book", label: "Kitap" },
  { value: "patent", label: "Patent" },
  { value: "conference", label: "Kongre Bildirisi" },
  { value: "thesis", label: "Tez" },
  { value: "other", label: "Diğer" },
];

export function CandidateProfileForm() {
  const locale = useLocale();
  const t = (key: string) => key;
  const [activeTab, setActiveTab] = useState("identity");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeDraft, setResumeDraft] = useState<CandidateResumeDraft | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CandidateProfileUpdate>({
    headline: "",
    location: null,
    skillsText: [],
    experience: [EMPTY_EXPERIENCE],
    internships: [],
    education: [EMPTY_EDUCATION],
    skills: [],
    languages: [],
    certifications: [],
    courses: [],
    projects: [],
    publications: [],
    awards: [],
    volunteer: [],
    references: [],
    summary: "",
    links: [],
    firstName: "",
    middleName: "",
    lastName: "",
    dateOfBirth: null,
    gender: undefined,
    nationality: undefined,
    tcNo: undefined,
    passportNo: undefined,
    maritalStatus: undefined,
    drivingLicense: undefined,
    addressLine: "",
    district: undefined,
    municipality: "",
    postalCode: "",
    phone: "",
    email: "",
    linkedIn: "",
    github: "",
    portfolio: "",
  });

  const [actionState, formAction] = useActionState(saveCandidateProfile, initialState);

  const updateField = useCallback((key: keyof CandidateProfileUpdate, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value || null }));
  }, []);

  const updateArrayField = useCallback(<T extends Record<string, unknown>>(
    arrayKey: keyof CandidateProfileUpdate,
    index: number,
    field: keyof T,
    value: string
  ) => {
    setFormData((prev) => {
      const arr = [...(prev[arrayKey] as unknown as T[])];
      arr[index] = { ...arr[index], [field]: value || undefined } as T;
      return { ...prev, [arrayKey]: arr };
    });
  }, []);

  const addArrayItem = useCallback(<T extends Record<string, unknown>>(
    arrayKey: keyof CandidateProfileUpdate,
    emptyItem: T
  ) => {
    setFormData((prev) => ({
      ...prev,
      [arrayKey]: [...(prev[arrayKey] as unknown as T[]), emptyItem],
    }));
  }, []);

  const removeArrayItem = useCallback(<T extends Record<string, unknown>>(
    arrayKey: keyof CandidateProfileUpdate,
    index: number
  ) => {
    setFormData((prev) => {
      const arr = [...(prev[arrayKey] as unknown as T[])];
      arr.splice(index, 1);
      return { ...prev, [arrayKey]: arr };
    });
  }, []);

  const moveArrayItem = useCallback(<T extends Record<string, unknown>>(
    arrayKey: keyof CandidateProfileUpdate,
    fromIndex: number,
    toIndex: number
  ) => {
    setFormData((prev) => {
      const arr = [...(prev[arrayKey] as unknown as T[])];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return { ...prev, [arrayKey]: arr };
    });
  }, []);

  const handleResumeUpload = async (file: File) => {
    setImportError(null);
    setResumeFile(file);
    try {
      const draft = await extractResumeFile(file);
      setResumeDraft(draft);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Dosya okunamadı");
    }
  };

  const handleResumeImport = async () => {
    if (!resumeDraft) return;
    const merged = mergeResumeDraft(formData as unknown as CandidateProfileDraft, resumeDraft);
    setFormData((prev) => ({ ...prev, ...(merged.profile as unknown as CandidateProfileUpdate) }));
    setResumeDraft(null);
    setResumeFile(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await formAction(new FormData(e.currentTarget));
  };

  const isSubmitting = actionState.status !== "idle";

  const getExperienceLabel = (item: CandidateExperience, index: number) =>
    `${item.role || "Rol"} @ ${item.company || "Şirket"}`;

  const getEducationLabel = (item: CandidateEducation, index: number) =>
    `${item.institution || "Kurum"} - ${item.department || "Bölüm"}`;

  const getSkillLabel = (item: CandidateSkill, index: number) => item.name || `Beceri ${index + 1}`;

  const getLanguageLabel = (item: CandidateLanguage, index: number) =>
    `${LANGUAGES.find(l => l.value === item.language)?.label || item.language} (${item.proficiency})`;

  const getCertificationLabel = (item: CandidateCertification, index: number) =>
    item.name || `Sertifika ${index + 1}`;

  const getProjectLabel = (item: CandidateProject, index: number) =>
    item.name || `Proje ${index + 1}`;

  const getPublicationLabel = (item: CandidatePublication, index: number) =>
    item.title || `Yayın ${index + 1}`;

  const getAwardLabel = (item: CandidateAward, index: number) =>
    item.name || `Ödül ${index + 1}`;

  const getVolunteerLabel = (item: CandidateVolunteer, index: number) =>
    `${item.role || "Rol"} @ ${item.organization || "Kurum"}`;

  const getReferenceLabel = (item: CandidateReference, index: number) =>
    `${item.name} (${item.relation})`;

  return (
    <div className="candidate-profile-form-container">
      <header className="candidate-profile-form-header">
        <div className="header-content">
          <h1>{t("title")}</h1>
          <p className="header-description">{t("subtitle")}</p>
        </div>
        <div className="header-actions">
          {resumeDraft && (
            <div className="resume-import-banner">
              <FileUp className="banner-icon" aria-hidden="true" />
              <span>{t("resumeReady")}</span>
              <button type="button" onClick={handleResumeImport} className="btn btn-primary btn-sm">
                {t("applyResume")}
              </button>
              <button type="button" onClick={() => { setResumeDraft(null); setResumeFile(null); }} className="btn btn-ghost btn-sm" aria-label="CV'yi kaldır">
                <Download className="btn-icon" aria-hidden="true" />
              </button>
            </div>
          )}
          <label className="btn btn-secondary" htmlFor="resume-upload">
            <FileUp className="btn-icon" aria-hidden="true" />
            <span>{t("uploadResume")}</span>
            <input
              id="resume-upload"
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => e.target.files?.[0] && handleResumeUpload(e.target.files[0])}
              className="file-input"
              aria-label="CV dosyası yükle"
            />
          </label>
          <button type="submit" form="profile-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="btn-icon spinner" aria-hidden="true" />
                <span>{t("saving")}</span>
              </>
            ) : (
              <>
                <Save className="btn-icon" aria-hidden="true" />
                <span>{t("save")}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {actionState.status === "error" && (
        <div className="form-alert form-alert-error" role="alert">
          <AlertCircle className="alert-icon" aria-hidden="true" />
          <span>{actionState.message}</span>
        </div>
      )}

      {actionState.status === "success" && (
        <div className="form-alert form-alert-success" role="status">
          <CheckCircle className="alert-icon" aria-hidden="true" />
          <span>{t("savedSuccessfully")}</span>
        </div>
      )}

      {importError && (
        <div className="form-alert form-alert-error" role="alert">
          <AlertCircle className="alert-icon" aria-hidden="true" />
          <span>{importError}</span>
        </div>
      )}

      <form id="profile-form" onSubmit={handleSubmit} className="candidate-profile-form">
        <Tabs tabs={CANDIDATE_FORM_TABS} activeTab={activeTab} onChange={setActiveTab} variant="pills" />

        <TabPanel id="identity" activeTab={activeTab}>
          <FormSection id="personal" title={t("personalInfo")} description={t("personalInfoDesc")} icon={<User />} required collapsible defaultOpen={true}>
            <FormGrid columns={2} gap="md">
              <FormField label={t("firstName")} value={formData.firstName || ""} onChange={(v) => updateField("firstName", v)} required placeholder={t("firstNamePlaceholder")} icon={<User />} />
              <FormField label={t("middleName")} value={formData.middleName || ""} onChange={(v) => updateField("middleName", v)} placeholder={t("middleNamePlaceholder")} />
              <FormField label={t("lastName")} value={formData.lastName || ""} onChange={(v) => updateField("lastName", v)} required placeholder={t("lastNamePlaceholder")} />
              <FormField label={t("dateOfBirth")} type="date" value={formData.dateOfBirth || ""} onChange={(v) => updateField("dateOfBirth", v)} placeholder="YYYY-MM-DD" icon={<Calendar />} />
              <SelectField label={t("gender")} value={formData.gender || ""} onChange={(v) => updateField("gender", v)} options={[
                { value: "male", label: t("gender.male") },
                { value: "female", label: t("gender.female") },
                { value: "other", label: t("gender.other") },
                { value: "prefer_not_to_say", label: t("gender.preferNotToSay") },
              ]} placeholder={t("selectGender")} />
              <SelectField label={t("nationality")} value={formData.nationality || ""} onChange={(v) => updateField("nationality", v)} options={[
                { value: "TR", label: "Türkiye (TR)" },
                { value: "KKTC", label: "KKTC" },
                { value: "DE", label: "Almanya (DE)" },
                { value: "RU", label: "Rusya (RU)" },
                { value: "other", label: "Diğer" },
              ]} placeholder={t("selectNationality")} />
              <SelectField label={t("maritalStatus")} value={formData.maritalStatus || ""} onChange={(v) => updateField("maritalStatus", v)} options={[
                { value: "single", label: t("marital.single") },
                { value: "married", label: t("marital.married") },
                { value: "divorced", label: t("marital.divorced") },
                { value: "widowed", label: t("marital.widowed") },
                { value: "prefer_not_to_say", label: t("marital.preferNotToSay") },
              ]} placeholder={t("selectMarital")} />
              <SelectField label={t("drivingLicense")} value={formData.drivingLicense || ""} onChange={(v) => updateField("drivingLicense", v)} options={[
                { value: "A1", label: "A1" }, { value: "A2", label: "A2" }, { value: "A", label: "A" },
                { value: "B1", label: "B1" }, { value: "B", label: "B" }, { value: "BE", label: "BE" },
                { value: "C1", label: "C1" }, { value: "C1E", label: "C1E" }, { value: "C", label: "C" }, { value: "CE", label: "CE" },
                { value: "D1", label: "D1" }, { value: "D1E", label: "D1E" }, { value: "D", label: "D" }, { value: "DE", label: "DE" },
                { value: "F", label: "F" }, { value: "G", label: "G" }, { value: "M", label: "M" }, { value: "T", label: "T" },
              ]} placeholder={t("selectDrivingLicense")} />
              <FormField label={t("tcNo")} value={formData.tcNo || ""} onChange={(v) => updateField("tcNo", v)} placeholder="12345678901" maxLength={11} hint={t("tcNoHint")} icon={<Shield />} />
              <FormField label={t("passportNo")} value={formData.passportNo || ""} onChange={(v) => updateField("passportNo", v)} placeholder="P1234567" maxLength={9} hint={t("passportHint")} />
            </FormGrid>
          </FormSection>

          <FormSection id="contact" title={t("contactInfo")} description={t("contactInfoDesc")} icon={<Mail />} collapsible defaultOpen={true}>
            <FormGrid columns={2} gap="md">
              <FormField label={t("email")} type="email" value={formData.email || ""} onChange={(v) => updateField("email", v)} placeholder="ornek@email.com" required icon={<Mail />} />
              <FormField label={t("phone")} type="tel" value={formData.phone || ""} onChange={(v) => updateField("phone", v)} placeholder="+90 5XX XXX XX XX" hint={t("phoneHint")} icon={<Phone />} />
              <FormField label={t("addressLine")} value={formData.addressLine || ""} onChange={(v) => updateField("addressLine", v)} placeholder={t("addressPlaceholder")} icon={<MapPin />} />
              <SelectField label={t("district")} value={formData.district || ""} onChange={(v) => updateField("district", v)} options={northernCyprusDistrictValues.map(d => ({ value: d, label: d }))} placeholder={t("selectDistrict")} />
              <FormField label={t("municipality")} value={formData.municipality || ""} onChange={(v) => updateField("municipality", v)} placeholder={t("municipalityPlaceholder")} />
              <FormField label={t("postalCode")} value={formData.postalCode || ""} onChange={(v) => updateField("postalCode", v)} placeholder="99000" maxLength={5} pattern="[0-9]*" />
            </FormGrid>
          </FormSection>

          <FormSection id="links" title={t("professionalLinks")} description={t("professionalLinksDesc")} icon={<Link2 />} collapsible defaultOpen={false}>
            <FormGrid columns={2} gap="md">
              <FormField label={t("linkedIn")} type="url" value={formData.linkedIn || ""} onChange={(v) => updateField("linkedIn", v)} placeholder="https://linkedin.com/in/..." icon={<ExternalLink />} />
              <FormField label={t("github")} type="url" value={formData.github || ""} onChange={(v) => updateField("github", v)} placeholder="https://github.com/..." icon={<ExternalLink />} />
              <FormField label={t("portfolio")} type="url" value={formData.portfolio || ""} onChange={(v) => updateField("portfolio", v)} placeholder="https://portfolio.com" icon={<ExternalLink />} />
            </FormGrid>
          </FormSection>

          <FormSection id="headline" title={t("professionalHeadline")} description={t("professionalHeadlineDesc")} icon={<Target />} required>
            <FormField label={t("headline")} value={formData.headline || ""} onChange={(v) => updateField("headline", v)} placeholder={t("headlinePlaceholder")} maxLength={140} hint={t("headlineHint")} />
            <FormGrid columns={2} gap="md">
              <SelectField label={t("location")} value={formData.location || ""} onChange={(v) => updateField("location", v)} options={northernCyprusDistrictValues.map(d => ({ value: d, label: d }))} placeholder={t("selectLocation")} />
            </FormGrid>
          </FormSection>

          <FormSection id="summary" title={t("summary")} description={t("summaryDesc")} icon={<FileText />} collapsible defaultOpen={false}>
            <FormField label={t("summary")} value={formData.summary || ""} onChange={(v) => updateField("summary", v)} multiline rows={5} maxLength={2000} placeholder={t("summaryPlaceholder")} />
          </FormSection>
        </TabPanel>

        <TabPanel id="education" activeTab={activeTab}>
          <FormSection id="educationList" title={t("education")} description={t("educationDesc")} icon={<GraduationCap />} collapsible defaultOpen={true}>
            <RepeaterField<CandidateEducation>
              label={t("educationEntries")}
              items={formData.education}
              onAdd={() => addArrayItem("education", EMPTY_EDUCATION)}
              onRemove={removeArrayItem.bind(null, "education")}
              onReorder={moveArrayItem.bind(null, "education")}
              maxItems={15}
              minItems={1}
              itemLabel={getEducationLabel}
              emptyMessage={t("noEducation")}
              icon={<GraduationCap />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <SelectField label={t("educationLevel")} value={item.level} onChange={(v) => updateArrayField("education", index, "level", v)} options={EDUCATION_LEVELS} required />
                  <FormField label={t("institution")} value={item.institution} onChange={(v) => updateArrayField("education", index, "institution", v)} required placeholder={t("institutionPlaceholder")} />
                  <FormField label={t("department")} value={item.department} onChange={(v) => updateArrayField("education", index, "department", v)} required placeholder={t("departmentPlaceholder")} />
                  <FormField label={t("degree")} value={item.degree || ""} onChange={(v) => updateArrayField("education", index, "degree", v)} placeholder={t("degreePlaceholder")} />
                  <FormField label={t("startYear")} type="number" value={item.startYear || ""} onChange={(v) => updateArrayField("education", index, "startYear", v)} placeholder="2018" min={1950} max={new Date().getFullYear()} required />
                  <FormField label={t("endYear")} type="number" value={item.endYear || ""} onChange={(v) => updateArrayField("education", index, "endYear", v)} placeholder="2022" min={1950} max={new Date().getFullYear() + 5} />
                  <FormField label={t("gpa")} value={item.gpa || ""} onChange={(v) => updateArrayField("education", index, "gpa", v)} placeholder="3.50" pattern="[0-9.]*" />
                  <SelectField label={t("isOngoing")} value={item.isOngoing ? "true" : "false"} onChange={(v) => updateArrayField("education", index, "isOngoing", v)} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
                  <FormField label={t("location")} value={item.location || ""} onChange={(v) => updateArrayField("education", index, "location", v)} placeholder={t("locationPlaceholder")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="internships" title={t("internships")} description={t("internshipsDesc")} icon={<Briefcase />} collapsible defaultOpen={false}>
            <RepeaterField<CandidateInternship>
              label={t("internshipEntries")}
              items={formData.internships}
              onAdd={() => addArrayItem("internships", EMPTY_INTERNSHIP)}
              onRemove={removeArrayItem.bind(null, "internships")}
              onReorder={moveArrayItem.bind(null, "internships")}
              maxItems={10}
              itemLabel={(item, i) => `${item.role || "Rol"} @ ${item.company || "Şirket"}`}
              emptyMessage={t("noInternships")}
              icon={<Briefcase />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("company")} value={item.company} onChange={(v) => updateArrayField("internships", index, "company", v)} required placeholder={t("companyPlaceholder")} />
                  <FormField label={t("role")} value={item.role} onChange={(v) => updateArrayField("internships", index, "role", v)} required placeholder={t("rolePlaceholder")} />
                  <FormField label={t("startDate")} type="date" value={item.startDate || ""} onChange={(v) => updateArrayField("internships", index, "startDate", v)} required />
                  <FormField label={t("endDate")} type="date" value={item.endDate || ""} onChange={(v) => updateArrayField("internships", index, "endDate", v)} />
                  <SelectField label={t("isCurrent")} value={item.isCurrent ? "true" : "false"} onChange={(v) => updateArrayField("internships", index, "isCurrent", v)} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
                  <FormField label={t("description")} value={item.description || ""} onChange={(v) => updateArrayField("internships", index, "description", v)} multiline rows={3} maxLength={1200} placeholder={t("descriptionPlaceholder")} />
                </FormGrid>
              )}
            />
          </FormSection>
        </TabPanel>

        <TabPanel id="experience" activeTab={activeTab}>
          <FormSection id="experienceList" title={t("workExperience")} description={t("workExperienceDesc")} icon={<Briefcase />} collapsible defaultOpen={true}>
            <RepeaterField<CandidateExperience>
              label={t("experienceEntries")}
              items={formData.experience}
              onAdd={() => addArrayItem("experience", EMPTY_EXPERIENCE)}
              onRemove={removeArrayItem.bind(null, "experience")}
              onReorder={moveArrayItem.bind(null, "experience")}
              maxItems={20}
              minItems={1}
              itemLabel={getExperienceLabel}
              emptyMessage={t("noExperience")}
              icon={<Briefcase />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("company")} value={item.company} onChange={(v) => updateArrayField("experience", index, "company", v)} required placeholder={t("companyPlaceholder")} />
                  <FormField label={t("role")} value={item.role} onChange={(v) => updateArrayField("experience", index, "role", v)} required placeholder={t("rolePlaceholder")} />
                  <SelectField label={t("sector")} value={item.sector || ""} onChange={(v) => updateArrayField("experience", index, "sector", v)} options={SECTORS} placeholder={t("selectSector")} />
                  <SelectField label={t("district")} value={item.district || ""} onChange={(v) => updateArrayField("experience", index, "district", v)} options={northernCyprusDistrictValues.map(d => ({ value: d, label: d }))} placeholder={t("selectDistrict")} />
                  <FormField label={t("startDate")} type="date" value={item.startDate || ""} onChange={(v) => updateArrayField("experience", index, "startDate", v)} required />
                  <FormField label={t("endDate")} type="date" value={item.endDate || ""} onChange={(v) => updateArrayField("experience", index, "endDate", v)} />
                  <SelectField label={t("isCurrent")} value={item.isCurrent ? "true" : "false"} onChange={(v) => updateArrayField("experience", index, "isCurrent", v)} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
                  <FormField label={t("description")} value={item.description || ""} onChange={(v) => updateArrayField("experience", index, "description", v)} multiline rows={3} maxLength={1800} placeholder={t("descriptionPlaceholder")} />
                  <FormField label={t("achievements")} value={item.achievements?.join("\n") || ""} onChange={(v) => updateArrayField("experience", index, "achievements", v)} multiline rows={3} maxLength={500} placeholder={t("achievementsPlaceholder")} hint={t("achievementsHint")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="projects" title={t("projects")} description={t("projectsDesc")} icon={<FlaskConical />} collapsible defaultOpen={false}>
            <RepeaterField<CandidateProject>
              label={t("projectEntries")}
              items={formData.projects}
              onAdd={() => addArrayItem("projects", EMPTY_PROJECT)}
              onRemove={removeArrayItem.bind(null, "projects")}
              onReorder={moveArrayItem.bind(null, "projects")}
              maxItems={20}
              itemLabel={getProjectLabel}
              emptyMessage={t("noProjects")}
              icon={<FlaskConical />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("projectName")} value={item.name} onChange={(v) => updateArrayField("projects", index, "name", v)} required placeholder={t("projectNamePlaceholder")} />
                  <FormField label={t("role")} value={item.role} onChange={(v) => updateArrayField("projects", index, "role", v)} required placeholder={t("rolePlaceholder")} />
                  <FormField label={t("startDate")} type="date" value={item.startDate || ""} onChange={(v) => updateArrayField("projects", index, "startDate", v)} required />
                  <FormField label={t("endDate")} type="date" value={item.endDate || ""} onChange={(v) => updateArrayField("projects", index, "endDate", v)} />
                  <SelectField label={t("isCurrent")} value={item.isCurrent ? "true" : "false"} onChange={(v) => updateArrayField("projects", index, "isCurrent", v)} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
                  <FormField label={t("description")} value={item.description || ""} onChange={(v) => updateArrayField("projects", index, "description", v)} multiline rows={3} maxLength={1800} placeholder={t("descriptionPlaceholder")} />
                  <FormField label={t("url")} type="url" value={item.url || ""} onChange={(v) => updateArrayField("projects", index, "url", v)} placeholder="https://..." />
                  <FormField label={t("technologies")} value={item.technologies?.join(", ") || ""} onChange={(v) => updateArrayField("projects", index, "technologies", v)} placeholder="React, Node.js, PostgreSQL" hint={t("technologiesHint")} />
                </FormGrid>
              )}
            />
          </FormSection>
        </TabPanel>

        <TabPanel id="skills" activeTab={activeTab}>
          <FormSection id="skillsText" title={t("skillsText")} description={t("skillsTextDesc")} icon={<Code />} required>
            <FormField label={t("skills")} value={formData.skillsText.join(", ")} onChange={(v) => updateField("skillsText", v)} multiline rows={4} maxLength={2600} placeholder={t("skillsPlaceholder")} hint={t("skillsHint")} />
          </FormSection>

          <FormSection id="skillsStructured" title={t("skillsStructured")} description={t("skillsStructuredDesc")} icon={<Code />} collapsible defaultOpen={true}>
            <RepeaterField<CandidateSkill>
              label={t("skillEntries")}
              items={formData.skills}
              onAdd={() => addArrayItem("skills", EMPTY_SKILL)}
              onRemove={removeArrayItem.bind(null, "skills")}
              onReorder={moveArrayItem.bind(null, "skills")}
              maxItems={60}
              itemLabel={getSkillLabel}
              emptyMessage={t("noSkills")}
              icon={<Code />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={3} gap="md">
                  <FormField label={t("skillName")} value={item.name} onChange={(v) => updateArrayField("skills", index, "name", v)} required placeholder={t("skillNamePlaceholder")} />
                  <SelectField label={t("skillCategory")} value={item.category || ""} onChange={(v) => updateArrayField("skills", index, "category", v)} options={SKILL_CATEGORIES} placeholder={t("selectCategory")} />
                  <SelectField label={t("skillProficiency")} value={item.proficiency || ""} onChange={(v) => updateArrayField("skills", index, "proficiency", v)} options={[
                    { value: "beginner", label: t("proficiency.beginner") },
                    { value: "intermediate", label: t("proficiency.intermediate") },
                    { value: "advanced", label: t("proficiency.advanced") },
                    { value: "expert", label: t("proficiency.expert") },
                  ]} placeholder={t("selectProficiency")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="languages" title={t("languages")} description={t("languagesDesc")} icon={<Languages />} collapsible defaultOpen={true}>
            <RepeaterField<CandidateLanguage>
              label={t("languageEntries")}
              items={formData.languages}
              onAdd={() => addArrayItem("languages", EMPTY_LANGUAGE)}
              onRemove={removeArrayItem.bind(null, "languages")}
              onReorder={moveArrayItem.bind(null, "languages")}
              maxItems={15}
              itemLabel={getLanguageLabel}
              emptyMessage={t("noLanguages")}
              icon={<Languages />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={3} gap="md">
                  <SelectField label={t("language")} value={item.language} onChange={(v) => updateArrayField("languages", index, "language", v)} options={LANGUAGES} required />
                  <SelectField label={t("proficiency")} value={item.proficiency} onChange={(v) => updateArrayField("languages", index, "proficiency", v)} options={CEFR_LEVELS} required />
                  <FormField label={t("languageNameLocalized")} value={item.language_name_localized || ""} onChange={(v) => updateArrayField("languages", index, "language_name_localized", v)} placeholder={t("languageNameLocalizedPlaceholder")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="certifications" title={t("certifications")} description={t("certificationsDesc")} icon={<Award />} collapsible defaultOpen={true}>
            <RepeaterField<CandidateCertification>
              label={t("certificationEntries")}
              items={formData.certifications}
              onAdd={() => addArrayItem("certifications", EMPTY_CERTIFICATION)}
              onRemove={removeArrayItem.bind(null, "certifications")}
              onReorder={moveArrayItem.bind(null, "certifications")}
              maxItems={20}
              itemLabel={getCertificationLabel}
              emptyMessage={t("noCertifications")}
              icon={<Award />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("certificationName")} value={item.name} onChange={(v) => updateArrayField("certifications", index, "name", v)} required placeholder={t("certificationNamePlaceholder")} />
                  <FormField label={t("issuer")} value={item.issuer} onChange={(v) => updateArrayField("certifications", index, "issuer", v)} required placeholder={t("issuerPlaceholder")} />
                  <FormField label={t("issueDate")} type="date" value={item.issueDate || ""} onChange={(v) => updateArrayField("certifications", index, "issueDate", v)} required />
                  <FormField label={t("expiryDate")} type="date" value={item.expiryDate || ""} onChange={(v) => updateArrayField("certifications", index, "expiryDate", v)} />
                  <FormField label={t("credentialId")} value={item.credentialId || ""} onChange={(v) => updateArrayField("certifications", index, "credentialId", v)} placeholder={t("credentialIdPlaceholder")} />
                  <FormField label={t("credentialUrl")} type="url" value={item.credentialUrl || ""} onChange={(v) => updateArrayField("certifications", index, "credentialUrl", v)} placeholder="https://..." />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="courses" title={t("courses")} description={t("coursesDesc")} icon={<BookOpen />} collapsible defaultOpen={false}>
            <RepeaterField<CandidateCourse>
              label={t("courseEntries")}
              items={formData.courses}
              onAdd={() => addArrayItem("courses", EMPTY_COURSE)}
              onRemove={removeArrayItem.bind(null, "courses")}
              onReorder={moveArrayItem.bind(null, "courses")}
              maxItems={20}
              itemLabel={(item, i) => `${item.name} (${item.provider})`}
              emptyMessage={t("noCourses")}
              icon={<BookOpen />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("courseName")} value={item.name} onChange={(v) => updateArrayField("courses", index, "name", v)} required placeholder={t("courseNamePlaceholder")} />
                  <FormField label={t("provider")} value={item.provider} onChange={(v) => updateArrayField("courses", index, "provider", v)} required placeholder={t("providerPlaceholder")} />
                  <FormField label={t("startDate")} type="date" value={item.startDate || ""} onChange={(v) => updateArrayField("courses", index, "startDate", v)} required />
                  <FormField label={t("endDate")} type="date" value={item.endDate || ""} onChange={(v) => updateArrayField("courses", index, "endDate", v)} />
                  <FormField label={t("hours")} type="number" value={item.hours?.toString() || ""} onChange={(v) => updateArrayField("courses", index, "hours", v)} placeholder="40" min="1" max="5000" />
                  <FormField label={t("certificateUrl")} type="url" value={item.certificateUrl || ""} onChange={(v) => updateArrayField("courses", index, "certificateUrl", v)} placeholder="https://..." />
                </FormGrid>
              )}
            />
          </FormSection>
        </TabPanel>

        <TabPanel id="achievements" activeTab={activeTab}>
          <FormSection id="publications" title={t("publications")} description={t("publicationsDesc")} icon={<FileText />} collapsible defaultOpen={false}>
            <RepeaterField<CandidatePublication>
              label={t("publicationEntries")}
              items={formData.publications}
              onAdd={() => addArrayItem("publications", EMPTY_PUBLICATION)}
              onRemove={removeArrayItem.bind(null, "publications")}
              onReorder={moveArrayItem.bind(null, "publications")}
              maxItems={15}
              itemLabel={getPublicationLabel}
              emptyMessage={t("noPublications")}
              icon={<FileText />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("title")} value={item.title} onChange={(v) => updateArrayField("publications", index, "title", v)} required placeholder={t("titlePlaceholder")} />
                  <SelectField label={t("type")} value={item.type} onChange={(v) => updateArrayField("publications", index, "type", v)} options={PUBLICATION_TYPES} required />
                  <FormField label={t("date")} type="date" value={item.date || ""} onChange={(v) => updateArrayField("publications", index, "date", v)} required />
                  <FormField label={t("url")} type="url" value={item.url || ""} onChange={(v) => updateArrayField("publications", index, "url", v)} placeholder="https://..." />
                  <FormField label={t("coAuthors")} value={item.coAuthors?.join(", ") || ""} onChange={(v) => updateArrayField("publications", index, "coAuthors", v)} placeholder={t("coAuthorsPlaceholder")} hint={t("coAuthorsHint")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="awards" title={t("awards")} description={t("awardsDesc")} icon={<Star />} collapsible defaultOpen={false}>
            <RepeaterField<CandidateAward>
              label={t("awardEntries")}
              items={formData.awards}
              onAdd={() => addArrayItem("awards", EMPTY_AWARD)}
              onRemove={removeArrayItem.bind(null, "awards")}
              onReorder={moveArrayItem.bind(null, "awards")}
              maxItems={15}
              itemLabel={getAwardLabel}
              emptyMessage={t("noAwards")}
              icon={<Star />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("awardName")} value={item.name} onChange={(v) => updateArrayField("awards", index, "name", v)} required placeholder={t("awardNamePlaceholder")} />
                  <FormField label={t("issuer")} value={item.issuer} onChange={(v) => updateArrayField("awards", index, "issuer", v)} required placeholder={t("issuerPlaceholder")} />
                  <FormField label={t("date")} type="date" value={item.date || ""} onChange={(v) => updateArrayField("awards", index, "date", v)} required />
                  <FormField label={t("description")} value={item.description || ""} onChange={(v) => updateArrayField("awards", index, "description", v)} multiline rows={3} maxLength={1000} placeholder={t("descriptionPlaceholder")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="volunteer" title={t("volunteer")} description={t("volunteerDesc")} icon={<Heart />} collapsible defaultOpen={false}>
            <RepeaterField<CandidateVolunteer>
              label={t("volunteerEntries")}
              items={formData.volunteer}
              onAdd={() => addArrayItem("volunteer", EMPTY_VOLUNTEER)}
              onRemove={removeArrayItem.bind(null, "volunteer")}
              onReorder={moveArrayItem.bind(null, "volunteer")}
              maxItems={10}
              itemLabel={getVolunteerLabel}
              emptyMessage={t("noVolunteer")}
              icon={<Heart />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("organization")} value={item.organization} onChange={(v) => updateArrayField("volunteer", index, "organization", v)} required placeholder={t("organizationPlaceholder")} />
                  <FormField label={t("role")} value={item.role} onChange={(v) => updateArrayField("volunteer", index, "role", v)} required placeholder={t("rolePlaceholder")} />
                  <FormField label={t("startDate")} type="date" value={item.startDate || ""} onChange={(v) => updateArrayField("volunteer", index, "startDate", v)} required />
                  <FormField label={t("endDate")} type="date" value={item.endDate || ""} onChange={(v) => updateArrayField("volunteer", index, "endDate", v)} />
                  <SelectField label={t("isCurrent")} value={item.isCurrent ? "true" : "false"} onChange={(v) => updateArrayField("volunteer", index, "isCurrent", v)} options={[{ value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
                  <FormField label={t("description")} value={item.description || ""} onChange={(v) => updateArrayField("volunteer", index, "description", v)} multiline rows={3} maxLength={1200} placeholder={t("descriptionPlaceholder")} />
                </FormGrid>
              )}
            />
          </FormSection>

          <FormSection id="references" title={t("references")} description={t("referencesDesc")} icon={<User />} collapsible defaultOpen={false}>
            <RepeaterField<CandidateReference>
              label={t("referenceEntries")}
              items={formData.references}
              onAdd={() => addArrayItem("references", EMPTY_REFERENCE)}
              onRemove={removeArrayItem.bind(null, "references")}
              onReorder={moveArrayItem.bind(null, "references")}
              maxItems={5}
              itemLabel={getReferenceLabel}
              emptyMessage={t("noReferences")}
              icon={<User />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("name")} value={item.name} onChange={(v) => updateArrayField("references", index, "name", v)} required placeholder={t("namePlaceholder")} />
                  <FormField label={t("title")} value={item.title} onChange={(v) => updateArrayField("references", index, "title", v)} required placeholder={t("titlePlaceholder")} />
                  <FormField label={t("company")} value={item.company} onChange={(v) => updateArrayField("references", index, "company", v)} required placeholder={t("companyPlaceholder")} />
                  <FormField label={t("phone")} type="tel" value={item.phone ?? ""} onChange={(v) => updateArrayField("references", index, "phone", v)} placeholder="+90 5XX XXX XX XX" />
                  <FormField label={t("email")} type="email" value={item.email} onChange={(v) => updateArrayField("references", index, "email", v)} placeholder="ornek@email.com" />
                  <FormField label={t("relation")} value={item.relation} onChange={(v) => updateArrayField("references", index, "relation", v)} required placeholder={t("relationPlaceholder")} />
                </FormGrid>
              )}
            />
          </FormSection>
        </TabPanel>

        <TabPanel id="additional" activeTab={activeTab}>
          <FormSection id="links" title={t("additionalLinks")} description={t("additionalLinksDesc")} icon={<Link2 />} collapsible defaultOpen={false}>
            <RepeaterField<{ label: string; url: string | null }>
              label={t("linkEntries")}
              items={formData.links}
              onAdd={() => addArrayItem("links", { label: "", url: "" })}
              onRemove={removeArrayItem.bind(null, "links")}
              onReorder={moveArrayItem.bind(null, "links")}
              maxItems={15}
              itemLabel={(item, i) => item.label || `Link ${i + 1}`}
              emptyMessage={t("noLinks")}
              icon={<Link2 />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label={t("linkLabel")} value={item.label} onChange={(v) => updateArrayField("links", index, "label", v)} required placeholder={t("linkLabelPlaceholder")} />
                  <FormField label={t("linkUrl")} type="url" value={item.url || ""} onChange={(v) => updateArrayField("links", index, "url", v)} required placeholder="https://..." />
                </FormGrid>
              )}
            />
          </FormSection>
        </TabPanel>
      </form>
    </div>
  );
}

export default CandidateProfileForm;