"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { importTalentPool } from "./import-talent-pool";
import {
  aiConvertTalentPool,
  aiImportConvertedTalentPool,
  deleteTalentPoolEntry,
} from "./ai-convert-talent-pool";
import {
  FileText,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Bot,
  Sparkles,
} from "lucide-react";

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

const initialAiState: Awaited<ReturnType<typeof aiConvertTalentPool>> = {
  status: "idle",
  message: "idle",
};

const initialImportState: Awaited<ReturnType<typeof aiImportConvertedTalentPool>> = {
  status: "idle",
  message: "idle",
};

type TalentPoolEntry = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  headline: string | null;
  location: string | null;
  skills: string[];
  summary: string | null;
  created_at: string;
};

export function AdminTalentPoolClient({
  _locale,
  totalCandidates,
  importedCandidates,
  memberCandidates,
  entries,
}: {
  _locale: string;
  totalCandidates?: number;
  importedCandidates?: number;
  memberCandidates?: number;
  entries?: TalentPoolEntry[];
}) {
  const t = useTranslations("TalentPool");
  const [jsonInput, setJsonInput] = useState("");
  const [state, formAction, isImporting] = useActionState(importTalentPool, initialState);

  // AI conversion
  const [rawText, setRawText] = useState("");
  const [aiState, aiAction, isConverting] = useActionState(aiConvertTalentPool, initialAiState);
  const [convertedJson, setConvertedJson] = useState("");
  const [importState, importAction, isImportingConverted] = useActionState(
    aiImportConvertedTalentPool,
    initialImportState,
  );

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteState, deleteAction] = useActionState(deleteTalentPoolEntry, {
    status: "idle",
    message: "idle",
  });

  function handleFillTemplate() {
    setJsonInput(JSON.stringify(TALENT_POOL_TEMPLATE, null, 2));
  }

  const entrySkills = (entry: TalentPoolEntry) =>
    (entry.skills ?? []).slice(0, 5).join(", ") + (entry.skills?.length ?? 0 > 5 ? "…" : "");

  const dateFormatter = new Intl.DateTimeFormat(_locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

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

      {/* AI Conversion Section */}
      <section className="admin-talent-pool-ai">
        <div className="admin-ai-header">
          <Bot size={20} aria-hidden="true" />
          <div>
            <h2>{t("aiConvertTitle")}</h2>
            <p>{t("aiConvertDescription")}</p>
          </div>
          <Sparkles size={20} aria-hidden="true" />
        </div>
        <form action={aiAction} className="admin-ai-form">
          <textarea
            name="rawText"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={t("aiConvertPlaceholder")}
            rows={6}
            className="admin-ai-textarea"
            spellCheck={false}
          />
          <button
            type="submit"
            disabled={isConverting || !rawText.trim()}
            className="button button-dark"
          >
            {isConverting ? <Bot size={16} className="spinning" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}
            {isConverting ? t("aiConverting") : t("aiConvertButton")}
          </button>
        </form>

        {aiState.status !== "idle" && (
          <div
            className={`admin-ai-result ${aiState.status}`}
            role="status"
            aria-live="polite"
          >
            {aiState.status === "success" ? (
              <>
                <CheckCircle2 size={20} aria-hidden="true" className="admin-result-icon" />
                <span>{aiState.message}</span>
              </>
            ) : (
              <>
                <AlertCircle size={20} aria-hidden="true" className="admin-result-icon" />
                <span>{aiState.message}</span>
              </>
            )}
          </div>
        )}

        {aiState.status === "success" && aiState.json && (
          <div className="admin-ai-converted">
            <label>{t("aiConvertedJson")}</label>
            <textarea
              value={convertedJson || aiState.json}
              onChange={(e) => setConvertedJson(e.target.value)}
              readOnly
              rows={8}
              className="admin-ai-json"
              spellCheck={false}
            />
            <form action={importAction} className="admin-ai-import-form">
              <input name="jsonData" type="hidden" value={convertedJson || aiState.json} />
              <button
                type="submit"
                disabled={isImportingConverted || !convertedJson.trim()}
                className="button button-primary"
              >
                {isImportingConverted ? <LoaderInline /> : <Plus size={16} aria-hidden="true" />}
                {isImportingConverted ? t("aiImporting") : t("aiImportButton")}
              </button>
            </form>
            {importState.status !== "idle" && (
              <p className="admin-ai-import-msg" data-status={importState.status}>
                {importState.message}
              </p>
            )}
          </div>
        )}
      </section>

      {/* Existing JSON Import Section */}
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
                <span>{t("importSuccess", { count: state.count ?? 0 })}</span>
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

      {/* Entries List */}
      <section className="admin-talent-pool-entries">
        <h2>{t("entriesTitle")}</h2>
        {(!entries || entries.length === 0) ? (
          <section className="company-review-empty" role="status">
            <p>{t("empty")}</p>
          </section>
        ) : (
          <div className="admin-entries-table-wrap">
            <table className="admin-entries-table">
              <thead>
                <tr>
                  <th>{t("candidateName")}</th>
                  <th>{t("candidateEmail")}</th>
                  <th>{t("headline")}</th>
                  <th>Konum</th>
                  <th>Beceriler</th>
                  <th>{t("addedAt")}</th>
                  <th>{t("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="admin-entry-row">
                    <td>{entry.full_name}</td>
                    <td>{entry.email}</td>
                    <td>{entry.headline ?? "—"}</td>
                    <td>{entry.location ?? "—"}</td>
                    <td>{entrySkills(entry) || "—"}</td>
                    <td>{dateFormatter.format(new Date(entry.created_at))}</td>
                    <td>
                      <form action={deleteAction} className="admin-delete-form">
                        <input name="entryId" type="hidden" value={entry.id} />
                        <button
                          type="submit"
                          disabled={deletingId === entry.id || deleteState.status !== "idle"}
                          className="button button-ghost button-sm delete-btn"
                          aria-label={t("deleteEntry", { name: entry.full_name })}
                          onClick={(ev) => {
                            setDeletingId(entry.id);
                            if (!window.confirm(t("confirmDeleteEntry"))) ev.preventDefault();
                          }}
                        >
                          {deletingId === entry.id ? (
                            <LoaderInline size={14} />
                          ) : (
                            <Trash2 size={14} aria-hidden="true" />
                          )}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {deleteState.status !== "idle" && deleteState.status === "success" && (
          <p className="admin-delete-msg success">{t("entryDeleted")}</p>
        )}
        {deleteState.status === "error" && (
          <p className="admin-delete-msg error">{deleteState.message}</p>
        )}
      </section>
    </section>
  );
}

function LoaderInline({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="spinning"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="62.83"
        strokeDashoffset="25"
      >
        <animate
          attributeName="strokeDashoffset"
          values="25; -12.83"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
