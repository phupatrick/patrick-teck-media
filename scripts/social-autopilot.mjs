import { loadNewsroomState } from "../src/newsroom-service.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { createDocumentStore } from "../src/document-store.mjs";
import { createPostContent, getRandomTechImage, postFirstComment, safePostToFacebook } from "../src/social-engine.mjs";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { pathToFileURL } from "node:url";

const DEFAULT_CONTENT_PATH = "data/newsroom-content.json";
const DEFAULT_STORE_CATALOG_URL = "https://patricktechmedia.store/api/products";
const DEFAULT_INFORMATION_POSTS_PER_DAY = 5;
const DEFAULT_PRODUCT_POSTS_PER_DAY = 3;
const DEFAULT_AI_SELECTED_POSTS_PER_DAY = 2;
const DEFAULT_TOPICS = [
  "Cách chọn công cụ AI phù hợp cho công việc hằng ngày",
  "Những thông số công nghệ người mua nên kiểm tra trước khi xuống tiền",
  "Bảo mật tài khoản số: ba việc nên làm ngay hôm nay"
];

export async function runSocialAutopilot({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  if (String(env.SOCIAL_AUTOPILOT_ENABLED || "").trim() !== "1") {
    return { skipped: true, reason: "SOCIAL_AUTOPILOT_ENABLED is not 1", published: [] };
  }

  const pageId = String(env.FB_PAGE_ID || "").trim();
  const pageToken = String(env.FB_PAGE_ACCESS_TOKEN || "").trim();
  if (!pageId || !pageToken) throw new Error("FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN are required.");

  const store = createSocialStore({
    statePath: env.SOCIAL_STATE_PATH || "data/social-posts.json",
    databaseUrl: env.DATABASE_URL || ""
  });
  const socialState = await store.getState();
  const publishedKeys = new Set(socialState.posts.filter((post) => post.status === "published").map((post) => post.source_key).filter(Boolean));
  const newsroom = await loadNewsroomState({ contentPath: env.NEWSROOM_CONTENT_PATH || DEFAULT_CONTENT_PATH, databaseUrl: env.DATABASE_URL || "" });
  const informationLimit = normalizeDailyLimit(env.SOCIAL_INFORMATION_POSTS_PER_DAY, DEFAULT_INFORMATION_POSTS_PER_DAY);
  const productLimit = normalizeDailyLimit(env.SOCIAL_PRODUCT_POSTS_PER_DAY, DEFAULT_PRODUCT_POSTS_PER_DAY);
  const aiSelectedLimit = normalizeDailyLimit(env.SOCIAL_AI_SELECTED_POSTS_PER_DAY, DEFAULT_AI_SELECTED_POSTS_PER_DAY);
  const learnedContext = await loadLearnedContext(env);
  const articles = selectCandidates(newsroom.articles, publishedKeys, informationLimit + aiSelectedLimit, { learnedContext, recentPosts: socialState.posts });
  const informationCandidates = articles.length
    ? articles.slice(0, informationLimit)
    : (String(env.SOCIAL_AUTOPILOT_ROTATE_TOPICS || "") === "1" ? DEFAULT_TOPICS.map((topic) => ({ title: topic, summary: "Chủ đề tư vấn công nghệ thực tế từ Patrick Tech Co.", source_key: `topic:${topic}`, pillar: "workflow_tips", post_type: "information" })).slice(0, informationLimit) : []);
  const aiSelectedCandidates = articles.slice(informationLimit, informationLimit + aiSelectedLimit).map((article) => ({
    ...article,
    pillar: article.pillar || "ai_news",
    post_type: "ai_selected"
  }));
  const productCandidates = await selectProductCandidates({ env, fetchImpl, publishedKeys, recentPosts: socialState.posts, limit: productLimit, logger });
  const candidates = [...informationCandidates.map((article) => ({ ...article, pillar: article.pillar || "ai_news", post_type: "information" })), ...aiSelectedCandidates, ...productCandidates];
  const published = [];
  const failures = [];

  for (const article of candidates) {
    const sourceKey = article.source_key || getSourceKey(article);
    try {
      const notes = buildArticleNotes(article);
      const content = await createAutopilotContent({ article, notes, env, fetchImpl, logger });
      const imageUrl = article.image?.src || article.image_url || getRandomTechImage();
      const postId = await safePostToFacebook({
        pageId,
        pageToken,
        caption: content.caption,
        imageUrl,
        fetchImpl
      });
      let firstCommentStatus = "not_requested";
      let firstCommentError = "";
      if (content.first_comment) {
        try {
          await postFirstComment({ postId, pageToken, commentText: content.first_comment, fetchImpl });
          firstCommentStatus = "published";
        } catch (error) {
          // The Facebook post is already live. Persist it and retry the comment separately later.
          firstCommentStatus = "failed";
          firstCommentError = error.message || String(error);
          logger.warn?.(`[social-autopilot] First comment failed for ${article.title}: ${firstCommentError}`);
        }
      }
      const record = {
        id: `autopilot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        topic: article.title,
        source_key: sourceKey,
        source_url: article.href || article.url || "",
        caption: content.caption,
        first_comment: content.first_comment,
        image_url: imageUrl,
        status: "published",
        fb_post_id: String(postId),
        created_at: new Date().toISOString(),
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        autopilot: true,
        candidate_score: article.candidate_score || 0,
        candidate_reasons: article.candidate_reasons || [],
        generation_mode: content.generation_mode || "offline",
        post_type: article.post_type || "information",
        first_comment_status: firstCommentStatus,
        first_comment_error: firstCommentError
      };
      await store.update((draft) => {
        draft.posts.unshift(record);
        draft.updated_at = record.updated_at;
        return draft;
      });
      published.push({
        title: article.title,
        facebook_url: `https://facebook.com/${postId}`,
        candidate_score: article.candidate_score || 0,
        generation_mode: content.generation_mode || "offline",
        post_type: article.post_type || "information",
        first_comment_status: firstCommentStatus
      });
    } catch (error) {
      failures.push({ title: article.title, error: error.message || String(error) });
      logger.warn?.(`[social-autopilot] Failed for ${article.title}: ${error.message || error}`);
    }
  }

  const result = { skipped: false, selected: candidates.length, published, failures };
  await sendTelegramReport(result, env, fetchImpl);
  return result;
}

