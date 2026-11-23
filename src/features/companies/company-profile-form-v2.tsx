"use client";

import {
  useState,
  useCallback,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useActionState } from "react";
import { Save, Loader2, AlertCircle, CheckCircle, Building2, MapPin, Phone, Mail, Globe, Users, Target, Shield, FileText, Link2, ExternalLink, Calendar, CreditCard, Banknote, Briefcase, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FormField,
  SelectField,
  CollapsibleSection,
  Tabs,
  TabPanel,
  FormGrid,
  RepeaterField,
  FormSection,
  COMPANY_FORM_TABS,
} from "@/components/forms/form-components";
import type {
  CompanyProfileFields,
  CompanyProfileFormState,
} from "./schemas";

const initialState: CompanyProfileFormState = {
  status: "idle",
  message: "idle",
};

const COMPANY_TYPES = [
  { value: "LTD", label: "LTD" },
  { value: "ANONIM", label: "ANONİM" },
  { value: "KOLLEKTIF", label: "KOLLEKTİF" },
  { value: "KOMANDIT", label: "KOMANDİT" },
  { value: "SAHIS", label: "ŞAHIS" },
];

const NAICS_SECTORS = [
  { value: "11", label: "11 - Tarım, Ormancılık, Balıkçılık" },
  { value: "21", label: "21 - Maden İşletmeciliği" },
  { value: "22", label: "22 - Elektrik, Gaz, Buhar" },
  { value: "23", label: "23 - İnşaat" },
  { value: "31", label: "31-33 - İmalat Sanayi" },
  { value: "42", label: "42 - Toptan Ticaret" },
  { value: "44", label: "44-45 - Perakende Ticaret" },
  { value: "48", label: "48-49 - Ulaşım ve Depolama" },
  { value: "51", label: "51 - Bilgi ve İletişim" },
  { value: "52", label: "52 - Finans ve Sigorta" },
  { value: "53", label: "53 - Gayrimenkul" },
  { value: "54", label: "54 - Profesyonel, Bilimsel, Teknik" },
  { value: "55", label: "55 - Konaklama ve Yemek" },
  { value: "56", label: "56 - Yönetim, Destek Hizmetleri" },
  { value: "61", label: "61 - Eğitim" },
  { value: "62", label: "62 - Sağlık ve Sosyal Yardım" },
  { value: "71", label: "71 - Sanat, Eğlence, Rekreasyon" },
  { value: "72", label: "72 - Diğer Hizmetler" },
  { value: "81", label: "81 - Kamu Yönetimi" },
  { value: "92", label: "92 - Uluslararası Örgütler" },
] as const;

const TURNOVER_RANGES = [
  { value: "0-500K", label: "0 - 500 Bin TRY" },
  { value: "500K-1M", label: "500 Bin - 1 Milyon TRY" },
  { value: "1M-5M", label: "1 - 5 Milyon TRY" },
  { value: "5M-10M", label: "5 - 10 Milyon TRY" },
  { value: "10M-50M", label: "10 - 50 Milyon TRY" },
  { value: "50M+", label: "50 Milyon+ TRY" },
] as const;

const northernCyprusDistrictValues = [
  "Lefkoşa",
  "Mağusa",
  "Girne",
  "Güzelyurt",
  "İskele",
  "Lefke",
] as const;

const EMPTY_SIGNATORY = {
  fullName: "",
  title: "",
  authorityScope: "",
  tcNo: "",
  appointmentDate: "",
};

