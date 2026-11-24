import assert from "node:assert/strict";
import test from "node:test";
import { canImportResume } from "../../src/features/candidates/resume-import-authorization";
import {
  cvParserSystemPrompt,
  parseResumeWithFallback,
} from "../../src/server/ai/cv-parser-core";

const output = {
  headline: "Инженер-программист",
  location: "Mağusa",
  skills: ["TypeScript"],
  experience: [],
  education: [],
  languages: [],
  certifications: [],
  summary: null,
  links: [],
};

function makeFile(name = "resume.txt"): File {
  return new File(["Synthetic CV text"], name, { type: "text/plain" });
}

function geminiResponse(value: unknown): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
    }),
    { status: 200 },
  );
}

function groqResponse(value: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
    { status: 200 },
  );
}

test("CV parsing instructions cover Turkish, English, Russian, and column layouts", () => {
  assert.match(cvParserSystemPrompt, /Turkish, English, Russian/);
  assert.match(cvParserSystemPrompt, /two-column or table layouts/);
  assert.match(cvParserSystemPrompt, /Never infer or invent information/);
});

test("Groq runs when Gemini is not configured and returns the canonical district", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return groqResponse(output);
  };

  try {
    const draft = await parseResumeWithFallback(
      makeFile(),
      "Профессиональная специализация: Инженер-программист",
      { groqApiKey: "test-groq-key" },
    );

    assert.equal(requests.length, 1);
    assert.match(requests[0]?.url ?? "", /api\.groq\.com/);
    const payload = JSON.parse(String(requests[0]?.init?.body)) as {
      response_format: { json_schema: { strict: boolean } };
    };
    assert.equal(payload.response_format.json_schema.strict, true);
    assert.equal(draft?.headline, "Инженер-программист");
    assert.equal(draft?.location, "Mağusa");
    assert.equal(draft?.summary, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini 429 falls back to Groq after retry with fallback model", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    return url.includes("generativelanguage.googleapis.com")
      ? new Response("{}", { status: 429 })
      : groqResponse(output);
  };

  try {
    const draft = await parseResumeWithFallback(
      makeFile(),
      "Профессиональная специализация: Инженер-программист",
      {
        geminiApiKey: "test-gemini-key",
        groqApiKey: "test-groq-key",
      },
    );

    assert.equal(requests.length, 3);
    assert.match(requests[0] ?? "", /generativelanguage\.googleapis\.com/);
    assert.match(requests[1] ?? "", /generativelanguage\.googleapis\.com/);
    assert.match(requests[2] ?? "", /api\.groq\.com/);
    assert.equal(draft?.headline, "Инженер-программист");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini preserves Russian CV content and sends the multilingual instructions", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return geminiResponse(output);
  };

  try {
    const draft = await parseResumeWithFallback(
      makeFile(),
      "РЕЗЮМЕ\nПрофессиональная специализация: Инженер-программист",
      { geminiApiKey: "test-gemini-key" },
    );
    const payload = JSON.parse(requestBody) as {
      systemInstruction: { parts: { text: string }[] };
      generationConfig: {
        responseMimeType: string;
      };
    };

    assert.equal(draft?.headline, "Инженер-программист");
    assert.match(payload.systemInstruction.parts[0]?.text ?? "", /Turkish, English, Russian/);
    // Schema is now embedded in the system prompt, not in generationConfig.responseSchema
    assert.match(payload.systemInstruction.parts[0]?.text ?? "", /Return ONLY a JSON object matching this exact schema/);
    assert.match(payload.systemInstruction.parts[0]?.text ?? "", /"headline": string \| null/);
    assert.match(payload.systemInstruction.parts[0]?.text ?? "", /"location": "Lefkoşa"/);
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("both providers failing falls back to the local multilingual parser", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    new Response("{}", {
      status: String(input).includes("generativelanguage.googleapis.com")
        ? 503
        : 429,
    });

  try {
    const draft = await parseResumeWithFallback(
      makeFile(),
      "PROFESSIONAL TITLE: Senior analyst\nSKILLS: SQL, Python",
      {
        geminiApiKey: "test-gemini-key",
        groqApiKey: "test-groq-key",
      },
    );

    assert.equal(draft?.headline, "Senior analyst");
    assert.deepEqual(draft?.skills, ["SQL", "Python"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the local parser handles Turkish, English, and Russian CV headings", async () => {
  const examples = [
    ["UZMANLIK ALANI: Yazılım geliştirici", "Yazılım geliştirici"],
    ["PROFESSIONAL TITLE: Product manager", "Product manager"],
    ["Профессиональная специализация: Инженер", "Инженер"],
  ] as const;

  for (const [text, expectedHeadline] of examples) {
    const draft = await parseResumeWithFallback(makeFile(), text, {});
    assert.equal(draft?.headline, expectedHeadline);
  }
});

test("the active candidate is authorized and anonymous or inactive accounts are rejected", () => {
  assert.equal(canImportResume(null), false);
  assert.equal(canImportResume({ status: "suspended" }), false);
  assert.equal(canImportResume({ status: "active" }), true);
});
