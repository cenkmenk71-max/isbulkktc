"use client";

import {
  useState,
  useCallback,
  type ReactNode,
  type ChangeEvent,
} from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  ChevronDown,
  ChevronUp,
  FileUp,
  Plus,
  Trash2,
  ExternalLink,
  GraduationCap,
  Briefcase,
  Award,
  Code,
  Languages,
  BookOpen,
  FlaskConical,
  Users,
  Link2,
  Settings,
  User,
  Building2,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Globe,
  Shield,
  Star,
  Target,
  FileText,
  Image,
  Video,
  Music,
  Heart,
  Brain,
  Zap,
  Feather,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type FormFieldProps = {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  name?: string;
  type?: "text" | "email" | "tel" | "url" | "date" | "number";
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  pattern?: string;
  min?: number | string;
  max?: number | string;
  step?: number | string;
  multiline?: boolean;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  icon?: ReactNode;
};

export function FormField({
  label,
  value,
  onChange,
  name,
  type = "text",
  placeholder,
  hint,
  maxLength,
  multiline = false,
  rows = 3,
  disabled = false,
  required = false,
  error,
  icon,
  pattern,
  min,
  max,
  step,
}: FormFieldProps) {
  const safeValue = value ?? "";
  return (
    <div className="form-field">
      <label htmlFor={name} className="form-field-label">
        {icon && <span className="form-field-icon" aria-hidden="true">{icon}</span>}
        <span>{label}</span>
        {required && <span className="form-field-required" aria-hidden="true">*</span>}
      </label>
      {multiline ? (
        <textarea
          id={name}
          name={name}
          value={safeValue}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          required={required}
          className={cn("form-input form-textarea", error && "form-input-error")}
          aria-describedby={hint ? `${name}-hint` : error ? `${name}-error` : undefined}
          aria-invalid={!!error}
        />
      ) : (
        <input
          id={name}
          name={name}
          type={type}
          value={safeValue}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          pattern={pattern}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          required={required}
          className={cn("form-input", error && "form-input-error")}
          aria-describedby={hint ? `${name}-hint` : error ? `${name}-error` : undefined}
          aria-invalid={!!error}
        />
      )}
      {hint && (
        <small id={`${name}-hint`} className="form-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${name}-error`} className="form-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  name?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  icon?: ReactNode;
};

export function SelectField({
  label,
  value,
  onChange,
  name,
  options,
  placeholder,
  hint,
  disabled = false,
  required = false,
  error,
  icon,
}: SelectFieldProps) {
  return (
    <div className="form-field">
      <label htmlFor={name} className="form-field-label">
        {icon && <span className="form-field-icon" aria-hidden="true">{icon}</span>}
        <span>{label}</span>
        {required && <span className="form-field-required" aria-hidden="true">*</span>}
      </label>
      <select
        id={name}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
        className={cn("form-input form-select", error && "form-input-error")}
        aria-describedby={hint ? `${name}-hint` : error ? `${name}-error` : undefined}
        aria-invalid={!!error}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && <small id={`${name}-hint`} className="form-hint">{hint}</small>}
      {error && <small id={`${name}-error`} className="form-error" role="alert">{error}</small>}
    </div>
  );
}

export type CollapsibleSectionProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  level?: 1 | 2;
  required?: boolean;
};

export function CollapsibleSection({
  title,
  description,
  icon,
  children,
  defaultOpen = true,
  level = 1,
  required = false,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={cn("collapsible-section", `collapsible-section-level-${level}`)}>
      <button
        type="button"
        className={cn("collapsible-header", !open && "collapsible-header-collapsed")}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={`${title.replace(/\s+/g, "-").toLowerCase()}-content`}
      >
        <div className="collapsible-header-main">
          {icon && <span className="collapsible-icon" aria-hidden="true">{icon}</span>}
          <div className="collapsible-title-group">
            <h3 className={cn("collapsible-title", level === 1 ? "collapsible-title-lg" : "collapsible-title-sm")}>
              {title}
              {required && <span className="collapsible-required" aria-hidden="true">*</span>}
            </h3>
            {description && <p className="collapsible-description">{description}</p>}
          </div>
        </div>
        <ChevronDown className={cn("collapsible-chevron", open && "collapsible-chevron-open")} aria-hidden="true" />
      </button>
      <div
        id={`${title.replace(/\s+/g, "-").toLowerCase()}-content`}
        className={cn("collapsible-content", !open && "collapsible-content-collapsed")}
        role="region"
        aria-labelledby={`${title.replace(/\s+/g, "-").toLowerCase()}-title`}
      >
        <div className="collapsible-content-inner">{children}</div>
      </div>
    </section>
  );
}

export type TabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  badge?: string;
  disabled?: boolean;
};

