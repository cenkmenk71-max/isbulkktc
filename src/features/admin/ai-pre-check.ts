"use server";

import { getCurrentUser } from "@/server/dal/user";
import { hasAssignedPlatformRole } from "@/server/dal/user";

export type AiPreCheckInput = {
  type: "job" | "company";
  data: Record<string, unknown>;
};

export type AiPreCheckState = {
  status: "idle" | "error" | "success";
  message: string;
  summary: string[];
  decisionNote: string;
};

const aiPreCheckSystemPrompt = `You are a senior recruitment operations reviewer for İşBul KKTC (Northern Cyprus job platform). Review a pending job listing or company profile submission and produce a short pre-audit.

Return ONLY a JSON object (no markdown, no commentary) with exactly these keys:
{
  "summary": ["string", "string", "string"],
  "decisionNote": "string"
}

RULES:
- summary: exactly 3 short Turkish sentences covering (1) missing information, (2) inconsistencies or quality issues, (3) spam/fraud signals or overall quality verdict.
- decisionNote: a ready-to-use one-line admin decision note in Turkish (e.g. "Onayla", "Düzeltme istemi gönder", "Reddet").
- If a field cannot be assessed, say so briefly rather than inventing.
- Be concise and professional.
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanSummary(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter(Boolean)
    .slice(0, 3);
}

async function requestGeminiPreCheck(
  payload: string,
  apiKey: string,
): Promise<{ ok: true; output: unknown } | { ok: false }> {
  const models = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: aiPreCheckSystemPrompt }] },
            contents: [{ role: "user", parts: [{ text: `Pre-audit the following ${payload}` }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
            },
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (!response.ok) continue;
      const json = await response.json().catch(() => null);
      let content: string | null = null;
      if (
        isRecord(json) &&
        Array.isArray(json.candidates) &&
        isRecord(json.candidates[0]) &&
        isRecord(json.candidates[0].content) &&
        Array.isArray(json.candidates[0].content.parts)
      ) {
        content = json.candidates[0].content.parts
          .filter((part): part is Record<string, unknown> => isRecord(part))
          .map((part) => part.text)
          .filter((part): part is string => typeof part === "string")
          .join("") || null;
      }
      if (!content) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
      } catch {
        continue;
      }
      return { ok: true, output: parsed };
    } catch {
      continue;
    }
  }
  return { ok: false };
}

async function requestGroqPreCheck(
  payload: string,
  apiKey: string,
): Promise<{ ok: true; output: unknown } | { ok: false }> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_CV_MODEL ?? "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: aiPreCheckSystemPrompt },
          { role: "user", content: `Pre-audit the following ${payload}` },
        ],
        temperature: 0.1,
        max_completion_tokens: 4_000,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) return { ok: false };
    const json = await response.json().catch(() => null);
    const content =
      isRecord(json) &&
      Array.isArray(json.choices) &&
      isRecord(json.choices[0]) &&
      isRecord(json.choices[0].message)
        ? json.choices[0].message.content
        : null;
    if (typeof content !== "string") return { ok: false };
    let parsed: unknown;
    try {
      parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
    } catch {
      return { ok: false };
    }
    return { ok: true, output: parsed };
  } catch {
    return { ok: false };
  }
}

function localRuleBasedPreCheck(type: "job" | "company", data: Record<string, unknown>): {
  summary: string[];
  decisionNote: string;
} {
  const summary: string[] = [];
  let decisionNote = "İnceleme gerekiyor";

  if (type === "job") {
    const title = String(data.title ?? "");
    const description = String(data.description ?? "");
    const summaryField = String(data.summary ?? "");
    const district = String(data.district ?? "");
    const jobType = String(data.job_type ?? "");

    const missing: string[] = [];
    if (!title.trim()) missing.push("ilan başlığı");
    if (!description.trim()) missing.push("ilan açıklaması");
    if (!summaryField.trim()) missing.push("kısa özet");
    if (!district.trim()) missing.push("ilçe");
    if (!jobType.trim()) missing.push("çalışma türü");

    if (missing.length) summary.push(`Eksik bilgi: ${missing.join(", ")}.`);
    else summary.push("Temel ilan alanları (başlık, açıklama, özet, ilçe, çalışma türü) mevcut.");

    if (description.trim().length < 100) summary.push("İlan açıklaması çok kısa; daha fazla detay eklenmeli.");
    else if (description.trim().length > 5000) summary.push("İlan açıklaması çok uzun; özetlenmesi önerilir.");
    else summary.push("İlan açıklaması uzunluğu uygun.");

    const spamSignals = ["para kazan", "hızlı para", "yatırım", "getiri", "garanti kar"].filter((s) =>
      `${title} ${description}`.toLowerCase().includes(s),
    );
    if (spamSignals.length) {
      summary.push(`Spam/dolandırıcılık sinyali tespit edildi: ${spamSignals.join(", ")}.`);
      decisionNote = "Reddet";
    } else {
      summary.push("Spam veya dolandırıcılık sinyali bulunamadı.");
      decisionNote = missing.length ? "Düzeltme istemi gönder" : "Onayla";
    }
  } else {
    const name = String(data.name ?? "");
    const publicEmail = String(data.public_email ?? "");
    const phone = String(data.phone ?? "");
    const website = String(data.website ?? "");
    const address = String(data.address ?? "");

    const missing: string[] = [];
    if (!name.trim()) missing.push("şirket adı");
    if (!publicEmail.trim()) missing.push("herkese açık e-posta");
    if (!phone.trim()) missing.push("telefon");
    if (!address.trim()) missing.push("adres");

    if (missing.length) summary.push(`Eksik bilgi: ${missing.join(", ")}.`);
    else summary.push("Temel şirket alanları (ad, e-posta, telefon, adres) mevcut.");

    if (publicEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(publicEmail)) {
      summary.push("E-posta formatı geçersiz.");
    } else {
      summary.push("E-posta formatı geçerli.");
    }

    if (website && !/^https?:\/\/\S+$/i.test(website)) {
      summary.push("Web sitesi URL'si geçersiz.");
    } else {
      summary.push("Web sitesi geçerli veya belirtilmemiş.");
    }

    decisionNote = missing.length ? "Düzeltme istemi gönder" : "Onayla";
  }

  return { summary: summary.slice(0, 3), decisionNote };
}

export async function aiPreCheck(
  _previousState: AiPreCheckState | null,
  formData: FormData,
): Promise<AiPreCheckState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "idle", message: "idle", summary: [], decisionNote: "" };
  }
  if (!(await hasAssignedPlatformRole("platform_admin"))) {
    return { status: "idle", message: "idle", summary: [], decisionNote: "" };
  }

  const type = formData.get("type");
  const dataJson = formData.get("data");
  if (typeof type !== "string" || (type !== "job" && type !== "company")) {
    return { status: "idle", message: "idle", summary: [], decisionNote: "" };
  }
  if (typeof dataJson !== "string" || !dataJson.trim()) {
    return { status: "idle", message: "idle", summary: [], decisionNote: "" };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataJson);
    if (!isRecord(data)) throw new Error("not an object");
  } catch {
    return { status: "idle", message: "idle", summary: [], decisionNote: "" };
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  let parsed: unknown = null;
  let providerUsed = "local";

  const payload = `${type}: ${JSON.stringify(data)}`;

  if (geminiApiKey) {
    try {
      const attempt = await requestGeminiPreCheck(payload, geminiApiKey);
      if (attempt.ok) {
        parsed = attempt.output;
        providerUsed = "gemini";
      }
    } catch {
      // fall through
    }
  }

  if (!parsed && groqApiKey) {
    try {
      const attempt = await requestGroqPreCheck(payload, groqApiKey);
      if (attempt.ok) {
        parsed = attempt.output;
        providerUsed = "groq";
      }
    } catch {
      // fall through
    }
  }

  let summary: string[];
  let decisionNote: string;

  if (parsed && isRecord(parsed)) {
    summary = cleanSummary((parsed as Record<string, unknown>).summary);
    decisionNote = cleanSummary([(parsed as Record<string, unknown>).decisionNote])[0] || "İnceleme gerekiyor";
    if (summary.length === 0) {
      const local = localRuleBasedPreCheck(type, data);
      summary = local.summary;
      decisionNote = local.decisionNote;
    }
  } else {
    const local = localRuleBasedPreCheck(type, data);
    summary = local.summary;
    decisionNote = local.decisionNote;
  }

  if (summary.length === 0) {
    const local = localRuleBasedPreCheck(type, data);
    summary = local.summary;
    decisionNote = local.decisionNote;
  }

  return {
    status: "success",
    message: providerUsed === "local"
      ? `Yerel kural tabanlı denetim tamamlandı (${type}).`
      : `${providerUsed.toUpperCase()} ile ön inceleme tamamlandı (${type}).`,
    summary: summary.slice(0, 3),
    decisionNote,
  };
}
