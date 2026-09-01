import assert from "node:assert/strict";
import { generateOfflinePost } from "../src/social-templates.mjs";
import { createPostContent } from "../src/social-engine.mjs";
import { createSocialStore } from "../src/social-store.mjs";
import { executeSocialCommand } from "../src/social-bot-handlers.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempPath = path.join(os.tmpdir(), `patrick-social-${Date.now()}.json`);
try {
  const post = generateOfflinePost({ topic: "AI agent", pillar: "ai_news" });
  assert.match(post.caption, /AI AGENT/);
  const content = await createPostContent({ topic: "Offline", provider: "offline" });
  assert.ok(content.caption && content.first_comment);
  const store = createSocialStore({ statePath: tempPath });
  const response = await executeSocialCommand("/social_post Kiem tra he thong", { isAdmin: true, store, defaults: {} });
  assert.match(response.text, /cho duyet/);
  assert.equal((await store.getPosts()).length, 1);
  const queue = await executeSocialCommand("/social_queue", { isAdmin: true, store, defaults: {} });
  assert.match(queue.text, /Kiem tra he thong/);
  console.log("social-autopost.test.mjs passed");
} finally { fs.rmSync(tempPath, { force: true }); }