export type TabsProps = {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: "default" | "pills" | "underline";
  className?: string;
};

export function Tabs({ tabs, activeTab, onChange, variant = "pills", className }: TabsProps) {
  return (
    <div className={cn("tabs-container", `tabs-variant-${variant}`, className)} role="tablist" aria-label="Form sections">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          id={`${tab.id}-tab`}
          aria-controls={`${tab.id}-panel`}
          aria-selected={activeTab === tab.id}
          aria-disabled={tab.disabled}
          onClick={() => !tab.disabled && onChange(tab.id)}
          className={cn(
            "tab-button",
            `tab-button-${variant}`,
            activeTab === tab.id && "tab-button-active",
            tab.disabled && "tab-button-disabled"
          )}
        >
          {tab.icon && <span className="tab-icon" aria-hidden="true">{tab.icon}</span>}
          <span className="tab-label">{tab.label}</span>
          {tab.badge && <span className="tab-badge">{tab.badge}</span>}
        </button>
      ))}
      <div className="tabs-indicator" aria-hidden="true" />
    </div>
  );
}

export type TabPanelProps = {
  id: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
};

export function TabPanel({ id, activeTab, children, className }: TabPanelProps) {
  if (activeTab !== id) return null;

  return (
    <div
      role="tabpanel"
      id={`${id}-panel`}
      aria-labelledby={`${id}-tab`}
      className={cn("tab-panel", className)}
      tabIndex={0}
    >
      {children}
    </div>
  );
}

export type FormGridProps = {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
  gap?: "sm" | "md" | "lg";
  className?: string;
};

export function FormGrid({ children, columns = 2, gap = "md", className }: FormGridProps) {
  return (
    <div
      className={cn(
        "form-grid",
        `form-grid-cols-${columns}`,
        `form-grid-gap-${gap}`,
        className
      )}
    >
      {children}
    </div>
  );
}

export type FieldGroupProps = {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
};

export function FieldGroup({ label, hint, children, className }: FieldGroupProps) {
  return (
    <fieldset className={cn("field-group", className)}>
      {label && <legend className="field-group-legend">{label}</legend>}
      {hint && <p className="field-group-hint">{hint}</p>}
      <div className="field-group-fields">{children}</div>
    </fieldset>
  );
}

export type RepeaterFieldProps<T> = {
  label: string;
  items: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  renderItem: (item: T, index: number, onChange: (field: keyof T, value: string) => void) => ReactNode;
  maxItems?: number;
  minItems?: number;
  itemLabel?: (item: T, index: number) => string;
  emptyMessage?: string;
  icon?: ReactNode;
};

