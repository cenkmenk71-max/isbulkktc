"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Bot, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { aiPreCheck, type AiPreCheckState } from "./ai-pre-check";

const initialState: AiPreCheckState = {
  status: "idle",
  message: "idle",
  summary: [],
  decisionNote: "",
};

export function AiPreCheckButton({
  type,
  data,
}: {
  type: "job" | "company";
  data: Record<string, unknown>;
}) {
  const t = useTranslations("JobManagement.admin");
  const [state, action, pending] = useActionState(aiPreCheck, initialState);
  const [triggered, setTriggered] = useState(false);

  const handleClick = () => {
    setTriggered(true);
    const formData = new FormData();
    formData.append("type", type);
    formData.append("data", JSON.stringify(data));
    action(formData);
  };

  return (
    <section className="admin-ai-precheck">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || triggered}
        className="button button-outline button-sm"
      >
        {pending ? (
          <>
            <Loader2 size={16} className="spinning" aria-hidden="true" />
            {t("aiChecking") ?? "Kontrol ediliyor…"}
          </>
        ) : (
          <>
            <Bot size={16} aria-hidden="true" />
            {t("aiPreCheck") ?? "AI Ön Kontrol"}
          </>
        )}
      </button>

      {state.status === "success" && (
        <div className="admin-ai-precheck-result" role="status" aria-live="polite">
          <div className="admin-ai-precheck-header">
            <CheckCircle size={16} aria-hidden="true" />
            <span className="admin-ai-precheck-label">{t("aiPreCheckResult") ?? "Ön İnceleme Sonucu"}</span>
          </div>
          <ul className="admin-ai-precheck-summary">
            {state.summary.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p className="admin-ai-precheck-note">
            <strong>{t("aiDecisionNote") ?? "Karar notu"}:</strong> {state.decisionNote}
          </p>
        </div>
      )}

      {state.status === "error" && state.message !== "idle" && (
        <div className="admin-ai-precheck-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{state.message}</span>
        </div>
      )}
    </section>
  );
}
