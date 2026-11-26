import assert from "node:assert/strict";
import test from "node:test";
import { canImportResume } from "../../src/features/candidates/resume-import-authorization";
import {
  cvParserSystemPrompt,
  normalizeRawAiCvPayload,
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
    const { draft } = await parseResumeWithFallback(
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
    const { draft } = await parseResumeWithFallback(
      makeFile(),
      "Профессиональная специализация: Инженер-программист",
      {
        geminiApiKey: "test-gemini-key",
        groqApiKey: "test-groq-key",
      },
    );

    assert.equal(requests.length, 4);
    assert.match(requests[0] ?? "", /generativelanguage\.googleapis\.com/);
    assert.match(requests[1] ?? "", /generativelanguage\.googleapis\.com/);
    assert.match(requests[2] ?? "", /generativelanguage\.googleapis\.com/);
    assert.match(requests[3] ?? "", /api\.groq\.com/);
    assert.equal(draft?.headline, "Инженер-программист");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gemini overload retries with the stable Flash fallback", async () => {
  const originalFetch = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const model = url.pathname.match(/models\/([^:]+)/)?.[1] ?? "";
    models.push(model);
    return model === "gemini-3.8-flash"
      ? new Response("{}", { status: 503 })
      : geminiResponse(output);
  };

  try {
    const { draft } = await parseResumeWithFallback(
      makeFile(),
      "Профессиональная специализация: Инженер-программист",
      {
        geminiApiKey: "test-gemini-key",
        geminiModel: "gemini-3.8-flash",
      },
    );

    assert.deepEqual(models, ["gemini-3.8-flash", "gemini-3.6-flash"]);
    assert.equal(draft?.headline, "Инженер-программист");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a missing Gemini model falls back to the configured model", async () => {
  const originalFetch = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const model = url.pathname.match(/models\/([^:]+)/)?.[1] ?? "";
    models.push(model);
    return model === "missing-model"
      ? new Response("{}", { status: 404 })
      : geminiResponse(output);
  };

  try {
    const { draft } = await parseResumeWithFallback(
      makeFile(),
      "Professional title: Product manager",
      {
        geminiApiKey: "test-gemini-key",
        geminiModel: "missing-model",
        geminiFallbackModel: "gemini-3.6-flash",
      },
    );

    assert.deepEqual(models, ["missing-model", "gemini-3.6-flash"]);
    assert.equal(draft?.headline, "Инженер-программист");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scanned PDFs use Groq Vision scout first, then Maverick fallback", async () => {
  const originalFetch = globalThis.fetch;
  const models: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response("{}", { status: 503 });
    }

    const payload = JSON.parse(String(init?.body)) as {
      model: string;
      max_completion_tokens: number;
      messages: { content: unknown[] }[];
      response_format: { type: string };
    };
    models.push(payload.model);
    assert.equal(payload.response_format.type, "json_object");
    const userContent = payload.messages[1]?.content;
    const imageItem = userContent?.[1] as { image_url?: { url: string } } | undefined;
    if (payload.model !== "meta-llama/llama-4-maverick-17b-128e-instruct") {
      return new Response("{}", { status: 404 });
    }

    assert.equal(payload.max_completion_tokens, 4_000);
    assert.equal(imageItem?.image_url?.url, "data:image/jpeg;base64,dGVzdA==");
    return groqResponse(output);
  };

  try {
    const { draft } = await parseResumeWithFallback(
      makeFile("resume.pdf"),
      "",
      {
        geminiApiKey: "test-gemini-key",
        geminiModel: "gemini-3.8-flash",
        geminiFallbackModel: "gemini-3.8-flash",
        groqApiKey: "test-groq-key",
        groqVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
      },
      ["data:image/jpeg;base64,dGVzdA=="],
    );

    assert.deepEqual(models, [
      "meta-llama/llama-4-scout-17b-16e-instruct",
      "meta-llama/llama-4-maverick-17b-128e-instruct",
    ]);
    assert.equal(draft?.headline, "Инженер-программист");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("pageImages bypasses Gemini entirely; Groq Vision single-step JSON fills all 9 fields", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const url = String(_input);
    requests.push(url);
    if (url.includes("generativelanguage.googleapis.com")) {
      // Gemini must never be consulted when page images + Groq key exist
      throw new Error("Gemini must not be called for page-images parsing");
    }
    const payload = JSON.parse(String(init?.body)) as {
      model: string;
      response_format: { type: string };
      messages: { content: unknown[] }[];
    };
    if (payload.model !== "meta-llama/llama-4-scout-17b-16e-instruct") {
      return new Response("{}", { status: 404 });
    }
    assert.equal(payload.response_format.type, "json_object");
    const userContent = payload.messages[1]?.content;
    const imageItem = userContent?.[1] as { image_url?: { url: string } } | undefined;
    assert.equal(imageItem?.image_url?.url, "data:image/jpeg;base64,dGVzdA==");
    return groqResponse({
      headline: "Yazılım Geliştirici",
      location: "Lefkoşa",
      skills: ["TypeScript", "React", "AWS"],
      experience: [
        {
          role: "Geliştirici",
          organization: "Acme",
          location: "Lefkoşa",
          startDate: "2020",
          endDate: "2023",
          description: "Web geliştirme",
        },
      ],
      education: [
        {
          institution: "Üniversite",
          qualification: "Lisans",
          field: "Bilgisayar Mühendisliği",
          startDate: "2016",
          endDate: "2020",
          description: "",
        },
      ],
      languages: [{ name: "Türkçe", proficiency: "Native" }],
      certifications: [{ name: "AWS Certified", issuer: "Amazon", issueDate: "2021", expiryDate: "" }],
      summary: "Yazılım geliştirici özet.",
      links: [{ label: "GitHub", url: "https://github.com/me" }],
    });
  };

  try {
    const { draft, diagnostics } = await parseResumeWithFallback(
      makeFile("resume.pdf"),
      "Professional Title: Yazılım Geliştirici",
      {
        geminiApiKey: "test-gemini-key",
        geminiModel: "gemini-3.8-flash",
        groqApiKey: "test-groq-key",
        groqVisionModel: "meta-llama/llama-4-scout-17b-16e-instruct",
      },
      ["data:image/jpeg;base64,dGVzdA=="],
    );

    assert.equal(requests.length, 1);
    assert.match(requests[0] ?? "", /api\.groq\.com/);
    assert.ok(!requests.some((url) => url.includes("generativelanguage.googleapis.com")));
    assert.equal(diagnostics.providerUsed, "groq-vision");
    assert.equal(draft?.headline, "Yazılım Geliştirici");
    assert.equal(draft?.location, "Lefkoşa");
    assert.deepEqual(draft?.skills, ["TypeScript", "React", "AWS"]);
    assert.equal(draft?.experience?.length, 1);
    assert.equal(draft?.experience?.[0]?.role, "Geliştirici");
    assert.equal(draft?.experience?.[0]?.organization, "Acme");
    assert.equal(draft?.experience?.[0]?.startDate, "2020");
    assert.equal(draft?.experience?.[0]?.endDate, "2023");
    assert.equal(draft?.education?.length, 1);
    assert.equal(draft?.education?.[0]?.institution, "Üniversite");
    assert.equal(draft?.education?.[0]?.qualification, "Lisans");
    assert.equal(draft?.education?.[0]?.field, "Bilgisayar Mühendisliği");
    assert.equal(draft?.languages?.length, 1);
    assert.equal(draft?.languages?.[0]?.name, "Türkçe");
    assert.equal(draft?.languages?.[0]?.proficiency, "Native");
    assert.equal(draft?.certifications?.length, 1);
    assert.equal(draft?.certifications?.[0]?.name, "AWS Certified");
    assert.equal(draft?.certifications?.[0]?.issuer, "Amazon");
    assert.equal(draft?.summary, "Yazılım geliştirici özet.");
    assert.deepEqual(draft?.links, [{ label: "GitHub", url: "https://github.com/me" }]);
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
    const { draft } = await parseResumeWithFallback(
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
    const { draft } = await parseResumeWithFallback(
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
    const { draft } = await parseResumeWithFallback(makeFile(), text, {});
    assert.equal(draft?.headline, expectedHeadline);
  }
});

test("the active candidate is authorized and anonymous or inactive accounts are rejected", () => {
  assert.equal(canImportResume(null), false);
  assert.equal(canImportResume({ status: "suspended" }), false);
  assert.equal(canImportResume({ status: "active" }), true);
});

test("partial text draft + pageImages triggers Groq Vision merge filling all arrays", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      headline: "Yazılım Geliştirici",
                      location: "Lefkoşa",
                      skills: ["TypeScript"],
                      experience: [],
                      education: [],
                      languages: [],
                      certifications: [],
                      summary: null,
                      links: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return groqResponse({
      headline: "Yazılım Geliştirici",
      location: "Lefkoşa",
      skills: ["TypeScript", "React"],
      experience: [
        {
          role: "Geliştirici",
          organization: "Acme",
          location: "Lefkoşa",
          startDate: "2020",
          endDate: "2023",
          description: "Web",
        },
      ],
      education: [
        {
          institution: "Üniversite",
          qualification: "Lisans",
          field: "Bilgisayar",
          startDate: "2016",
          endDate: "2020",
          description: "",
        },
      ],
      languages: [{ name: "Türkçe", proficiency: "Native" }],
      certifications: [{ name: "AWS", issuer: "Amazon", issueDate: "2021", expiryDate: "" }],
      summary: null,
      links: [],
    });
  };

  try {
    const { draft } = await parseResumeWithFallback(
      makeFile("resume.pdf"),
      "Professional Title: Yazılım Geliştirici",
      {
        geminiApiKey: "test-gemini-key",
        geminiModel: "gemini-3.8-flash",
        groqApiKey: "test-groq-key",
        groqVisionModel: "qwen/qwen3.8-27b",
      },
      ["data:image/jpeg;base64,dGVzdA=="],
    );

    assert.equal(draft?.headline, "Yazılım Geliştirici");
    assert.equal(draft?.experience?.length, 1);
    assert.equal(draft?.experience?.[0]?.role, "Geliştirici");
    assert.equal(draft?.education?.length, 1);
    assert.equal(draft?.languages?.length, 1);
    assert.equal(draft?.certifications?.length, 1);
    assert.equal(draft?.certifications?.[0]?.name, "AWS");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizeRawAiCvPayload converts alternate AI keys to canonical schema", () => {
  const normalized = normalizeRawAiCvPayload({
    headline: "Yazılım Geliştirici",
    location: "Lefkoşa",
    skills: ["TypeScript"],
    experience: [
      {
        position: "Geliştirici",
        employer: "Acme",
        period: "2020 - 2023",
        summary: "Web geliştirme\nEkip yönetimi",
      },
    ],
    education: [
      {
        degree: "Lisans",
        university: "Üniversite",
        graduationYear: "2020",
      },
    ],
    languages: ["Türkçe (Ana Dil)", "İngilizce (İleri)", "Fransızca / B2"],
    certifications: ["AWS Sertifikası"],
    summary: null,
    links: [],
  }) as {
    experience: Array<{ role?: string; organization?: string; startDate?: string; endDate?: string }>;
    education: Array<{ institution?: string; qualification?: string; startDate?: string; endDate?: string }>;
    languages: Array<{ name?: string; proficiency?: string }>;
    certifications: Array<{ name?: string; issuer?: string; issueDate?: string; expiryDate?: string }>;
  };

  assert.deepEqual(normalized.experience, [
    {
      role: "Geliştirici",
      organization: "Acme",
      location: "",
      startDate: "2020",
      endDate: "2023",
      description: "Web geliştirme\nEkip yönetimi",
    },
  ]);
  assert.deepEqual(normalized.education, [
    {
      institution: "Üniversite",
      qualification: "Lisans",
      field: "",
      startDate: "2020",
      endDate: "",
      description: "",
    },
  ]);
  assert.equal(normalized.languages.length, 3);
  assert.equal(normalized.languages[0]?.name, "Türkçe");
  assert.equal(normalized.languages[0]?.proficiency, "Native");
  assert.equal(normalized.languages[1]?.name, "İngilizce");
  assert.equal(normalized.languages[1]?.proficiency, "C1");
  assert.equal(normalized.languages[2]?.name, "Fransızca");
  assert.equal(normalized.languages[2]?.proficiency, "B2");
  assert.deepEqual(normalized.certifications, [
    { name: "AWS Sertifikası", issuer: "", issueDate: "", expiryDate: "" },
  ]);
});