export function RepeaterField<T extends Record<string, unknown>>({
  label,
  items,
  onAdd,
  onRemove,
  onReorder,
  renderItem,
  maxItems,
  minItems = 0,
  itemLabel,
  emptyMessage = "Henüz kayıt yok",
  icon,
}: RepeaterFieldProps<T>) {
  const canAdd = maxItems === undefined || items.length < maxItems;
  const canRemove = items.length > minItems;

  return (
    <div className="repeater-field">
      <div className="repeater-header">
        <h4 className="repeater-label">
          {icon && <span className="repeater-icon" aria-hidden="true">{icon}</span>}
          {label}
          <span className="repeater-count">({items.length})</span>
        </h4>
        {canAdd && (
          <button
            type="button"
            className="repeater-add-btn"
            onClick={onAdd}
            aria-label={`Add ${label}`}
          >
            <Plus className="repeater-add-icon" aria-hidden="true" />
            <span>Ekle</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="repeater-empty">{emptyMessage}</p>
      ) : (
        <div className="repeater-items" role="list" aria-label={`${label} listesi`}>
          {items.map((item, index) => (
            <div key={index} className="repeater-item" role="listitem">
              <div className="repeater-item-header">
                <span className="repeater-item-label">
                  {itemLabel ? itemLabel(item, index) : `${label} ${index + 1}`}
                </span>
                <div className="repeater-item-actions">
                  {onReorder && (
                    <button
                      type="button"
                      className="repeater-action-btn"
                      aria-label="Yukarı taşı"
                      onClick={() => index > 0 && onReorder(index, index - 1)}
                    >
                      <ChevronUp className="repeater-action-icon" aria-hidden="true" />
                    </button>
                  )}
                  {onReorder && (
                    <button
                      type="button"
                      className="repeater-action-btn"
                      aria-label="Aşağı taşı"
                      onClick={() => index < items.length - 1 && onReorder(index, index + 1)}
                    >
                      <ChevronDown className="repeater-action-icon" aria-hidden="true" />
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      className="repeater-action-btn repeater-action-btn-danger"
                      aria-label={`${label} ${index + 1} sil`}
                      onClick={() => onRemove(index)}
                    >
                      <Trash2 className="repeater-action-icon" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              <div className="repeater-item-content">
                {renderItem(item, index, (field, value) => {
                  console.warn("onChange not implemented for field:", field);
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type FormSectionProps = {
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  required?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export function FormSection({ id, title, description, icon, children, required = false, collapsible = false, defaultOpen = true }: FormSectionProps) {
  return collapsible ? (
    <CollapsibleSection title={title} description={description} icon={icon} defaultOpen={defaultOpen} required={required}>
      {children}
    </CollapsibleSection>
  ) : (
    <section id={id} className="form-section" aria-labelledby={`${id}-title`}>
      <header className="form-section-header">
        {icon && <span className="form-section-icon" aria-hidden="true">{icon}</span>}
        <div>
          <h2 id={`${id}-title`} className="form-section-title">
            {title}
            {required && <span className="form-section-required" aria-hidden="true">*</span>}
          </h2>
          {description && <p className="form-section-description">{description}</p>}
        </div>
      </header>
      <div className="form-section-content">{children}</div>
    </section>
  );
}

export const CANDIDATE_FORM_TABS: TabItem[] = [
  {
    id: "identity",
    label: "Kimlik",
    icon: <User className="tab-icon" aria-hidden="true" />,
    description: "Kişisel bilgiler, iletişim, adres",
  },
  {
    id: "education",
    label: "Eğitim",
    icon: <GraduationCap className="tab-icon" aria-hidden="true" />,
    description: "Okullar, dereceler, notlar",
  },
  {
    id: "experience",
    label: "Deneyim",
    icon: <Briefcase className="tab-icon" aria-hidden="true" />,
    description: "İş geçmişi, stajlar, projeler",
  },
  {
    id: "skills",
    label: "Beceriler",
    icon: <Code className="tab-icon" aria-hidden="true" />,
    description: "Teknik, yazılım, dil, sertifikalar",
  },
  {
    id: "achievements",
    label: "Başarılar",
    icon: <Award className="tab-icon" aria-hidden="true" />,
    description: "Sertifikalar, ödüller, yayınlar",
  },
  {
    id: "additional",
    label: "Ekler",
    icon: <FileText className="tab-icon" aria-hidden="true" />,
    description: "Referanslar, gönüllü, linkler",
  },
];

export const COMPANY_FORM_TABS: TabItem[] = [
  {
    id: "identity",
    label: "Ticari Kimlik",
    icon: <Building2 className="tab-icon" aria-hidden="true" />,
    description: "Ünvan, vergi no, sicil no, tür",
  },
  {
    id: "address",
    label: "Adresler",
    icon: <MapPin className="tab-icon" aria-hidden="true" />,
    description: "Kayıtlı ve işyeri adresleri",
  },
  {
    id: "contact",
    label: "İletişim",
    icon: <Phone className="tab-icon" aria-hidden="true" />,
    description: "Telefon, e-posta, web, sosyal medya",
  },
  {
    id: "authority",
    label: "Yetkililer",
    icon: <Users className="tab-icon" aria-hidden="true" />,
    description: "İmza yetkilileri, yetki kapsamları",
  },
  {
    id: "activity",
    label: "Faaliyet",
    icon: <Target className="tab-icon" aria-hidden="true" />,
    description: "Sektör, NACE, anahtar kelimeler",
  },
  {
    id: "finance",
    label: "Finans",
    icon: <Shield className="tab-icon" aria-hidden="true" />,
    description: "Banka, IBAN, sigorta, çalişan sayısı",
  },
  {
    id: "profile",
    label: "Profil",
    icon: <FileText className="tab-icon" aria-hidden="true" />,
    description: "Açıklama, kategoriler, dizin hedefi",
  },
];

export const SECTION_ICONS = {
  identity: User,
  education: GraduationCap,
  experience: Briefcase,
  skills: Code,
  languages: Languages,
  certifications: Award,
  projects: FlaskConical,
  publications: BookOpen,
  awards: Star,
  volunteer: Heart,
  references: Users,
  links: Link2,
  settings: Settings,
  calendar: Calendar,
  location: MapPin,
  phone: Phone,
  email: Mail,
  web: Globe,
  finance: Shield,
  social: Users,
  documents: FileText,
  media: Image,
  video: Video,
  audio: Music,
} as const;

export function getSectionIcon(key: string): ReactNode {
  const Icon = SECTION_ICONS[key as keyof typeof SECTION_ICONS];
  return Icon ? <Icon className="section-icon" aria-hidden="true" /> : null;
}