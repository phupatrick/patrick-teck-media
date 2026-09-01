import { createDocumentStore } from "./document-store.mjs";
import { createSocialStore } from "./social-store.mjs";
import { fetchFacebookPostMetrics } from "./social-analytics.mjs";

export async function analyzeAndSelfUpgrade({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const databaseUrl = env.DATABASE_URL || "";
  const social = createSocialStore({ statePath: env.SOCIAL_STATE_PATH || "data/social-posts.json", databaseUrl });
  const posts = await social.getPosts();
  const config = { ...(await social.getConfig()), fb_page_token: env.FB_PAGE_ACCESS_TOKEN || (await social.getConfig()).fb_page_token };
  const recentPosts = posts.filter((post) => post.status === "published" && post.fb_post_id && post.fb_post_id !== "sample_id").slice(0, 15);
  let totalReactions = 0; let totalComments = 0; let totalShares = 0;
  for (const post of recentPosts) {
    const metrics = await fetchFacebookPostMetrics({ pageToken: config.fb_page_token, fbPostId: post.fb_post_id, fetchImpl });
    post.metrics = metrics;
    post.engagement_score = metrics.score;
    totalReactions += metrics.reactions; totalComments += metrics.comments; totalShares += metrics.shares;
  }
  await social.update((state) => ({ ...state, posts, updated_at: new Date(now).toISOString() }));
  const topWinningPosts = [...recentPosts].sort((a, b) => (b.engagement_score || 0) - (a.engagement_score || 0)).slice(0, 3).map((post) => ({ topic: post.topic, pillar: post.pillar, score: post.engagement_score || 0 }));
  const learnedContext = {
    updated_at: new Date(now).toISOString(),
    top_winning_topics: topWinningPosts.map((post) => post.topic),
    winning_pillars: [...new Set(topWinningPosts.map((post) => post.pillar).filter(Boolean))],
    optimization_rule: "Ưu tiên so sánh trực diện, phân tích sâu và lợi ích kinh tế thực tế."
  };
  learnedContext.winning_pillars = learnedContext.winning_pillars.length ? learnedContext.winning_pillars : ["Mẹo thực chiến & Workflow", "Tin tức & Xu hướng AI"];
  const learnedStore = createDocumentStore({ documentKey: "social:learned_context", fallbackPath: env.SOCIAL_LEARNED_CONTEXT_PATH || "data/social-learned-context.json", initialValue: {} , databaseUrl });
  await learnedStore.write(learnedContext);
  const day = new Date(now).toDateString();
  return { totalPostsToday: posts.filter((post) => post.status === "published" && new Date(post.published_at || post.created_at).toDateString() === day).length, totalReactions, totalComments, totalShares, topWinningPosts, learnedContext };
}
