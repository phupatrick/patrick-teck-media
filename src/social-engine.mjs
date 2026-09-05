import { generateOfflinePost } from "./social-templates.mjs";
import { createDocumentStore } from "./document-store.mjs";
import { callGeminiJson, resolveGeminiApiKey } from "./ai-gateway.mjs";

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

const CONTENT_ARCHETYPES = [
  "So sánh trực diện: nêu rõ khi nào nên chọn công cụ A, khi nào nên dùng công cụ B.",
  "Mẹo workflow thực chiến: chỉ ra một quy trình cụ thể, điểm nghẽn và cách đo thời gian hoặc tỷ lệ lỗi.",
  "Bóc tách chi phí và rủi ro: đối chiếu khoản phí, hạn mức, quyền truy cập và điều kiện bảo hành khi có dữ liệu.",
  "Điểm tin từ tòa soạn: giải thích thay đổi kỹ thuật này ảnh hưởng thế nào đến công việc hằng ngày."
];

const SOCIAL_SYSTEM_PROMPT = [
  "Bạn là Giám đốc Nội dung và kỹ sư công nghệ thực chiến của Patrick Tech Co.",
  "Viết tiếng Việt có dấu, nói thẳng vào tính năng, giới hạn, chi phí và tác động trong workflow; tuyệt đối không dùng văn mẫu sáo rỗng như Trong thời đại 4.0, Không thể phủ nhận, Hãy cùng khám phá, giải pháp tuyệt vời, hoặc Trong bối cảnh hiện nay.",
  "Mỗi bài phải dùng một archetype được truyền trong dữ liệu và luân phiên giữa bốn hướng: so sánh trực diện, mẹo workflow, bóc tách chi phí/rủi ro, hoặc điểm tin giải thích tác động.",
  "Bắt buộc gọi tên tính năng kỹ thuật cụ thể phù hợp chủ đề, như Composer, Codebase Indexing, Tab Autocomplete, Artifacts, context window, MoE, API latency, token throughput, Docker, Terminal integration hoặc quyền quản trị; chỉ dùng thông số khi dữ liệu nguồn đã xác minh và không tự bịa số liệu.",
  "Cấu trúc caption bắt buộc theo đúng thứ tự sau và không thêm phần nào trước Hook:",
  "1) Dòng đầu tiên là Hook giật tít tối đa 120 ký tự, phải chứa từ khóa chính của chủ đề và đánh vào chi phí, hiệu suất hoặc so sánh công cụ mà không giật gân sai sự thật.",
  "2) Ngay sau Hook là Header: 🌟 PATRICK TECH CO. | [TIÊU ĐỀ IN HOA, NGẮN GỌN]. Dòng kế tiếp đúng nguyên văn: Công nghệ dễ tiếp cận hơn – Giá hợp lý hơn – Hỗ trợ tận tâm hơn.",
  "Thân bài bắt buộc có đúng 3 gạch đầu dòng ngắn, lần lượt mở đầu bằng ⚡, 📌, 💡. ⚡ phải nêu cơ chế hoặc tính năng kỹ thuật; 📌 phải nêu hiệu suất, workflow, giới hạn hoặc cách kiểm chứng; 💡 phải nêu bài toán chi phí và hỗ trợ Patrick Tech nhưng không bịa giá hay cam kết.",
  "Không dùng các từ hack, crack, tut, lách, rẻ bèo, tài khoản lậu hoặc cam kết 100% trong caption. Không hứa lợi nhuận, không khẳng định không rủi ro và không đưa số liệu chưa có trong dữ liệu nguồn.",
  "Với sản phẩm/dịch vụ, nói rõ đây là nội dung thương mại, nêu giá/thời hạn/chính sách chỉ khi có dữ liệu và nêu điều kiện bảo hành, hỗ trợ 1-1.",
  "Sau đúng 3 gạch đầu dòng, thêm đúng một câu hỏi mở để khuyến khích thảo luận hai chiều.",
  "Ngay sau câu hỏi là Dual-CTA có đủ hai link https://patricktechmedia.com/vi/ và https://patricktechmedia.store/, kèm Zalo/Hotline 0933 684 560.",
  "first_comment phải dùng Unicode dễ đọc và có link tòa soạn, link store, Zalo/Hotline và cam kết hỗ trợ/bảo hành 1-1.",
  "Không dùng Markdown hoặc dấu **. Trả về JSON duy nhất gồm caption và first_comment; không bọc markdown."
].join(" ");

