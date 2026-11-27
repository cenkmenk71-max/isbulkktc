"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/routing";

export function AdminTalentPoolClient({ _locale }: { _locale: AppLocale }) {
  const t = useTranslations("TalentPool");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; count?: number; error?: string } | null>(null);
  const [jsonInput, setJsonInput] = useState("");

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    setImporting(true);
    setResult(null);

    try {
      const entries = JSON.parse(jsonInput);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !anonKey) throw new Error("Supabase not configured");

      const res = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_bulk_import_talent_pool`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ _entries: entries }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Import failed: ${res.status}`);
      }

      const count = await res.json();
      setResult({ ok: true, count: count as number });
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="admin-talent-pool page-container">
      <header className="admin-talent-pool-header">
        <h1>{t("adminTitle")}</h1>
        <p>{t("adminDescription")}</p>
      </header>

      <section className="admin-talent-pool-import">
        <h2>{t("importTitle")}</h2>
        <p>{t("importDescription")}</p>
        <form onSubmit={handleImport} className="admin-talent-pool-form">
          <textarea
            value={jsonInput}
            onChange={(event) => setJsonInput(event.target.value)}
            placeholder={t("importPlaceholder")}
            rows={10}
            className="admin-talent-pool-json"
          />
          <button
            type="submit"
            disabled={importing}
            className="button button-dark"
          >
            {importing ? t("importing") : t("importButton")}
          </button>
        </form>
        {result && (
          <div className={`admin-talent-pool-result ${result.ok ? "success" : "error"}`}>
            {result.ok
              ? `${t("importedCount", { count: result.count ?? 0 })}`
              : result.error}
          </div>
        )}
      </section>
    </div>
  );
}