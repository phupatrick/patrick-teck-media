import assert from "node:assert/strict";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { createPostContent, getRandomTechImage } from "../src/social-engine.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { executeSocialCommand, handleSocialCallback } from "../src/social-bot-handlers.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempPath = path.join(os.tmpdir(), `patrick-social-${Date.now()}.json`);
try {
  const post = generateOfflinePost({ topic: "AI agent", pillar: "ai_news" });
  assert.match(post.caption, /AI AGENT/);
  const content = await createPostContent({ topic: "Offline", provider: "offline" });
  assert.ok(content.caption && content.first_comment);
  assert.match(getRandomTechImage({ random: () => 0 }), /^https:\/\/images\.unsplash\.com\//);
  let geminiRequest = null;
  const geminiContent = await createPostContent({
    provider: "gemini",
    apiKey: "test-key",
    topic: "Điện thoại AI",
    notes: "Thông số đã xác minh",
    fetchImpl: async (url, options) => {
      geminiRequest = { url, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ caption: "Bài có dấu", first_comment: "Liên hệ 0933 684 560" }) }] } }] }), { status: 200 });
    }
  });
  assert.match(geminiRequest.url, /gemini-2\.5-flash:generateContent/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /phân tích sâu 3 điểm/);
  assert.match(geminiRequest.body.contents[0].parts[0].text, /bảo hành/);
  assert.equal(geminiContent.caption, "Bài có dấu");
  const originalSocialKey = process.env.SOCIAL_AI_API_KEY;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  try {
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
    assert.match(envRequestUrl, /key=env-key/);

    await assert.rejects(
      createPostContent({
        provider: "gemini",
        apiKey: "request-key",
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 401 })
      }),
      /Gemini API failed \(HTTP 401\): API key not valid/
    );
  } finally {
    if (originalSocialKey === undefined) delete process.env.SOCIAL_AI_API_KEY;
    else process.env.SOCIAL_AI_API_KEY = originalSocialKey;
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
  await callbackStore.update((state) => { state.posts.push({ id: "post-1", caption: "Bài kiểm thử", first_comment: "", image_url: "https://images.unsplash.com/test", status: "pending_approval" }); return state; });
  const callback = await handleSocialCallback("social:approve:post-1", {
    isAdmin: true,
    store: callbackStore,
    defaults: { fb_page_id: "page", fb_page_token: "token" },
    fetch: async () => new Response(JSON.stringify({ id: "123_456" }), { status: 200 })
  });
  assert.match(callback.text, /ĐÃ ĐĂNG LÊN FANPAGE THÀNH CÔNG/);
  assert.deepEqual(callback.replyMarkup, { inline_keyboard: [] });
  fs.rmSync(callbackPath, { force: true });
  console.log("social-autopost.test.mjs passed");
} finally { fs.rmSync(tempPath, { force: true }); }