const CANDIDATE_MODELS = ["gemini-3-flash-preview", "gemini-3.6-flash"];
const GEMINI_REQUEST_TIMEOUT_MS = 35_000;

export function getRandomTechImage({ random = Math.random } = {}) {
  const index = Math.min(TECH_IMAGES.length - 1, Math.max(0, Math.floor(Number(random()) * TECH_IMAGES.length)));
  return TECH_IMAGES[index];
}

const PEXELS_TIMEOUT_MS = 10_000;

export function getPexelsSearchQuery(topic = "") {
  const value = String(topic || "").toLowerCase();
  if (/(cursor|vs\s*code|visual studio|coding|programming|developer|lập trình)/i.test(value)) return "programmer code setup dark";
  if (/(claude|anthropic|chatgpt|openai|gpt|gemini|llm|ai agent|trí tuệ nhân tạo)/i.test(value)) return "artificial intelligence neural network technology";
  if (/(chip|bán dẫn|semiconductor|nvidia|intel|amd|qualcomm|gpu|cpu|npu)/i.test(value)) return "computer microchip semiconductor circuit";
  if (/(anker|phone|iphone|android|pixel|gadget|device|laptop|smartphone|thiết bị|điện thoại)/i.test(value)) return "modern smartphone technology gadget";
  return "cyber technology workspace dark";
}

export async function fetchContextualPexelsImage({ topic = "", apiKey = process.env.PEXELS_API_KEY, fetchImpl = fetch, fallback = getRandomTechImage, timeoutMs = PEXELS_TIMEOUT_MS } = {}) {
  const key = String(apiKey || "").trim();
  if (!key) return fallback();
  try {
    const query = getPexelsSearchQuery(topic);
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const response = await fetchWithTimeout(fetchImpl, url, { headers: { Authorization: key, Accept: "application/json" } }, timeoutMs);
    const payload = await readResponse(response);
    const imageUrl = String(payload?.photos?.[0]?.src?.large2x || payload?.photos?.[0]?.src?.large || "").trim();
    if (!response.ok || !imageUrl) throw new Error(`Pexels request failed with HTTP ${response.status}.`);
    return imageUrl;
  } catch (error) {
    console.warn(`[Pexels] contextual image fallback: ${error?.message || error}`);
    return fallback();
  }
}

export async function createPostContent({ provider = "offline", apiKey = "", model = "", topic, pillar, postType = "information", notes, sourceArticleUrl = "", mediaUrl = "", storeUrl = "", fetchImpl = fetch } = {}) {
  const normalizedProvider = String(provider || "offline").trim().toLowerCase();
  if (["", "none", "offline"].includes(normalizedProvider)) {
    return generateOfflinePost({ topic, pillar, notes, isProductPromotion: postType === "product_promotion" });
  }

  const resolvedApiKey = resolveGeminiApiKey({ apiKey });
  if (!resolvedApiKey) {
    console.warn(`[social-engine] No API key for ${normalizedProvider}; using rich offline template.`);
    return createGracefulFallback({ topic, pillar, notes, postType, sourceArticleUrl, mediaUrl, storeUrl });
  }

  let learningContext = "";
  try {
    const store = createDocumentStore({ documentKey: "social:learned_context", fallbackPath: "data/social-learned-context.json", initialValue: {} });
    const learned = await store.read();
    if (Array.isArray(learned.top_winning_topics) && learned.top_winning_topics.length) learningContext = `\nKinh nghiệm bài hiệu quả: ${learned.top_winning_topics.slice(0, 3).join(" | ")}. ${learned.optimization_rule || ""}`;
  } catch {
    // Learning data is optional; content generation remains available without it.
  }
  try {
    const result = await requestAiContent({ provider: normalizedProvider, apiKey: resolvedApiKey, model, topic, pillar, postType, notes, sourceArticleUrl, learningContext, fetchImpl });
    return validatePostContent(result);
  } catch (error) {
    const reason = error?.message || String(error);
    console.warn(`[social-engine] AI providers unavailable; using rich offline template: ${reason}`);
    return createGracefulFallback({ topic, pillar, notes, postType, sourceArticleUrl, mediaUrl, storeUrl });
  }
}

