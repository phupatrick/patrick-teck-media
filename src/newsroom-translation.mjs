const TRANSLATABLE_FIELDS = ["title", "summary", "dek", "hook", "sections"];

export function createNewsroomTranslator(options = {}) {
  const endpoint = String(options.endpoint !== undefined ? options.endpoint : process.env.NEWSROOM_TRANSLATION_ENDPOINT || "").trim();
  const apiKey = String(options.apiKey !== undefined ? options.apiKey : process.env.NEWSROOM_TRANSLATION_API_KEY || process.env.NEWSROOM_GEMINI_API_KEY || process.env.SOCIAL_AI_API_KEY || process.env.GEMINI_API_KEY || "").trim();
  const model = String(options.model !== undefined ? options.model : process.env.NEWSROOM_TRANSLATION_MODEL || process.env.NEWSROOM_GEMINI_MODEL || "gemini-1.5-flash").trim();
  const fetchImpl = options.fetch || fetch;
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));

  return {
    enabled: Boolean(apiKey && model),
    async translateArticle(article, targetLanguage) {
      if (!apiKey || !model) {
        throw new Error("Newsroom translation provider is not configured.");
      }

      const sourceLanguage = article?.language === "en" ? "en" : "vi";
      const target = targetLanguage === "en" ? "en" : "vi";
      let translated;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          translated = endpoint
            ? await requestTranslation({ endpoint, apiKey, model, article, sourceLanguage, target, fetchImpl })
            : await requestGeminiTranslation({ apiKey, model, article, sourceLanguage, target, fetchImpl });
          break;
        } catch (error) {
          lastError = error;
          if (attempt < 2) await sleep([2000, 5000, 10000][attempt]);
        }
      }

      if (!translated) throw lastError || new Error("Newsroom translation failed.");
      return validateTranslation(translated);
    }
  };
}

async function requestGeminiTranslation({ apiKey, model, article, sourceLanguage, target, fetchImpl }) {
  const models = [...new Set([model, "gemini-2.0-flash", "gemini-1.5-pro", "gemini-3.6-flash"].filter(Boolean))];
  const input = JSON.stringify({ source_language: sourceLanguage, target_language: target, article: selectFields(article) });
  const errors = [];
  for (const candidate of models) {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: `Translate this technology newsroom article. Return only valid JSON with title, summary, dek, hook, and sections. Keep facts, numbers, names, citations, and product terms unchanged. Do not add claims. sections must be an array of objects with heading and body.\n\n${input}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } })
    });
    const payload = await response.json();
    if (response.ok) return parseTranslationJson(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
    errors.push(`${candidate}: HTTP ${response.status}: ${payload?.error?.message || "Google returned an unknown error."}`);
  }
  throw new Error(`Newsroom Gemini translation failed: ${errors.join(" | ")}`);
}

async function requestTranslation({ endpoint, apiKey, model, article, sourceLanguage, target, fetchImpl }) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          input: [
            {
              role: "system",
              content: [{
                type: "input_text",
                text: "Translate this technology newsroom article. Return only valid JSON with title, summary, dek, hook, and sections. Keep facts, numbers, names, citations, and product terms unchanged. Do not add claims. sections must be an array of objects with heading and body."
              }]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: JSON.stringify({ source_language: sourceLanguage, target_language: target, article: selectFields(article) }) }]
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Newsroom translation failed with HTTP ${response.status}.`);
      }

      const payload = await response.json();
      const text = extractOutputText(payload);
      return parseTranslationJson(text);
}

function selectFields(article) {
  return TRANSLATABLE_FIELDS.reduce((result, field) => {
    result[field] = article?.[field] ?? "";
    return result;
  }, {});
}

function validateTranslation(value) {
  if (!value || typeof value !== "object" || !String(value.title || "").trim()) {
    throw new Error("Newsroom translation returned incomplete article fields.");
  }

  const sections = Array.isArray(value.sections) ? value.sections : [];
  if (sections.length < 4 || sections.some((section) => !String(section?.heading || "").trim() || !String(section?.body || "").trim())) {
    throw new Error("Newsroom translation returned incomplete sections.");
  }

  return {
    title: String(value.title).trim(),
    summary: String(value.summary || "").trim(),
    dek: String(value.dek || "").trim(),
    hook: String(value.hook || "").trim(),
    sections: sections.map((section) => ({ heading: String(section.heading).trim(), body: String(section.body).trim() }))
  };
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) chunks.push(content.text);
    }
  }
  if (!chunks.length) throw new Error("Newsroom translation returned no text.");
  return chunks.join("\n");
}

function stripJsonFence(value) {
  return String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export function parseTranslationJson(value) {
  const cleaned = stripJsonFence(value);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Newsroom translation returned invalid JSON.");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

// Public alias used by operational tooling and integration tests.
export const sanitizeAndParseJSON = parseTranslationJson;
