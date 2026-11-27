"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { importTalentPool } from "./import-talent-pool";
import { FileText, Plus, CheckCircle2, AlertCircle } from "lucide-react";

const TALENT_POOL_TEMPLATE = [
  {
    full_name: "Ayşe Demir",
    email: "ayse.demir@example.com",
    phone: "+90 539 111 22 33",
    headline: "Yazılım Mühendisi",
    location: "Lefkoşa",
    summary: "React ve TypeScript ile web uygulamaları geliştiren full-stack yazılım mühendisi.",
    skills: ["React", "TypeScript", "Node.js", "PostgreSQL"],
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    links: [],
    source: "bulk_import",
    is_searchable: true,
  },
];

const initialState: Awaited<ReturnType<typeof importTalentPool>> = {
  status: "idle",
  message: "idle",
};

export function AdminTalentPoolClient({
  _locale,
  totalCandidates,
  importedCandidates,
  memberCandidates,
}: {
  _locale: string;
  totalCandidates?: number;
  importedCandidates?: number;
  memberCandidates?: number;
}) {
  const t = useTranslations("TalentPool");
  const [jsonInput, setJsonInput] = useState("");
  const [state, formAction, isImporting] = useActionState(importTalentPool, initialState);

  function handleFillTemplate() {
    setJsonInput(JSON.stringify(TALENT_POOL_TEMPLATE, null, 2));
  }

  return (
    <section className="admin-talent-pool page-container">
      <header className="admin-talent-pool-header">
        <div className="admin-talent-pool-stats">
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t("totalCandidates")}</span>
            <span className="admin-stat-value">{totalCandidates ?? 0}</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t("importedCandidates")}</span>
            <span className="admin-stat-value">{importedCandidates ?? 0}</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">{t("memberCandidates")}</span>
            <span className="admin-stat-value">{memberCandidates ?? 0}</span>
          </div>
        </div>
        <h1>{t("adminTitle")}</h1>
        <p>{t("adminDescription")}</p>
      </header>

      <section className="admin-talent-pool-import">
        <h2>{t("importTitle")}</h2>
        <p>{t("importDescription")}</p>
        <form action={formAction} className="admin-talent-pool-form">
          <input name="jsonData" type="hidden" value={jsonInput} />
          <div className="admin-talent-pool-actions">
            <button
              type="button"
              onClick={handleFillTemplate}
              disabled={isImporting}
              className="button button-outline"
            >
              <FileText size={16} aria-hidden="true" />
              {t("importTemplateButton")}
            </button>
            <p className="admin-talent-pool-fields-note">{t("fieldsNote")}</p>
          </div>
          <textarea
            value={jsonInput}
            onChange={(event) => setJsonInput(event.target.value)}
            placeholder={t("importPlaceholder")}
            rows={12}
            className="admin-talent-pool-json"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={isImporting || !jsonInput.trim()}
            className="button button-dark"
          >
            <Plus size={16} aria-hidden="true" />
            {isImporting ? t("importing") : t("importButton")}
          </button>
        </form>

        {state && state.status !== "idle" && (
          <div
            className={`admin-talent-pool-result ${state.status}`}
            role="status"
            aria-live="polite"
          >
            {state.status === "success" ? (
              <>
                <CheckCircle2 size={20} aria-hidden="true" className="admin-result-icon" />
                <span>
                  {t("importSuccess", { count: state.count ?? 0 })}
                </span>
              </>
            ) : (
              <>
                <AlertCircle size={20} aria-hidden="true" className="admin-result-icon" />
                <span>{state.message}</span>
              </>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
