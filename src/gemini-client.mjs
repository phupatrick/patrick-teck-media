import https from "node:https";

const DEFAULT_TIMEOUT_MS = 20_000;

export async function callGeminiAPI({ prompt, temperature = 0.7, maxRetries = 3, env = process.env } = {}) {
  const apiKey = String(env.NEWSROOM_GEMINI_API_KEY || env.SOCIAL_AI_API_KEY || env.GEMINI_API_KEY || "").trim();
  if (!apiKey) throw new Error("NO_GEMINI_API_KEY_AVAILABLE");

  const model = String(env.SOCIAL_AI_MODEL || "gemini-1.5-flash").trim();
  const payload = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: String(prompt || "") }] }],
    generationConfig: { responseMimeType: "application/json", temperature }
  });
  let delayMs = 1_000;
  let lastError;

  for (let attempt = 1; attempt <= Math.max(1, Number(maxRetries) || 1); attempt += 1) {
    try {
      const response = await requestGemini({ model, apiKey, payload });
      const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("GEMINI_EMPTY_RESPONSE");
      return parseJsonResponse(rawText);
    } catch (error) {
      lastError = error;
      if (attempt >= Math.max(1, Number(maxRetries) || 1)) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
  throw lastError;
}

function requestGemini({ model, apiKey, payload, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: "generativelanguage.googleapis.com",
      path: `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
      timeout: timeoutMs
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = null; }
        if (response.statusCode >= 200 && response.statusCode < 300 && parsed) return resolve(parsed);
        reject(new Error(`HTTP_${response.statusCode}: ${body}`));
      });
    });
    request.on("error", reject);
    request.on("timeout", () => {
      request.destroy();
      reject(new Error("REQUEST_TIMEOUT_20S"));
    });
    request.write(payload);
    request.end();
  });
}

function parseJsonResponse(value) {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(source);
}
