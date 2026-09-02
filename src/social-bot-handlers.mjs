import { CONTENT_PILLARS } from "./social-templates.mjs";
import { createPostContent, getRandomTechImage, postFirstComment, safePostToFacebook } from "./social-engine.mjs";

const processingLocks = new Set();

export async function executeSocialCommand(rawText, context = {}) {
  if (!context.isAdmin) throw new Error("Chi admin moi duoc quan ly Facebook.");
  const [command, ...parts] = String(rawText || "").trim().split(/\s+/);
  const args = parts.join(" ").trim();
  if (command === "/social_queue") return { text: await formatQueue(context.store) };
  if (command === "/social_post") return createPendingPost(args, context);
  if (command === "/social_ai") return updateProvider(args, context);
  return null;
}

export async function handleSocialCallback(callbackData, context = {}) {
  if (!String(callbackData || "").startsWith("social:")) return null;
  if (!context.isAdmin) throw new Error("Chi admin moi duoc duyet bai Facebook.");
  const [, action, id] = String(callbackData).split(":");
  if (!id || !["approve", "reject"].includes(action)) throw new Error("Thao tac Facebook khong hop le.");
  if (processingLocks.has(id)) {
    await context.answerCallbackQuery?.("Bài đang được xử lý, vui lòng chờ.");
    return { text: "Bài viết đang được xử lý.", replyMarkup: { inline_keyboard: [] } };
  }
  processingLocks.add(id);
  let result = "";
  try {
    await context.answerCallbackQuery?.("Đang xử lý đăng Facebook...");
    await context.store.update(async (state) => {
    const post = state.posts.find((item) => item.id === id);
    if (!post || post.status !== "pending_approval") throw new Error("Bai viet khong con trong hang cho duyet.");
    if (action === "reject") { post.status = "rejected"; post.updated_at = new Date().toISOString(); result = "Da huy bai viet Facebook."; return state; }
    const config = { ...context.defaults, ...state.config };
    const facebookPost = await safePostToFacebook({ pageId: config.fb_page_id, pageToken: config.fb_page_token, caption: post.caption, imageUrl: post.image_url, fetchImpl: context.fetch, returnDetails: true });
    const fbPostId = facebookPost.id;
    if (post.first_comment) await postFirstComment({ postId: fbPostId, pageToken: config.fb_page_token, commentText: post.first_comment, fetchImpl: context.fetch });
    post.status = "published"; post.fb_post_id = fbPostId; post.facebook_url = facebookPost.permalink_url; post.facebook_verification_status = facebookPost.verification_status; post.facebook_verification_error = facebookPost.verification_error || ""; post.published_at = new Date().toISOString(); post.updated_at = post.published_at;
    result = `✅ ĐÃ ĐĂNG LÊN FANPAGE THÀNH CÔNG!\n${facebookPost.permalink_url}`;
    return state;
    });
    return { text: result, replyMarkup: { inline_keyboard: [] } };
  } finally {
    processingLocks.delete(id);
  }
}

async function createPendingPost(topic, context) {
  if (!topic) return { text: "Dung: /social_post <chu de>" };
  const state = await context.store.getState();
  const config = { ...context.defaults, ...state.config };
  const content = await createPostContent({ provider: config.ai_provider, apiKey: config.ai_api_key, topic, pillar: CONTENT_PILLARS.AI_NEWS, fetchImpl: context.fetch });
  const post = { id: `social_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, topic, caption: content.caption, first_comment: content.first_comment, image_url: getRandomTechImage(), status: "pending_approval", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  await context.store.update((draft) => { draft.posts.unshift(post); draft.updated_at = new Date().toISOString(); return draft; });
  return { text: `Bai viet dang cho duyet:\n\n${post.caption}\n\nBinh luan dau:\n${post.first_comment}`, photo: post.image_url, photoCaption: "Ảnh minh họa cho bài viết. Chọn thao tác bên dưới:", replyMarkup: { inline_keyboard: [[{ text: "Dang Facebook", callback_data: `social:approve:${post.id}` }, { text: "Huy", callback_data: `social:reject:${post.id}` }]] } };
}

async function updateProvider(args, context) {
  const [provider = "", ...keyParts] = args.split(/\s+/).filter(Boolean);
  if (!provider) { const config = { ...context.defaults, ...(await context.store.getConfig()) }; return { text: `AI hien tai: ${config.ai_provider || "offline"}. Dung: /social_ai <offline|gemini|openai|deepseek> [api_key]` }; }
  if (!["offline", "gemini", "openai", "deepseek"].includes(provider)) return { text: "Provider hop le: offline, gemini, openai, deepseek." };
  await context.store.update((draft) => { draft.config = { ...draft.config, ai_provider: provider, ...(keyParts.length ? { ai_api_key: keyParts.join(" ") } : {}) }; draft.updated_at = new Date().toISOString(); return draft; });
  return { text: `Da cap nhat AI provider: ${provider}.` };
}

async function formatQueue(store) {
  const posts = await store.getPosts(); const pending = posts.filter((post) => post.status === "pending_approval");
  return pending.length ? ["Hang doi Facebook", ...pending.slice(0, 10).map((post, index) => `${index + 1}. ${post.topic}`)].join("\n") : "Hang doi Facebook dang trong.";
}
