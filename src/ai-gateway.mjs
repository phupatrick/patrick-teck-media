const DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-3.6-flash"];
const DEFAULT_TIMEOUT_MS = 35_000;
const DEEPSEEK_MODEL = "deepseek-chat";
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const GEMINI_COOLDOWN_MS = 15 * 60 * 1000;
const geminiCooldowns = new Map();

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
  let failoverReason = "";
  const useCircuitBreaker = env === process.env;
  const now = Date.now();
  const cooldownKey = key;
  const geminiAvailable = !useCircuitBreaker || now >= (geminiCooldowns.get(cooldownKey) || 0);

  for (const candidate of geminiAvailable ? models : []) {
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
      if (!failoverReason) failoverReason = isQuotaError(response.status, body) ? "quota" : "provider";
      if (useCircuitBreaker && isQuotaError(response.status, body)) {
        geminiCooldowns.set(cooldownKey, Date.now() + GEMINI_COOLDOWN_MS);
      }
      console.warn(`[Gemini] ${label} failed: ${error}`);
      // A quota response applies to the API key, not merely this candidate.
      // Do not spend another request before moving to the next provider.
      if (isQuotaError(response.status, body)) break;
    } catch (error) {
      const detail = error?.message || String(error);
      errors.push(`${candidate}: ${detail}`);
      failoverReason ||= "network";
      console.warn(`[Gemini] ${label} failed: ${candidate}: ${detail}`);
    }
  }

  const groqKey = String(env.GROQ_API_KEY || "").trim();
  if (groqKey && (failoverReason === "quota" || !geminiAvailable)) {
    console.warn("[AIGateway] Gemini bị quá tải quota (HTTP 429), đang tự động chuyển sang Groq API...");
    try {
      const result = await callGroqAPI({ apiKey: groqKey, payload, fetchImpl, timeoutMs, label });
      console.log("[AIGateway] Đã tạo nội dung thành công qua Groq API dự phòng.");
      return result;
    } catch (error) {
      errors.push(`Groq: ${error?.message || String(error)}`);
      console.warn(`[Groq] ${label} failed: ${error?.message || error}`);
    }
  }

  const deepSeekKey = String(env.DEEPSEEK_API_KEY || "").trim();
  if (deepSeekKey && failoverReason) {
    console.warn("[AIGateway] AI provider trước đó không khả dụng, đang tự động chuyển sang DeepSeek API...");
    try {
      const result = await callDeepSeekAPI({
        apiKey: deepSeekKey,
        payload,
        fetchImpl,
        timeoutMs,
        label
      });
      console.log("[AIGateway] Đã tạo nội dung thành công qua DeepSeek API dự phòng.");
      return result;
    } catch (error) {
      errors.push(`DeepSeek: ${error?.message || String(error)}`);
      console.warn(`[DeepSeek] ${label} failed: ${error?.message || error}`);
    }
  }

  throw new Error(`${label} API failed: ${errors.join(" | ")}`);
}

export async function callGroqAPI({ apiKey = "", payload = {}, systemPrompt = "", userPrompt = "", jsonOutput = true, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, label = "Groq" } = {}) {
  const key = String(apiKey || process.env.GROQ_API_KEY || "").trim();
  if (!key) throw new Error(`${label} API key is missing. Set GROQ_API_KEY.`);

  const contents = Array.isArray(payload.contents) ? payload.contents : [];
  const inferredUserPrompt = contents
    .flatMap((content) => Array.isArray(content?.parts) ? content.parts : [])
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n\n");
  const messages = [
    { role: "system", content: String(systemPrompt || payload.systemInstruction?.parts?.map((part) => part.text).join("\n") || "") },
    { role: "user", content: String(userPrompt || inferredUserPrompt) }
  ];
  const errors = [];
  for (const model of GROQ_MODELS) {
    const body = {
      model,
      messages,
    ...(jsonOutput ? { response_format: { type: "json_object" } } : {}),
    temperature: 0.7,
    max_tokens: 2000
    };
    const response = await fetchWithTimeout(fetchImpl, "https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body)
    }, timeoutMs);
    const result = await readJson(response);
    if (!response.ok) {
      const error = `HTTP ${response.status}: ${result?.error?.message || result?.raw || "Groq returned an unknown error."}`;
      errors.push(`${model}: ${error}`);
      if ([400, 404].includes(Number(response.status)) && model !== GROQ_MODELS.at(-1)) continue;
      throw new Error(errors.join(" | "));
    }
    const content = result?.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((part) => typeof part === "string" ? part : part?.text || "").join("") : content;
    if (!text) throw new Error("Groq returned no content.");
    if (jsonOutput) {
      try { JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
      catch { throw new Error("Groq returned invalid JSON."); }
    }
    return { candidates: [{ content: { parts: [{ text }] } }], provider: "groq", model };
  }
  throw new Error(errors.join(" | "));
}

export async function callDeepSeekAPI({ apiKey = "", payload = {}, systemPrompt = "", userPrompt = "", jsonOutput = true, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, label = "DeepSeek" } = {}) {
  const key = String(apiKey || process.env.DEEPSEEK_API_KEY || "").trim();
  if (!key) throw new Error(`${label} API key is missing. Set DEEPSEEK_API_KEY.`);

  const contents = Array.isArray(payload.contents) ? payload.contents : [];
  const inferredUserPrompt = contents
    .flatMap((content) => Array.isArray(content?.parts) ? content.parts : [])
    .map((part) => String(part?.text || "").trim())
    .filter(Boolean)
    .join("\n\n");
  const body = {
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: String(systemPrompt || payload.systemInstruction?.parts?.map((part) => part.text).join("\n") || "") },
      { role: "user", content: String(userPrompt || inferredUserPrompt) }
    ],
    ...(jsonOutput ? { response_format: { type: "json_object" } } : {}),
    temperature: 0.7,
    max_tokens: 2000
  };
  const response = await fetchWithTimeout(fetchImpl, "https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify(body)
  }, timeoutMs);
  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${result?.error?.message || result?.raw || "DeepSeek returned an unknown error."}`);
  }
  const content = result?.choices?.[0]?.message?.content;
  const text = Array.isArray(content)
    ? content.map((part) => typeof part === "string" ? part : part?.text || "").join("")
    : content;
  if (!text) throw new Error("DeepSeek returned no content.");
  if (jsonOutput) {
    try {
      JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
    } catch {
      throw new Error("DeepSeek returned invalid JSON.");
    }
  }
  return { candidates: [{ content: { parts: [{ text }] } }], provider: "deepseek", model: DEEPSEEK_MODEL };
}

function isQuotaError(status, body) {
  if (Number(status) === 429) return true;
  const code = body?.error?.status || body?.error?.code || body?.status || "";
  const detail = body?.error?.message || body?.raw || "";
  return /RESOURCE_EXHAUSTED|quota|rate[\s_-]*limit|too many requests/i.test(`${code} ${detail}`);
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
