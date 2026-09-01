import { generateOfflinePost } from "./social-templates.mjs";
import { createDocumentStore } from "./document-store.mjs";

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
  "CTA cuối bài điều hướng website patricktechmedia.com, cửa hàng patricktechmedia.store và Zalo/Hotline 0933 684 560.",
  "Kết thúc bằng một câu hỏi mở để khuyến khích thảo luận, không dùng lời hứa tuyệt đối, gây áp lực hoặc thông tin chưa được xác minh.",
  "Trả về JSON duy nhất gồm caption và first_comment; không bọc markdown."
].join(" ");

const DEFAULT_GEMINI_MODEL = "gemini-1.5-flash";
const COMPATIBLE_GEMINI_MODELS = ["gemini-2.5-flash"];

export function getRandomTechImage({ random = Math.random } = {}) {
  const index = Math.min(TECH_IMAGES.length - 1, Math.max(0, Math.floor(Number(random()) * TECH_IMAGES.length)));
  return TECH_IMAGES[index];
}

export async function createPostContent({ provider = "offline", apiKey = "", topic, pillar, notes, sourceArticleUrl = "", fetchImpl = fetch } = {}) {
  const normalizedProvider = String(provider || "offline").trim().toLowerCase();
  if (["", "none", "offline"].includes(normalizedProvider)) {
    return generateOfflinePost({ topic, pillar, notes });
  }

  const resolvedApiKey = String(
    process.env.NEWSROOM_GEMINI_API_KEY ||
    process.env.SOCIAL_AI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    apiKey ||
    ""
  ).trim();
  if (!resolvedApiKey) {
    throw new Error(`Missing API key for social provider "${normalizedProvider}".`);
  }

  let learningContext = "";
  try {
    const store = createDocumentStore({ documentKey: "social:learned_context", fallbackPath: "data/social-learned-context.json", initialValue: {} });
    const learned = await store.read();
    if (Array.isArray(learned.top_winning_topics) && learned.top_winning_topics.length) learningContext = `\nKinh nghiệm bài hiệu quả: ${learned.top_winning_topics.slice(0, 3).join(" | ")}. ${learned.optimization_rule || ""}`;
  } catch {
    // Learning data is optional; content generation remains available without it.
  }
  const result = await requestAiContent({ provider: normalizedProvider, apiKey: resolvedApiKey, topic, pillar, notes, sourceArticleUrl, learningContext, fetchImpl });
  return validatePostContent(result);
}

export async function postToFacebook({ pageId, pageToken, caption, imageUrl = "", fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!pageId || !pageToken) throw new Error("Facebook Page ID and access token are required.");
  const usePhoto = Boolean(String(imageUrl || "").trim());
  const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/${usePhoto ? "photos" : "feed"}`;
  const body = new URLSearchParams({ access_token: pageToken, [usePhoto ? "caption" : "message"]: String(caption || "") });
  if (usePhoto) body.set("url", String(imageUrl).trim());
  const response = await fetchWithTimeout(fetchImpl, endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, timeoutMs);
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `Facebook publishing failed with HTTP ${response.status}.`);
  const id = String(payload?.id || payload?.post_id || "").trim();
  if (!id) throw new Error("Facebook did not return a post ID.");
  return id;
}

export async function safePostToFacebook({ pageId, pageToken, caption, imageUrl = "", fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  try {
    return await postToFacebook({ pageId, pageToken, caption, imageUrl, fetchImpl, timeoutMs });
  } catch (error) {
    if (!String(imageUrl || "").trim()) throw error;
    return postToFacebook({ pageId, pageToken, caption, imageUrl: "", fetchImpl, timeoutMs });
  }
}

export async function postFirstComment({ postId, pageToken, commentText, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!postId || !pageToken || !commentText) return null;
  const response = await fetchWithTimeout(fetchImpl, `https://graph.facebook.com/v20.0/${encodeURIComponent(postId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ access_token: pageToken, message: String(commentText) })
  }, timeoutMs);
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `Facebook comment failed with HTTP ${response.status}.`);
  return payload?.id || null;
}