function createGracefulFallback({ topic, pillar, notes, postType, sourceArticleUrl, mediaUrl = "", storeUrl = "" }) {
  const fallback = generateOfflinePost({
    topic,
    pillar,
    notes,
    mediaUrl,
    storeUrl: storeUrl || "https://patricktechmedia.store/",
    isProductPromotion: postType === "product_promotion"
  });
  return {
    ...fallback,
    generation_mode: "approved_fallback",
    fallback_reason: "ai_providers_unavailable",
    fallback_note: "(Nội dung tạo từ Template dự phòng do API đang quá tải quota)"
  };
}

export function resolveApiKeys(requestKey = "") {
  return [...new Set([
    process.env.NEWSROOM_GEMINI_API_KEY,
    process.env.SOCIAL_AI_API_KEY,
    process.env.GEMINI_API_KEY,
    requestKey
  ].map((key) => String(key || "").trim()).filter(Boolean))];
}

export async function postToFacebook({ pageId, pageToken, caption, imageUrl = "", fetchImpl = fetch, timeoutMs = 10000, returnDetails = false } = {}) {
  if (!pageId || !pageToken) throw new Error("Facebook Page ID and access token are required.");
  const usePhoto = Boolean(String(imageUrl || "").trim());
  const endpoint = `https://graph.facebook.com/v20.0/${encodeURIComponent(pageId)}/${usePhoto ? "photos" : "feed"}`;
  const body = new URLSearchParams({ access_token: pageToken, published: "true", [usePhoto ? "caption" : "message"]: String(caption || "") });
  if (usePhoto) body.set("url", String(imageUrl).trim());
  const response = await fetchWithTimeout(fetchImpl, endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, timeoutMs);
  const payload = await readResponse(response);
  if (!response.ok) throw new Error(payload?.error?.message || `Facebook publishing failed with HTTP ${response.status}.`);
  // The photo edge returns both a photo id and a Page feed post id. The feed
  // post id is the only id suitable for a public permalink and First Comment.
  const id = String(payload?.post_id || payload?.id || "").trim();
  if (!id) throw new Error("Facebook did not return a post ID.");
  if (!returnDetails) return id;
  return verifyFacebookPost({ pageId, postId: id, pageToken, fetchImpl, timeoutMs });
}

export async function safePostToFacebook({ pageId, pageToken, caption, imageUrl = "", fetchImpl = fetch, timeoutMs = 10000, returnDetails = false } = {}) {
  try {
    return await postToFacebook({ pageId, pageToken, caption, imageUrl, fetchImpl, timeoutMs, returnDetails });
  } catch (error) {
    if (!String(imageUrl || "").trim()) throw error;
    return postToFacebook({ pageId, pageToken, caption, imageUrl: "", fetchImpl, timeoutMs, returnDetails });
  }
}

