import "server-only";
"use server";

import { LanguageExtractionResultSchema, type ExtractedLanguage, type LanguageExtractionResult } from "@/features/candidates/language-extraction";
import { mapLanguageNameToCode } from "@/features/candidates/language-mapping";
import { mapProficiencyToCEFR } from "@/features/candidates/cefr-alignment";

const LANGUAGE_EXTRACTION_SYSTEM_PROMPT = `You are a multilingual CV/resume language extraction engine. Your task is to extract ALL languages and their proficiency levels from the provided CV text.

CRITICAL RULES:
1. Return ONLY valid JSON matching the exact schema provided. No extra text, no markdown, no explanations.
2. Extract EVERY language mentioned in the CV, regardless of the CV's language.
3. For each language, provide:
   - language_code: ISO 639-1 code (tr, en, ru, de, el, fa, ar, fr, es, it, nl, pl, uk, ro, bg, cs, hu, sr, hr, sk, sl, et, lv, lt, mt, ga, cy, is, mk, sq, bs, me, other)
   - language_name_localized: The EXACT language name as it appears in the CV (e.g., "Английский", "Inglés", "Englisch", "İngilizce")
   - language_name_standard: The standard Turkish name (e.g., "İngilizce", "Türkçe", "Almanca")
   - proficiency_code: CEFR level (Native, C2, C1, B2, B1, A2, A1) - map any proficiency description to the closest CEFR level
4. If proficiency is unclear or missing, default to "B1".
5. Each language must be a separate object in the array.
6. Maximum 20 languages.

Examples of proficiency mapping:
- "Native", "Mother tongue", "Ana dil", "Родной", "Muttersprache" → "Native"
- "Fluent", "C2", "Expert", "Ilr 5", "Продвинутый", "Fließend" → "C2"
- "Advanced", "C1", "İleri", "Avancé", "Fortgeschritten" → "C1"
- "Upper Intermediate", "B2", "Orta üstü", "Intermedio alto" → "B2"
- "Intermediate", "B1", "Orta", "Intermedio", "Mittelstufe" → "B1"
- "Elementary", "A2", "Temel", "Basico", "Grundkenntnisse" → "A2"
- "Beginner", "A1", "Başlangıç", "Principiante", "Anfänger" → "A1"

The output MUST be a JSON object with a "languages" array.`;

export async function extractLanguagesFromCV(
  cvText: string,
  locale: string = "tr"
): Promise<LanguageExtractionResult> {
  const truncatedText = cvText.slice(0, 8000);

  const prompt = `${LANGUAGE_EXTRACTION_SYSTEM_PROMPT}

CV TEXT (${locale}):
${truncatedText}

Return JSON:`;

  const response = await callLLMWithStructuredOutput(prompt);
  
  if (!response) {
    return fallbackLanguageExtraction(cvText);
  }

  const parsed = LanguageExtractionResultSchema.safeParse(response);
  if (!parsed.success) {
    console.error("Language extraction schema validation failed:", parsed.error);
    return fallbackLanguageExtraction(cvText);
  }

  return enhanceWithMapping(parsed.data);
}

async function callLLMWithStructuredOutput(prompt: string): Promise<LanguageExtractionResult | null> {
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
        { role: "system", content: LANGUAGE_EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 2000,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "LanguageExtractionResult",
          strict: true,
          schema: {
            type: "object",
            properties: {
              languages: {
                type: "array",
                maxItems: 20,
                items: {
                  type: "object",
                  properties: {
                    language_code: {
                      type: "string",
                      enum: ["tr", "en", "ru", "de", "el", "fa", "ar", "fr", "es", "it", "nl", "pl", "uk", "ro", "bg", "cs", "hu", "sr", "hr", "sk", "sl", "et", "lv", "lt", "mt", "ga", "cy", "is", "mk", "sq", "bs", "me", "other"],
                    },
                    language_name_localized: { type: "string", minLength: 1, maxLength: 80 },
                    language_name_standard: { type: "string", minLength: 1, maxLength: 80 },
                    proficiency_code: {
                      type: "string",
                      enum: ["Native", "C2", "C1", "B2", "B1", "A2", "A1"],
                    },
                  },
                  required: ["language_code", "language_name_localized", "language_name_standard", "proficiency_code"],
                  additionalProperties: false,
                },
              },
              source_text: { type: "string", maxLength: 5000 },
            },
            required: ["languages"],
            additionalProperties: false,
          },
        },
      },
    }),
    signal: AbortSignal.timeout(15000),
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

function fallbackLanguageExtraction(cvText: string): LanguageExtractionResult {
  const languageSectionRegex = /(?:languages?|diller|yabanc[iı] diller|dil bilgisi|языки|владение языками|γλώσσες|زبان[-\s]?ها|sprachen|sprachkenntnisse)[:\s]*([\s\S]{0,1000})/i;
  const match = cvText.match(languageSectionRegex);
  const sectionText = match?.[1] ?? cvText.slice(-2000);

  const lines = sectionText
    .split(/[\n,;،؛|•●▪◦]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1 && l.length < 100);

  const languages: ExtractedLanguage[] = [];
  const seenCodes = new Set<string>();

  for (const line of lines) {
    const mapped = mapLanguageNameToCode(line);
    if (mapped && !seenCodes.has(mapped.code)) {
      const proficiencyMatch = line.match(
        /\b(native|ana dil|mother tongue|fluent|advanced|ileri|upper intermediate|orta.?[üu]st.?|intermediate|orta|elementary|temel|beginner|başlangıç|c2|c1|b2|b1|a2|a1|expert|proficient|good|fair|basic|ilr \d|dlpt \d)\b/i
      );
      const proficiency = proficiencyMatch 
        ? mapProficiencyToCEFR(proficiencyMatch[1]) 
        : "B1";

      languages.push({
        language_code: mapped.code,
        language_name_localized: line.slice(0, 80),
        language_name_standard: mapped.standardNameTr,
        proficiency_code: proficiency,
      });
      seenCodes.add(mapped.code);
    }
  }

  if (languages.length === 0) {
    const commonLanguages = ["tr", "en", "de", "ru", "ar", "fa", "fr", "es"];
    for (const code of commonLanguages) {
      const mapped = mapLanguageNameToCode(code);
      if (mapped) {
        languages.push({
          language_code: mapped.code,
          language_name_localized: mapped.standardNameTr,
          language_name_standard: mapped.standardNameTr,
          proficiency_code: "B1",
        });
      }
    }
  }

  return { languages: languages.slice(0, 20) };
}

function enhanceWithMapping(result: LanguageExtractionResult): LanguageExtractionResult {
  return {
    ...result,
    languages: result.languages.map((lang) => {
      const mapped = mapLanguageNameToCode(lang.language_name_localized);
      if (mapped) {
        return {
          ...lang,
          language_code: mapped.code,
          language_name_standard: mapped.standardNameTr,
        };
      }
      return lang;
    }),
  };
}