async function requestAiContent({ provider, apiKey, topic, pillar, notes, sourceArticleUrl = "", learningContext = "", fetchImpl }) {
  if (provider === "gemini") {
    const configuredModel = String(process.env.SOCIAL_AI_MODEL || process.env.GEMINI_MODEL || process.env.NEWSROOM_GEMINI_MODEL || "").trim();
    const models = [...new Set([configuredModel, DEFAULT_GEMINI_MODEL, ...COMPATIBLE_GEMINI_MODELS].filter(Boolean))];
    const errors = [];
    for (const model of models) {
      const response = await fetchWithTimeout(fetchImpl, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: `${SOCIAL_SYSTEM_PROMPT}${learningContext}\n\n${buildPrompt({ topic, pillar, notes, sourceArticleUrl })}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.6 } })
      }, 10000);
      const payload = await readResponse(response);
      if (response.ok) return parseJsonText(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
      const detail = payload?.error?.message || payload?.raw || "Google returned an unknown error.";
      errors.push(`${model}: HTTP ${response.status}: ${detail}`);
      if (response.status !== 404) break;
    }
    throw new Error(`Gemini API failed: ${errors.join(" | ")}`);
  }

  const baseUrl = provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com";
  const model = provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";
  const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, response_format: { type: "json_object" }, messages: [{ role: "system", content: `${SOCIAL_SYSTEM_PROMPT}${learningContext}` }, { role: "user", content: buildPrompt({ topic, pillar, notes, sourceArticleUrl }) }] })
  }, 10000);
  const payload = await readResponse(response);
  if (!response.ok) {
    throw new Error(`${provider} API failed (HTTP ${response.status}): ${payload?.error?.message || payload?.raw || "Provider returned an unknown error."}`);
  }
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

function buildPrompt({ topic, pillar, notes, sourceArticleUrl = "" }) {
  return `Thương hiệu: Patrick Tech Co. Chủ đề: ${topic || "Công nghệ"}. Trụ cột: ${pillar || "ai_news"}. URL bài nguồn để tham khảo: ${sourceArticleUrl || "không có"}. Dữ liệu đã xác minh: ${notes || ""}. Hãy viết đủ chiều sâu nhưng dễ đọc, ưu tiên lợi ích và quyết định thực tế của người đọc.`;
}

function validatePostContent(value) {
  const caption = sanitizeSocialText(String(value?.caption || "").trim());
  const firstComment = String(value?.first_comment || value?.firstComment || "").trim();
  if (!caption) throw new Error("AI response has no caption.");
  return { caption: caption.slice(0, 6000), first_comment: firstComment.slice(0, 1800) };
}

const UNSAFE_CLAIMS = [
  [/cam kết lợi nhuận/gi, "giá trị tham khảo, không cam kết lợi nhuận"],
  [/đảm bảo 100%/gi, "hướng đến kết quả phù hợp"],
  [/không rủi ro/gi, "cần đánh giá rủi ro trước khi dùng"],
  [/hack tài khoản/gi, "bảo vệ và khôi phục quyền truy cập đúng quy trình"]
];

export function sanitizeSocialText(value) {
  return UNSAFE_CLAIMS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || "")).trim();
}

function parseJsonText(value) {
  const source = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(source);
}

async function readResponse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const duration = Math.max(1, Number(timeoutMs) || 10000);
  const timer = setTimeout(() => controller.abort(), duration);
  let timeoutTimer;
  const timeout = new Promise((_, reject) => { timeoutTimer = setTimeout(() => reject(new Error(`Request timeout after ${duration}ms: ${url}`)), duration); });
  try {
    return await Promise.race([fetchImpl(url, { ...options, signal: controller.signal }), timeout]);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Request timeout after ${duration}ms: ${url}`);
    throw error;
  } finally {
    clearTimeout(timer);
    clearTimeout(timeoutTimer);
  }
}
