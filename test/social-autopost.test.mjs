import assert from "node:assert/strict";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { createPostContent, getFacebookPostDetails, getRandomTechImage, postToFacebook, safePostToFacebook, sanitizeSocialText } from "../src/social-engine.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { executeSocialCommand, handleSocialCallback } from "../src/social-bot-handlers.mjs";
import { getDailyQuota, runSocialAutopilot, selectCandidates } from "../scripts/social-autopilot.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempPath = path.join(os.tmpdir(), `patrick-social-${Date.now()}.json`);
try {
  const post = generateOfflinePost({ topic: "AI agent", pillar: "ai_news" });
  assert.match(post.caption, /AI agent: Điều gì đáng chú ý\?/);
  assert.match(post.caption, /PATRICK TECH CO\./);
  assert.match(post.caption, /patricktechmedia\.com/);
  assert.match(post.caption, /patricktechmedia\.store/);
  assert.match(post.caption, /Chia sẻ trải nghiệm/);
  assert.doesNotMatch(post.caption, /\*\*/);
  assert.doesNotMatch(sanitizeSocialText("Đảm bảo 100% và không rủi ro"), /Đảm bảo 100%|không rủi ro/);
  const content = await createPostContent({ topic: "Offline", provider: "offline" });
  assert.ok(content.caption && content.first_comment);
  assert.match(getRandomTechImage({ random: () => 0 }), /^https:\/\/images\.unsplash\.com\//);
  const candidates = selectCandidates([
    { id: "repeated", title: "Tin AI cũ", language: "vi", topic: "ai", updated_at: "2026-08-30T12:00:00.000Z", verification_state: "verified", image_url: "https://images.example.com/old.jpg" },
    { id: "fresh", title: "Tin hạ tầng mới", language: "vi", topic: "infrastructure", updated_at: "2026-09-02T06:00:00.000Z", verification_state: "verified", image_url: "https://images.example.com/new.jpg", quality_score: 90 }
  ], new Set(), 2, { recentPosts: [{ status: "published", topic: "ai", published_at: "2026-09-01T12:00:00.000Z" }], now: new Date("2026-09-02T07:00:00.000Z") });
  assert.equal(candidates[0].id, "fresh");
  assert.ok(candidates[0].candidate_score > candidates.at(-1).candidate_score);
  const duplicateCandidates = selectCandidates([
    { href: "https://example.com/same", title: "Bài trùng A", language: "vi" },
    { href: "https://example.com/same", title: "Bài trùng B", language: "vi" }
  ], new Set(), 5);
  assert.equal(duplicateCandidates.length, 1);
  const quota = getDailyQuota([
    { status: "published", post_type: "information", published_at: "2026-09-02T00:30:00.000Z" },
    { status: "published", post_type: "product_promotion", published_at: "2026-09-01T17:30:00.000Z" },
    { status: "pending", post_type: "information", published_at: "2026-09-02T01:00:00.000Z" }
  ], { now: new Date("2026-09-02T07:00:00.000Z"), limits: { information: 5, ai_selected: 2, product_promotion: 3 } });
  assert.deepEqual(quota, { information: 1, ai_selected: 0, product_promotion: 1, remaining: { information: 4, ai_selected: 2, product_promotion: 2 } });
  const publishUrls = [];
  const fallbackPostId = await safePostToFacebook({ pageId: "page", pageToken: "token", caption: "Fallback", imageUrl: "https://images.example.com/broken.jpg", fetchImpl: async (url) => {
    publishUrls.push(url);
    return publishUrls.length === 1
      ? new Response(JSON.stringify({ error: { message: "image unavailable" } }), { status: 400 })
      : new Response(JSON.stringify({ id: "text-123" }), { status: 200 });
  } });
  assert.equal(fallbackPostId, "text-123");
  assert.match(publishUrls[0], /\/photos$/);
  assert.match(publishUrls[1], /\/feed$/);
  const pagePostId = await postToFacebook({ pageId: "page", pageToken: "token", caption: "Published photo", imageUrl: "https://images.example.com/photo.jpg", fetchImpl: async () => new Response(JSON.stringify({ id: "photo-123", post_id: "page_456" }), { status: 200 }) });
  assert.equal(pagePostId, "page_456");
  const verifiedDetails = await getFacebookPostDetails({ pageId: "page", postId: "page_456", pageToken: "token", fetchImpl: async () => new Response(JSON.stringify({ id: "page_456", is_published: true, is_hidden: false, permalink_url: "https://facebook.example/posts/page_456" }), { status: 200 }) });
  assert.equal(verifiedDetails.verification_status, "verified");
  const hiddenDetails = await getFacebookPostDetails({ pageId: "page", postId: "page_456", pageToken: "token", fetchImpl: async () => new Response(JSON.stringify({ id: "page_456", is_published: true, is_hidden: true, permalink_url: "https://facebook.example/posts/page_456" }), { status: 200 }) });
  assert.equal(hiddenDetails.is_hidden, true);
  await assert.rejects(postToFacebook({ pageId: "page", pageToken: "token", caption: "Timeout", timeoutMs: 5, fetchImpl: () => new Promise(() => {}) }), /Request timeout after 5ms/);
  let geminiRequest = null;
  const geminiContent = await createPostContent({
    provider: "gemini",
    apiKey: "test-key",
    topic: "Điện thoại AI",
    notes: "Thông số đã xác minh",
    sourceArticleUrl: "https://patricktechmedia.com/vi/news/ai-phone",
    fetchImpl: async (url, options) => {
      geminiRequest = { url, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ caption: "Bài có dấu", first_comment: "Liên hệ 0933 684 560" }) }] } }] }), { status: 200 });
    }
  });
  assert.match(geminiRequest.url, /gemini-1\.5-flash:generateContent/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /phân tích sâu 3 điểm/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /bảo hành/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /ai-phone/);
  assert.equal(geminiContent.caption, "Bài có dấu");
  let productPrompt = "";
  await createPostContent({
    provider: "gemini", apiKey: "test-key", topic: "Công cụ AI", pillar: "product_offer", postType: "product_promotion", notes: "Giá tham khảo 99.000 đồng; thời hạn 30 ngày",
    fetchImpl: async (url, options) => { productPrompt = JSON.parse(options.body).contents?.[0]?.parts?.[0]?.text || ""; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ caption: "Giới thiệu sản phẩm", first_comment: "" }) }] } }] }), { status: 200 }); }
  });
  assert.match(productPrompt, /mục đích thương mại/);
  assert.match(productPrompt, /giá\/thời hạn/);
  const originalSocialKey = process.env.SOCIAL_AI_API_KEY;
  const originalNewsroomKey = process.env.NEWSROOM_GEMINI_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  try {
    process.env.NEWSROOM_GEMINI_API_KEY = "newsroom-key";
    process.env.SOCIAL_AI_API_KEY = "env-key";
    delete process.env.GEMINI_API_KEY;
    let envRequestUrl = "";
    await createPostContent({
      provider: "gemini",
      topic: "Kiểm tra key môi trường",
      fetchImpl: async (url) => {
        envRequestUrl = url;
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ caption: "Bài từ env", first_comment: "" }) }] } }] }), { status: 200 });
      }
    });
    assert.match(envRequestUrl, /key=newsroom-key/);

    const fallbackUrls = [];
    await createPostContent({
      provider: "gemini",
      apiKey: "request-key",
      topic: "Model fallback",
      fetchImpl: async (url) => {
        fallbackUrls.push(url);
        if (fallbackUrls.length === 1) return new Response(JSON.stringify({ error: { message: "model is no longer available" } }), { status: 404 });
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ caption: "Bài dự phòng", first_comment: "" }) }] } }] }), { status: 200 });
      }
    });
    assert.match(fallbackUrls[0], /gemini-1\.5-flash:generateContent/);

    await assert.rejects(
      createPostContent({
        provider: "gemini",
        apiKey: "request-key",
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 401 })
      }),
      /Gemini API failed: .*HTTP 401: API key not valid/
    );
  } finally {
    if (originalSocialKey === undefined) delete process.env.SOCIAL_AI_API_KEY;
    else process.env.SOCIAL_AI_API_KEY = originalSocialKey;
    if (originalNewsroomKey === undefined) delete process.env.NEWSROOM_GEMINI_API_KEY;
    else process.env.NEWSROOM_GEMINI_API_KEY = originalNewsroomKey;
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalGeminiKey;
  }
  const store = createSocialStore({ statePath: tempPath });
  const response = await executeSocialCommand("/social_post Kiem tra he thong", { isAdmin: true, store, defaults: {} });
  assert.match(response.text, /cho duyet/);
  assert.equal((await store.getPosts()).length, 1);
  const queue = await executeSocialCommand("/social_queue", { isAdmin: true, store, defaults: {} });
  assert.match(queue.text, /Kiem tra he thong/);
  const callbackPath = path.join(os.tmpdir(), `patrick-social-callback-${Date.now()}.json`);
  const callbackStore = createSocialStore({ statePath: callbackPath });
  let callbackToast = "";
  await callbackStore.update((state) => { state.posts.push({ id: "post-1", caption: "Bài kiểm thử", first_comment: "", image_url: "https://images.unsplash.com/test", status: "pending_approval" }); return state; });
  const callback = await handleSocialCallback("social:approve:post-1", {
    isAdmin: true,
    store: callbackStore,
    defaults: { fb_page_id: "page", fb_page_token: "token" },
    fetch: async (url) => new Response(JSON.stringify(String(url).includes("123_456?fields=")
      ? { id: "123_456", is_published: true, is_hidden: false, permalink_url: "https://facebook.example/posts/123_456" }
      : { id: "123_456" }), { status: 200 }),
    answerCallbackQuery: (text) => { callbackToast = text; }
  });
  assert.match(callback.text, /META XÁC MINH CÔNG KHAI/);
  assert.match(callbackToast, /Đang xử lý/);
  assert.deepEqual(callback.replyMarkup, { inline_keyboard: [] });
  const commentFailurePath = path.join(os.tmpdir(), `patrick-social-comment-${Date.now()}.json`);
  const publishThenCommentFailStore = createSocialStore({ statePath: commentFailurePath });
  const autopilotResult = await runSocialAutopilot({
    env: {
      SOCIAL_AUTOPILOT_ENABLED: "1", FB_PAGE_ID: "page", FB_PAGE_ACCESS_TOKEN: "token",
      NEWSROOM_CONTENT_PATH: path.join(os.tmpdir(), `patrick-social-empty-${Date.now()}.json`),
      SOCIAL_STATE_PATH: commentFailurePath, SOCIAL_AUTOPILOT_ROTATE_TOPICS: "1", SOCIAL_INFORMATION_POSTS_PER_DAY: "1", SOCIAL_AI_SELECTED_POSTS_PER_DAY: "0", SOCIAL_PRODUCT_POSTS_PER_DAY: "0"
    },
    fetchImpl: async (url) => {
      if (url.includes("/feed")) return new Response(JSON.stringify({ id: "post-123" }), { status: 200 });
      if (url.includes("post-123?fields=")) return new Response(JSON.stringify({ id: "post-123", is_published: true, is_hidden: false, permalink_url: "https://facebook.example/posts/post-123" }), { status: 200 });
      if (url.includes("/comments")) return new Response(JSON.stringify({ error: { message: "comment unavailable" } }), { status: 500 });
      return new Response(JSON.stringify({ error: { message: "no AI" } }), { status: 500 });
    },
    logger: { warn() {} }
  });
  assert.equal(autopilotResult.published.length, 1);
  assert.equal(autopilotResult.failures.length, 0);
  assert.equal((await publishThenCommentFailStore.getPosts())[0].first_comment_status, "failed");
  fs.rmSync(callbackPath, { force: true });
  fs.rmSync(commentFailurePath, { force: true });
  console.log("social-autopost.test.mjs passed");
} finally { fs.rmSync(tempPath, { force: true }); }
