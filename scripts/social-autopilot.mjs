import { loadNewsroomState } from "../src/newsroom-service.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { createDocumentStore } from "../src/document-store.mjs";
import { createPostContent, getRandomTechImage, postFirstCommentWithRetry, safePostToFacebook } from "../src/social-engine.mjs";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { getScheduledPostType, isProductCooldownComplete, selectScheduledCandidates } from "../src/social-scheduler.mjs";
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

export async function runSocialAutopilot({ env = process.env, fetchImpl = fetch, logger = console, now = new Date() } = {}) {
  if (String(env.SOCIAL_AUTOPILOT_ENABLED || "").trim() !== "1") {
    return { skipped: true, reason: "SOCIAL_AUTOPILOT_ENABLED is not 1", published: [] };
  }
  const lease = await acquireAutopilotLease(env, now);
  if (!lease.acquired) return { skipped: true, reason: "another social autopilot cycle is active", published: [] };
  try {

  const pageId = String(env.FB_PAGE_ID || "").trim();
  const pageToken = String(env.FB_PAGE_ACCESS_TOKEN || "").trim();
  if (!pageId || !pageToken) throw new Error("FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN are required.");

  const store = createSocialStore({
    statePath: env.SOCIAL_STATE_PATH || "data/social-posts.json",
    databaseUrl: env.DATABASE_URL || ""
  });
  const socialState = await store.getState();
  const retriedComments = await retryFailedFirstComments({ store, posts: socialState.posts, pageToken, fetchImpl, logger, now, env });
  const publishedKeys = new Set(socialState.posts.filter((post) => post.status === "published").map((post) => post.source_key).filter(Boolean));
  const newsroom = await loadNewsroomState({ contentPath: env.NEWSROOM_CONTENT_PATH || DEFAULT_CONTENT_PATH, databaseUrl: env.DATABASE_URL || "" });
  const informationLimit = normalizeDailyLimit(env.SOCIAL_INFORMATION_POSTS_PER_DAY, DEFAULT_INFORMATION_POSTS_PER_DAY);
  const productLimit = normalizeDailyLimit(env.SOCIAL_PRODUCT_POSTS_PER_DAY, DEFAULT_PRODUCT_POSTS_PER_DAY);
  const aiSelectedLimit = normalizeDailyLimit(env.SOCIAL_AI_SELECTED_POSTS_PER_DAY, DEFAULT_AI_SELECTED_POSTS_PER_DAY);
  const quota = getDailyQuota(socialState.posts, { now, timeZone: env.SOCIAL_TIMEZONE || "Asia/Ho_Chi_Minh", limits: { information: informationLimit, product_promotion: productLimit, ai_selected: aiSelectedLimit } });
  const remainingInformation = quota.remaining.information;
  const remainingAiSelected = quota.remaining.ai_selected;
  const remainingProduct = quota.remaining.product_promotion;
  const learnedContext = await loadLearnedContext(env);
  const articles = selectCandidates(newsroom.articles, publishedKeys, remainingInformation + remainingAiSelected, { learnedContext, recentPosts: socialState.posts });
  const informationCandidates = articles.length
    ? articles.slice(0, remainingInformation)
    : (String(env.SOCIAL_AUTOPILOT_ROTATE_TOPICS || "") === "1" ? DEFAULT_TOPICS.map((topic) => ({ title: topic, summary: "Chủ đề tư vấn công nghệ thực tế từ Patrick Tech Co.", source_key: `topic:${topic}`, pillar: "workflow_tips", post_type: "information" })).slice(0, remainingInformation) : []);
  const aiSelectedCandidates = articles.slice(remainingInformation, remainingInformation + remainingAiSelected).map((article) => ({
    ...article,
    pillar: article.pillar || "ai_news",
    post_type: "ai_selected"
  }));
  const productCandidates = await selectProductCandidates({ env, fetchImpl, publishedKeys, recentPosts: socialState.posts, limit: remainingProduct, logger, now });
  const allCandidates = [...informationCandidates.map((article) => ({ ...article, pillar: article.pillar || "ai_news", post_type: "information" })), ...aiSelectedCandidates, ...productCandidates];
  const scheduled = String(env.SOCIAL_AUTOPILOT_SCHEDULED || "").trim() === "1";
  const forced = String(env.SOCIAL_AUTOPILOT_FORCE || "").trim() === "1";
  const scheduledType = getScheduledPostType({ now, timeZone: env.SOCIAL_TIMEZONE || "Asia/Ho_Chi_Minh", force: forced });
  if (scheduled && !scheduledType && !forced) return { skipped: true, reason: "outside scheduled publishing slot", published: [], failures: [], retriedComments };
  const configuredLimit = scheduled && !forced ? 1 : normalizeDailyLimit(env.SOCIAL_AUTOPILOT_RUN_LIMIT || env.SOCIAL_AUTOPILOT_LIMIT, 1);
  const candidates = selectScheduledCandidates(allCandidates, scheduled && !forced ? scheduledType : "", configuredLimit);
  const published = [];
  const failures = [];

  for (const article of candidates) {
    const sourceKey = article.source_key || getSourceKey(article);
    try {
      const notes = buildArticleNotes(article);
      const content = await createAutopilotContent({ article, notes, env, fetchImpl, logger });
      const imageUrl = article.image?.src || article.image_url || getRandomTechImage();
      const facebookPost = await safePostToFacebook({
        pageId,
        pageToken,
        caption: content.caption,
        imageUrl,
        fetchImpl,
        returnDetails: true
      });
      const postId = facebookPost.id;
      console.log("====================================================");
      console.log("[FACEBOOK PUBLISHED SUCCESS]");
      console.log(`Post ID: ${postId}`);
      console.log(`Public permalink: ${facebookPost.permalink_url}`);
      console.log("====================================================");
      const publishedAt = now.toISOString();
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
        facebook_url: facebookPost.permalink_url,
        facebook_verification_status: facebookPost.verification_status,
        facebook_verification_error: facebookPost.verification_error || "",
        created_at: publishedAt,
        published_at: publishedAt,
        updated_at: publishedAt,
        autopilot: true,
        candidate_score: article.candidate_score || 0,
        candidate_reasons: article.candidate_reasons || [],
        generation_mode: content.generation_mode || "offline",
        post_type: article.post_type || "information",
        first_comment_status: content.first_comment ? "pending" : "not_requested",
        first_comment_error: "",
        first_comment_retry_count: 0
      };
      await store.update((draft) => {
        draft.posts.unshift(record);
        draft.updated_at = publishedAt;
        return draft;
      });
      let firstCommentStatus = "not_requested";
      let firstCommentError = "";
      if (content.first_comment) {
        try {
          await postFirstCommentWithRetry({
            postId,
            pageToken,
            commentText: content.first_comment,
            fetchImpl,
            delayMs: env.SOCIAL_FIRST_COMMENT_DELAY_MS || 3500,
            retries: 2,
            logger
          });
          firstCommentStatus = "published";
        } catch (error) {
          // The Facebook post is already live. Persist it and retry the comment separately later.
          firstCommentStatus = "failed";
          firstCommentError = error.message || String(error);
          logger.warn?.(`[social-autopilot] First comment failed for ${article.title}: ${firstCommentError}`);
        }
      }
      await store.update((draft) => {
        const target = draft.posts.find((item) => item.id === record.id);
        if (target) {
          target.first_comment_status = firstCommentStatus;
          target.first_comment_error = firstCommentError;
          target.first_comment_last_attempt_at = content.first_comment ? new Date().toISOString() : "";
          target.updated_at = new Date().toISOString();
        }
        draft.updated_at = new Date().toISOString();
        return draft;
      });
      published.push({
        title: article.title,
        facebook_url: facebookPost.permalink_url,
        facebook_verification_status: facebookPost.verification_status,
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

  const result = { skipped: false, selected: candidates.length, published, failures, retriedComments, scheduledType: scheduledType || "next-available" };
  await sendTelegramReport(result, env, fetchImpl);
  return result;
  } finally {
    await releaseAutopilotLease(lease);
  }
}

const activeLeases = new Map();

async function acquireAutopilotLease(env, now) {
  const key = "social-autopilot";
  const ttlMs = Math.max(30_000, Number(env.SOCIAL_AUTOPILOT_LOCK_TTL_MS || 20 * 60 * 1000));
  const activeUntil = activeLeases.get(key) || 0;
  if (activeUntil > now.getTime()) return { acquired: false };
  activeLeases.set(key, now.getTime() + ttlMs);
  return { acquired: true, key };
}

async function releaseAutopilotLease(lease) {
  if (lease?.key) activeLeases.delete(lease.key);
}

function selectRunCandidates(candidates, configuredLimit) {
  const limit = normalizeDailyLimit(configuredLimit, 10);
  return (Array.isArray(candidates) ? candidates : []).slice(0, limit);
}

async function createAutopilotContent({ article, notes, env, fetchImpl, logger }) {
  try {
    const content = await createPostContent({
      provider: env.SOCIAL_AI_PROVIDER || "offline",
      apiKey: env.NEWSROOM_GEMINI_API_KEY || env.SOCIAL_AI_API_KEY || env.GEMINI_API_KEY || "",
      topic: article.title,
      pillar: article.pillar || "ai_news",
      postType: article.post_type || "information",
      notes,
      sourceArticleUrl: article.href || article.url || "",
      fetchImpl
    });
    return { ...content, generation_mode: "gemini" };
  } catch (error) {
    const message = error.message || String(error);
    logger.warn?.(`[social-autopilot] AI generation failed; using approved fallback template: ${message}`);
    return { ...generateOfflinePost({ topic: article.title, pillar: article.pillar || "ai_news", notes, customCTA: article.custom_cta || "", isProductPromotion: article.post_type === "product_promotion" }), generation_mode: "approved_fallback" };
  }
}

async function selectProductCandidates({ env, fetchImpl, publishedKeys, recentPosts, limit, logger, now }) {
  if (limit < 1) return [];
  try {
    const response = await fetchImpl(String(env.SOCIAL_PRODUCT_CATALOG_URL || DEFAULT_STORE_CATALOG_URL), {
      headers: { accept: "application/json", "user-agent": "patrick-tech-media-social-autopilot" },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
    const payload = await response.json();
    return (Array.isArray(payload?.products) ? payload.products : [])
      .filter(isFacebookEligibleProduct)
      .filter((product) => !publishedKeys.has(`product:${product.id}`))
      .filter((product) => isProductCooldownComplete(recentPosts, `product:${product.id}`, { now, cooldownHours: env.SOCIAL_PRODUCT_COOLDOWN_HOURS || 72 }))
      .map(toProductCandidate)
      .slice(0, limit);
  } catch (error) {
    logger.warn?.(`[social-autopilot] Product catalog was unavailable; product promotions skipped: ${error.message || error}`);
    return [];
  }
}

async function retryFailedFirstComments({ store, posts, pageToken, fetchImpl, logger, now, env }) {
  const retryDelayMs = Math.max(0, Number(env.SOCIAL_FIRST_COMMENT_RETRY_DELAY_MS || 30000));
  const retryLimit = Math.max(0, Number(env.SOCIAL_FIRST_COMMENT_RETRY_LIMIT || 3));
  const due = (Array.isArray(posts) ? posts : []).filter((post) => {
    if (post?.status !== "published" || post?.first_comment_status !== "failed" || !post?.fb_post_id || !post?.first_comment) return false;
    if (Number(post.first_comment_retry_count || 0) >= retryLimit) return false;
    const lastAttempt = Date.parse(post.first_comment_last_attempt_at || post.updated_at || post.published_at || 0);
    return !Number.isFinite(lastAttempt) || now.getTime() - lastAttempt >= retryDelayMs;
  }).slice(0, 3);
  const retried = [];
  for (const post of due) {
    try {
      await postFirstCommentWithRetry({ postId: post.fb_post_id, pageToken, commentText: post.first_comment, fetchImpl, delayMs: 0, retries: 2, logger });
      await store.update((draft) => {
        const target = draft.posts.find((item) => item.id === post.id);
        if (target) { target.first_comment_status = "published"; target.first_comment_error = ""; target.first_comment_last_attempt_at = now.toISOString(); target.updated_at = now.toISOString(); }
        return draft;
      });
      retried.push({ id: post.id, status: "published" });
    } catch (error) {
      const message = error.message || String(error);
      logger.warn?.(`[social-autopilot] First comment retry failed for ${post.topic}: ${message}`);
      await store.update((draft) => {
        const target = draft.posts.find((item) => item.id === post.id);
        if (target) { target.first_comment_retry_count = Number(target.first_comment_retry_count || 0) + 1; target.first_comment_last_attempt_at = now.toISOString(); target.first_comment_error = message; target.updated_at = now.toISOString(); }
        return draft;
      });
      retried.push({ id: post.id, status: "failed" });
    }
  }
  return retried;
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

  const seenKeys = new Set();
  return (Array.isArray(articles) ? articles : [])
    .filter((article) => article && article.title && !publishedKeys.has(getSourceKey(article)))
    .filter((article) => article.language === "vi" || !article.language)
    .filter((article) => {
      const key = getSourceKey(article);
      if (!key || seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    })
    .map((article) => scoreCandidate(article, { recentTopics, winners, now }))
    .sort((left, right) => right.candidate_score - left.candidate_score || Date.parse(right.updated_at || right.published_at || 0) - Date.parse(left.updated_at || left.published_at || 0))
    .slice(0, limit)
    .map((article) => ({ ...article, source_key: getSourceKey(article) }));
}

export function getDailyQuota(posts, { now = new Date(), timeZone = "Asia/Ho_Chi_Minh", limits = {} } = {}) {
  const today = calendarDayKey(now, timeZone);
  const quota = { information: 0, ai_selected: 0, product_promotion: 0 };
  for (const post of Array.isArray(posts) ? posts : []) {
    if (post?.status !== "published" || calendarDayKey(post.published_at || post.created_at, timeZone) !== today) continue;
    const type = post.post_type === "product_promotion" || post.post_type === "ai_selected" ? post.post_type : "information";
    quota[type] += 1;
  }
  return {
    ...quota,
    remaining: {
      information: Math.max(0, Number(limits.information || 0) - quota.information),
      ai_selected: Math.max(0, Number(limits.ai_selected || 0) - quota.ai_selected),
      product_promotion: Math.max(0, Number(limits.product_promotion || 0) - quota.product_promotion)
    }
  };
}

function calendarDayKey(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
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
