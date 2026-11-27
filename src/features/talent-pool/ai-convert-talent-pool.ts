"use server";

import { createSupabaseServiceClient } from "@/server/db/supabase-server";
import { getCurrentUser } from "@/server/dal/user";
import { hasAssignedPlatformRole } from "@/server/dal/user";
import type { Json } from "@/types/database";

export type AiConvertTalentPoolInput = {
  rawText: string;
};

export type AiConvertTalentPoolState = {
  status: "idle" | "error" | "success";
  message: string;
  json?: string;
  count?: number;
};

const aiConvertSystemPrompt = `You convert unstructured recruiter notes, raw text, or CSV lines into a clean JSON array of talent pool candidate records.

Return ONLY a JSON array (no markdown, no commentary, no code fences) where each object has exactly these keys:
{
  "full_name": string | null,
  "email": string | null,
  "phone": string | null,
  "headline": string | null,
  "location": string | null,
  "skills": string[],
  "summary": string | null
}

RULES:
- Treat every input line as a potential candidate record.
- For CSV-style input ("Ayşe Demir, ayse@example.com, +90 539 111 22 33, Yazılım Mühendisi, Lefkoşa, React, TypeScript; Özet..."), map columns left to right to full_name, email, phone, headline, location, skills, summary. Skills may be a comma/semicolon-separated list in one column; split into an array.
- For free-form text, extract the person's name, e-mail, phone, headline/title, location (normalize to a KKTC district when evident: Lefkoşa, Mağusa, Girne, Güzelyurt, İskele, Lefke), skills array, and a short summary.
- Use null for unknown fields; empty array for absent skills.
- Validate e-mail format; if no valid e-mail exists for a record, set email to null but keep the record if a name is present.
- Deduplicate by e-mail; keep the first occurrence.
- Maximum 50 records in the output array.
- Preserve original language of names/titles; do not translate.
- Return valid JSON only.
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maximum: number): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length > maximum) return null;
  return cleaned;
}

function normalizeAiOutput(raw: unknown): Array<{
  full_name?: string;
  email?: string;
  phone?: string;
  headline?: string;
  location?: string;
  skills?: string[];
  summary?: string;
}> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{
    full_name?: string;
    email?: string;
    phone?: string;
    headline?: string;
    location?: string;
    skills?: string[];
    summary?: string;
  }> = [];
  const seenEmails = new Set<string>();

  for (const item of raw) {
    if (!isRecord(item)) continue;
    const fullName = cleanString(item.full_name, 120);
    const email = cleanString(item.email, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (email) {
      const norm = email.toLowerCase();
      if (seenEmails.has(norm)) continue;
      seenEmails.add(norm);
    }
    if (!fullName && !email) continue;

    const phone = cleanString(item.phone, 80);
    const headline = cleanString(item.headline, 140);
    const location = cleanString(item.location, 120);
    const summary = cleanString(item.summary, 2000);

    let skills: string[] = [];
    if (Array.isArray(item.skills)) {
      skills = item.skills
        .map((s) => cleanString(s, 60))
        .filter((s): s is string => Boolean(s))
        .slice(0, 40);
    }

    out.push({
      full_name: fullName ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      headline: headline ?? undefined,
      location: location ?? undefined,
      skills,
      summary: summary ?? undefined,
    });
    if (out.length >= 50) break;
  }

  return out;
}

async function requestGeminiConvert(
  rawText: string,
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
            systemInstruction: { parts: [{ text: aiConvertSystemPrompt }] },
            contents: [{ role: "user", parts: [{ text: `Convert the following recruiter input into a JSON array of talent pool records:\n\n${rawText}` }] }],
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

async function requestGroqConvert(
  rawText: string,
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
          { role: "system", content: aiConvertSystemPrompt },
          { role: "user", content: `Convert the following recruiter input into a JSON array of talent pool records:\n\n${rawText}` },
        ],
        temperature: 0.1,
        max_completion_tokens: 6_000,
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
    // Groq response_format json_object returns an object; wrap if it isn't an array.
    if (!Array.isArray(parsed)) {
      parsed = isRecord(parsed) ? [parsed] : [];
    }
    return { ok: true, output: parsed };
  } catch {
    return { ok: false };
  }
}

/**
 * Local smart CSV / line parser fallback when no AI key is configured.
 * Handles:
 *   - CSV with header: full_name,email,phone,headline,location,skills,summary
 *   - CSV without header: same column order per line
 *   - Pipe/semicolon separated lines
 *   - Free "Name <email>" style lines
 */
function localCsvParse(rawText: string): Array<{
  full_name?: string;
  email?: string;
  phone?: string;
  headline?: string;
  location?: string;
  skills?: string[];
  summary?: string;
}> {
  const EMAIL = /([^\s@]+@[^\s@]+\.[^\s@]+)/;
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const out: Array<{
    full_name?: string;
    email?: string;
    phone?: string;
    headline?: string;
    location?: string;
    skills?: string[];
    summary?: string;
  }> = [];
  const seen = new Set<string>();
  let startIndex = 0;

  const firstFields = lines[0].split(/[,;|]/).map((f) => f.trim().toLowerCase());
  const looksLikeHeader = firstFields.some((f) =>
    ["full_name", "email", "phone", "headline", "location", "skills", "summary", "ad soyad", "e-posta", "email", "telefon", "başlık", "konum", "beceriler", "özet"].includes(f),
  );
  if (looksLikeHeader) startIndex = 1;

  for (let i = startIndex; i < lines.length && out.length < 50; i += 1) {
    const line = lines[i];
    if (!line) continue;

    const parts = line.split(/[,;|]/).map((p) => p.trim()).filter(Boolean);
    let fullName: string | undefined;
    let email: string | undefined;
    let phone: string | undefined;
    let headline: string | undefined;
    let location: string | undefined;
    let skills: string[] = [];
    let summary: string | undefined;

    if (parts.length >= 2) {
      // CSV-style column mapping
      fullName = parts[0] || undefined;
      const maybeEmail = parts[1];
      if (EMAIL.test(maybeEmail)) email = maybeEmail;
      else { fullName = `${fullName ?? ""} ${maybeEmail}`.trim() || undefined; }
      phone = parts[2] || undefined;
      headline = parts[3] || undefined;
      location = parts[4] || undefined;
      if (parts[5]) skills = parts[5].split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      summary = parts.slice(6).join(" ") || undefined;
    } else {
      // Single field: try to extract name + email
      const emailMatch = line.match(EMAIL);
      if (emailMatch) email = emailMatch[1];
      const beforeEmail = line.replace(EMAIL, "").replace(/[<>()]/g, " ").replace(/\s+/g, " ").trim();
      fullName = beforeEmail || undefined;
    }

    if (email) {
      const norm = email.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
    }
    if (!fullName && !email) continue;

    out.push({ full_name: fullName, email, phone, headline, location, skills, summary });
  }

  return out;
}

export async function aiConvertTalentPool(
  _previousState: AiConvertTalentPoolState | null,
  formData: FormData,
): Promise<AiConvertTalentPoolState> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "Oturum açmış bir kullanıcı olmalısınız." };
  }
  if (!(await hasAssignedPlatformRole("platform_admin"))) {
    return { status: "error", message: "Yalnızca platform yöneticileri bu işlemi yapabilir." };
  }

  const rawText = formData.get("rawText");
  if (typeof rawText !== "string" || !rawText.trim()) {
    return { status: "error", message: "Lütfen dönüştürülecek ham metni veya CSV verisini giriniz." };
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  let rawOutput: unknown = null;
  let providerUsed = "local";

  if (geminiApiKey) {
    try {
      const attempt = await requestGeminiConvert(rawText, geminiApiKey);
      if (attempt.ok) {
        rawOutput = attempt.output;
        providerUsed = "gemini";
      }
    } catch {
      // fall through to groq / local
    }
  }

  if (!rawOutput && groqApiKey) {
    try {
      const attempt = await requestGroqConvert(rawText, groqApiKey);
      if (attempt.ok) {
        rawOutput = attempt.output;
        providerUsed = "groq";
      }
    } catch {
      // fall through to local
    }
  }

  if (!rawOutput) {
    providerUsed = "local";
    rawOutput = localCsvParse(rawText);
  }

  const normalized = normalizeAiOutput(rawOutput);

  if (normalized.length === 0) {
    return {
      status: "error",
      message: "Hiç geçerli aday kaydı çıkarılamadı. Lütfen metni kontrol edip tekrar deneyin.",
    };
  }

  const json = JSON.stringify(normalized, null, 2);

  return {
    status: "success",
    message: providerUsed === "local"
      ? `Yerel ayrıştırıcıyla ${normalized.length} aday kaydı çıkarıldı.`
      : `${providerUsed.toUpperCase()} ile ${normalized.length} aday kaydı oluşturuldu.`,
    json,
    count: normalized.length,
  };
}

/**
 * Persist converted JSON entries into the talent pool.
 */
export async function aiImportConvertedTalentPool(
  _previousState: { status: string; message: string } | null,
  formData: FormData,
): Promise<{ status: string; message: string; count?: number }> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "Oturum açmış bir kullanıcı olmalısınız." };
  }
  if (!(await hasAssignedPlatformRole("platform_admin"))) {
    return { status: "error", message: "Yalnızca platform yöneticileri bu işlemi yapabilir." };
  }

  const rawJson = formData.get("jsonData");
  if (typeof rawJson !== "string" || !rawJson.trim()) {
    return { status: "error", message: "Lütfen içe aktarılacak JSON verilerini giriniz." };
  }

  let entries: Array<{
    full_name: string;
    email: string;
    phone?: string;
    headline?: string;
    location?: string;
    summary?: string;
    skills?: string[];
  }>;
  try {
    entries = JSON.parse(rawJson);
  } catch {
    return { status: "error", message: "Geçersiz JSON formatı." };
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    return { status: "error", message: "JSON bir dizi olmalı ve en az bir kayıt içermelidir." };
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return { status: "error", message: "Sunucu istemcisi yapılandırılamadı." };
  }

  const normalizedEntries = entries.map((e) => ({
    full_name: e.full_name,
    email: e.email,
    phone: e.phone ?? null,
    headline: e.headline ?? null,
    location: e.location ?? null,
    summary: e.summary ?? null,
    skills: e.skills ?? [],
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    links: [],
    source: "ai_import",
    source_ref: `ai-${Date.now()}`,
    is_searchable: true,
  }));

  const { error } = await supabase.rpc("admin_bulk_import_talent_pool", {
    _entries: normalizedEntries as unknown as Json,
  });

  if (error) {
    return { status: "error", message: error.message || "İçe aktarma sırasında bir hata oluştu." };
  }

  return { status: "success", message: `${normalizedEntries.length} aday havuzuna eklendi.`, count: normalizedEntries.length };
}

/**
 * Delete a single talent pool entry by id.
 */
export async function deleteTalentPoolEntry(
  _previousState: { status: string; message: string } | null,
  formData: FormData,
): Promise<{ status: string; message: string }> {
  const user = await getCurrentUser();
  if (!user || user.status !== "active") {
    return { status: "error", message: "Oturum açmış bir kullanıcı olmalısınız." };
  }
  if (!(await hasAssignedPlatformRole("platform_admin"))) {
    return { status: "error", message: "Yalnızca platform yöneticileri bu işlemi yapabilir." };
  }

  const entryId = formData.get("entryId");
  if (typeof entryId !== "string") {
    return { status: "error", message: "Geçersiz kayıt kimliği." };
  }

  const supabase = createSupabaseServiceClient();
  if (!supabase) {
    return { status: "error", message: "Sunucu istemcisi yapılandırılamadı." };
  }

  const { error } = await supabase.from("talent_pool_entries").delete().eq("id", entryId);

  if (error) {
    console.error("Talent pool entry deletion failed.", { code: error.code });
    return { status: "error", message: "Kayıt silinemedi." };
  }

  return { status: "success", message: "Aday kaydı silindi." };
}
