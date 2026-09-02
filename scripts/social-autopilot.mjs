import { loadNewsroomState } from "../src/newsroom-service.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { createDocumentStore } from "../src/document-store.mjs";
import { createPostContent, getRandomTechImage, postFirstComment, safePostToFacebook } from "../src/social-engine.mjs";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { pathToFileURL } from "node:url";

const DEFAULT_CONTENT_PATH = "data/newsroom-content.json";
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
  const limit = Math.max(1, Math.min(20, Number(env.SOCIAL_AUTOPILOT_LIMIT || 1)));
  const learnedContext = await loadLearnedContext(env);
  const articles = selectCandidates(newsroom.articles, publishedKeys, limit, { learnedContext, recentPosts: socialState.posts });
  const candidates = articles.length ? articles : (String(env.SOCIAL_AUTOPILOT_ROTATE_TOPICS || "") === "1" ? DEFAULT_TOPICS.map((topic) => ({ title: topic, summary: "Chủ đề tư vấn công nghệ thực tế từ Patrick Tech Co.", source_key: `topic:${topic}` })).slice(0, limit) : []);
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
      if (content.first_comment) await postFirstComment({ postId, pageToken, commentText: content.first_comment, fetchImpl });
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
        generation_mode: content.generation_mode || "offline"
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
        generation_mode: content.generation_mode || "offline"
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
    return { ...generateOfflinePost({ topic: article.title, pillar: "ai_news", notes }), generation_mode: "approved_fallback" };
  }
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
  const token = String(env.TELEGRAM_NEWSROOM_BOT_TOKEN || "").trim();
  const chatIds = String(env.TELEGRAM_NEWSROOM_REPORT_CHAT_IDS || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (!token || !chatIds.length) return;
  const lines = [`Social Autopilot: đã đăng ${result.published.length}/${result.selected} bài.`];
  lines.push(...result.published.map((item) => `✅ ${item.title} [${item.generation_mode}, score ${item.candidate_score}]\n${item.facebook_url}`));
  lines.push(...result.failures.map((item) => `❌ ${item.title}: ${item.error}`));
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