export async function getFacebookPostDetails({ pageId, postId, pageToken, fetchImpl = fetch, timeoutMs = 10000 }) {
  const fallback = {
    id: postId,
    permalink_url: `https://www.facebook.com/${encodeURIComponent(pageId)}/posts/${encodeURIComponent(postId)}`,
    is_published: null,
    verification_status: "unverified"
  };
  try {
    const fields = "id,permalink_url,is_published,is_hidden,privacy";
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(postId)}?fields=${fields}&access_token=${encodeURIComponent(pageToken)}`;
    const response = await fetchWithTimeout(fetchImpl, url, { headers: { accept: "application/json" } }, timeoutMs);
    const payload = await readResponse(response);
    if (!response.ok) return { ...fallback, verification_error: payload?.error?.message || `Facebook verification failed with HTTP ${response.status}.` };
    return {
      ...fallback,
      ...payload,
      permalink_url: payload?.permalink_url || fallback.permalink_url,
      verification_status: payload?.is_published === true && payload?.permalink_url
        ? "verified"
        : payload?.is_published === false
          ? "not_published"
          : "unverified"
    };
  } catch (error) {
    return { ...fallback, verification_error: error.message || String(error) };
  }
}

export async function verifyFacebookPost({ pageId, postId, pageToken, fetchImpl = fetch, timeoutMs = 10000, attempts = 4, delayMs = 3000, logger = console } = {}) {
  let details;
  const totalAttempts = Math.max(1, Number(attempts) || 1);
  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    details = await getFacebookPostDetails({ pageId, postId, pageToken, fetchImpl, timeoutMs });
    if (details.verification_status === "verified" && details.is_hidden !== true) return details;
    if (attempt < totalAttempts) {
      logger.warn?.(`[Facebook] Public visibility check ${attempt}/${totalAttempts} is not verified yet.`);
      await delay(delayMs);
    }
  }
  const cause = details?.verification_error
    || (details?.is_hidden === true
      ? "Meta marked the post as hidden. Check Page quality, audience restrictions, and publishing authorization."
      : details?.is_published === false
        ? "Meta accepted the request but the post is not published. Check Page restrictions and publishing authorization."
        : "Meta did not confirm a public permalink after the verification window.");
  throw new Error(`Facebook post ${postId} was not publicly verified: ${cause}`);
}

export async function getFacebookPermalink({ pageId = "", postId, pageToken, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  const details = await getFacebookPostDetails({ pageId, postId, pageToken, fetchImpl, timeoutMs });
  return details.permalink_url;
}

export async function postFirstComment({ postId, pageToken, commentText, fetchImpl = fetch, timeoutMs = 25000 } = {}) {
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

export async function postFirstCommentWithRetry({ postId, pageToken, commentText, fetchImpl = fetch, timeoutMs = 25000, delayMs = 4000, retries = 2, logger = console } = {}) {
  if (!postId || !pageToken || !commentText) return null;
  await delay(delayMs);
  let lastError;
  for (let attempt = 0; attempt <= Math.max(0, Number(retries) || 0); attempt += 1) {
    try {
      return await postFirstComment({ postId, pageToken, commentText, fetchImpl, timeoutMs });
    } catch (error) {
      lastError = error;
      logger.warn?.(`[Facebook] First Comment attempt ${attempt + 1} failed: ${error.message || error}`);
      if (attempt < retries) await delay(2000);
    }
  }
  throw lastError;
}

async function requestAiContent({ provider, apiKey, model = "", topic, pillar, postType = "information", notes, sourceArticleUrl = "", learningContext = "", fetchImpl }) {
  if (provider === "gemini") {
    const payload = await callGeminiJson({ apiKey, model, fallbackModels: CANDIDATE_MODELS, fetchImpl, timeoutMs: GEMINI_REQUEST_TIMEOUT_MS, label: "Social content" , payload: {
      contents: [{ parts: [{ text: `${SOCIAL_SYSTEM_PROMPT}${learningContext}\n\n${buildPrompt({ topic, pillar, postType, notes, sourceArticleUrl })}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.7, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } }
    }});
    return parseJsonText(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  const baseUrl = provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com";
  const providerModel = provider === "deepseek" ? "deepseek-chat" : "gpt-4o-mini";
  const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: providerModel, response_format: { type: "json_object" }, messages: [{ role: "system", content: `${SOCIAL_SYSTEM_PROMPT}${learningContext}` }, { role: "user", content: buildPrompt({ topic, pillar, postType, notes, sourceArticleUrl }) }] })
  }, 35_000);
  const payload = await readResponse(response);
  if (!response.ok) {
    throw new Error(`${provider} API failed (HTTP ${response.status}): ${payload?.error?.message || payload?.raw || "Provider returned an unknown error."}`);
  }
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

