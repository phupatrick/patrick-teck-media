const DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-3.6-flash"];
const DEFAULT_TIMEOUT_MS = 35_000;

export function resolveGeminiApiKey({ apiKey = "", env = process.env } = {}) {
  return String(apiKey || env.NEWSROOM_GEMINI_API_KEY || env.SOCIAL_AI_API_KEY || env.GEMINI_API_KEY || "").trim();
}

export function getGeminiModels({ model = "", env = process.env, fallbackModels = DEFAULT_MODELS } = {}) {
  return [...new Set([
    model,
    env.SOCIAL_AI_MODEL,
    env.NEWSROOM_GEMINI_MODEL,
    ...fallbackModels
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

export async function callGeminiJson({ apiKey, model = "", payload, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env, fallbackModels = DEFAULT_MODELS, label = "Gemini" } = {}) {
  const key = resolveGeminiApiKey({ apiKey, env });
  if (!key) throw new Error(`${label} API key is missing. Set NEWSROOM_GEMINI_API_KEY, SOCIAL_AI_API_KEY, or GEMINI_API_KEY.`);
  const models = getGeminiModels({ model, env, fallbackModels });
  if (!models.length) throw new Error(`${label} has no candidate models configured.`);
  const errors = [];

  for (const candidate of models) {
    try {
      const response = await fetchWithTimeout(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(candidate)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, timeoutMs);
      const body = await readJson(response);
      if (response.ok) {
        console.log(`[Gemini] ${label} succeeded with model: ${candidate}`);
        return body;
      }
      const detail = body?.error?.message || body?.raw || "Google returned an unknown error.";
      const error = `${candidate}: HTTP ${response.status}: ${detail}`;
      errors.push(error);
      console.warn(`[Gemini] ${label} failed: ${error}`);
    } catch (error) {
      const detail = error?.message || String(error);
      errors.push(`${candidate}: ${detail}`);
      console.warn(`[Gemini] ${label} failed: ${candidate}: ${detail}`);
    }
  }

  throw new Error(`${label} API failed: ${errors.join(" | ")}`);
}

async function readJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const duration = Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), duration);
  let timeoutTimer;
  try {
    const response = await Promise.race([
      fetchImpl(url, { ...options, signal: controller.signal }),
      new Promise((_, reject) => { timeoutTimer = setTimeout(() => reject(new Error(`Request timeout after ${duration}ms: ${url}`)), duration); })
    ]);
    return response;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Request timeout after ${duration}ms: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(timeoutTimer);
  }
}