export function CompanyProfileForm() {
  const [activeTab, setActiveTab] = useState("identity");
  const [signatories, setSignatories] = useState<typeof EMPTY_SIGNATORY[]>([]);

  const [formData, setFormData] = useState<CompanyProfileFields>({
    companyId: "",
    tradeName: "",
    tradeTitle: "",
    companyType: undefined,
    taxNumber: "",
    tradeRegistryNumber: "",
    mersisNo: "",
    establishmentDate: "",
    capital: undefined,
    currency: "TRY",
    registeredAddress: "",
    registeredDistrict: undefined,
    registeredMunicipality: "",
    registeredPostalCode: "",
    workplaceAddress: "",
    workplaceDistrict: undefined,
    workplaceMunicipality: "",
    workplacePostalCode: "",
    phone: "",
    fax: "",
    email: "",
    website: "",
    authorizedSignatories: [] as unknown as CompanyProfileFields["authorizedSignatories"],
    naceCode: undefined,
    sector: "",
    subSector: "",
    keywords: [],
    bankName: "",
    iban: "",
    insuranceNumber: "",
    employeeCount: undefined,
    annualTurnoverRange: undefined,
    linkedIn: "",
    instagram: "",
    facebook: "",
    twitter: "",
    youtube: "",
    profileDescription: "",
    categoriesText: [],
    directoryTarget: "",
  });

  const [actionState, formAction] = useActionState(saveCompanyProfile, initialState);

  const updateField = useCallback((key: keyof CompanyProfileFields, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: (value || undefined) as unknown as CompanyProfileFields[keyof CompanyProfileFields] }));
  }, []);

  const updateSignatory = useCallback((index: number, field: keyof typeof EMPTY_SIGNATORY, value: string) => {
    setSignatories((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const addSignatory = useCallback(() => {
    setSignatories((prev) => [...prev, EMPTY_SIGNATORY]);
  }, []);

  const removeSignatory = useCallback((index: number) => {
    setSignatories((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Sync signatories to formData as JSON string
    const signatoriesJson = JSON.stringify(signatories.filter(s => s.fullName || s.title));
    setFormData((prev) => ({ ...prev, authorizedSignatories: signatoriesJson as unknown as CompanyProfileFields["authorizedSignatories"] }));
    await formAction(new FormData(e.currentTarget));
  };

  const isSubmitting = actionState.status !== "idle";

  return (
    <div className="company-profile-form-container">
      <header className="company-profile-form-header">
        <div className="header-content">
          <h1>Firma Profili</h1>
          <p className="header-description">Firma bilgilerinizi yönetin</p>
        </div>
        <div className="header-actions">
          <button type="submit" form="company-profile-form" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="btn-icon spinner" aria-hidden="true" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <Save className="btn-icon" aria-hidden="true" />
                <span>Kaydet</span>
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
          <span>Başarıyla kaydedildi</span>
        </div>
      )}

      <form id="company-profile-form" onSubmit={handleSubmit} className="company-profile-form">
        <Tabs tabs={COMPANY_FORM_TABS} activeTab={activeTab} onChange={setActiveTab} variant="pills" />

        <TabPanel id="identity" activeTab={activeTab}>
          <FormSection id="tradeIdentity" title="Ticari Kimlik" description="Ünvan, vergi no, sicil no, tür" icon={<Building2 />} required collapsible defaultOpen={true}>
            <FormGrid columns={2} gap="md">
              <FormField label="Ticaret Unvanı" value={formData.tradeName} onChange={(v) => updateField("tradeName", v)} required placeholder="Örn: ABC Ltd. Şti." icon={<Building2 />} />
              <FormField label="Ticaret Adı" value={formData.tradeTitle || ""} onChange={(v) => updateField("tradeTitle", v)} placeholder="Farklıysa ticaret adı" />
              <SelectField label="Şirket Türü" value={formData.companyType || ""} onChange={(v) => updateField("companyType", v)} options={COMPANY_TYPES} placeholder="Tür seçin" />
              <FormField label="Vergi No" value={formData.taxNumber || ""} onChange={(v) => updateField("taxNumber", v)} placeholder="1234567890" maxLength={10} pattern="[0-9]*" hint="10 haneli vergi kimlik numarası" icon={<Shield />} />
              <FormField label="Ticaret Sicil No" value={formData.tradeRegistryNumber || ""} onChange={(v) => updateField("tradeRegistryNumber", v)} placeholder="Sicil numarası" />
              <FormField label="MERSİS No" value={formData.mersisNo || ""} onChange={(v) => updateField("mersisNo", v)} placeholder="0123456789012345" maxLength={16} pattern="[0-9]*" hint="16 haneli MERSİS numarası" />
              <FormField label="Kuruluş Tarihi" type="date" value={formData.establishmentDate || ""} onChange={(v) => updateField("establishmentDate", v)} />
              <FormField label="Sermaye" type="number" value={formData.capital?.toString() || ""} onChange={(v) => updateField("capital", v)} placeholder="100000" min="0" step="1000" />
              <FormField label="Para Birimi" value={formData.currency || ""} onChange={(v) => updateField("currency", v)} placeholder="TRY" maxLength={3} />
            </FormGrid>
          </FormSection>
        </TabPanel>

        <TabPanel id="address" activeTab={activeTab}>
          <FormSection id="registeredAddress" title="Kayıtlı Adres" description="Resmi kayıt adresi" icon={<MapPin />} required collapsible defaultOpen={true}>
            <FormGrid columns={2} gap="md">
              <FormField label="Adres" value={formData.registeredAddress || ""} onChange={(v) => updateField("registeredAddress", v)} multiline rows={3} placeholder="Mahalle, Cadde, Sokak, No" />
              <SelectField label="İlçe" value={formData.registeredDistrict || ""} onChange={(v) => updateField("registeredDistrict", v)} options={northernCyprusDistrictValues.map(d => ({ value: d, label: d }))} placeholder="İlçe seçin" required />
              <FormField label="Belediye" value={formData.registeredMunicipality || ""} onChange={(v) => updateField("registeredMunicipality", v)} placeholder="Belediye" />
              <FormField label="Posta Kodu" value={formData.registeredPostalCode || ""} onChange={(v) => updateField("registeredPostalCode", v)} placeholder="99000" maxLength={5} pattern="[0-9]*" />
            </FormGrid>
          </FormSection>

          <FormSection id="workplaceAddress" title="İşyeri Adresi" description="Farklıysa işyeri adresi" icon={<MapPin />} collapsible defaultOpen={false}>
            <FormGrid columns={2} gap="md">
              <FormField label="Adres" value={formData.workplaceAddress || ""} onChange={(v) => updateField("workplaceAddress", v)} multiline rows={3} placeholder="Mahalle, Cadde, Sokak, No" />
              <SelectField label="İlçe" value={formData.workplaceDistrict || ""} onChange={(v) => updateField("workplaceDistrict", v)} options={northernCyprusDistrictValues.map(d => ({ value: d, label: d }))} placeholder="İlçe seçin" />
              <FormField label="Belediye" value={formData.workplaceMunicipality || ""} onChange={(v) => updateField("workplaceMunicipality", v)} placeholder="Belediye" />
              <FormField label="Posta Kodu" value={formData.workplacePostalCode || ""} onChange={(v) => updateField("workplacePostalCode", v)} placeholder="99000" maxLength={5} pattern="[0-9]*" />
            </FormGrid>
          </FormSection>
        </TabPanel>

        <TabPanel id="contact" activeTab={activeTab}>
          <FormSection id="contactInfo" title="İletişim" description="Telefon, e-posta, web" icon={<Phone />} required collapsible defaultOpen={true}>
            <FormGrid columns={2} gap="md">
              <FormField label="Telefon" type="tel" value={formData.phone || ""} onChange={(v) => updateField("phone", v)} placeholder="+90 5XX XXX XX XX" required icon={<Phone />} />
              <FormField label="Faks" type="tel" value={formData.fax || ""} onChange={(v) => updateField("fax", v)} placeholder="+90 5XX XXX XX XX" icon={<Phone />} />
              <FormField label="E-posta" type="email" value={formData.email || ""} onChange={(v) => updateField("email", v)} placeholder="info@firma.com" required icon={<Mail />} />
              <FormField label="Web Sitesi" type="url" value={formData.website || ""} onChange={(v) => updateField("website", v)} placeholder="https://firma.com" icon={<Globe />} />
            </FormGrid>
          </FormSection>

          <FormSection id="socialMedia" title="Sosyal Medya" description="Sosyal medya hesapları" icon={<Link2 />} collapsible defaultOpen={false}>
            <FormGrid columns={2} gap="md">
              <FormField label="LinkedIn" type="url" value={formData.linkedIn || ""} onChange={(v) => updateField("linkedIn", v)} placeholder="https://linkedin.com/company/..." icon={<ExternalLink />} />
              <FormField label="Instagram" type="url" value={formData.instagram || ""} onChange={(v) => updateField("instagram", v)} placeholder="https://instagram.com/..." icon={<ExternalLink />} />
              <FormField label="Facebook" type="url" value={formData.facebook || ""} onChange={(v) => updateField("facebook", v)} placeholder="https://facebook.com/..." icon={<ExternalLink />} />
              <FormField label="X (Twitter)" type="url" value={formData.twitter || ""} onChange={(v) => updateField("twitter", v)} placeholder="https://twitter.com/..." icon={<ExternalLink />} />
              <FormField label="YouTube" type="url" value={formData.youtube || ""} onChange={(v) => updateField("youtube", v)} placeholder="https://youtube.com/..." icon={<ExternalLink />} />
            </FormGrid>
          </FormSection>
        </TabPanel>

        <TabPanel id="authority" activeTab={activeTab}>
          <FormSection id="authorizedSignatories" title="İmza Yetkilileri" description="Firma adına imza atan yetkililer" icon={<Users />} required collapsible defaultOpen={true}>
            <RepeaterField<{ fullName: string; title: string; authorityScope: string; tcNo: string; appointmentDate: string }>
              label="İmza Yetkilileri"
              items={signatories}
              onAdd={addSignatory}
              onRemove={removeSignatory}
              maxItems={10}
              itemLabel={(item, i) => `${item.fullName} - ${item.title}`}
              emptyMessage="Henüz yetkili eklenmedi"
              icon={<Users />}
              renderItem={(item, index, onChange) => (
                <FormGrid columns={2} gap="md">
                  <FormField label="Ad Soyad" value={item.fullName} onChange={(v) => updateSignatory(index, "fullName", v)} required placeholder="Ad Soyad" />
                  <FormField label="Ünvan" value={item.title} onChange={(v) => updateSignatory(index, "title", v)} required placeholder="Genel Müdür, Müdür vb." />
                  <FormField label="Yetki Kapsamı" value={item.authorityScope} onChange={(v) => updateSignatory(index, "authorityScope", v)} placeholder="Yetki kapsamı" multiline rows={2} />
                  <FormField label="TC No" value={item.tcNo} onChange={(v) => updateSignatory(index, "tcNo", v)} placeholder="12345678901" maxLength={11} pattern="[0-9]*" />
                  <FormField label="Atama Tarihi" type="date" value={item.appointmentDate} onChange={(v) => updateSignatory(index, "appointmentDate", v)} />
                </FormGrid>
              )}
            />
          </FormSection>
        </TabPanel>

        <TabPanel id="activity" activeTab={activeTab}>
          <FormSection id="sectorInfo" title="Faaliyet Alanı" description="Sektör, NACE, anahtar kelimeler" icon={<Target />} required collapsible defaultOpen={true}>
            <FormGrid columns={2} gap="md">
              <SelectField label="NACE Kodu" value={formData.naceCode || ""} onChange={(v) => updateField("naceCode", v)} options={[...NAICS_SECTORS]} placeholder="NACE kodu seçin" />
              <FormField label="Sektör" value={formData.sector || ""} onChange={(v) => updateField("sector", v)} placeholder="Sektör" />
              <FormField label="Alt Sektör" value={formData.subSector || ""} onChange={(v) => updateField("subSector", v)} placeholder="Alt sektör" />
              <FormField label="Anahtar Kelimeler" value={formData.keywords?.join(", ") || ""} onChange={(v) => updateField("keywords", v)} placeholder="Anahtar kelimeler (virgülle ayırın)" hint="Arama ve filtreleme için" />
            </FormGrid>
          </FormSection>
        </TabPanel>

        <TabPanel id="finance" activeTab={activeTab}>
          <FormSection id="banking" title="Banka Bilgileri" description="Banka, IBAN" icon={<Banknote />} collapsible defaultOpen={false}>
            <FormGrid columns={2} gap="md">
              <FormField label="Banka Adı" value={formData.bankName || ""} onChange={(v) => updateField("bankName", v)} placeholder="Banka adı" icon={<Banknote />} />
              <FormField label="IBAN" value={formData.iban || ""} onChange={(v) => updateField("iban", v)} placeholder="TR00 0000 0000 0000 0000 0000 00" hint="TR IBAN formatında" icon={<CreditCard />} />
            </FormGrid>
          </FormSection>

          <FormSection id="insurance" title="Sigorta ve Çalışan" description="Sigorta, çalışan sayısı, ciro" icon={<Shield />} collapsible defaultOpen={false}>
            <FormGrid columns={2} gap="md">
              <FormField label="Sigorta No" value={formData.insuranceNumber || ""} onChange={(v) => updateField("insuranceNumber", v)} placeholder="Sigorta numarası" />
              <FormField label="Çalışan Sayısı" type="number" value={formData.employeeCount?.toString() || ""} onChange={(v) => updateField("employeeCount", v)} placeholder="50" min="0" step="1" icon={<Users />} />
              <SelectField label="Yıllık Ciro Aralığı" value={formData.annualTurnoverRange || ""} onChange={(v) => updateField("annualTurnoverRange", v)} options={[...TURNOVER_RANGES]} placeholder="Ciro aralığı seçin" />
            </FormGrid>
          </FormSection>
        </TabPanel>

        <TabPanel id="profile" activeTab={activeTab}>
          <FormSection id="description" title="Profil" description="Açıklama, kategoriler, dizin hedefi" icon={<FileText />} collapsible defaultOpen={true}>
            <FormField label="Profil Açıklaması" value={formData.profileDescription || ""} onChange={(v) => updateField("profileDescription", v)} multiline rows={5} maxLength={2000} placeholder="Firma hakkında açıklama" />
            <FormField label="Kategoriler" value={formData.categoriesText?.join(", ") || ""} onChange={(v) => updateField("categoriesText", v)} multiline rows={3} maxLength={1000} placeholder="Kategoriler (virgülle ayırın)" hint="Dizin kategorileri" />
            <FormField label="Dizin Hedefi" value={formData.directoryTarget || ""} onChange={(v) => updateField("directoryTarget", v)} placeholder="Dizin hedefi (opsiyonel)" />
          </FormSection>
        </TabPanel>
      </form>
    </div>
  );
}

function saveCompanyProfile(_prev: CompanyProfileFormState, _formData: FormData): CompanyProfileFormState {
  return { status: "idle", message: "idle" };
}

export default CompanyProfileForm;