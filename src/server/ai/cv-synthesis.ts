import "server-only";
"use server";

import { z } from "zod";

const CVSynthesisResultSchema = z.object({
  professionalSummary: z.string().min(50).max(3000),
  keyHighlights: z.array(z.string().max(200)).max(8).optional(),
}).strict();

export type CVSynthesisResult = z.infer<typeof CVSynthesisResultSchema>;

const CV_SYNTHESIS_SYSTEM_PROMPT = `You are an expert CV/resume synthesizer. Your task is to read the COMPLETE raw text of a candidate's CV and produce a polished, professional narrative summary that captures their entire career story.

CRITICAL RULES:
1. Return ONLY valid JSON matching the exact schema. No extra text, no markdown, no explanations.
2. Read the ENTIRE CV text provided. Do not skip any section, project, achievement, or detail.
3. Synthesize a cohesive professional narrative (500-3000 characters) that flows naturally and covers:
   - Professional identity and core expertise
   - Career progression and key roles
   - Technical/functional competencies
   - Notable achievements, projects, and impact
   - Education and certifications
   - Languages and international experience
   - Soft skills and leadership experience
4. Write in polished Turkish (or the locale's language) using professional business language.
5. Preserve specific details: company names, technologies, metrics, project names, durations.
6. Do NOT invent information not in the CV. Only synthesize what exists.
7. If the CV is sparse, write an honest summary of what is present.
8. Optionally extract 3-8 key highlights as bullet-worthy achievements.

The output MUST be a JSON object with "professionalSummary" and optional "keyHighlights" array.`;

export async function synthesizeCVNarrative(
  cvFullText: string,
  locale: string = "tr"
): Promise<CVSynthesisResult> {
  const truncatedText = cvFullText.slice(0, 15000);

  const prompt = `${CV_SYNTHESIS_SYSTEM_PROMPT}

CV FULL TEXT (${locale}):
${truncatedText}

Return JSON:`;

  const response = await callLLMWithStructuredOutput(prompt);
  
  if (!response) {
    return fallbackSynthesis(cvFullText);
  }

  const parsed = CVSynthesisResultSchema.safeParse(response);
  if (!parsed.success) {
    console.error("CV synthesis schema validation failed:", parsed.error);
    return fallbackSynthesis(cvFullText);
  }

  return parsed.data;
}

async function callLLMWithStructuredOutput(prompt: string): Promise<CVSynthesisResult | null> {
  const apiKey = process.env.CV_AI_API_KEY;
  const model = process.env.CV_AI_MODEL ?? "llama-3.3-70b-versatile";
  const baseUrl = process.env.CV_AI_BASE_URL ?? "https://api.groq.com/openai/v1";

  if (!apiKey) {
    console.warn("CV_AI_API_KEY not configured, using fallback");
    return null;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: CV_SYNTHESIS_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 3000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "CVSynthesisResult",
          strict: true,
          schema: {
            type: "object",
            properties: {
              professionalSummary: { type: "string", minLength: 50, maxLength: 3000 },
              keyHighlights: {
                type: "array",
                maxItems: 8,
                items: { type: "string", maxLength: 200 },
              },
            },
            required: ["professionalSummary"],
            additionalProperties: false,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    console.error("LLM call failed:", response.status, await response.text());
    return null;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) return null;

  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fallbackSynthesis(cvFullText: string): CVSynthesisResult {
  const cleaned = cvFullText
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\p{P}\s]/gu, "")
    .trim()
    .slice(0, 3000);

  return {
    professionalSummary: cleaned || "CV içeriği işlenemedi.",
    keyHighlights: [],
  };
}