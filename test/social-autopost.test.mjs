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
