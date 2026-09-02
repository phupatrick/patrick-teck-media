import assert from "node:assert/strict";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { createPostContent, getRandomTechImage, postToFacebook, safePostToFacebook, sanitizeSocialText } from "../src/social-engine.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { executeSocialCommand, handleSocialCallback } from "../src/social-bot-handlers.mjs";
import { selectCandidates } from "../scripts/social-autopilot.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempPath = path.join(os.tmpdir(), `patrick-social-${Date.now()}.json`);
try {
  const post = generateOfflinePost({ topic: "AI agent", pillar: "ai_news" });
  assert.match(post.caption, /AI AGENT/);
  assert.match(post.caption, /PATRICK TECH CO\./);
  assert.match(post.caption, /patricktechmedia\.com/);
  assert.match(post.caption, /patricktechmedia\.store/);
  assert.match(post.caption, /Chia sẻ trải nghiệm/);
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
    fetch: async () => new Response(JSON.stringify({ id: "123_456" }), { status: 200 }),
    answerCallbackQuery: (text) => { callbackToast = text; }
  });
  assert.match(callback.text, /ĐÃ ĐĂNG LÊN FANPAGE THÀNH CÔNG/);
  assert.match(callbackToast, /Đang xử lý/);
  assert.deepEqual(callback.replyMarkup, { inline_keyboard: [] });
  fs.rmSync(callbackPath, { force: true });
  console.log("social-autopost.test.mjs passed");
} finally { fs.rmSync(tempPath, { force: true }); }