async function delay(milliseconds) {
  const duration = Math.max(0, Number(milliseconds) || 0);
  if (duration) await new Promise((resolve) => setTimeout(resolve, duration));
}

function buildPrompt({ topic, pillar, postType = "information", notes, sourceArticleUrl = "" }) {
  const productRules = postType === "product_promotion"
    ? "Đây là bài giới thiệu sản phẩm có mục đích thương mại. Phải nói rõ sản phẩm đang được giới thiệu, danh mục, giá/thời hạn nếu có trong dữ liệu, điều kiện sử dụng, giới hạn và kênh mua. Dùng giọng tư vấn nhẹ, không giả làm tin độc lập, không tạo khan hiếm giả, không hứa kết quả, không dùng thuộc tính cá nhân để thuyết phục và không che giấu quan hệ bán hàng."
    : "Đây là bài thông tin; CTA chỉ nên nhẹ và liên quan trực tiếp đến nội dung. Không biến bài tin thành quảng cáo.";
  return `Thương hiệu: Patrick Tech Co. Loại bài: ${postType}. ${productRules} Chủ đề: ${topic || "Công nghệ"}. Trụ cột: ${pillar || "ai_news"}. URL bài nguồn để tham khảo: ${sourceArticleUrl || "không có"}. Dữ liệu đã xác minh: ${notes || ""}. Hãy viết đủ chiều sâu nhưng dễ đọc, ưu tiên lợi ích và quyết định thực tế của người đọc.`;
}

function validatePostContent(value) {
  const rawCaption = String(value?.caption || "").trim();
  if (/(cam kết lợi nhuận|lợi nhuận chắc chắn|đảm bảo\s*100\s*%|không rủi ro|lãi suất chắc chắn|giàu nhanh)/i.test(rawCaption)) {
    throw new Error("AI response contains an unverifiable financial or deceptive claim.");
  }
  const caption = formatFacebookCaption(rawCaption);
  const firstComment = String(value?.first_comment || value?.firstComment || "").trim();
  if (!caption) throw new Error("AI response has no caption.");
  assertFacebookCaptionStructure(caption);
  return { caption: caption.slice(0, 6000), first_comment: firstComment.slice(0, 1800) };
}

const UNSAFE_CLAIMS = [
  [/cam kết lợi nhuận/gi, "giá trị tham khảo, không cam kết lợi nhuận"],
  [/đảm bảo 100%/gi, "hướng đến kết quả phù hợp"],
  [/không rủi ro/gi, "cần đánh giá rủi ro trước khi dùng"],
  [/hack tài khoản/gi, "bảo vệ và khôi phục quyền truy cập đúng quy trình"],
  [/\bhack\b/gi, "bảo mật"],
  [/\bcrack\b/gi, "bản quyền"],
  [/\btut\b/gi, "hướng dẫn"],
  [/lách/gi, "tối ưu"],
  [/rẻ bèo/gi, "chi phí hợp lý"],
  [/tài khoản lậu/gi, "tài khoản bản quyền"]
];

export function sanitizeSocialText(value) {
  return UNSAFE_CLAIMS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ""))
    .replace(/\*{1,3}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatFacebookCaption(value) {
  const normalized = sanitizeSocialText(value);
  if (!normalized) return "";
  return normalized
    .replace(/\s*(?=🌟|⚡|📌|💡|💬|📩|🛒|#PatrickTech)/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assertFacebookCaptionStructure(caption) {
  const lines = caption.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const hasHook = lines[0] && lines[0].length <= 120;
  const hasBrand = lines.some((line) => line.startsWith("🌟 PATRICK TECH CO."));
  const hasPoints = ["⚡", "📌", "💡"].every((icon) => lines.some((line) => line.startsWith(icon)));
  if (!hasHook || !hasBrand || !hasPoints || lines.length < 7) {
    throw new Error("AI response does not meet the required Facebook paragraph structure.");
  }
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
