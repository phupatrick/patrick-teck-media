const TRANSLATABLE_FIELDS = ["title", "summary", "dek", "hook", "sections"];

export function createNewsroomTranslator(options = {}) {
  const endpoint = String(options.endpoint || process.env.NEWSROOM_TRANSLATION_ENDPOINT || "").trim();
  const apiKey = String(options.apiKey || process.env.NEWSROOM_TRANSLATION_API_KEY || "").trim();
  const model = String(options.model || process.env.NEWSROOM_TRANSLATION_MODEL || "").trim();

  return {
    enabled: Boolean(endpoint && apiKey && model),
    async translateArticle(article, targetLanguage) {
      if (!endpoint || !apiKey || !model) {
        throw new Error("Newsroom translation provider is not configured.");
      }

      const sourceLanguage = article?.language === "en" ? "en" : "vi";
      const target = targetLanguage === "en" ? "en" : "vi";
      const response = await fetch(endpoint, {
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
      const translated = JSON.parse(stripJsonFence(text));
      return validateTranslation(translated);
    }
  };
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
