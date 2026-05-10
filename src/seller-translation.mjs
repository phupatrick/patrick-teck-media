const TRANSLATABLE_KEYS = ["name", "description", "duration_label", "warranty_label"];

export function createSellerTranslator(options = {}) {
  const mode = String(options.mode || process.env.SELLER_TRANSLATION_MODE || "fallback").trim().toLowerCase();
  const endpoint = String(options.endpoint || process.env.SELLER_TRANSLATION_ENDPOINT || "").trim();
  const apiKey = String(options.apiKey || process.env.SELLER_TRANSLATION_API_KEY || "").trim();
  const model = String(options.model || process.env.SELLER_TRANSLATION_MODEL || "").trim();
  const customTranslate = typeof options.translate === "function" ? options.translate : null;

  return {
    mode,
    async translateProductTexts(input = {}) {
      const sourceLanguage = normalizeLanguage(input.sourceLanguage || "vi");
      const sourceFields = normalizeFields(input.fields || {});
      const targets = Array.isArray(input.targets) ? input.targets.map(normalizeLanguage).filter(Boolean) : ["my"];
      const translations = {};

      for (const targetLanguage of targets) {
        if (targetLanguage === sourceLanguage) {
          translations[targetLanguage] = { ...sourceFields };
          continue;
        }

        if (customTranslate) {
          translations[targetLanguage] = normalizeFields(
            await customTranslate({
              sourceLanguage,
              targetLanguage,
              fields: sourceFields
            })
          );
          continue;
        }

        if (mode === "openai-compatible" && endpoint && apiKey && model) {
          try {
            translations[targetLanguage] = await translateViaOpenAICompatible({
              endpoint,
              apiKey,
              model,
              sourceLanguage,
              targetLanguage,
              fields: sourceFields
            });
            continue;
          } catch {
            // Fall through to fallback copy mode so catalog creation never breaks.
          }
        }

        translations[targetLanguage] = buildFallbackTranslation(sourceFields, targetLanguage);
      }

      return translations;
    }
  };
}

function normalizeFields(fields) {
  return {
    name: safeTrim(fields.name),
    description: safeTrim(fields.description),
    duration_label: safeTrim(fields.duration_label || fields.durationLabel),
    warranty_label: safeTrim(fields.warranty_label || fields.warrantyLabel)
  };
}

function normalizeLanguage(value) {
  const normalized = safeTrim(value).toLowerCase();
  if (["vi", "en", "my"].includes(normalized)) {
    return normalized;
  }

  return "vi";
}

async function translateViaOpenAICompatible({ endpoint, apiKey, model, sourceLanguage, targetLanguage, fields }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Translate seller catalog fields. Return only JSON with keys name, description, duration_label, warranty_label. Keep pricing codes, product names, and plan names consistent."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                source_language: sourceLanguage,
                target_language: targetLanguage,
                fields
              })
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Translation API failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const outputText = extractOutputText(payload);
  return normalizeFields(JSON.parse(outputText));
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        chunks.push(content.text);
      }
    }
  }

  if (!chunks.length) {
    throw new Error("Translation API returned no text.");
  }

  return chunks.join("\n");
}

function buildFallbackTranslation(fields, targetLanguage) {
  if (targetLanguage !== "my") {
    return { ...fields };
  }

  return {
    name: `[MY] ${fields.name}`.trim(),
    description: fields.description ? `[MY] ${fields.description}` : "",
    duration_label: fields.duration_label ? `[MY] ${fields.duration_label}` : "",
    warranty_label: fields.warranty_label ? `[MY] ${fields.warranty_label}` : ""
  };
}

function safeTrim(value) {
  return String(value || "").trim();
}

export { TRANSLATABLE_KEYS };