async function createAutopilotContent({ article, notes, env, fetchImpl, logger }) {
  try {
    const content = await createPostContent({
      provider: env.SOCIAL_AI_PROVIDER || "offline",
      apiKey: env.NEWSROOM_GEMINI_API_KEY || env.SOCIAL_AI_API_KEY || env.GEMINI_API_KEY || "",
      topic: article.title,
      pillar: "ai_news",
      notes,
      sourceArticleUrl: article.href || article.url || "",
      fetchImpl
    });
    return { ...content, generation_mode: "gemini" };
  } catch (error) {
    const message = error.message || String(error);
    logger.warn?.(`[social-autopilot] AI generation failed; using approved fallback template: ${message}`);
    return { ...generateOfflinePost({ topic: article.title, pillar: article.pillar || "ai_news", notes, customCTA: article.custom_cta || "" }), generation_mode: "approved_fallback" };
  }
}

async function selectProductCandidates({ env, fetchImpl, publishedKeys, recentPosts, limit, logger }) {
  if (limit < 1) return [];
  try {
    const response = await fetchImpl(String(env.SOCIAL_PRODUCT_CATALOG_URL || DEFAULT_STORE_CATALOG_URL), {
      headers: { accept: "application/json", "user-agent": "patrick-tech-media-social-autopilot" },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
    const payload = await response.json();
    const usedProducts = new Set((Array.isArray(recentPosts) ? recentPosts : []).map((post) => String(post?.source_key || "")).filter((key) => key.startsWith("product:")));
    return (Array.isArray(payload?.products) ? payload.products : [])
      .filter(isFacebookEligibleProduct)
      .filter((product) => !publishedKeys.has(`product:${product.id}`) && !usedProducts.has(`product:${product.id}`))
      .map(toProductCandidate)
      .slice(0, limit);
  } catch (error) {
    logger.warn?.(`[social-autopilot] Product catalog was unavailable; product promotions skipped: ${error.message || error}`);
    return [];
  }
}

function isFacebookEligibleProduct(product) {
  const category = String(product?.catalogCategory || "").toLowerCase();
  const text = `${product?.title || ""} ${product?.description || ""}`.toLowerCase();
  if (!new Set(["ai", "software"]).has(category)) return false;
  return !/(add\s*(fam|family|team)|cấp tài khoản|tài khoản riêng|đổi mật khẩu|mail\s*\||password|unban|tăng lượt|tăng tương tác|followers?|views?|subscribers?|bot giá|tool tăng)/i.test(text);
}

function toProductCandidate(product) {
  const description = String(product.description || "").replace(/\s+/g, " " ).trim().slice(0, 1800);
  const price = String(product.priceText || "").trim();
  return {
    title: product.title,
    summary: `Sản phẩm thuộc danh mục ${product.catalogLabelVi || "Công cụ số"}.${price ? ` Giá tham khảo: ${price}.` : ""}`,
    dek: description,
    image_url: product.image || product.images?.[0] || "",
    href: "https://patricktechmedia.store/",
    source_key: `product:${product.id}`,
    pillar: "product_offer",
    post_type: "product_promotion",
    custom_cta: "Xem danh mục sản phẩm tại patricktechmedia.store hoặc nhắn Zalo 0933 684 560 để nhận tư vấn về tính tương thích, điều kiện sử dụng và hỗ trợ sau mua."
  };
}

function normalizeDailyLimit(value, fallback) {
  const number = Number(value);
  return Math.max(0, Math.min(10, Number.isFinite(number) ? Math.floor(number) : fallback));
}

export function selectCandidates(articles, publishedKeys, limit, { learnedContext = {}, recentPosts = [], now = new Date() } = {}) {
  const recentTopics = new Set(
    (Array.isArray(recentPosts) ? recentPosts : [])
      .filter((post) => post?.status === "published")
      .filter((post) => new Date(now).getTime() - Date.parse(post.published_at || post.created_at || 0) < 1000 * 60 * 60 * 72)
      .map((post) => topicKey(post.topic))
      .filter(Boolean)
  );
  const winners = new Set((Array.isArray(learnedContext.top_winning_topics) ? learnedContext.top_winning_topics : []).map(topicKey));

  return (Array.isArray(articles) ? articles : [])
    .filter((article) => article && article.title && !publishedKeys.has(getSourceKey(article)))
    .filter((article) => article.language === "vi" || !article.language)
    .map((article) => scoreCandidate(article, { recentTopics, winners, now }))
    .sort((left, right) => right.candidate_score - left.candidate_score || Date.parse(right.updated_at || right.published_at || 0) - Date.parse(left.updated_at || left.published_at || 0))
    .slice(0, limit)
    .map((article) => ({ ...article, source_key: getSourceKey(article) }));
}

async function loadLearnedContext(env) {
  const learnedStore = createDocumentStore({
    documentKey: "social:learned_context",
    fallbackPath: env.SOCIAL_LEARNED_CONTEXT_PATH || "data/social-learned-context.json",
    initialValue: {},
    databaseUrl: env.DATABASE_URL || ""
  });
  return learnedStore.read();
}

function scoreCandidate(article, { recentTopics, winners, now }) {
  const reasons = [];
  let score = 0;
  const ageHours = Math.max(0, (new Date(now).getTime() - Date.parse(article.updated_at || article.published_at || 0)) / 3600000);
  if (ageHours <= 12) { score += 34; reasons.push("moi-cap-nhat"); }
  else if (ageHours <= 48) { score += 22; reasons.push("con-moi"); }
  else if (ageHours <= 168) { score += 8; }
  if (article.verification_state === "verified") { score += 24; reasons.push("da-xac-minh"); }
  else if (article.verification_state === "emerging") { score += 10; }
  if (article.hero_image?.kind === "source" || article.image?.src || article.image_url) { score += 14; reasons.push("co-anh-nguon"); }
  const quality = Math.max(0, Math.min(20, Number(article.quality_score || 0) / 5));
  if (quality) { score += quality; reasons.push("chat-luong-bien-tap"); }
  const topic = topicKey(article.topic || article.topic_label || article.title);
  if (winners.has(topic)) { score += 7; reasons.push("chu-de-da-hieu-qua"); }
  if (recentTopics.has(topic)) { score -= 20; reasons.push("tranh-lap-chu-de"); }
  return { ...article, candidate_score: Math.round(score), candidate_reasons: reasons };
}

function topicKey(value) {
  return String(value || "").trim().toLocaleLowerCase("vi");
}

function getSourceKey(article) {
  return String(article?.href || article?.url || article?.id || article?.slug || article?.title || "").trim();
}

function buildArticleNotes(article) {
  const sections = Array.isArray(article.sections) ? article.sections.map((section) => `${section.heading || ""}: ${section.body || ""}`).join("\n") : "";
  return [article.summary, article.dek, sections].filter(Boolean).join("\n").slice(0, 9000);
}

async function sendTelegramReport(result, env, fetchImpl) {
  if (!Array.isArray(result.published) || result.published.length === 0) {
    console.log("No successfully published Facebook posts; Telegram notification skipped.");
    return;
  }
  const token = String(env.TELEGRAM_NEWSROOM_BOT_TOKEN || "").trim();
  const chatIds = String(env.TELEGRAM_NEWSROOM_REPORT_CHAT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!token || !chatIds.length) return;
  const informationCount = result.published.filter((item) => item.post_type === "information").length;
  const aiSelectedCount = result.published.filter((item) => item.post_type === "ai_selected").length;
  const productCount = result.published.filter((item) => item.post_type === "product_promotion").length;
  const lines = [`Social Autopilot: đã đăng ${result.published.length}/${result.selected} bài (${informationCount} thông tin, ${aiSelectedCount} AI tự chọn, ${productCount} sản phẩm).`];
  lines.push(...result.published.map((item) => `✅ ${item.title} [${item.post_type}, ${item.generation_mode}, score ${item.candidate_score}${item.first_comment_status === "failed" ? ", comment pending" : ""}]\n${item.facebook_url}`));
  for (const chatId of chatIds) {
    await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n\n"), disable_web_page_preview: true })
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSocialAutopilot().then((result) => {
    console.log(JSON.stringify({ skipped: result.skipped, selected: result.selected, published: result.published.length, failures: result.failures?.length || 0 }));
  }).catch((error) => {
    console.error(`[social-autopilot] ${error.message || error}`);
    process.exitCode = 1;
  });
}
