import assert from "node:assert/strict";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { createPostContent, getFacebookPostDetails, getRandomTechImage, postToFacebook, safePostToFacebook, sanitizeSocialText } from "../src/social-engine.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { executeSocialCommand, handleSocialCallback } from "../src/social-bot-handlers.mjs";
import { getDailyQuota, isFacebookEligibleProduct, runSocialAutopilot, selectCandidates, validateFacebookCaption } from "../scripts/social-autopilot.mjs";
import { callGeminiJson } from "../src/ai-gateway.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempPath = path.join(os.tmpdir(), `patrick-social-${Date.now()}.json`);
try {
  const post = generateOfflinePost({ topic: "AI agent", pillar: "ai_news" });
  const captionLines = post.caption.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  assert.ok(captionLines[0].length <= 120);
  assert.match(captionLines[0], /^AI agent$/);
  assert.ok(captionLines.indexOf("🌟 PATRICK TECH CO. | CÔNG NGHỆ DỄ HIỂU, GIÁ TRỊ RÕ RÀNG") > 0);
  assert.match(post.caption, /🌟 PATRICK TECH CO./);
  assert.match(post.caption, /Công nghệ dễ tiếp cận hơn/);
  assert.match(post.caption, /⚡/);
  assert.match(post.caption, /📌/);
  assert.match(post.caption, /💡/);
  assert.match(post.caption, /PATRICK TECH CO\./);
  assert.match(post.caption, /patricktechmedia\.com/);
  assert.match(post.caption, /patricktechmedia\.store/);
  assert.match(post.first_comment, /bảo hành 1-1/);
  assert.match(post.caption, /Chia sẻ trải nghiệm/);
  assert.doesNotMatch(post.caption, /\*\*/);
  const cursorPost = generateOfflinePost({ topic: "Cursor Composer và VS Code", pillar: "product_offer" });
  assert.match(cursorPost.caption, /Composer và chỉnh sửa đa tệp/);
  assert.match(cursorPost.caption, /Tab Autocomplete/);
  assert.doesNotMatch(cursorPost.caption, /giảm 60%|không giới hạn request/);
  const claudePost = generateOfflinePost({ topic: "Claude Sonnet cho refactor", pillar: "ai_news" });
  assert.match(claudePost.caption, /Artifacts/);
  const deepSeekPost = generateOfflinePost({ topic: "DeepSeek API key", pillar: "product_offer" });
  assert.match(deepSeekPost.caption, /tương thích OpenAI/);
  const genericPost = generateOfflinePost({ topic: "Tối ưu quy trình số", pillar: "workflow_tips" });
  assert.match(genericPost.caption, /Tự động hóa phần việc lặp lại/);
  assert.doesNotMatch(genericPost.caption, /Làm rõ lợi ích|Cân nhắc chi phí|Thử ở quy mô nhỏ/);
  assert.doesNotMatch(sanitizeSocialText("Đảm bảo 100% và không rủi ro"), /Đảm bảo 100%|không rủi ro/);
  assert.equal(isFacebookEligibleProduct({ catalogCategory: "ai", title: "GPT Plus", description: "Shared GPT Plus account, email + password" }), false);
  assert.equal(isFacebookEligibleProduct({ catalogCategory: "ai", title: "API usage guide", description: "Hướng dẫn dùng API chính thức, không cung cấp quyền truy cập tài khoản" }), true);
  assert.throws(() => validateFacebookCaption({ postType: "product_promotion", caption: "Giới thiệu sản phẩm: lợi nhuận chắc chắn và không rủi ro." }), /quarantined/);
  assert.throws(() => validateFacebookCaption({ postType: "product_promotion", caption: "Một sản phẩm công nghệ với thông tin tham khảo." }), /commercial disclosure/);
  assert.equal(validateFacebookCaption({ postType: "product_promotion", caption: "📣 Bài viết giới thiệu sản phẩm của Patrick Tech Co. Thông tin được tham khảo từ catalog tại thời điểm đăng." }), true);
  const content = await createPostContent({ topic: "Offline", provider: "offline" });
  assert.ok(content.caption && content.first_comment);
  const originalDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  try {
    process.env.DEEPSEEK_API_KEY = "deepseek-failing-key";
    const gracefulFallback = await createPostContent({
      provider: "gemini",
      apiKey: "gemini-failing-key",
      topic: "Công cụ AI cho công việc",
      pillar: "ai_news",
      notes: "Dữ liệu kiểm thử đã xác minh",
      fetchImpl: async (url) => url.includes("generativelanguage.googleapis.com")
        ? new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 })
        : new Response(JSON.stringify({ error: { message: "insufficient balance" } }), { status: 402 })
    });
    assert.equal(gracefulFallback.generation_mode, "approved_fallback");
    assert.doesNotMatch(gracefulFallback.caption, /Nội dung tạo từ Template dự phòng/);
    assert.equal(gracefulFallback.fallback_note, "(Nội dung tạo từ Template dự phòng do API đang quá tải quota)");
    const fallbackLines = gracefulFallback.caption.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    assert.ok(fallbackLines.indexOf("🌟 PATRICK TECH CO. | CÔNG NGHỆ DỄ HIỂU, GIÁ TRỊ RÕ RÀNG") > 0);
    assert.match(gracefulFallback.caption, /⚡/);
    assert.match(gracefulFallback.caption, /📌/);
    assert.match(gracefulFallback.caption, /💡/);
    assert.match(gracefulFallback.caption, /patricktechmedia\.store/);
  } finally {
    if (originalDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = originalDeepSeekKey;
  }
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
  assert.match(geminiRequest.url, /gemini-3-flash-preview:generateContent/);
  assert.equal(geminiRequest.body.generationConfig.temperature, 0.7);
  assert.equal(geminiRequest.body.generationConfig.maxOutputTokens, 1500);
  assert.equal(geminiRequest.body.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /🌟 PATRICK TECH CO./);
  const socialPrompt = geminiRequest.body.contents[0].parts[0].text;
  assert.match(socialPrompt, /Dòng đầu tiên là Hook/);
  assert.match(socialPrompt, /Ngay sau Hook là Header/);
  assert.ok(socialPrompt.indexOf("Dòng đầu tiên là Hook") < socialPrompt.indexOf("Ngay sau Hook là Header"));
  assert.match(socialPrompt, /tối đa 120 ký tự/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /⚡, 📌, 💡/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /bảo hành/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /ai-phone/);
  assert.equal(geminiContent.caption, "Bài có dấu");
  let deepSeekRequest = null;
  const deepSeekContent = await callGeminiJson({
    apiKey: "gemini-test-key",
    env: { DEEPSEEK_API_KEY: "deepseek-test-key" },
    payload: { contents: [{ parts: [{ text: "Viết JSON về kiểm thử" }] }] },
    fallbackModels: ["gemini-test-model"],
    fetchImpl: async (url, options) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
      }
      deepSeekRequest = { url, body: JSON.parse(options.body), authorization: options.headers.Authorization };
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ caption: "Bài do DeepSeek", first_comment: "Liên hệ Patrick Tech" }) } }] }), { status: 200 });
    },
    label: "Social failover test"
  });
  assert.equal(deepSeekContent.candidates[0].content.parts[0].text, JSON.stringify({ caption: "Bài do DeepSeek", first_comment: "Liên hệ Patrick Tech" }));
  assert.equal(deepSeekRequest.url, "https://api.deepseek.com/chat/completions");
  assert.equal(deepSeekRequest.body.model, "deepseek-chat");
  assert.deepEqual(deepSeekRequest.body.response_format, { type: "json_object" });
  assert.equal(deepSeekRequest.authorization, "Bearer deepseek-test-key");
  let resourceExhaustedFallbackCalled = false;
  const resourceExhaustedContent = await callGeminiJson({
    apiKey: "gemini-test-key",
    env: { DEEPSEEK_API_KEY: "deepseek-test-key" },
    payload: { contents: [{ parts: [{ text: "Viết JSON khi hết hạn mức" }] }] },
    fallbackModels: ["gemini-test-model"],
    fetchImpl: async (url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response(JSON.stringify({
          error: { status: "RESOURCE_EXHAUSTED", message: "quota exhausted" }
        }), { status: 400 });
      }
      resourceExhaustedFallbackCalled = true;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ caption: "Bài dự phòng quota", first_comment: "Liên hệ Patrick Tech" }) } }]
      }), { status: 200 });
    },
    label: "Resource exhausted fallback test"
  });
  assert.equal(resourceExhaustedFallbackCalled, true);
  assert.equal(resourceExhaustedContent.provider, "deepseek");
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
    assert.match(fallbackUrls[0], /gemini-3-flash-preview:generateContent/);

    const missingProviderFallback = await createPostContent({
      provider: "gemini",
      apiKey: "request-key",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 401 })
    });
    assert.equal(missingProviderFallback.generation_mode, "approved_fallback");
    assert.doesNotMatch(missingProviderFallback.caption, /Template dự phòng/);
    assert.equal(missingProviderFallback.fallback_note, "(Nội dung tạo từ Template dự phòng do API đang quá tải quota)");
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
  assert.match(callback.text, /ĐÃ ĐĂNG LÊN FANPAGE THÀNH CÔNG/);
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
  assert.equal((await publishThenCommentFailStore.getPosts())[0].comment_status, "retrying");
  fs.rmSync(callbackPath, { force: true });
  fs.rmSync(commentFailurePath, { force: true });
  console.log("social-autopost.test.mjs passed");
} finally { fs.rmSync(tempPath, { force: true }); }
