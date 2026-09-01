import { generateOfflinePost } from "./social-templates.mjs";

const TECH_IMAGES = [
  "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=85"
];

const SOCIAL_SYSTEM_PROMPT = [
  "Bạn là biên tập viên Social Autopilot của Patrick Tech Co.",
  "Viết bài Facebook bằng tiếng Việt có dấu đầy đủ, tự nhiên, chính xác và không dùng tiếng Việt không dấu.",
  "Cấu trúc bắt buộc: Hook ngắn, rõ và thu hút; phân tích sâu 3 điểm đắt giá; kết luận thực tế.",
  "Không bịa giá, thông số, tính năng, thời điểm hoặc cam kết ngoài dữ liệu được cung cấp.",
  "Với sản phẩm/dịch vụ, nêu rõ điểm mạnh, giới hạn, mức giá nếu có dữ liệu và trường hợp nên dùng.",
  "Nêu rõ cam kết bảo hành và hỗ trợ 1-1 của Patrick Tech khi bài viết liên quan sản phẩm hoặc dịch vụ.",
  "CTA cuối bài điều hướng Zalo/Hotline 0933 684 560.",
  "Trả về JSON duy nhất gồm caption và first_comment; không bọc markdown."
].join(" ");

export function getRandomTechImage({ random = Math.random } = {}) {
  const index = Math.min(TECH_IMAGES.length - 1, Math.max(0, Math.floor(Number(random()) * TECH_IMAGES.length)));
  return TECH_IMAGES[index];
}

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
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: `${SOCIAL_SYSTEM_PROMPT}\n\n${buildPrompt({ topic, pillar, notes })}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6 } })
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
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: SOCIAL_SYSTEM_PROMPT }, { role: "user", content: buildPrompt({ topic, pillar, notes }) }] })
  });
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `${provider} failed with HTTP ${response.status}.`);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

function buildPrompt({ topic, pillar, notes }) {
  return `Thương hiệu: Patrick Tech Co. Chủ đề: ${topic || "Công nghệ"}. Trụ cột: ${pillar || "ai_news"}. Dữ liệu đã xác minh: ${notes || ""}. Hãy viết đủ chiều sâu nhưng dễ đọc, ưu tiên lợi ích và quyết định thực tế của người đọc.`;
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
