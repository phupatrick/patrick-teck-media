import { generateOfflinePost } from "./social-templates.mjs";

export async function createPostContent({ provider = "offline", apiKey = "", topic, pillar, notes, fetchImpl = fetch } = {}) {
  const normalizedProvider = String(provider || "offline").trim().toLowerCase();
  if (!apiKey || ["", "none", "offline"].includes(normalizedProvider)) {
    return generateOfflinePost({ topic, pillar, notes });
  }

  try {
    const result = await requestAiContent({ provider: normalizedProvider, apiKey, topic, pillar, notes, fetchImpl });
    return validatePostContent(result);
  } catch (error) {
    console.warn(`[social] AI content fallback: ${error.message || error}`);
    return generateOfflinePost({ topic, pillar, notes });
  }
}

export async function postToFacebook({ pageId, pageToken, caption, imageUrl = "", fetchImpl = fetch } = {}) {
  if (!pageId || !pageToken) throw new Error("Facebook Page ID and access token are required.");
  const usePhoto = Boolean(String(imageUrl || "").trim());
  const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/${usePhoto ? "photos" : "feed"}`;
  const body = new URLSearchParams({ access_token: pageToken, [usePhoto ? "caption" : "message"]: String(caption || "") });
  if (usePhoto) body.set("url", String(imageUrl).trim());
  const response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `Facebook publishing failed with HTTP ${response.status}.`);
  const id = String(payload?.id || payload?.post_id || "").trim();
  if (!id) throw new Error("Facebook did not return a post ID.");
  return id;
}

export async function postFirstComment({ postId, pageToken, commentText, fetchImpl = fetch } = {}) {
  if (!postId || !pageToken || !commentText) return null;
  const response = await fetchImpl(`https://graph.facebook.com/v20.0/${encodeURIComponent(postId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: pageToken, message: String(commentText) })
  });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `Facebook comment failed with HTTP ${response.status}.`);
  return payload?.id || null;
}

async function requestAiContent({ provider, apiKey, topic, pillar, notes, fetchImpl }) {
  if (provider === "gemini") {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt({ topic, pillar, notes }) }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6 } })
    });
    const payload = await readResponse(response);
    if (!response.ok) throw new Error(payload?.error?.message || `Gemini failed with HTTP ${response.status}.`);
    return parseJsonText(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  const baseUrl = provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com";
  const model = provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";
  const response = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: "Return only JSON with caption and first_comment for a factual, Vietnamese Facebook post." }, { role: "user", content: buildPrompt({ topic, pillar, notes }) }] })
  });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `${provider} failed with HTTP ${response.status}.`);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

function buildPrompt({ topic, pillar, notes }) {
  return `Brand: Patrick Tech Co. Topic: ${topic || "Technology"}. Pillar: ${pillar || "ai_news"}. Notes: ${notes || ""}. Do not invent prices, specifications, or claims. Include a practical angle and a concise CTA.`;
}

function validatePostContent(value) {
  const caption = String(value?.caption || "").trim();
  const firstComment = String(value?.first_comment || value?.firstComment || "").trim();
  if (!caption) throw new Error("AI response has no caption.");
  return { caption: caption.slice(0, 6000), first_comment: firstComment.slice(0, 1800) };
}

function parseJsonText(value) {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(source);
}

async function readResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}
