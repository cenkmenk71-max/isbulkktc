"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Mail, Plus, Trash2, Eye, Send, Loader2, AlertTriangle, CheckCircle, Users, FileText } from "lucide-react";
import { sendOutreachEmails } from "./outreach-actions";

type Recipient = {
  id: string;
  companyName: string;
  email: string;
  locale: "tr" | "en";
};

type SendResult = {
  email: string;
  status: "sent" | "unsubscribed_skipped" | "invalid_email" | "error";
  message?: string;
};

type SendSummary = {
  sent: number;
  skipped: number;
  invalid: number;
  errors: number;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MARKETING_PREVIEW_HTML = {
  tr: `
<!doctype html>
<html lang="tr" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>İşBul KKTC İşveren Paketleri</title>
  <style>
    :root { color-scheme: light; --green:#194435; --green-hover:#14392c; --ink:#171b1a; --ink-2:#2a3531; --line:#d0d9d3; --canvas:#f5f2eb; --surface:#faf8f3; --green-soft:#d6e8df; --radius:12px; --radius-sm:8px; }
    body { margin:0; padding:24px 12px; background:var(--canvas); color:var(--ink); font:16px/1.6 system-ui, -apple-system, sans-serif; }
    .email { max-width:600px; margin:0 auto; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; box-shadow:0 12px 32px rgba(20,50,32,.06); }
    .header { background:linear-gradient(135deg,var(--green),var(--green-hover)); color:#fff; padding:32px 24px; text-align:center; }
    .header h1 { margin:0; font-size:24px; font-weight:700; }
    .header p { margin:8px 0 0; opacity:.9; }
    .content { padding:32px 24px; }
    .greeting { margin:0 0 16px; font-size:16px; }
    .paragraph { margin:0 0 16px; color:var(--ink-2); }
    .hero { background:var(--green-soft); border-radius:var(--radius); padding:24px; margin:24px 0; text-align:center; }
    .hero h2 { margin:0 0 8px; font-size:20px; color:var(--green); }
    .hero p { margin:0; color:var(--ink-2); }
    .cta { display:inline-block; background:var(--green); color:#fff; padding:14px 28px; border-radius:999px; font-weight:700; text-decoration:none; margin:16px 0; }
    .cta:hover { background:var(--green-hover); }
    .packages { margin:32px 0; }
    .package-card { border:1px solid var(--line); border-radius:var(--radius); padding:20px; margin:16px 0; background:#fff; }
    .package-card h3 { margin:0 0 8px; font-size:18px; }
    .package-card .audience { font-size:12px; font-weight:700; color:var(--green); text-transform:uppercase; margin-bottom:8px; }
    .package-card .scope { color:var(--ink-2); font-size:14px; }
    .features { margin:24px 0; }
    .feature { display:flex; gap:12px; margin:12px 0; align-items:flex-start; }
    .feature-icon { width:28px; height:28px; border-radius:50%; background:var(--green-soft); color:var(--green); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
    .feature-text { flex:1; }
    .feature-text strong { display:block; margin-bottom:4px; }
    .contacts { border-top:1px solid var(--line); padding-top:24px; margin-top:24px; }
    .contact-row { display:flex; align-items:center; gap:12px; margin:12px 0; color:var(--ink-2); }
    .contact-icon { width:36px; height:36px; border-radius:50%; background:var(--green-soft); color:var(--green); display:flex; align-items:center; justify-content:center; }
    .footer { background:var(--canvas); border-top:1px solid var(--line); padding:24px; text-align:center; color:var(--ink-2); font-size:13px; }
    .unsubscribe { margin-top:16px; font-size:12px; color:#66746c; }
    .unsubscribe a { color:var(--green); }
  </style>
</head>
<body>
  <div class="email">
    <div class="header">
      <h1>İşBul KKTC İşveren Paketleri</h1>
      <p>İşe alım ihtiyacınıza uygun ilan paketini seçin</p>
    </div>
    <div class="content">
      <p class="greeting">Sayın Yetkili,</p>
      <p class="paragraph">İşBul KKTC işveren paketleri, aynı anda yayınlamak istediğiniz açık pozisyon sayısına göre farklı ilan hakları sunar.</p>
      <p class="paragraph">Her ilan için 1, 7 veya 30 gün seçebilirsiniz. Kurumsal paketin ilan adedi ve kapsamı yazılı teklifte netleştirilir.</p>

      <div class="hero">
        <h2>İşe alım ihtiyacınıza uygun ilan paketini seçin</h2>
        <p>İlan adedini belirleyin; her ilan için 1, 7 veya 30 gün seçin.</p>
        <a href="#" class="cta">Paketleri incele</a>
      </div>

      <div class="features">
        <h3 style="margin:0 0 16px;color:var(--green);">Paketlerin temel farkları</h3>
        <div class="feature"><span class="feature-icon">01</span><div class="feature-text"><strong>Tek açık pozisyon</strong>Tek İlan paketi, bir açık pozisyon için 1 ilan hakkı sunar.</div></div>
        <div class="feature"><span class="feature-icon">03</span><div class="feature-text"><strong>Birden fazla pozisyon</strong>Büyüme paketi, aynı dönemde en fazla 3 ilan hakkı sunar.</div></div>
        <div class="feature"><span class="feature-icon">05</span><div class="feature-text"><strong>Düzenli işe alım</strong>Profesyonel paketi, aynı dönemde en fazla 5 ilan hakkı sunar.</div></div>
        <div class="feature"><span class="feature-icon">✓</span><div class="feature-text"><strong>Kurumsal kapsam</strong>Kurumsal paketin ilan adedi, kapsamı ve süresi yazılı teklifte netleştirilir.</div></div>
      </div>

      <p class="paragraph" style="margin-top:24px;">Paket kapsamlarını inceleyin ve ihtiyacınıza uygun seçeneği ekibimizle netleştirin.</p>

      <div class="contacts">
        <h3 style="margin:0 0 16px;color:var(--green);">Seçtiğiniz ilan paketi hakkında ekibimize ulaşın.</h3>
        <div class="contact-row"><span class="contact-icon">📧</span><div><strong>E-posta</strong><br>info@isbulkktc.com</div></div>
        <div class="contact-row"><span class="contact-icon">📞</span><div><strong>Telefon</strong><br>0539 131 64 21</div></div>
        <div class="contact-row"><span class="contact-icon">💬</span><div><strong>WhatsApp</strong><br>0539 131 64 21</div></div>
      </div>
    </div>
    <div class="footer">
      Bu e-posta, İşBul KKTC'nin işverenlere yönelik ilan paketleri hakkında bilgilendirme amacıyla gönderilmiştir.<br>
      <div class="unsubscribe">
        <a href="[UNSUBSCRIBE_URL]">Abonelikten çık</a> ·
        İşBul KKTC · Alsancak, KKTC
      </div>
    </div>
  </div>
</body>
</html>
  `,
  en: `
<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>İşBul KKTC Employer Packages</title>
  <style>
    :root { color-scheme: light; --green:#194435; --green-hover:#14392c; --ink:#171b1a; --ink-2:#2a3531; --line:#d0d9d3; --canvas:#f5f2eb; --surface:#faf8f3; --green-soft:#d6e8df; --radius:12px; --radius-sm:8px; }
    body { margin:0; padding:24px 12px; background:var(--canvas); color:var(--ink); font:16px/1.6 system-ui, -apple-system, sans-serif; }
    .email { max-width:600px; margin:0 auto; background:var(--surface); border:1px solid var(--line); border-radius:var(--radius); overflow:hidden; box-shadow:0 12px 32px rgba(20,50,32,.06); }
    .header { background:linear-gradient(135deg,var(--green),var(--green-hover)); color:#fff; padding:32px 24px; text-align:center; }
    .header h1 { margin:0; font-size:24px; font-weight:700; }
    .header p { margin:8px 0 0; opacity:.9; }
    .content { padding:32px 24px; }
    .greeting { margin:0 0 16px; font-size:16px; }
    .paragraph { margin:0 0 16px; color:var(--ink-2); }
    .hero { background:var(--green-soft); border-radius:var(--radius); padding:24px; margin:24px 0; text-align:center; }
    .hero h2 { margin:0 0 8px; font-size:20px; color:var(--green); }
    .hero p { margin:0; color:var(--ink-2); }
    .cta { display:inline-block; background:var(--green); color:#fff; padding:14px 28px; border-radius:999px; font-weight:700; text-decoration:none; margin:16px 0; }
    .cta:hover { background:var(--green-hover); }
    .packages { margin:32px 0; }
    .package-card { border:1px solid var(--line); border-radius:var(--radius); padding:20px; margin:16px 0; background:#fff; }
    .package-card h3 { margin:0 0 8px; font-size:18px; }
    .package-card .audience { font-size:12px; font-weight:700; color:var(--green); text-transform:uppercase; margin-bottom:8px; }
    .package-card .scope { color:var(--ink-2); font-size:14px; }
    .features { margin:24px 0; }
    .feature { display:flex; gap:12px; margin:12px 0; align-items:flex-start; }
    .feature-icon { width:28px; height:28px; border-radius:50%; background:var(--green-soft); color:var(--green); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px; flex-shrink:0; }
    .feature-text { flex:1; }
    .feature-text strong { display:block; margin-bottom:4px; }
    .contacts { border-top:1px solid var(--line); padding-top:24px; margin-top:24px; }
    .contact-row { display:flex; align-items:center; gap:12px; margin:12px 0; color:var(--ink-2); }
    .contact-icon { width:36px; height:36px; border-radius:50%; background:var(--green-soft); color:var(--green); display:flex; align-items:center; justify-content:center; }
    .footer { background:var(--canvas); border-top:1px solid var(--line); padding:24px; text-align:center; color:var(--ink-2); font-size:13px; }
    .unsubscribe { margin-top:16px; font-size:12px; color:#66746c; }
    .unsubscribe a { color:var(--green); }
  </style>
</head>
<body>
  <div class="email">
    <div class="header">
      <h1>İşBul KKTC Employer Packages</h1>
      <p>Choose a listing package for your hiring needs</p>
    </div>
    <div class="content">
      <p class="greeting">Dear Hiring Manager,</p>
      <p class="paragraph">İşBul KKTC employer packages provide listing allowances based on the number of open roles you need to publish at the same time.</p>
      <p class="paragraph">Choose 1, 7 or 30 days for each listing. The listing quantity and scope for a corporate package are defined in a written quote.</p>

      <div class="hero">
        <h2>Choose a listing package for your hiring needs</h2>
        <p>Choose your listing allowance, then select 1, 7 or 30 days per listing.</p>
        <a href="#" class="cta">View packages</a>
      </div>

      <div class="features">
        <h3 style="margin:0 0 16px;color:var(--green);">How the packages differ</h3>
        <div class="feature"><span class="feature-icon">01</span><div class="feature-text"><strong>One open role</strong>Single Listing includes one job listing for one open role.</div></div>
        <div class="feature"><span class="feature-icon">03</span><div class="feature-text"><strong>Multiple open roles</strong>Growth includes up to three listings at the same time.</div></div>
        <div class="feature"><span class="feature-icon">05</span><div class="feature-text"><strong>Regular hiring</strong>Professional includes up to five listings at the same time.</div></div>
        <div class="feature"><span class="feature-icon">✓</span><div class="feature-text"><strong>Corporate scope</strong>The listing quantity, scope and duration for Corporate are agreed in a written quote.</div></div>
      </div>

      <p class="paragraph" style="margin-top:24px;">Review the package scope and discuss the option that fits your hiring needs with our team.</p>

      <div class="contacts">
        <h3 style="margin:0 0 16px;color:var(--green);">Contact our team about this listing package.</h3>
        <div class="contact-row"><span class="contact-icon">📧</span><div><strong>Email</strong><br>info@isbulkktc.com</div></div>
        <div class="contact-row"><span class="contact-icon">📞</span><div><strong>Phone</strong><br>+90 539 131 64 21</div></div>
        <div class="contact-row"><span class="contact-icon">💬</span><div><strong>WhatsApp</strong><br>+90 539 131 64 21</div></div>
      </div>
    </div>
    <div class="footer">
      This email provides information about İşBul KKTC listing packages for employers.<br>
      <div class="unsubscribe">
        <a href="[UNSUBSCRIBE_URL]">Unsubscribe</a> ·
        İşBul KKTC · Alsancak, KKTC
      </div>
    </div>
  </div>
</body>
</html>
  `,
};

export function OutreachComposer() {
  const t = useTranslations("AdminOutreach");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [singleForm, setSingleForm] = useState({ companyName: "", email: "", locale: "tr" as "tr" | "en" });
  const [bulkText, setBulkText] = useState("");
  const [previewLocale, setPreviewLocale] = useState<"tr" | "en">("tr");
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<{ results: SendResult[]; summary: SendSummary } | null>(null);
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const validRecipients = useMemo(() => recipients.filter((r) => EMAIL_REGEX.test(r.email)), [recipients]);
  const invalidCount = recipients.length - validRecipients.length;
  const duplicateEmails = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    recipients.forEach((r) => {
      const norm = r.email.trim().toLowerCase();
      if (seen.has(norm)) dupes.add(norm);
      seen.add(norm);
    });
    return dupes;
  }, [recipients]);

  const addSingleRecipient = useCallback(() => {
    const { companyName, email, locale } = singleForm;
    if (!email || !EMAIL_REGEX.test(email)) return;
    const normEmail = email.trim().toLowerCase();
    if (recipients.some((r) => r.email.trim().toLowerCase() === normEmail)) return;
    setRecipients((prev) => [...prev, { id: crypto.randomUUID(), companyName: companyName.trim(), email: normEmail, locale }]);
    setSingleForm({ companyName: "", email: "", locale });
  }, [singleForm, recipients]);

  const parseBulkText = useCallback((text: string) => {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const newRecipients: Recipient[] = [];
    for (const line of lines) {
      if (newRecipients.length >= 25) break;
      const parts = line.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        const email = parts[1];
        if (EMAIL_REGEX.test(email)) {
          const normEmail = email.toLowerCase();
          if (!recipients.some((r) => r.email === normEmail) && !newRecipients.some((r) => r.email === normEmail)) {
            newRecipients.push({ id: crypto.randomUUID(), companyName: parts[0], email: normEmail, locale: "tr" });
          }
        }
      } else if (parts.length === 1 && EMAIL_REGEX.test(parts[0])) {
        const normEmail = parts[0].toLowerCase();
        if (!recipients.some((r) => r.email === normEmail) && !newRecipients.some((r) => r.email === normEmail)) {
          newRecipients.push({ id: crypto.randomUUID(), companyName: "", email: normEmail, locale: "tr" });
        }
      }
    }
    setRecipients((prev) => [...prev, ...newRecipients]);
    setBulkText("");
  }, [recipients]);

  const removeRecipient = useCallback((id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleSendTest = useCallback(async () => {
    const adminEmail = prompt(t("testEmailPrompt"));
    if (!adminEmail || !EMAIL_REGEX.test(adminEmail)) return;
    setTestSending(true);
    setTestResult(null);
    setToast(null);
    try {
      const res = await sendOutreachEmails({ recipients: [], testMode: true, testEmail: adminEmail });
      setTestResult({ success: res.success, message: res.results[0]?.message ?? (res.success ? t("testSent") : t("testFailed")) });
      if (res.success) {
        setToast({ kind: "success", message: t("testSent") });
      } else {
        setToast({ kind: "error", message: t("testFailed") });
      }
    } catch (error) {
      setTestResult({ success: false, message: error instanceof Error ? error.message : t("testError") });
      setToast({ kind: "error", message: t("testError") });
    } finally {
      setTestSending(false);
    }
  }, [t]);

  const handleSendAll = useCallback(async () => {
    if (validRecipients.length === 0) return;
    setSending(true);
    setSendResults(null);
    setToast(null);
    try {
      const res = await sendOutreachEmails({ recipients: validRecipients, testMode: false });
      setSendResults({ results: res.results, summary: res.summary });
      if (res.success) {
        setToast({ kind: "success", message: t("sendComplete", { sent: res.summary.sent, total: validRecipients.length }) });
      } else {
        setToast({ kind: "error", message: t("sendError") });
      }
    } catch (error) {
      setSendResults({
        results: validRecipients.map((r) => ({ email: r.email, status: "error" as const, message: error instanceof Error ? error.message : t("sendError") })),
        summary: { sent: 0, skipped: 0, invalid: invalidCount, errors: validRecipients.length },
      });
      setToast({ kind: "error", message: t("sendError") });
    } finally {
      setSending(false);
    }
  }, [validRecipients, invalidCount, t]);

  const getPreviewHtml = useCallback(() => {
    return MARKETING_PREVIEW_HTML[previewLocale].replace("[UNSUBSCRIBE_URL]", "#unsubscribe-link");
  }, [previewLocale]);

  const statusColors = {
    sent: "status-sent",
    unsubscribed_skipped: "status-skipped",
    invalid_email: "status-invalid",
    error: "status-error",
  };

  const statusLabels = {
    sent: t("statusSent"),
    unsubscribed_skipped: t("statusSkipped"),
    invalid_email: t("statusInvalid"),
    error: t("statusError"),
  };

  return (
    <div className="admin-outreach-composer">
      {toast && (
        <div className={`outreach-toast outreach-toast--${toast.kind}`} role="alert" aria-live="polite">
          {toast.kind === "success" ? <CheckCircle size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
          <span>{toast.message}</span>
          <button className="outreach-toast-dismiss" onClick={dismissToast} aria-label={t("dismissToast")}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}

      <div className="composer-grid">
        <section className="composer-panel" aria-labelledby="recipients-title">
          <header className="panel-header">
            <h2 id="recipients-title">
              <Mail size={18} aria-hidden="true" />
              {t("recipientsTitle")}
            </h2>
            <span className="recipient-count">
              {recipients.length} {t("recipientCount", { count: recipients.length })}
            </span>
          </header>

          <div className="input-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "single"}
              onClick={() => setActiveTab("single")}
              className={activeTab === "single" ? "tab-active" : ""}
            >
              {t("tabSingle")}
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "bulk"}
              onClick={() => setActiveTab("bulk")}
              className={activeTab === "bulk" ? "tab-active" : ""}
            >
              {t("tabBulk")}
            </button>
          </div>

          {activeTab === "single" && (
            <div className="tab-panel">
              <div className="form-row">
                <label htmlFor="companyName">{t("companyName")}</label>
                <input
                  id="companyName"
                  type="text"
                  value={singleForm.companyName}
                  onChange={(e) => setSingleForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  placeholder={t("companyNamePlaceholder")}
                  maxLength={200}
                />
              </div>
              <div className="form-row">
                <label htmlFor="singleEmail">{t("email")}</label>
                <input
                  id="singleEmail"
                  type="email"
                  value={singleForm.email}
                  onChange={(e) => setSingleForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder={t("emailPlaceholder")}
                />
              </div>
              <div className="form-row">
                <label htmlFor="singleLocale">{t("locale")}</label>
                <select
                  id="singleLocale"
                  value={singleForm.locale}
                  onChange={(e) => setSingleForm((prev) => ({ ...prev, locale: e.target.value as "tr" | "en" }))}
                >
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </div>
              <button
                className="button button-primary"
                onClick={addSingleRecipient}
                disabled={!singleForm.email || !EMAIL_REGEX.test(singleForm.email)}
              >
                <Plus size={16} aria-hidden="true" /> {t("addRecipient")}
              </button>
            </div>
          )}

          {activeTab === "bulk" && (
            <div className="tab-panel">
              <label htmlFor="bulkInput" className="visually-hidden">{t("bulkPlaceholder")}</label>
              <textarea
                id="bulkInput"
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={t("bulkPlaceholder")}
                rows={8}
              />
              <p className="bulk-hint">{t("bulkHint")}</p>
              <button
                className="button button-primary"
                onClick={() => parseBulkText(bulkText)}
                disabled={!bulkText.trim()}
              >
                <Plus size={16} aria-hidden="true" /> {t("addFromBulk")}
              </button>
            </div>
          )}

          {invalidCount > 0 && (
            <div className="validation-warning">
              <AlertTriangle size={16} aria-hidden="true" />
              {t("invalidEmailWarning", { count: invalidCount })}
            </div>
          )}

          {duplicateEmails.size > 0 && (
            <div className="validation-warning">
              <AlertTriangle size={16} aria-hidden="true" />
              {t("duplicateEmailWarning", { count: duplicateEmails.size })}
            </div>
          )}

          {recipients.length > 0 && (
            <div className="recipient-list" role="list" aria-label={t("recipientListLabel")}>
              {recipients.map((r) => (
                <div key={r.id} className="recipient-item">
                  <div className="recipient-info">
                    <span className="recipient-email">{r.email}</span>
                    {r.companyName && <span className="recipient-company">{r.companyName}</span>}
                    <span className={`recipient-locale locale-${r.locale}`}>{r.locale.toUpperCase()}</span>
                  </div>
                  <button
                    className="button button-ghost button-sm"
                    onClick={() => removeRecipient(r.id)}
                    aria-label={t("removeRecipient", { email: r.email })}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {recipients.length === 0 && (
            <p className="empty-recipients" role="status">
              <FileText size={24} aria-hidden="true" />
              {t("noRecipientsYet")}
            </p>
          )}
        </section>

        <section className="preview-panel" aria-labelledby="preview-title">
          <header className="panel-header">
            <h2 id="preview-title">
              <Eye size={18} aria-hidden="true" />
              {t("previewTitle")}
            </h2>
            <div className="preview-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={previewLocale === "tr"}
                onClick={() => setPreviewLocale("tr")}
                className={previewLocale === "tr" ? "tab-active" : ""}
              >
                TR
              </button>
              <button
                role="tab"
                aria-selected={previewLocale === "en"}
                onClick={() => setPreviewLocale("en")}
                className={previewLocale === "en" ? "tab-active" : ""}
              >
                EN
              </button>
            </div>
          </header>
          <div className="preview-frame">
            <iframe
              srcDoc={getPreviewHtml()}
              sandbox="allow-scripts allow-same-origin"
              title={t("previewFrameTitle", { locale: previewLocale })}
              loading="lazy"
            />
          </div>
        </section>
      </div>

      <section className="actions-section" aria-labelledby="actions-title">
        <h2 id="actions-title" className="visually-hidden">{t("actionsTitle")}</h2>
        <div className="action-buttons">
          <button
            className="button button-secondary"
            onClick={handleSendTest}
            disabled={testSending}
          >
            {testSending ? <Loader2 size={16} className="spinning" /> : <Send size={16} aria-hidden="true" />}
            {t("sendTestEmail")}
          </button>
          <button
            className="button button-primary"
            onClick={handleSendAll}
            disabled={sending || validRecipients.length === 0}
          >
            {sending ? <Loader2 size={16} className="spinning" /> : <Send size={16} aria-hidden="true" />}
            {t("sendToAll", { count: validRecipients.length })}
          </button>
        </div>

        {testResult && (
          <div className={`test-result ${testResult.success ? "success" : "error"}`} role="alert">
            {testResult.success ? <CheckCircle size={18} aria-hidden="true" /> : <AlertTriangle size={18} aria-hidden="true" />}
            <span>{testResult.message}</span>
          </div>
        )}

        {sendResults && (
          <div className="send-results" role="region" aria-label={t("sendResultsLabel")}>
            <h3>
              <CheckCircle size={18} aria-hidden="true" className="results-icon" />
              {t("sendComplete", { sent: sendResults.summary.sent, total: validRecipients.length })}
            </h3>
            <div className="results-summary">
              <span className="summary-item sent">{t("summarySent", { count: sendResults.summary.sent })}</span>
              <span className="summary-item skipped">{t("summarySkipped", { count: sendResults.summary.skipped })}</span>
              <span className="summary-item invalid">{t("summaryInvalid", { count: sendResults.summary.invalid })}</span>
              <span className="summary-item error">{t("summaryErrors", { count: sendResults.summary.errors })}</span>
            </div>
            <details className="results-details">
              <summary>{t("showDetails")}</summary>
              <table className="results-table">
                <thead>
                  <tr>
                    <th>{t("emailHeader")}</th>
                    <th>{t("statusHeader")}</th>
                    <th>{t("messageHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sendResults.results.map((r, i) => (
                    <tr key={i} className={statusColors[r.status]}>
                      <td>{r.email}</td>
                      <td><span className={`status-badge ${statusColors[r.status]}`}>{statusLabels[r.status]}</span></td>
                      <td>{r.message ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}
